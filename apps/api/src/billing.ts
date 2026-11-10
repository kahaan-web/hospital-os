import { schema, type Tx } from '@hos/db';
import {
  addCycle,
  paymentStatusForOutcome,
  type OrderDto,
  type PayAttemptResult,
  type PaymentDto,
  type QuoteDto,
  type SubscriptionConfig,
} from '@hos/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { orderDto, partyFromSettings, priceBook, quoteFor, settings } from './catalog';
import { paymentSignature, publicId, safeEqual } from './crypto';
import { ApiError, writeAudit, type Actor } from './http';

const OPEN = ['created', 'attempted'] as const;

export async function createOrder(
  tx: Tx,
  actor: Actor,
  purpose: 'onboarding' | 'change',
  config: SubscriptionConfig | null,
  idempotencyKey: string,
  keyId: string,
): Promise<OrderDto> {
  const [tenant] = await tx.select().from(schema.tenants);
  if (!tenant) throw new ApiError(404, 'not_found', 'Hospital not found');
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
  return orderDto(tx, order!.id, keyId);
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
  secret: string,
  keyId: string,
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
  const signature = status === 'captured' ? paymentSignature(secret, order.publicId, payment!.publicId) : null;
  await writeAudit(tx, actor, 'billing.payment.attempt', 'payment', payment!.publicId, null, { outcome: input.outcome, method: input.method, orderId: order.publicId });
  const dto = await orderDto(tx, order.id, keyId);
  const paymentDto = dto.payments.find((p) => p.id === payment!.publicId)!;
  return { order: dto, payment: paymentDto, checkout: signature ? { orderId: order.publicId, paymentId: payment!.publicId, signature } : null };
}

/** Returns null when the signature is wrong. The audit row is written and the caller must commit it (do not throw). */
export async function verifyPayment(tx: Tx, actor: Actor, body: { orderId: string; paymentId: string; signature: string }, secret: string, keyId: string): Promise<OrderDto | null> {
  const order = await mustOrder(tx, body.orderId);
  const [payment] = await tx.select().from(schema.payments).where(and(eq(schema.payments.orderId, order.id), eq(schema.payments.publicId, body.paymentId)));
  if (!payment) throw new ApiError(404, 'not_found', 'Payment not found');
  const expected = paymentSignature(secret, order.publicId, payment.publicId);
  if (!safeEqual(expected, body.signature)) {
    await writeAudit(tx, actor, 'billing.payment.bad_signature', 'payment', payment.publicId, null, { orderId: order.publicId });
    return null;
  }
  if (payment.status !== 'captured') throw new ApiError(409, 'payment_not_captured', 'Only a captured payment can be verified');
  if (!payment.signatureVerified) {
    await tx.update(schema.payments).set({ signatureVerified: true }).where(eq(schema.payments.id, payment.id));
  }
  if (!order.fulfilledAt) await fulfil(tx, order.id, payment.id);
  await writeAudit(tx, actor, 'billing.payment.verify', 'order', order.publicId, null, { paymentId: payment.publicId });
  return orderDto(tx, order.id, keyId);
}

export async function resolvePending(tx: Tx, actor: Actor, paymentPublicId: string, outcome: 'success' | 'failure', secret: string, keyId: string): Promise<PaymentDto> {
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
    const signature = paymentSignature(secret, order.publicId, payment.publicId);
    await tx.update(schema.payments).set({ status: 'captured', signatureVerified: true, capturedAt: new Date() }).where(eq(schema.payments.id, payment.id));
    await tx.update(schema.orders).set({ status: 'paid', paidAt: new Date() }).where(eq(schema.orders.id, order.id));
    if (!order.fulfilledAt) await fulfil(tx, order.id, payment.id);
    void signature;
  }
  await writeAudit(tx, actor, 'billing.payment.resolve', 'payment', payment.publicId, { status: 'pending' }, { outcome, orderOpen: open });
  const dto = await orderDto(tx, order.id, keyId);
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
  await insertInvoice(tx, tenant.id, order.id, paymentId, quote, order.purpose === 'onboarding' ? 'Hospital OS subscription' : 'Hospital OS subscription change');
  await tx.update(schema.orders).set({ fulfilledAt: new Date(), status: 'paid', paidAt: order.paidAt ?? new Date() }).where(eq(schema.orders.id, order.id));
  if (order.purpose === 'onboarding' && ['facility', 'locations', 'plan', 'addons', 'payment'].includes(tenant.onboardingStep)) {
    await tx.update(schema.tenants).set({ onboardingStep: 'invoice' }).where(eq(schema.tenants.id, tenant.id));
  }
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

async function insertInvoice(tx: Tx, tenantId: string, orderId: string, paymentId: string, quote: QuoteDto, description: string): Promise<string> {
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
      notes: 'Sample price. Mock invoice — no tax is remitted.',
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
  return invoice!.id;
}

export { addCycle };
