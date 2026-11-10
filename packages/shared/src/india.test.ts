import { describe, expect, it } from 'vitest';
import { PINCODE_REGEX, checkGstin, gstinCheckDigit, isStateCode, normaliseMobile, stateName } from './india';

function withCheckDigit(first14: string): string {
  return first14 + gstinCheckDigit(first14);
}

describe('GSTIN', () => {
  const valid = withCheckDigit('27ABCDE1234F1Z');

  it('accepts a 15-character GSTIN whose state code and check digit are real', () => {
    expect(valid).toHaveLength(15);
    expect(checkGstin(valid)).toEqual({ valid: true, checksumValid: true, stateCode: '27' });
    expect(checkGstin(`  ${valid.toLowerCase()}  `)).toMatchObject({ valid: true, checksumValid: true, stateCode: '27' });
    expect(stateName('27')).toBe('Maharashtra');
    expect(isStateCode('27')).toBe(true);
  });

  it('keeps a wrong check digit as a format-valid GSTIN and rejects bad shapes and state codes', () => {
    const wrong = `${valid.slice(0, 14)}${valid[14] === '0' ? '1' : '0'}`;
    expect(checkGstin(wrong)).toMatchObject({ valid: true, checksumValid: false, stateCode: '27' });

    expect(checkGstin('27ABCDE1234F1Z')).toMatchObject({ valid: false, checksumValid: false, stateCode: null });
    expect(checkGstin('not-a-gstin')).toMatchObject({ valid: false, stateCode: null });
    expect(checkGstin(withCheckDigit('99ABCDE1234F1Z')).valid).toBe(false);
    expect(checkGstin(withCheckDigit('25ABCDE1234F1Z')).valid).toBe(false);
    expect(isStateCode('25')).toBe(false);
    expect(isStateCode('99')).toBe(false);
  });
});

describe('mobile numbers', () => {
  it('normalises Indian mobiles to 10 digits', () => {
    expect(normaliseMobile('9876543210')).toBe('9876543210');
    expect(normaliseMobile('+91 98765 43210')).toBe('9876543210');
    expect(normaliseMobile('+91-9876543210')).toBe('9876543210');
    expect(normaliseMobile('09876543210')).toBe('9876543210');
    expect(normaliseMobile('91 9876543210')).toBe('9876543210');
    expect(normaliseMobile('(98765) 43210')).toBe('9876543210');
  });

  it('rejects numbers that are not a 10-digit Indian mobile', () => {
    expect(normaliseMobile('5876543210')).toBeNull();
    expect(normaliseMobile('98765')).toBeNull();
    expect(normaliseMobile('98765432101')).toBeNull();
    expect(normaliseMobile('')).toBeNull();
    expect(normaliseMobile('+1 9876543210')).toBeNull();
  });
});

describe('PIN codes', () => {
  it('accepts a 6-digit PIN that does not start with 0', () => {
    expect(PINCODE_REGEX.test('400001')).toBe(true);
    expect(PINCODE_REGEX.test('452001')).toBe(true);
    expect(PINCODE_REGEX.test('302001')).toBe(true);
    expect(PINCODE_REGEX.test('000000')).toBe(false);
    expect(PINCODE_REGEX.test('012345')).toBe(false);
    expect(PINCODE_REGEX.test('40001')).toBe(false);
    expect(PINCODE_REGEX.test('4000012')).toBe(false);
    expect(PINCODE_REGEX.test('40000A')).toBe(false);
  });
});
