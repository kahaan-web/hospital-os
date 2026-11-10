import { describe, expect, it } from 'vitest';
import {
  InvalidTransitionError,
  PricingError,
  applyGst,
  canTransitionOrder,
  canTransitionPayment,
  orderStatusAfterPayment,
  paymentStatusForOutcome,
  priceSubscription,
  quoteChange,
  transitionOrder,
  transitionPayment,
  type BillingPeriod,
  type OrderStatus,
  type PaymentStatus,
  type PriceBook,
  type QuoteLine,
  type SubscriptionConfig,
} from './billing';

const book: PriceBook = {
  plans: [
    { id: 'basic', name: 'Basic', monthlyPaise: 300_000, annualPaise: 3_000_000 },
    { id: 'medium', name: 'Medium', monthlyPaise: 600_000, annualPaise: 6_000_000 },
  ],
  addons: [
    {
      moduleId: 'lab',
      name: 'Laboratory',
      monthlyPaise: 150_000,
      annualPaise: 1_500_000,
      gstRateBp: 1800,
      sacCode: '998314',
    },
  ],
  planGstRateBp: 1800,
  planSacCode: '998315',
};

/** 1 Apr 2026 → 1 May 2026 is 30 days. On 20 Apr, 10 days remain (the current day counts as used). */
const period: BillingPeriod = {
  start: new Date('2026-04-01T00:00:00.000Z'),
  end: new Date('2026-05-01T00:00:00.000Z'),
};
const now = new Date('2026-04-20T00:00:00.000Z');

function cfg(partial: Partial<SubscriptionConfig> & Pick<SubscriptionConfig, 'planId'>): SubscriptionConfig {
  return {
    cycle: 'monthly',
    locationCount: 1,
    addonModuleIds: [],
    ...partial,
  };
}

describe('applyGst', () => {
  const lines: QuoteLine[] = [
    {
      kind: 'plan',
      refId: 'basic',
      description: 'plan',
      sacCode: '998315',
      quantity: 1,
      unitPaise: 10_000,
      amountPaise: 10_000,
      gstRateBp: 1800,
    },
    {
      kind: 'addon',
      refId: 'odd',
      description: 'odd paise',
      sacCode: '998314',
      quantity: 1,
      unitPaise: 3,
      amountPaise: 3,
      gstRateBp: 1800,
    },
  ];

  it('splits CGST and SGST for the same state and rounds each half to the paisa', () => {
    const { lines: taxed, totals } = applyGst(lines, '27', '27');
    expect(totals.interState).toBe(false);
    // 10_000 × 18% / 2 = 900. 3 × 18% / 2 = 0.27 → 0, so the two halves can sum to less than IGST.
    expect(taxed[0]).toMatchObject({ cgstPaise: 900, sgstPaise: 900, igstPaise: 0 });
    expect(taxed[1]).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 0 });
    expect(totals).toMatchObject({
      taxablePaise: 10_003,
      cgstPaise: 900,
      sgstPaise: 900,
      igstPaise: 0,
      taxPaise: 1_800,
      totalPaise: 11_803,
    });
  });

  it('charges IGST for a different state, rounded per line', () => {
    const { lines: taxed, totals } = applyGst(lines, '27', '23');
    expect(totals.interState).toBe(true);
    // 10_000 × 18% = 1_800. 3 × 18% = 0.54 → 1.
    expect(taxed[0]).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 1_800 });
    expect(taxed[1]).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 1 });
    expect(totals).toMatchObject({
      taxablePaise: 10_003,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 1_801,
      taxPaise: 1_801,
      totalPaise: 11_804,
    });
  });
});

