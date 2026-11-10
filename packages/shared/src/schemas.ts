// Request schemas shared by the API (validation + OpenAPI) and the web forms (inline validation).
import { z } from 'zod';
import { checkGstin, isStateCode, normaliseMobile, PINCODE_REGEX } from './india';

const name = z.string().trim().min(2, 'Enter at least 2 characters').max(120);
const email = z.email('Enter a valid email address').max(254);
const mobile = z
  .string()
  .trim()
  .refine((v) => normaliseMobile(v) !== null, 'Enter a 10-digit Indian mobile number');
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), 'Use letters and at least one number');
const uuid = z.uuid();
const stateCode = z.string().refine(isStateCode, 'Choose a state');

export const FACILITY_TYPES = ['nursing_home', 'clinic', 'hospital'] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];
export const FACILITY_TYPE_LABELS: Record<FacilityType, string> = {
  nursing_home: 'Nursing home',
  clinic: 'Clinic',
  hospital: 'Hospital',
};

export const SPECIALITIES = [
  'General Medicine',
  'General Surgery',
  'Obstetrics & Gynaecology',
  'Paediatrics',
  'Orthopaedics',
  'Cardiology',
  'ENT',
  'Ophthalmology',
  'Dermatology',
  'Dental',
  'Physiotherapy',
  'Pathology',
  'Radiology',
  'Emergency & Trauma',
  'Nephrology & Dialysis',
  'Urology',
  'Psychiatry',
] as const;

export const DEFAULT_DEPARTMENTS = ['OPD', 'General Ward', 'Pharmacy', 'Laboratory', 'Billing', 'Reception'] as const;

export const CONSENT_PURPOSES = ['account_management', 'service_delivery', 'billing_invoicing', 'security_audit', 'product_updates'] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

// ---- Auth -----------------------------------------------------------------------------------------------------------
export const signupSchema = z.object({
  name,
  email,
  mobile,
  password: passwordSchema,
  designation: z.enum(['owner', 'manager']),
  acceptTerms: z.literal(true, 'Accept the terms of service to continue'),
  acceptPrivacy: z.literal(true, 'Consent to the privacy notice to continue'),
  productUpdates: z.boolean().default(false),
  noticeVersion: z.string().min(1),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const otpVerifySchema = z.object({
  challengeId: uuid,
  code: z.string().regex(/^[0-9]{6}$/, 'Enter the 6-digit code'),
});
export const otpResendSchema = z.object({ challengeId: uuid });
export const otpLoginRequestSchema = z.object({ email });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(128),
  totp: z.string().regex(/^[0-9]{6}$/).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const totpCodeSchema = z.object({ code: z.string().regex(/^[0-9]{6}$/, 'Enter the 6-digit code') });
export const switchLocationSchema = z.object({ locationId: uuid });

// ---- Setup wizard ---------------------------------------------------------------------------------------------------
export const facilitySchema = z.object({
  facilityType: z.enum(FACILITY_TYPES, 'Choose a facility type'),
  legalName: name,
  displayName: name,
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === '' || checkGstin(v).valid, 'GSTIN must be 15 characters, like 27ABCDE1234F1Z5')
    .default(''),
  registrationNo: z.string().trim().min(2, 'Enter the registration or licence number').max(60),
  bedCount: z.number().int('Whole number of beds').min(0).max(5000),
  specialities: z.array(z.string().trim().min(1).max(60)).max(30),
});
export type FacilityInput = z.infer<typeof facilitySchema>;

export const locationInputSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2, 'Name this location').max(80),
  addressLine1: z.string().trim().min(3, 'Enter the street address').max(160),
  addressLine2: z.string().trim().max(160).default(''),
  city: z.string().trim().min(2, 'Enter the city').max(80),
  stateCode,
  pincode: z.string().trim().regex(PINCODE_REGEX, 'Enter a 6-digit PIN code'),
  phone: z.string().trim().max(20).default(''),
  departments: z.array(z.string().trim().min(1).max(60)).min(1, 'Add at least one department').max(40),
});
export type LocationInput = z.infer<typeof locationInputSchema>;

export const locationsSchema = z.object({
  locations: z.array(locationInputSchema).min(1, 'Add at least one location').max(25),
});

export const billingCycleSchema = z.enum(['monthly', 'annual']);

export const planSelectionSchema = z.object({
  planId: uuid,
  cycle: billingCycleSchema,
  locationCount: z.number().int().min(1).max(100),
});
export type PlanSelectionInput = z.infer<typeof planSelectionSchema>;

export const addonSelectionSchema = z.object({ moduleIds: z.array(uuid).max(60) });

// ---- Billing --------------------------------------------------------------------------------------------------------
export const changeConfigSchema = z.object({
  planId: uuid,
  locationCount: z.number().int().min(1).max(100),
  addonModuleIds: z.array(uuid).max(60),
});
export type ChangeConfigInput = z.infer<typeof changeConfigSchema>;

export const createOrderSchema = z.discriminatedUnion('purpose', [
  z.object({ purpose: z.literal('onboarding') }),
  z.object({ purpose: z.literal('change'), config: changeConfigSchema }),
]);

export const PAYMENT_METHODS = ['upi', 'card', 'netbanking'] as const;
export const PAYMENT_OUTCOMES = ['success', 'failure', 'pending'] as const;

