import { schema, type Tx } from '@hos/db';
import {
  addCycle,
  applyGst,
  priceSubscription,
  type OrderDto,
  type PayAttemptResult,
  type PaymentDto,
  type QuoteDto,
  type QuoteLine,
  type SubscriptionConfig,
  type TaxTotals,
} from '@hos/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { orderDto, partyFromSettings, placeOfSupply, priceBook, quoteFor, settings } from './catalog';
import { publicId } from './crypto';
import { ApiError, writeAudit, type Actor } from './http';
import type { PaymentGateway } from './providers';

const OPEN = ['created', 'attempted'] as const;

type SqlQuery = ReturnType<typeof sql>;

function errorText(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const record = error as { message?: unknown; cause?: unknown };
  const own = typeof record.message === 'string' ? record.message : '';
  return `${own} ${errorText(record.cause)}`;
}

async function exec(tx: Tx, query: SqlQuery) {
  try {
    return await tx.execute(query);
  } catch (error) {
    const code = /hos:([a-z0-9_]+)/.exec(errorText(error))?.[1];
    if (code === 'order_closed') throw new ApiError(409, 'order_closed', 'This order is already closed');
    if (code === 'payment_not_pending') throw new ApiError(409, 'payment_not_pending', 'That payment is not pending');
    if (code === 'bad_transition') throw new ApiError(409, 'conflict', 'That status change is not allowed');
    if (code === 'order_not_paid') throw new ApiError(409, 'order_closed', 'Only a paid order can be fulfilled');
    if (code === 'payment_not_verified') throw new ApiError(409, 'payment_not_captured', 'Only a verified captured payment can be fulfilled');
    if (code === 'order_not_found') throw new ApiError(404, 'not_found', 'Order not found');
    if (code === 'payment_not_found') throw new ApiError(404, 'not_found', 'Payment not found');
    if (code === 'no_subscription') throw new ApiError(422, 'no_subscription', 'There is no subscription to change');
    if (code === 'forbidden') throw new ApiError(403, 'forbidden', 'You cannot do that');
    if (code === 'period_change') throw new ApiError(422, 'period_change', 'This change cannot move the billing period');
    if (code === 'credit_above') throw new ApiError(422, 'credit_above', 'That credit is higher than the unused value of this subscription');
    if (code === 'price_increase') throw new ApiError(422, 'payment_required', 'This change needs a payment. Create an order instead.');
    throw error;
  }
}

async function simulatorEnabled(tx: Tx, allowSimulator: boolean): Promise<boolean> {
  if (!allowSimulator) return false;
  const rows = await tx.execute<{ enabled: boolean }>(sql`select mock_payment_simulator as enabled from platform_settings where id = 1`);
  return rows.rows[0]?.enabled === true;
}

/** The server captures unless dev-insecure mode is on, the simulator flag is on, and the client named an outcome. */
export async function decideOutcome(
  tx: Tx,
  allowSimulator: boolean,
  requested: 'success' | 'failure' | 'pending' | undefined,
): Promise<'success' | 'failure' | 'pending'> {
  if ((await simulatorEnabled(tx, allowSimulator)) && requested) return requested;
  return 'success';
}

export async function createOrder(
  tx: Tx,
  actor: Actor,
  purpose: 'onboarding' | 'change',
  config: SubscriptionConfig | null,
  idempotencyKey: string,
  gateway: PaymentGateway,
): Promise<OrderDto> {
  // Serialise creates for this hospital. The partial unique index is the backstop if the lock is skipped.
  await tx.execute(sql`select id from tenants where id = hos_tenant_id() for update`);
  const [tenant] = await tx.select().from(schema.tenants);
  if (!tenant) throw new ApiError(404, 'not_found', 'Hospital not found');
  if (purpose === 'onboarding') {
    if (tenant.status !== 'onboarding') throw new ApiError(409, 'onboarding_closed', 'Setup is already finished');
    const paid = await tx
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(and(eq(schema.orders.purpose, 'onboarding'), eq(schema.orders.status, 'paid')));
    if (paid.length > 0) throw new ApiError(409, 'already_paid', 'The onboarding order is already paid');
  }
  const draft = tenant.onboardingDraft;
  const cfg: SubscriptionConfig =
    purpose === 'onboarding'
      ? { planId: draft.planId ?? '', cycle: draft.cycle, locationCount: draft.locationCount, addonModuleIds: draft.addonModuleIds }
      : { ...(config as SubscriptionConfig), cycle: (await currentCycle(tx)) };
  if (!cfg.planId) throw new ApiError(422, 'plan_required', 'Choose a plan before paying');
  const quote = await quoteFor(tx, cfg, purpose);
  if (quote.totals.totalPaise <= 0) throw new ApiError(422, 'no_payment_due', 'Nothing is payable for this change');
  const open = await tx
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(and(eq(schema.orders.purpose, purpose), inArray(schema.orders.status, [...OPEN])));
  if (open.length > 0) {
    for (const row of open) await exec(tx, sql`select hos_order_transition(${row.id}::uuid, 'cancelled')`);
  }
  const [order] = await tx
    .insert(schema.orders)
    .values({
      tenantId: tenant.id,
      publicId: publicId('order'),
      purpose,
      status: 'created',
      amountPaise: quote.totals.totalPaise,
      quote,
      idempotencyKey,
      createdBy: actor.actorId,
    })
    .returning();
  await writeAudit(tx, actor, 'billing.order.create', 'order', order!.publicId, null, { purpose, amountPaise: quote.totals.totalPaise, cancelled: open.map((o) => o.id) });
  return orderDto(tx, order!.id, gateway.keyId);
}

