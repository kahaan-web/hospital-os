import { describe, expect, it } from 'vitest';
import { gstinCheckDigit } from './india';
import {
  facilitySchema,
  fieldErrors,
  inviteUserSchema,
  locationInputSchema,
  loginSchema,
  overrideSchema,
  otpVerifySchema,
  passwordSchema,
  payAttemptSchema,
  planSelectionSchema,
  signupSchema,
  verifyPaymentSchema,
} from './schemas';

const gstin = `27ABCDE1234F1Z${gstinCheckDigit('27ABCDE1234F1Z')}`;

const signup = {
  name: 'Asha Demo',
  email: 'asha.demo@hospitalos.test',
  mobile: '+91 98765 43210',
  password: 'Owner#2026',
  designation: 'owner' as const,
  acceptTerms: true as const,
  acceptPrivacy: true as const,
  noticeVersion: '2026-04-01',
};

describe('signupSchema and passwordSchema', () => {
  it('accepts a signup and normalises the mobile on later use', () => {
    const parsed = signupSchema.parse(signup);
    expect(parsed.productUpdates).toBe(false);
    expect(parsed.email).toBe('asha.demo@hospitalos.test');
    expect(passwordSchema.parse('Owner#2026')).toBe('Owner#2026');
  });

  it('rejects a weak password, a bad mobile, and missing consent', () => {
    expect(passwordSchema.safeParse('short1').success).toBe(false);
    expect(passwordSchema.safeParse('longpassword').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(false);

    const badMobile = signupSchema.safeParse({ ...signup, mobile: '5876543210' });
    expect(badMobile.success).toBe(false);

    const noTerms = signupSchema.safeParse({ ...signup, acceptTerms: false });
    expect(noTerms.success).toBe(false);
    if (!noTerms.success) expect(fieldErrors(noTerms.error).acceptTerms).toMatch(/terms/i);

    const noPrivacy = signupSchema.safeParse({ ...signup, acceptPrivacy: false, email: 'not-an-email' });
    expect(noPrivacy.success).toBe(false);
    if (!noPrivacy.success) {
      const errors = fieldErrors(noPrivacy.error);
      expect(errors.email).toBeTruthy();
      expect(errors.acceptPrivacy).toBeTruthy();
      expect(errors.email).not.toBe(errors.acceptPrivacy);
    }
  });
});

describe('otp and login', () => {
  it('requires a uuid challenge and a 6-digit code', () => {
    expect(otpVerifySchema.safeParse({ challengeId: 'not-a-uuid', code: '123456' }).success).toBe(false);
    expect(otpVerifySchema.safeParse({ challengeId: '11111111-1111-4111-8111-111111111111', code: '12345' }).success).toBe(false);
    expect(otpVerifySchema.parse({ challengeId: '11111111-1111-4111-8111-111111111111', code: '123456' }).code).toBe('123456');
  });

  it('lets login omit the TOTP code', () => {
    expect(loginSchema.parse({ email: 'asha.demo@hospitalos.test', password: 'x' }).totp).toBeUndefined();
    expect(loginSchema.safeParse({ email: 'asha.demo@hospitalos.test', password: 'x', totp: '12' }).success).toBe(false);
  });
});

describe('facility, location and plan schemas', () => {
  it('allows a blank GSTIN and a format-valid GSTIN, and rejects a malformed one', () => {
    const base = {
      facilityType: 'nursing_home' as const,
      legalName: 'Fictional Lakeside Nursing Home',
      displayName: 'Lakeside Demo',
      registrationNo: 'LIC-DEMO-001',
      bedCount: 12,
      specialities: ['General Medicine'],
    };
    expect(facilitySchema.parse(base).gstin).toBe('');
    expect(facilitySchema.parse({ ...base, gstin: gstin.toLowerCase() }).gstin).toBe(gstin);
    expect(facilitySchema.safeParse({ ...base, gstin: 'NOT-A-GSTIN' }).success).toBe(false);
    expect(facilitySchema.safeParse({ ...base, bedCount: 1.5 }).success).toBe(false);
    expect(facilitySchema.safeParse({ ...base, bedCount: -1 }).success).toBe(false);
  });

  it('checks the PIN code, state and at least one department', () => {
    const location = {
      name: 'Mumbai',
      addressLine1: '12 Demo Marg',
      city: 'Mumbai',
      stateCode: '27',
      pincode: '400001',
      departments: ['OPD'],
    };
    const parsed = locationInputSchema.parse(location);
    expect(parsed.addressLine2).toBe('');
    expect(parsed.phone).toBe('');
    expect(locationInputSchema.safeParse({ ...location, pincode: '000000' }).success).toBe(false);
    expect(locationInputSchema.safeParse({ ...location, pincode: '40001' }).success).toBe(false);
    expect(locationInputSchema.safeParse({ ...location, stateCode: '25' }).success).toBe(false);
    expect(locationInputSchema.safeParse({ ...location, departments: [] }).success).toBe(false);
  });

  it('requires a plan id and at least one location on the plan step', () => {
    expect(planSelectionSchema.safeParse({ planId: '11111111-1111-4111-8111-111111111111', cycle: 'monthly', locationCount: 0 }).success).toBe(
      false,
    );
    expect(planSelectionSchema.parse({ planId: '11111111-1111-4111-8111-111111111111', cycle: 'annual', locationCount: 2 }).cycle).toBe(
      'annual',
    );
  });
});

describe('billing, invite and override schemas', () => {
  it('defaults pay-attempt details and requires the verify triple', () => {
    expect(payAttemptSchema.parse({ method: 'upi', outcome: 'success' }).details).toEqual({});
    expect(payAttemptSchema.safeParse({ method: 'cash', outcome: 'success' }).success).toBe(false);
    expect(payAttemptSchema.safeParse({ method: 'card', outcome: 'success', details: { cardLast4: '12' } }).success).toBe(false);
    expect(verifyPaymentSchema.safeParse({ orderId: '', paymentId: 'pay_1', signature: 'abc' }).success).toBe(false);
    expect(verifyPaymentSchema.parse({ orderId: 'order_1', paymentId: 'pay_1', signature: 'abc' }).orderId).toBe('order_1');
  });

  it('allows an invite for every location, and requires a target on an override', () => {
    const invite = inviteUserSchema.parse({
      name: 'Nurse Demo',
      email: 'nurse.demo@hospitalos.test',
      roleKey: 'nurse',
      locationIds: null,
    });
    expect(invite.locationIds).toBeNull();
    expect(
      inviteUserSchema.safeParse({ name: 'Nurse Demo', email: 'nurse.demo@hospitalos.test', roleKey: 'nurse', locationIds: [] }).success,
    ).toBe(false);

    const moduleId = '11111111-1111-4111-8111-111111111111';
    expect(overrideSchema.safeParse({ target: 'module', effect: 'grant', reason: 'Pilot site' }).success).toBe(false);
    expect(overrideSchema.parse({ target: 'module', moduleId, effect: 'revoke', reason: 'Not contracted' }).moduleId).toBe(moduleId);
  });
});
