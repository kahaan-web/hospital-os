import { schema, type Tx } from '@hos/db';
import {
  addCycle,
  applyGst,
  paymentStatusForOutcome,
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

export async function createOrder(
  tx: Tx,
  actor: Actor,
  purpose: 'onboarding' | 'change',
  config: SubscriptionConfig | null,
  idempotencyKey: string,
  gateway: PaymentGateway,
): Promise<OrderDto> {
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
    await tx.update(schema.orders).set({ status: 'cancelled' }).where(inArray(schema.orders.id, open.map((o) => o.id)));
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
  input: { method: 'upi' | 'card' | 'netbanking'; outcome: 'success' | 'failure' | 'pending'; details: Record<string, string | undefined> },
  gateway: PaymentGateway,
): Promise<PayAttemptResult> {
  const order = await mustOrder(tx, orderPublicId);
  if (!OPEN.includes(order.status as (typeof OPEN)[number])) throw new ApiError(409, 'order_closed', 'This order is already closed');
  const pending = await tx
    .select({ id: schema.payments.id })
    .from(schema.payments)
    .where(and(eq(schema.payments.orderId, order.id), eq(schema.payments.status, 'pending')));
  if (pending.length > 0) throw new ApiError(409, 'payment_pending', 'A payment is still pending on this order');
  const status = paymentStatusForOutcome(input.outcome);
  const details: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.details)) if (v) details[k] = v;
  const [payment] = await tx
    .insert(schema.payments)
    .values({
      tenantId: order.tenantId,
      orderId: order.id,
      publicId: publicId('pay'),
      method: input.method,
      methodDetails: details,
      status,
      amountPaise: order.amountPaise,
      failureCode: input.outcome === 'failure' ? 'simulated_failure' : null,
      failureReason: input.outcome === 'failure' ? 'The mock gateway declined this attempt' : null,
      capturedAt: status === 'captured' ? new Date() : null,
    })
    .returning();
  const nextOrder = status === 'captured' ? 'paid' : 'attempted';
  await tx
    .update(schema.orders)
    .set({ status: nextOrder, paidAt: status === 'captured' ? new Date() : order.paidAt })
    .where(eq(schema.orders.id, order.id));
  const signature = status === 'captured' ? gateway.signCapture(order.publicId, payment!.publicId) : null;
  await writeAudit(tx, actor, 'billing.payment.attempt', 'payment', payment!.publicId, null, { outcome: input.outcome, method: input.method, orderId: order.publicId });
  const dto = await orderDto(tx, order.id, gateway.keyId);
  const paymentDto = dto.payments.find((p) => p.id === payment!.publicId)!;
  return { order: dto, payment: paymentDto, checkout: signature ? { orderId: order.publicId, paymentId: payment!.publicId, signature } : null };
}

/** Returns null when the signature is wrong. The audit row is written and the caller must commit it (do not throw). */
export async function verifyPayment(tx: Tx, actor: Actor, body: { orderId: string; paymentId: string; signature: string }, gateway: PaymentGateway): Promise<OrderDto | null> {
  const order = await mustOrder(tx, body.orderId);
  const [payment] = await tx.select().from(schema.payments).where(and(eq(schema.payments.orderId, order.id), eq(schema.payments.publicId, body.paymentId)));
  if (!payment) throw new ApiError(404, 'not_found', 'Payment not found');
  if (!gateway.verifySignature(order.publicId, payment.publicId, body.signature)) {
    await writeAudit(tx, actor, 'billing.payment.bad_signature', 'payment', payment.publicId, null, { orderId: order.publicId });
    return null;
  }
  if (payment.status !== 'captured') throw new ApiError(409, 'payment_not_captured', 'Only a captured payment can be verified');
  if (!payment.signatureVerified) {
    await tx.update(schema.payments).set({ signatureVerified: true }).where(eq(schema.payments.id, payment.id));
  }
  if (!order.fulfilledAt) await fulfil(tx, order.id, payment.id);
  await writeAudit(tx, actor, 'billing.payment.verify', 'order', order.publicId, null, { paymentId: payment.publicId });
  return orderDto(tx, order.id, gateway.keyId);
}

export async function resolvePending(tx: Tx, actor: Actor, paymentPublicId: string, outcome: 'success' | 'failure', gateway: PaymentGateway): Promise<PaymentDto> {
  const [payment] = await tx.select().from(schema.payments).where(eq(schema.payments.publicId, paymentPublicId));
  if (!payment) throw new ApiError(404, 'not_found', 'Payment not found');
  if (payment.status !== 'pending') throw new ApiError(409, 'payment_not_pending', 'That payment is not pending');
  const order = (await tx.select().from(schema.orders).where(eq(schema.orders.id, payment.orderId)))[0];
  if (!order) throw new ApiError(404, 'not_found', 'Order not found');
  const open = OPEN.includes(order.status as (typeof OPEN)[number]);
  if (outcome === 'failure' || !open) {
    await tx
      .update(schema.payments)
      .set({ status: 'failed', failureCode: open ? 'simulated_failure' : 'order_closed', failureReason: open ? 'The mock gateway declined this attempt' : 'The order closed before the payment completed' })
      .where(eq(schema.payments.id, payment.id));
  } else {
    await tx.update(schema.payments).set({ status: 'captured', signatureVerified: true, capturedAt: new Date() }).where(eq(schema.payments.id, payment.id));
    await tx.update(schema.orders).set({ status: 'paid', paidAt: new Date() }).where(eq(schema.orders.id, order.id));
    if (!order.fulfilledAt) await fulfil(tx, order.id, payment.id);
  }
  await writeAudit(tx, actor, 'billing.payment.resolve', 'payment', payment.publicId, { status: 'pending' }, { outcome, orderOpen: open });
  const dto = await orderDto(tx, order.id, gateway.keyId);
  return dto.payments.find((p) => p.id === payment.publicId)!;
}