async function currentCycle(tx: Tx) {
  const [sub] = await tx.select().from(schema.subscriptions);
  if (!sub) throw new ApiError(422, 'no_subscription', 'There is no subscription to change');
  return sub.billingCycle as SubscriptionConfig['cycle'];
}

export async function payOrder(
  tx: Tx,
  actor: Actor,
  orderPublicId: string,
  input: { method: 'upi' | 'card' | 'netbanking'; outcome?: 'success' | 'failure' | 'pending'; details: Record<string, string | undefined> },
  gateway: PaymentGateway,
  allowSimulator: boolean,
): Promise<PayAttemptResult> {
  const order = await mustOrder(tx, orderPublicId);
  await tx.execute(sql`select id from orders where id = ${order.id} for update`);
  const locked = await mustOrder(tx, orderPublicId);
  if (!OPEN.includes(locked.status as (typeof OPEN)[number])) throw new ApiError(409, 'order_closed', 'This order is already closed');
  const pending = await tx
    .select({ id: schema.payments.id })
    .from(schema.payments)
    .where(and(eq(schema.payments.orderId, locked.id), eq(schema.payments.status, 'pending')));
  if (pending.length > 0) throw new ApiError(409, 'payment_pending', 'A payment is still pending on this order');
  const outcome = await decideOutcome(tx, allowSimulator, input.outcome);
  const details: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.details)) if (v) details[k] = v;
  const [payment] = await tx
    .insert(schema.payments)
    .values({
      tenantId: locked.tenantId,
      orderId: locked.id,
      publicId: publicId('pay'),
      method: input.method,
      methodDetails: details,
      status: 'created',
      amountPaise: locked.amountPaise,
    })
    .returning();
  if (outcome === 'failure') {
    await exec(tx, sql`select hos_payment_transition(${payment!.id}::uuid, 'failed', 'simulated_failure', 'The mock gateway declined this attempt', null)`);
    await exec(tx, sql`select hos_order_transition(${locked.id}::uuid, 'attempted')`);
  } else if (outcome === 'pending') {
    await exec(tx, sql`select hos_payment_transition(${payment!.id}::uuid, 'pending', null, null, null)`);
    await exec(tx, sql`select hos_order_transition(${locked.id}::uuid, 'attempted')`);
  } else {
    await exec(tx, sql`select hos_payment_transition(${payment!.id}::uuid, 'captured', null, null, null)`);
    await exec(tx, sql`select hos_order_mark_paid(${locked.id}::uuid)`);
  }
  const signature = outcome === 'success' ? gateway.signCapture(locked.publicId, payment!.publicId) : null;
  await writeAudit(tx, actor, 'billing.payment.attempt', 'payment', payment!.publicId, null, { outcome, method: input.method, orderId: locked.publicId });
  const dto = await orderDto(tx, locked.id, gateway.keyId);
  const paymentDto = dto.payments.find((p) => p.id === payment!.publicId)!;
  return { order: dto, payment: paymentDto, checkout: signature ? { orderId: locked.publicId, paymentId: payment!.publicId, signature } : null };
}