describe('priceSubscription', () => {
  it('prices the plan and each add-on per location', () => {
    const lines = priceSubscription(book, cfg({ planId: 'basic', locationCount: 2, addonModuleIds: ['lab', 'lab'] }));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      kind: 'plan',
      refId: 'basic',
      sacCode: '998315',
      quantity: 2,
      unitPaise: 300_000,
      amountPaise: 600_000,
      gstRateBp: 1800,
    });
    expect(lines[1]).toMatchObject({
      kind: 'addon',
      refId: 'lab',
      sacCode: '998314',
      quantity: 2,
      unitPaise: 150_000,
      amountPaise: 300_000,
      gstRateBp: 1800,
    });
    const annual = priceSubscription(book, cfg({ planId: 'basic', cycle: 'annual' }));
    expect(annual[0]?.unitPaise).toBe(3_000_000);
  });

  it('rejects a missing plan, a missing add-on, and a location count below 1', () => {
    expect(() => priceSubscription(book, cfg({ planId: 'nope' }))).toThrow(PricingError);
    expect(() => priceSubscription(book, cfg({ planId: 'basic', addonModuleIds: ['cpoe'] }))).toThrow(PricingError);
    expect(() => priceSubscription(book, cfg({ planId: 'basic', locationCount: 0 }))).toThrow(PricingError);
    expect(() => priceSubscription(book, cfg({ planId: 'basic', locationCount: 1.5 }))).toThrow(PricingError);
  });
});

describe('quoteChange', () => {
  it('prorates an upgrade for the days still left in the period', () => {
    const quote = quoteChange(book, cfg({ planId: 'basic' }), cfg({ planId: 'medium' }), period, now);
    expect(quote.remainingDays).toBe(10);
    expect(quote.totalDays).toBe(30);
    expect(quote.netPaise).toBe(100_000);
    expect(quote.taxablePaise).toBe(100_000);
    expect(quote.creditAppliedPaise).toBe(0);
    expect(quote.creditBalanceAfterPaise).toBe(0);
    // A plan swap is itemised: the new plan is charged and the old plan is credited, because each line is keyed by plan id.
    expect(quote.lines.map((l) => [l.kind, l.refId, l.amountPaise])).toEqual([
      ['plan', 'medium', 200_000],
      ['plan', 'basic', -100_000],
    ]);
    expect(quote.lines[0]?.description).toContain('prorated 10/30 days');
    expect(quote.lines[1]?.description).toContain('Unused');
  });

  it('turns a downgrade into account credit and does not ask for a payment', () => {
    const quote = quoteChange(book, cfg({ planId: 'medium' }), cfg({ planId: 'basic' }), period, now, 10_000);
    expect(quote.netPaise).toBe(-100_000);
    expect(quote.taxablePaise).toBe(0);
    expect(quote.creditAppliedPaise).toBe(0);
    expect(quote.creditBalanceAfterPaise).toBe(110_000);
    expect(quote.lines.map((l) => [l.refId, l.amountPaise])).toEqual([
      ['basic', 100_000],
      ['medium', -200_000],
    ]);
  });

  it('prorates a new add-on, and credits an add-on that was removed', () => {
    const added = quoteChange(book, cfg({ planId: 'basic' }), cfg({ planId: 'basic', addonModuleIds: ['lab'] }), period, now);
    expect(added.lines.map((l) => [l.kind, l.amountPaise])).toEqual([['addon', 50_000]]);
    expect(added.taxablePaise).toBe(50_000);

    const removed = quoteChange(book, cfg({ planId: 'basic', addonModuleIds: ['lab'] }), cfg({ planId: 'basic' }), period, now);
    expect(removed.netPaise).toBe(-50_000);
    expect(removed.taxablePaise).toBe(0);
    expect(removed.creditBalanceAfterPaise).toBe(50_000);
  });

  it('applies account credit to a charge and carries the remainder', () => {
    const partial = quoteChange(book, cfg({ planId: 'basic' }), cfg({ planId: 'medium' }), period, now, 40_000);
    expect(partial.creditAppliedPaise).toBe(40_000);
    expect(partial.taxablePaise).toBe(60_000);
    expect(partial.creditBalanceAfterPaise).toBe(0);
    expect(partial.lines.at(-1)).toMatchObject({ kind: 'credit', amountPaise: -40_000 });

    const covered = quoteChange(book, cfg({ planId: 'basic' }), cfg({ planId: 'medium' }), period, now, 250_000);
    expect(covered.creditAppliedPaise).toBe(100_000);
    expect(covered.taxablePaise).toBe(0);
    expect(covered.creditBalanceAfterPaise).toBe(150_000);
  });

  it('charges nothing when the period is over or the configuration is unchanged', () => {
    const ended = quoteChange(
      book,
      cfg({ planId: 'basic' }),
      cfg({ planId: 'medium' }),
      period,
      new Date('2026-05-01T00:00:00.000Z'),
    );
    expect(ended.remainingDays).toBe(0);
    expect(ended.netPaise).toBe(0);
    expect(ended.lines).toHaveLength(0);

    const same = quoteChange(book, cfg({ planId: 'basic', locationCount: 2 }), cfg({ planId: 'basic', locationCount: 2 }), period, now);
    expect(same.netPaise).toBe(0);
    expect(same.lines).toHaveLength(0);
  });

  it('refuses a mid-period billing-cycle change', () => {
    expect(() => quoteChange(book, cfg({ planId: 'basic' }), cfg({ planId: 'basic', cycle: 'annual' }), period, now)).toThrow(PricingError);
  });
});