export const payAttemptSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  /** Mock gateway only: which outcome to simulate. */
  outcome: z.enum(PAYMENT_OUTCOMES),
  details: z
    .object({
      vpa: z.string().trim().max(80).optional(),
      cardLast4: z.string().regex(/^[0-9]{4}$/).optional(),
      cardNetwork: z.string().trim().max(20).optional(),
      bank: z.string().trim().max(60).optional(),
    })
    .default({}),
});
export type PayAttemptInput = z.infer<typeof payAttemptSchema>;

export const verifyPaymentSchema = z.object({
  orderId: z.string().min(1).max(64),
  paymentId: z.string().min(1).max(64),
  signature: z.string().min(1).max(256),
});

export const resolvePendingSchema = z.object({ outcome: z.enum(['success', 'failure']) });

// ---- Users ----------------------------------------------------------------------------------------------------------
export const inviteUserSchema = z.object({
  name,
  email,
  roleKey: z.string().min(1),
  /** null = all locations. */
  locationIds: z.array(uuid).min(1, 'Choose at least one location').nullable(),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = z.object({
  status: z.enum(['active', 'disabled']).optional(),
  roleKey: z.string().min(1).optional(),
  locationIds: z.array(uuid).min(1).nullable().optional(),
});

export const acceptInviteSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });

// ---- Privacy (DPDP) -------------------------------------------------------------------------------------------------
export const DPR_TYPES = ['access', 'correction', 'erasure', 'grievance'] as const;
export const DPR_STATUSES = ['open', 'in_progress', 'completed', 'rejected'] as const;

export const dprCreateSchema = z.object({
  type: z.enum(DPR_TYPES),
  principalName: name,
  principalContact: z.string().trim().min(5, 'Enter a phone number or email').max(120),
  reference: z.string().trim().max(80).default(''),
  details: z.string().trim().min(5, 'Describe the request').max(2000),
});
export const dprUpdateSchema = z.object({
  status: z.enum(DPR_STATUSES),
  resolutionNotes: z.string().trim().max(2000).default(''),
});

export const checklistToggleSchema = z.object({ done: z.boolean() });

// ---- App Admin ------------------------------------------------------------------------------------------------------
export const planStatusSchema = z.enum(['active', 'draft', 'archived']);

export const planCreateSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{1,30}$/, 'Lowercase letters, numbers and hyphens'),
  name: z.string().trim().min(2).max(40),
  tagline: z.string().trim().max(80).default(''),
  description: z.string().trim().max(400).default(''),
  highlight: z.boolean().default(false),
  badge: z.string().trim().max(30).default(''),
  status: planStatusSchema.default('draft'),
  monthlyPaise: z.number().int().min(0).max(100_000_000),
  annualPaise: z.number().int().min(0).max(1_200_000_000),
  /** Copy the feature matrix from this plan. */
  copyFromPlanId: uuid.nullable().default(null),
});

export const planUpdateSchema = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  tagline: z.string().trim().max(80).optional(),
  description: z.string().trim().max(400).optional(),
  highlight: z.boolean().optional(),
  badge: z.string().trim().max(30).optional(),
  status: planStatusSchema.optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const planReorderSchema = z.object({ planIds: z.array(uuid).min(1) });

export const matrixUpdateSchema = z.object({
  changes: z
    .array(z.object({ planId: uuid, featureId: uuid, included: z.boolean() }))
    .min(1)
    .max(2000),
});

export const moduleStatusSchema = z.enum(['available', 'coming_soon', 'hidden']);

export const moduleUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(400).optional(),
  status: moduleStatusSchema.optional(),
  addonPurchasable: z.boolean().optional(),
  gstRateBp: z.number().int().min(0).max(2800).optional(),
  sacCode: z.string().trim().max(12).optional(),
  /** Add-on price per location; null removes the price. */
  addonMonthlyPaise: z.number().int().min(0).max(100_000_000).nullable().optional(),
  addonAnnualPaise: z.number().int().min(0).max(1_200_000_000).nullable().optional(),
});

export const featureCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(['function', 'report', 'interface', 'app_feature']),
});

export const planPriceSchema = z.object({
  monthlyPaise: z.number().int().min(0).max(100_000_000),
  annualPaise: z.number().int().min(0).max(1_200_000_000),
});

export const overrideSchema = z
  .object({
    target: z.enum(['module', 'feature']),
    moduleId: uuid.optional(),
    featureId: uuid.optional(),
    effect: z.enum(['grant', 'revoke']),
    reason: z.string().trim().min(3, 'Say why (kept in the audit trail)').max(300),
  })
  .refine((v) => (v.target === 'module' ? !!v.moduleId : !!v.featureId), 'Choose a module or feature');

export const suspendSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });

export const platformSettingsSchema = z.object({
  supplierLegalName: z.string().trim().min(2).max(120),
  supplierTradeName: z.string().trim().min(2).max(120),
  supplierGstin: z.string().trim().toUpperCase().max(15),
  supplierStateCode: stateCode,
  supplierAddress: z.string().trim().min(5).max(300),
  defaultSacCode: z.string().trim().max(12),
  defaultGstRateBp: z.number().int().min(0).max(2800),
  invoicePrefix: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{2,4}$/, '2–4 capital letters or digits'),
});

/** Flatten a ZodError into { field: message } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (!(path in out)) out[path] = issue.message;
  }
  return out;
}