/** Returns null when the signature is wrong. The audit row is written and the caller must commit it (do not throw). */
export async function verifyPayment(tx: Tx, actor: Actor, body: { orderId: string; paymentId: string; signature: string }, gateway: PaymentGateway): Promise<OrderDto | null> {
  const locked = await tx.execute<{ id: string; public_id: string; fulfilled_at: Date | null }>(sql`
    select id, public_id, fulfilled_at from orders where public_id = ${body.orderId}
  `);
  const order = locked.rows[0];
  if (!order) throw new ApiError(404, 'not_found', 'Order not found');
  const payments = await tx.execute<{ id: string; public_id: string; status: string; signature_verified: boolean }>(sql`
    select id, public_id, status, signature_verified from payments
    where order_id = ${order.id} and public_id = ${body.paymentId}
  `);
  const payment = payments.rows[0];
  if (!payment) throw new ApiError(404, 'not_found', 'Payment not found');
  if (!gateway.verifySignature(order.public_id, payment.public_id, body.signature)) {
    await writeAudit(tx, actor, 'billing.payment.bad_signature', 'payment', payment.public_id, null, { orderId: order.public_id });
    return null;
  }
  if (payment.status !== 'captured') throw new ApiError(409, 'payment_not_captured', 'Only a captured payment can be verified');
  if (!payment.signature_verified) {
    await exec(tx, sql`select hos_payment_transition(${payment.id}::uuid, 'captured', null, null, true)`);
  }
  if (!order.fulfilled_at) await fulfil(tx, order.id, payment.id);
  await writeAudit(tx, actor, 'billing.payment.verify', 'order', order.public_id, null, { paymentId: payment.public_id });
  return orderDto(tx, order.id, gateway.keyId);
}

/** Platform or mock-webhook only. A tenant session must not call this. */
export async function resolvePending(tx: Tx, actor: Actor, paymentPublicId: string, outcome: 'success' | 'failure', gateway: PaymentGateway): Promise<PaymentDto> {
  const locked = await tx.execute<{ payment_id: string; payment_status: string; order_id: string; order_status: string; public_id: string }>(sql`
    select p.id as payment_id, p.status as payment_status, o.id as order_id, o.status as order_status, p.public_id
    from payments p
    join orders o on o.id = p.order_id
    where p.public_id = ${paymentPublicId}
  `);
  const row = locked.rows[0];
  if (!row) throw new ApiError(404, 'not_found', 'Payment not found');
  if (row.payment_status !== 'pending') throw new ApiError(409, 'payment_not_pending', 'That payment is not pending');
  const open = OPEN.includes(row.order_status as (typeof OPEN)[number]);
  if (outcome === 'failure' || !open) {
    const code = open ? 'simulated_failure' : 'order_closed';
    const reason = open ? 'The mock gateway declined this attempt' : 'The order closed before the payment completed';
    await exec(tx, sql`select hos_payment_transition(${row.payment_id}::uuid, 'failed', ${code}, ${reason}, null)`);
  } else {
    await exec(tx, sql`select hos_payment_transition(${row.payment_id}::uuid, 'captured', null, null, true)`);
    await exec(tx, sql`select hos_order_mark_paid(${row.order_id}::uuid)`);
    await fulfil(tx, row.order_id, row.payment_id);
  }
  await writeAudit(tx, actor, 'billing.payment.resolve', 'payment', row.public_id, { status: 'pending' }, { outcome, orderOpen: open });
  const dto = await orderDto(tx, row.order_id, gateway.keyId);
  return dto.payments.find((p) => p.id === row.public_id)!;
}

async function mustOrder(tx: Tx, publicOrderId: string) {
  const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.publicId, publicOrderId));
  if (!order) throw new ApiError(404, 'not_found', 'Order not found');
  return order;
}

/** Invoice + subscription. Onboarding does not activate the tenant — that is /onboarding/provision. */
export async function fulfil(tx: Tx, orderId: string, paymentId: string): Promise<void> {
  const applied = await exec(tx, sql`select hos_subscription_apply_order(${orderId}::uuid) as applied`);
  if (applied.rows[0]?.applied !== true) return;
  const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) return;
  const quote = order.quote as QuoteDto;
  const [tenant] = await tx.select().from(schema.tenants);
  if (!tenant) throw new ApiError(404, 'not_found', 'Hospital not found');
  if (order.purpose === 'onboarding' && ['facility', 'locations', 'plan', 'addons', 'payment'].includes(tenant.onboardingStep)) {
    await tx.update(schema.tenants).set({ onboardingStep: 'invoice' }).where(eq(schema.tenants.id, tenant.id));
  }
  // Invoice number last: hos_next_invoice_number locks the counter row until commit.
  await insertInvoice(tx, tenant.id, order.id, paymentId, quote, order.purpose === 'onboarding' ? 'Hospital OS subscription' : 'Hospital OS subscription change');
}