describe('payment and order state machines', () => {
  const paymentCases: [PaymentStatus, PaymentStatus, boolean][] = [
    ['created', 'pending', true],
    ['created', 'captured', true],
    ['created', 'failed', true],
    ['pending', 'captured', true],
    ['pending', 'failed', true],
    ['created', 'created', false],
    ['captured', 'failed', false],
    ['captured', 'pending', false],
    ['failed', 'captured', false],
    ['failed', 'created', false],
  ];

  it('allows only the payment transitions in the table', () => {
    for (const [from, to, ok] of paymentCases) {
      expect(canTransitionPayment(from, to), `${from} → ${to}`).toBe(ok);
      if (ok) expect(transitionPayment(from, to)).toBe(to);
      else expect(() => transitionPayment(from, to)).toThrow(InvalidTransitionError);
    }
  });

  const orderCases: [OrderStatus, OrderStatus, boolean][] = [
    ['created', 'attempted', true],
    ['created', 'paid', true],
    ['created', 'cancelled', true],
    ['attempted', 'attempted', true],
    ['attempted', 'paid', true],
    ['attempted', 'cancelled', true],
    ['created', 'created', false],
    ['paid', 'cancelled', false],
    ['paid', 'attempted', false],
    ['cancelled', 'paid', false],
    ['cancelled', 'created', false],
  ];

  it('allows only the order transitions in the table', () => {
    for (const [from, to, ok] of orderCases) {
      expect(canTransitionOrder(from, to), `${from} → ${to}`).toBe(ok);
      if (ok) expect(transitionOrder(from, to)).toBe(to);
      else expect(() => transitionOrder(from, to)).toThrow(InvalidTransitionError);
    }
  });

  it('maps a simulated gateway outcome onto payment and order status', () => {
    expect(paymentStatusForOutcome('success')).toBe('captured');
    expect(paymentStatusForOutcome('failure')).toBe('failed');
    expect(paymentStatusForOutcome('pending')).toBe('pending');

    expect(orderStatusAfterPayment('created', 'captured')).toBe('paid');
    expect(orderStatusAfterPayment('created', 'failed')).toBe('attempted');
    expect(orderStatusAfterPayment('created', 'pending')).toBe('attempted');
    expect(orderStatusAfterPayment('attempted', 'captured')).toBe('paid');
    expect(orderStatusAfterPayment('paid', 'failed')).toBe('paid');
    expect(orderStatusAfterPayment('paid', 'captured')).toBe('paid');
    expect(orderStatusAfterPayment('cancelled', 'failed')).toBe('cancelled');
    expect(() => orderStatusAfterPayment('cancelled', 'captured')).toThrow(InvalidTransitionError);
  });
});
