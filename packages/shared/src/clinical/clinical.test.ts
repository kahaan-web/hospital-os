import { describe, expect, it } from 'vitest';
import { FEATURE_DEFS } from '../catalog';
import { clinicalFeatureKeys } from './features';
import { documentTypeFor, placeOfSupply, resolveLineGst, roundOffPaise, splitInclusive } from './gst-health';
import { fyCode, formatDocNumber, formatUhid } from './numbering';
import { ageLabel, maskMobile } from './patient';

describe('clinical feature keys', () => {
  it('every CLINICAL_FEATURES value exists in FEATURE_DEFS', () => {
    const known = new Set(FEATURE_DEFS.map((f) => f.key));
    const keys = clinicalFeatureKeys();
    expect(keys.length).toBeGreaterThan(80);
    const missing = keys.filter((key) => !known.has(key));
    expect(missing).toEqual([]);
  });
});

describe('healthcare GST', () => {
  it('exempts clinical services and taxes room rent only above ₹5,000', () => {
    expect(resolveLineGst({ treatment: 'exempt_healthcare' })).toEqual({ treatment: 'exempt_healthcare', gstRateBp: 0 });
    expect(resolveLineGst({ treatment: 'room_rent_rule', unitPricePaise: 500_000 }).gstRateBp).toBe(0);
    expect(resolveLineGst({ treatment: 'room_rent_rule', unitPricePaise: 600_000 }).gstRateBp).toBe(500);
    expect(resolveLineGst({ treatment: 'room_rent_rule', unitPricePaise: 800_000 }).gstRateBp).toBe(500);
    expect(resolveLineGst({ treatment: 'taxable', configuredRateBp: 1200 })).toEqual({ treatment: 'taxable', gstRateBp: 1200 });
  });

  it('splits an inclusive MRP half-up to the paise', () => {
    expect(splitInclusive(11_200, 1200)).toEqual({ taxablePaise: 10_000, taxPaise: 1_200 });
    expect(splitInclusive(100, 0)).toEqual({ taxablePaise: 100, taxPaise: 0 });
  });

  it('picks the document type from the mix of lines', () => {
    const exempt = { treatment: 'exempt_healthcare' as const, gstRateBp: 0 };
    const taxed = { treatment: 'taxable' as const, gstRateBp: 1200 };
    expect(documentTypeFor([exempt, exempt], false)).toBe('bill_of_supply');
    expect(documentTypeFor([taxed], false)).toBe('tax_invoice');
    expect(documentTypeFor([exempt, taxed], false)).toBe('invoice_cum_bill_of_supply');
    expect(documentTypeFor([exempt, taxed], true)).toBe('tax_invoice');
  });

  it('uses CGST+SGST unless a registered payer GSTIN is in another state', () => {
    expect(placeOfSupply({ locationStateCode: '27' })).toEqual({ stateCode: '27', interState: false });
    expect(placeOfSupply({ locationStateCode: '27', payerGstin: '27AAAAA0000A1Z5' })).toEqual({ stateCode: '27', interState: false });
    expect(placeOfSupply({ locationStateCode: '27', payerGstin: '09AAAAA0000A1Z5' })).toEqual({ stateCode: '09', interState: true });
    expect(placeOfSupply({ locationStateCode: '27', payerGstin: 'not-a-gstin' }).interState).toBe(false);
  });

  it('rounds a bill total to the rupee', () => {
    expect(roundOffPaise(100_50)).toEqual({ roundedPaise: 10_100, roundOffPaise: 50 });
    expect(roundOffPaise(100_49)).toEqual({ roundedPaise: 10_000, roundOffPaise: -49 });
    expect(roundOffPaise(10_000)).toEqual({ roundedPaise: 10_000, roundOffPaise: 0 });
  });
});

describe('numbering calendar', () => {
  it('puts 31 March 23:59 IST in the previous financial year', () => {
    expect(fyCode(new Date('2026-03-31T23:59:00+05:30'))).toBe('2526');
    expect(fyCode(new Date('2026-04-01T00:00:00+05:30'))).toBe('2627');
  });

  it('keeps document numbers within 16 characters', () => {
    expect(formatDocNumber('MUM', 'OB', '2627', 42)).toBe('MUMOB/2627/00042');
    expect(formatDocNumber('MUM', 'OB', '2627', 42).length).toBeLessThanOrEqual(16);
    expect(formatDocNumber('MU', 'OB', '2627', 1).length).toBeLessThanOrEqual(16);
    expect(formatUhid(123)).toBe('UH000000123');
  });
});

describe('age label', () => {
  it('picks years, then months, then days', () => {
    expect(ageLabel('1992-01-15', new Date('2026-06-01T12:00:00+05:30'))).toBe('34 Y');
    expect(ageLabel('2025-10-01', new Date('2026-06-01T12:00:00+05:30'))).toBe('8 M');
    expect(ageLabel('2026-05-20', new Date('2026-06-01T12:00:00+05:30'))).toBe('12 D');
    expect(ageLabel(null)).toBe('');
  });

  it('masks a mobile number', () => {
    expect(maskMobile('9844444444')).toBe('98••••••44');
  });
});