async function mustOrder(tx: Tx, publicOrderId: string) {
  const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.publicId, publicOrderId));
  if (!order) throw new ApiError(404, 'not_found', 'Order not found');
  return order;
}

/** Invoice + subscription. Onboarding does not activate the tenant — that is /onboarding/provision. */
export async function fulfil(tx: Tx, orderId: string, paymentId: string): Promise<void> {
  const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order || order.fulfilledAt) return;
  const quote = order.quote as QuoteDto;
  const [tenant] = await tx.select().from(schema.tenants);
  if (!tenant) throw new ApiError(404, 'not_found', 'Hospital not found');
  if (order.purpose === 'onboarding') await ensureSubscription(tx, tenant.id, quote);
  else await applySubscriptionChange(tx, quote);
  if (order.purpose === 'onboarding' && ['facility', 'locations', 'plan', 'addons', 'payment'].includes(tenant.onboardingStep)) {
    await tx.update(schema.tenants).set({ onboardingStep: 'invoice' }).where(eq(schema.tenants.id, tenant.id));
  }
  await tx.update(schema.orders).set({ fulfilledAt: new Date(), status: 'paid', paidAt: order.paidAt ?? new Date() }).where(eq(schema.orders.id, order.id));
  // Invoice number last: hos_next_invoice_number locks the counter row until commit.
  await insertInvoice(tx, tenant.id, order.id, paymentId, quote, order.purpose === 'onboarding' ? 'Hospital OS subscription' : 'Hospital OS subscription change');
}

async function ensureSubscription(tx: Tx, tenantId: string, quote: QuoteDto): Promise<void> {
  const [existing] = await tx.select().from(schema.subscriptions);
  if (existing) return;
  const { book } = await priceBook(tx);
  const plan = book.plans.find((p) => p.id === quote.config.planId);
  if (!plan) throw new ApiError(422, 'invalid_config', 'Plan is no longer available');
  const start = new Date(quote.periodStart);
  const end = new Date(quote.periodEnd);
  const [sub] = await tx
    .insert(schema.subscriptions)
    .values({
      tenantId,
      planId: quote.config.planId,
      billingCycle: quote.config.cycle,
      locationCount: quote.config.locationCount,
      status: 'active',
      currentPeriodStart: start,
      currentPeriodEnd: end,
      creditPaise: 0,
    })
    .returning();
  const unit = quote.config.cycle === 'annual' ? plan.annualPaise : plan.monthlyPaise;
  await tx.insert(schema.subscriptionItems).values({
    tenantId,
    subscriptionId: sub!.id,
    kind: 'plan',
    planId: plan.id,
    unitAmountPaise: unit,
    quantity: quote.config.locationCount,
    status: 'active',
  });
  for (const moduleId of quote.config.addonModuleIds) {
    const addon = book.addons.find((a) => a.moduleId === moduleId);
    if (!addon) continue;
    await tx.insert(schema.subscriptionItems).values({
      tenantId,
      subscriptionId: sub!.id,
      kind: 'addon',
      moduleId,
      unitAmountPaise: quote.config.cycle === 'annual' ? addon.annualPaise : addon.monthlyPaise,
      quantity: quote.config.locationCount,
      status: 'active',
    });
  }
}

/**
 * Applies a plan, location-count or add-on change immediately, including downgrades.
 * A downgrade does not refund cash and does not issue a GST credit note (out of scope).
 * Unused pre-tax value is stored on `subscriptions.credit_paise` and consumed by the
 * next charge (upgrade or renewal). Paid upgrades still go through change-quote →
 * order → pay → verify → fulfil, which calls this with the priced quote.
 */
export async function applySubscriptionChange(tx: Tx, quote: QuoteDto): Promise<void> {
  const [sub] = await tx.select().from(schema.subscriptions);
  if (!sub) throw new ApiError(422, 'no_subscription', 'There is no subscription to change');
  const { book } = await priceBook(tx);
  const plan = book.plans.find((p) => p.id === quote.config.planId);
  if (!plan) throw new ApiError(422, 'invalid_config', 'Plan is no longer available');
  await tx
    .update(schema.subscriptions)
    .set({
      planId: quote.config.planId,
      locationCount: quote.config.locationCount,
      creditPaise: quote.change?.creditBalanceAfterPaise ?? sub.creditPaise,
    })
    .where(eq(schema.subscriptions.id, sub.id));
  await tx.update(schema.subscriptionItems).set({ status: 'removed', removedAt: new Date() }).where(eq(schema.subscriptionItems.subscriptionId, sub.id));
  const unit = sub.billingCycle === 'annual' ? plan.annualPaise : plan.monthlyPaise;
  await tx.insert(schema.subscriptionItems).values({
    tenantId: sub.tenantId,
    subscriptionId: sub.id,
    kind: 'plan',
    planId: plan.id,
    unitAmountPaise: unit,
    quantity: quote.config.locationCount,
    status: 'active',
  });
  for (const moduleId of quote.config.addonModuleIds) {
    const addon = book.addons.find((a) => a.moduleId === moduleId);
    if (!addon) continue;
    await tx.insert(schema.subscriptionItems).values({
      tenantId: sub.tenantId,
      subscriptionId: sub.id,
      kind: 'addon',
      moduleId,
      unitAmountPaise: sub.billingCycle === 'annual' ? addon.annualPaise : addon.monthlyPaise,
      quantity: quote.config.locationCount,
      status: 'active',
    });
  }
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
  await tx
    .update(schema.subscriptions)
    .set({ currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, creditPaise: credit })
    .where(eq(schema.subscriptions.id, subView.id));
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
