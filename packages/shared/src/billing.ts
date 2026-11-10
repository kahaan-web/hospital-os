// Subscription pricing, proration and GST (pure functions; all money in integer paise, GST rates in basis points).

export type BillingCycle = 'monthly' | 'annual';

export interface PriceBookPlan {
  id: string;
  name: string;
  monthlyPaise: number;
  annualPaise: number;
}
export interface PriceBookAddon {
  moduleId: string;
  name: string;
  monthlyPaise: number;
  annualPaise: number;
  gstRateBp: number;
  sacCode: string;
}
export interface PriceBook {
  plans: readonly PriceBookPlan[];
  addons: readonly PriceBookAddon[];
  /** GST rate and SAC for the plan subscription line (platform settings). */
  planGstRateBp: number;
  planSacCode: string;
}

export interface SubscriptionConfig {
  planId: string;
  cycle: BillingCycle;
  /** Prices are per location. */
  locationCount: number;
  addonModuleIds: readonly string[];
}

export interface QuoteLine {
  kind: 'plan' | 'addon' | 'credit';
  refId: string | null;
  description: string;
  sacCode: string;
  quantity: number;
  unitPaise: number;
  amountPaise: number;
  gstRateBp: number;
}

export interface TaxedLine extends QuoteLine {
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export interface TaxTotals {
  interState: boolean;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  totalPaise: number;
}

export class PricingError extends Error {}

function cycleLabel(cycle: BillingCycle): string {
  return cycle === 'annual' ? 'annual' : 'monthly';
}

function unitFor(p: { monthlyPaise: number; annualPaise: number }, cycle: BillingCycle): number {
  return cycle === 'annual' ? p.annualPaise : p.monthlyPaise;
}

/** Full-period price lines for a subscription configuration. */
export function priceSubscription(book: PriceBook, cfg: SubscriptionConfig): QuoteLine[] {
  if (!Number.isInteger(cfg.locationCount) || cfg.locationCount < 1) throw new PricingError('locationCount must be at least 1');
  const plan = book.plans.find((p) => p.id === cfg.planId);
  if (!plan) throw new PricingError('Plan is not available');
  const lines: QuoteLine[] = [
    {
      kind: 'plan',
      refId: plan.id,
      description: `Hospital OS ${plan.name} plan — ${cycleLabel(cfg.cycle)} subscription`,
      sacCode: book.planSacCode,
      quantity: cfg.locationCount,
      unitPaise: unitFor(plan, cfg.cycle),
      amountPaise: unitFor(plan, cfg.cycle) * cfg.locationCount,
      gstRateBp: book.planGstRateBp,
    },
  ];
  for (const id of [...new Set(cfg.addonModuleIds)]) {
    const addon = book.addons.find((a) => a.moduleId === id);
    if (!addon) throw new PricingError('Add-on module is not available for purchase');
    lines.push({
      kind: 'addon',
      refId: addon.moduleId,
      description: `Add-on module: ${addon.name} — ${cycleLabel(cfg.cycle)}`,
      sacCode: addon.sacCode,
      quantity: cfg.locationCount,
      unitPaise: unitFor(addon, cfg.cycle),
      amountPaise: unitFor(addon, cfg.cycle) * cfg.locationCount,
      gstRateBp: addon.gstRateBp,
    });
  }
  return lines;
}

export function sumLines(lines: readonly QuoteLine[]): number {
  return lines.reduce((s, l) => s + l.amountPaise, 0);
}

/**
 * GST: same state → CGST + SGST (half the rate each); different state → IGST (full rate).
 * Tax is computed per line (lines may carry different rates) and rounded to the paisa.
 */
export function applyGst(
  lines: readonly QuoteLine[],
  supplierStateCode: string,
  placeOfSupplyStateCode: string,
): { lines: TaxedLine[]; totals: TaxTotals } {
  const interState = supplierStateCode !== placeOfSupplyStateCode;
  const taxed = lines.map((l): TaxedLine => {
    if (interState) {
      return { ...l, cgstPaise: 0, sgstPaise: 0, igstPaise: Math.round((l.amountPaise * l.gstRateBp) / 10000) };
    }
    const half = Math.round((l.amountPaise * l.gstRateBp) / 20000);
    return { ...l, cgstPaise: half, sgstPaise: half, igstPaise: 0 };
  });
  const sum = (f: (l: TaxedLine) => number) => taxed.reduce((s, l) => s + f(l), 0);
  const taxablePaise = sum((l) => l.amountPaise);
  const cgstPaise = sum((l) => l.cgstPaise);
  const sgstPaise = sum((l) => l.sgstPaise);
  const igstPaise = sum((l) => l.igstPaise);
  const taxPaise = cgstPaise + sgstPaise + igstPaise;
  return {
    lines: taxed,
    totals: { interState, taxablePaise, cgstPaise, sgstPaise, igstPaise, taxPaise, totalPaise: taxablePaise + taxPaise },
  };
}

export interface BillingPeriod {
  start: Date;
  end: Date;
}

/** Add one billing cycle to a date (calendar month or year, clamped to month end). */
export function addCycle(start: Date, cycle: BillingCycle): Date {
  const d = new Date(start.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  if (cycle === 'annual') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days left in the period (the current day counts as used), and the period length in days. */
export function remainingDays(period: BillingPeriod, now: Date): { remaining: number; total: number } {
  const total = Math.max(1, Math.round((period.end.getTime() - period.start.getTime()) / DAY_MS));
  const used = Math.floor((now.getTime() - period.start.getTime()) / DAY_MS) + 1;
  return { remaining: Math.min(total, Math.max(0, total - Math.max(0, used))), total };
}

export interface ChangeQuote {
  /** Itemised prorated differences (positive = charge, negative = credit for removed items), then credit applied. */
  lines: QuoteLine[];
  remainingDays: number;
  totalDays: number;
  /** Net pre-tax difference for the rest of the period, before account credit. */
  netPaise: number;
  creditAppliedPaise: number;
  /** Pre-tax amount to pay now (0 when the change is a downgrade or covered by credit). */
  taxablePaise: number;
  /** Account credit left after this change (pre-tax). */
  creditBalanceAfterPaise: number;
}

/**
 * Mid-period change (upgrade, downgrade, add or remove add-ons, more or fewer locations).
 * Charge = (new price − current price) × remaining days ÷ days in period. A negative result becomes
 * account credit, applied automatically to later charges; no refunds are issued.
 */
export function quoteChange(
  book: PriceBook,
  current: SubscriptionConfig,
  next: SubscriptionConfig,
  period: BillingPeriod,
  now: Date,
  creditBalancePaise = 0,
): ChangeQuote {
  if (current.cycle !== next.cycle) throw new PricingError('Billing cycle can only change at renewal');
  const { remaining, total } = remainingDays(period, now);
  const prorate = (amount: number) => Math.round((amount * remaining) / total);

  const cur = priceSubscription(book, current);
  const nxt = priceSubscription(book, next);
  const lines: QuoteLine[] = [];
  const key = (l: QuoteLine) => `${l.kind}:${l.refId}`;
  const curByKey = new Map(cur.map((l) => [key(l), l]));
  const nxtByKey = new Map(nxt.map((l) => [key(l), l]));

  for (const l of nxt) {
    const old = curByKey.get(key(l));
    const diff = prorate(l.amountPaise) - (old ? prorate(old.amountPaise) : 0);
    if (diff === 0) continue;
    lines.push({
      ...l,
      description: `${l.description} (prorated ${remaining}/${total} days${old ? ', change' : ''})`,
      unitPaise: diff,
      quantity: 1,
      amountPaise: diff,
    });
  }
  for (const l of cur) {
    if (nxtByKey.has(key(l))) continue;
    const credit = -prorate(l.amountPaise);
    if (credit === 0) continue;
    lines.push({
      ...l,
      description: `Unused: ${l.description} (prorated ${remaining}/${total} days)`,
      unitPaise: credit,
      quantity: 1,
      amountPaise: credit,
    });
  }

  const netPaise = sumLines(lines);
  let creditAppliedPaise = 0;
  let creditBalanceAfterPaise = creditBalancePaise;
  if (netPaise <= 0) {
    creditBalanceAfterPaise = creditBalancePaise - netPaise;
  } else {
    creditAppliedPaise = Math.min(creditBalancePaise, netPaise);
    creditBalanceAfterPaise = creditBalancePaise - creditAppliedPaise;
    if (creditAppliedPaise > 0) {
      lines.push({
        kind: 'credit',
        refId: null,
        description: 'Account credit applied',
        sacCode: book.planSacCode,
        quantity: 1,
        unitPaise: -creditAppliedPaise,
        amountPaise: -creditAppliedPaise,
        gstRateBp: book.planGstRateBp,
      });
    }
  }

  return {
    lines,
    remainingDays: remaining,
    totalDays: total,
    netPaise,
    creditAppliedPaise,
    taxablePaise: Math.max(0, netPaise - creditAppliedPaise),
    creditBalanceAfterPaise,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Mock payment state machine (mirrors a Razorpay-style gateway: order → payment attempts → capture)
// ---------------------------------------------------------------------------------------------------------------------

export type OrderStatus = 'created' | 'attempted' | 'paid' | 'cancelled';
export type PaymentStatus = 'created' | 'pending' | 'captured' | 'failed';
export type PaymentMethod = 'upi' | 'card' | 'netbanking';
export type PaymentOutcome = 'success' | 'failure' | 'pending';

const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  created: ['pending', 'captured', 'failed'],
  pending: ['captured', 'failed'],
  captured: [],
  failed: [],
};

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  created: ['attempted', 'paid', 'cancelled'],
  attempted: ['attempted', 'paid', 'cancelled'],
  paid: [],
  cancelled: [],
};

export class InvalidTransitionError extends Error {
  constructor(kind: 'order' | 'payment', from: string, to: string) {
    super(`Invalid ${kind} transition: ${from} → ${to}`);
  }
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function transitionPayment(from: PaymentStatus, to: PaymentStatus): PaymentStatus {
  if (!canTransitionPayment(from, to)) throw new InvalidTransitionError('payment', from, to);
  return to;
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function transitionOrder(from: OrderStatus, to: OrderStatus): OrderStatus {
  if (!canTransitionOrder(from, to)) throw new InvalidTransitionError('order', from, to);
  return to;
}

/** Status a payment moves to for a simulated gateway outcome. */
export function paymentStatusForOutcome(outcome: PaymentOutcome): PaymentStatus {
  return outcome === 'success' ? 'captured' : outcome === 'failure' ? 'failed' : 'pending';
}

/** Order status after one of its payments reaches `payment`. A captured payment pays the order; anything else leaves it retryable. */
export function orderStatusAfterPayment(order: OrderStatus, payment: PaymentStatus): OrderStatus {
  if (order === 'paid' || order === 'cancelled') {
    if (payment === 'captured' && order === 'cancelled') throw new InvalidTransitionError('order', order, 'paid');
    return order;
  }
  return payment === 'captured' ? transitionOrder(order, 'paid') : transitionOrder(order, 'attempted');
}
