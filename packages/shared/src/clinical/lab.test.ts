import { describe, expect, it } from 'vitest';
import { flagLabValue, opdCollectionAllowed, pickRefBand, type LabRefBand } from './lab';

const hb: LabRefBand[] = [
  { sex: 'any', ageMinYears: 0, ageMaxYears: 11, low: 11, high: 14.5 },
  { sex: 'male', ageMinYears: 12, ageMaxYears: 120, low: 13, high: 17 },
  { sex: 'female', ageMinYears: 12, ageMaxYears: 120, low: 12, high: 15 },
  { sex: 'any', ageMinYears: 12, ageMaxYears: 120, low: 10, high: 20 },
];

describe('flagLabValue', () => {
  it('uses the sex-specific adult band, not the wider any band', () => {
    expect(pickRefBand(hb, 'male', 40)?.low).toBe(13);
    expect(pickRefBand(hb, 'female', 40)?.low).toBe(12);
    expect(flagLabValue({ valueType: 'numeric', valueNum: 13.5, sex: 'male', ageYears: 40, refRanges: hb, criticalLow: 7, criticalHigh: 20 })).toBe('N');
    expect(flagLabValue({ valueType: 'numeric', valueNum: 12, sex: 'male', ageYears: 40, refRanges: hb, criticalLow: 7, criticalHigh: 20 })).toBe('L');
    expect(flagLabValue({ valueType: 'numeric', valueNum: 12, sex: 'female', ageYears: 40, refRanges: hb, criticalLow: 7, criticalHigh: 20 })).toBe('N');
    expect(flagLabValue({ valueType: 'numeric', valueNum: 11.5, sex: 'female', ageYears: 40, refRanges: hb, criticalLow: 7, criticalHigh: 20 })).toBe('L');
    expect(flagLabValue({ valueType: 'numeric', valueNum: 17.5, sex: 'male', ageYears: 40, refRanges: hb, criticalLow: 7, criticalHigh: 20 })).toBe('H');
  });

  it('uses the child age band', () => {
    expect(pickRefBand(hb, 'male', 8)?.sex).toBe('any');
    expect(flagLabValue({ valueType: 'numeric', valueNum: 11.2, sex: 'male', ageYears: 8, refRanges: hb, criticalLow: 7, criticalHigh: 20 })).toBe('N');
    expect(flagLabValue({ valueType: 'numeric', valueNum: 10, sex: 'female', ageYears: 5, refRanges: hb, criticalLow: 7, criticalHigh: 20 })).toBe('L');
    expect(flagLabValue({ valueType: 'numeric', valueNum: 12, sex: 'male', ageYears: 12, refRanges: hb, criticalLow: 7, criticalHigh: 20 })).toBe('L');
  });

  it('lets critical limits win over the reference band', () => {
    expect(flagLabValue({ valueType: 'numeric', valueNum: 7, sex: 'male', ageYears: 40, refRanges: hb, criticalLow: 7, criticalHigh: 20 })).toBe('LL');
    expect(flagLabValue({ valueType: 'numeric', valueNum: 6, sex: 'female', ageYears: 40, refRanges: hb, criticalLow: 7, criticalHigh: 20 })).toBe('LL');
    expect(flagLabValue({ valueType: 'numeric', valueNum: 20, sex: 'male', ageYears: 40, refRanges: hb, criticalLow: 7, criticalHigh: 20 })).toBe('HH');
  });

  it('does not flag text values', () => {
    expect(flagLabValue({ valueType: 'text', valueNum: 1, sex: 'male', ageYears: 40, refRanges: hb, criticalLow: 7, criticalHigh: 20 })).toBeNull();
    expect(flagLabValue({ valueType: 'numeric', valueNum: null, sex: 'male', ageYears: 40, refRanges: hb, criticalLow: null, criticalHigh: null })).toBeNull();
  });
});

describe('opdCollectionAllowed', () => {
  it('blocks an unsettled OPD sample unless collection before payment is on', () => {
    expect(opdCollectionAllowed('opd', false, false)).toBe(false);
    expect(opdCollectionAllowed('opd', true, false)).toBe(true);
    expect(opdCollectionAllowed('opd', false, true)).toBe(true);
    expect(opdCollectionAllowed('ipd', false, false)).toBe(true);
  });
});