/**
 * Applies a plan, location-count or add-on change immediately, including downgrades.
 * A downgrade does not refund cash and does not issue a GST credit note (out of scope).
 * Unused pre-tax value is stored on `subscriptions.credit_paise` and consumed by the
 * next charge (upgrade or renewal). Paid upgrades still go through change-quote →
 * order → pay → verify → fulfil, which calls this with the priced quote.
 * In tenant scope the database keeps the current period, derives the credit, and
 * rejects a pricier plan. The quote's credit is checked against that derived value.
 */
export async function applySubscriptionChange(tx: Tx, quote: QuoteDto): Promise<void> {
  const [sub] = await tx.select().from(schema.subscriptions);
  if (!sub) throw new ApiError(422, 'no_subscription', 'There is no subscription to change');
  const { book } = await priceBook(tx);
  const plan = book.plans.find((p) => p.id === quote.config.planId);
  if (!plan) throw new ApiError(422, 'invalid_config', 'Plan is no longer available');
  await persistSubscription(tx, {
    planId: quote.config.planId,
    locationCount: quote.config.locationCount,
    addonModuleIds: [...quote.config.addonModuleIds],
    creditPaise: quote.change?.creditBalanceAfterPaise ?? sub.creditPaise,
    periodStart: sub.currentPeriodStart,
    periodEnd: sub.currentPeriodEnd,
    setPeriod: false,
    reason: 'no_payment_change',
  });
}

async function persistSubscription(
  tx: Tx,
  change: {
    planId: string;
    locationCount: number;
    addonModuleIds: string[];
    creditPaise: number;
    periodStart: Date;
    periodEnd: Date;
    setPeriod: boolean;
    reason: 'renewal' | 'no_payment_change';
  },
): Promise<void> {
  await exec(
    tx,
    sql`select hos_subscription_admin_change(
      ${change.planId}::uuid,
      ${change.locationCount}::int,
      ${JSON.stringify(change.addonModuleIds)}::jsonb,
      ${change.creditPaise}::bigint,
      ${change.periodStart.toISOString()}::timestamptz,
      ${change.periodEnd.toISOString()}::timestamptz,
      ${change.setPeriod}::boolean,
      ${change.reason}
    )`,
  );
}

interface InvoiceSource {
  lines: QuoteDto['lines'];
  totals: Pick<TaxTotals, 'interState' | 'taxablePaise' | 'cgstPaise' | 'sgstPaise' | 'igstPaise' | 'totalPaise'>;
  placeOfSupplyStateCode: string;
  periodStart: string;
  periodEnd: string;
}

export interface RenewalInvoice {
  invoiceId: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  totalPaise: number;
}

/**
 * Dev clock. Moves the subscription across period boundaries that fall within
 * `advanceDays` of now and writes one mock renewal invoice per boundary.
 * The mock gateway marks those invoices paid; there is no dunning. Not for production.
 */
export async function advanceBillingClock(tx: Tx, actor: Actor, advanceDays: number): Promise<{ advancedDays: number; renewals: RenewalInvoice[] }> {
  const horizon = new Date(Date.now() + advanceDays * 24 * 60 * 60 * 1000);
  const renewals: RenewalInvoice[] = [];
  for (let i = 0; i < 36; i++) {
    const [row] = await tx.select().from(schema.subscriptions);
    if (!row || row.status !== 'active') throw new ApiError(422, 'no_subscription', 'There is no subscription to renew');
    if (new Date(row.currentPeriodEnd).getTime() > horizon.getTime()) break;
    renewals.push(await issueRenewal(tx, actor, row));
  }
  return { advancedDays: advanceDays, renewals };
}

async function issueRenewal(tx: Tx, actor: Actor, row: typeof schema.subscriptions.$inferSelect): Promise<RenewalInvoice> {
  const { book } = await priceBook(tx);
  const cfg = await settings(tx);
  const place = await placeOfSupply(tx);
  const cycle = row.billingCycle as SubscriptionConfig['cycle'];
  const [subView] = await tx.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, row.id));
  if (!subView) throw new ApiError(422, 'no_subscription', 'There is no subscription to renew');
  const items = await tx.select().from(schema.subscriptionItems).where(eq(schema.subscriptionItems.status, 'active'));
  const config: SubscriptionConfig = {
    planId: subView.planId,
    cycle,
    locationCount: subView.locationCount,
    addonModuleIds: items.flatMap((item) => (item.kind === 'addon' && item.moduleId ? [item.moduleId] : [])),
  };
  const lines: QuoteLine[] = priceSubscription(book, config);
  let credit = subView.creditPaise;
  let taxed = applyGst(lines, cfg.supplierStateCode, place);
  const applied = Math.min(credit, Math.max(0, taxed.totals.taxablePaise));
  if (applied > 0) {
    const withCredit = applyGst(
      [
        ...lines,
        {
          kind: 'credit',
          refId: null,
          description: 'Account credit applied',
          sacCode: book.planSacCode,
          quantity: 1,
          unitPaise: -applied,
          amountPaise: -applied,
          gstRateBp: book.planGstRateBp,
        },
      ],
      cfg.supplierStateCode,
      place,
    );
    if (withCredit.totals.totalPaise >= 0) {
      taxed = withCredit;
      credit -= applied;
    }
  }
  const periodStart = new Date(subView.currentPeriodEnd);
  const periodEnd = addCycle(periodStart, cycle);
  await persistSubscription(tx, {
    planId: config.planId,
    locationCount: config.locationCount,
    addonModuleIds: [...config.addonModuleIds],
    creditPaise: credit,
    periodStart,
    periodEnd,
    setPeriod: true,
    reason: 'renewal',
  });
  const invoice = await insertInvoice(
    tx,
    subView.tenantId,
    null,
    null,
    {
      lines: taxed.lines,
      totals: taxed.totals,
      placeOfSupplyStateCode: place,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    },
    'Hospital OS subscription renewal',
    'Sample price. Mock renewal — no tax is remitted.',
  );
  await writeAudit(tx, actor, 'billing.subscription.renew', 'invoice', invoice.id, null, {
    number: invoice.number,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalPaise: taxed.totals.totalPaise,
  });
  return {
    invoiceId: invoice.id,
    number: invoice.number,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalPaise: taxed.totals.totalPaise,
  };
}

async function insertInvoice(
  tx: Tx,
  tenantId: string,
  orderId: string | null,
  paymentId: string | null,
  quote: InvoiceSource,
  description: string,
  notes = 'Sample price. Mock invoice — no tax is remitted.',
): Promise<{ id: string; number: string }> {
  const cfg = await settings(tx);
  const [tenant] = await tx.select().from(schema.tenants);
  const locs = await tx.select().from(schema.locations);
  const primary = locs.find((l) => l.isPrimary) ?? locs[0];
  const numbered = await tx.execute<{ fy: string; number: string }>(sql`select fy, number from hos_next_invoice_number(now())`);
  const series = numbered.rows[0];
  if (!series) throw new ApiError(500, 'internal', 'Could not allocate an invoice number');
  const { stateName } = await import('@hos/shared');
  const address = primary ? `${primary.addressLine1}, ${primary.city}, ${stateName(primary.stateCode)} ${primary.pincode}` : '';
  const issue = new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
  const [invoice] = await tx
    .insert(schema.invoices)
    .values({
      tenantId,
      number: series.number,
      fy: series.fy,
      orderId,
      paymentId,
      status: 'paid',
      issueDate: issue,
      description,
      supplier: partyFromSettings(cfg),
      customer: {
        legalName: tenant?.legalName || tenant?.displayName || 'Customer',
        tradeName: tenant?.displayName || tenant?.legalName || 'Customer',
        gstin: tenant?.gstin ?? '',
        address,
        stateCode: quote.placeOfSupplyStateCode,
        stateName: stateName(quote.placeOfSupplyStateCode),
      },
      placeOfSupplyStateCode: quote.placeOfSupplyStateCode,
      interState: quote.totals.interState,
      taxablePaise: quote.totals.taxablePaise,
      cgstPaise: quote.totals.cgstPaise,
      sgstPaise: quote.totals.sgstPaise,
      igstPaise: quote.totals.igstPaise,
      totalPaise: quote.totals.totalPaise,
      periodStart: new Date(quote.periodStart),
      periodEnd: new Date(quote.periodEnd),
      notes,
    })
    .returning();
  if (quote.lines.length > 0) {
    await tx.insert(schema.invoiceLines).values(
      quote.lines.map((line, sortOrder) => ({
        tenantId,
        invoiceId: invoice!.id,
        sortOrder,
        description: line.description,
        sacCode: line.sacCode,
        quantity: line.quantity,
        unitPaise: line.unitPaise,
        amountPaise: line.amountPaise,
        gstRateBp: line.gstRateBp,
        cgstPaise: line.cgstPaise,
        sgstPaise: line.sgstPaise,
        igstPaise: line.igstPaise,
      })),
    );
  }
  return { id: invoice!.id, number: invoice!.number };
}

export { addCycle };
