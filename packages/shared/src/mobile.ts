// Proposed mobile (Android) DTOs and request schemas.
// Phase A has no patient / appointment / visit / billing clinical endpoints yet.
// These are additive contracts for apps/mobile and a later API slice. See apps/mobile/API_PROPOSAL.md.

import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm (24-hour)');
const id = z.string().min(1);
const paise = z.number().int();

export const MOBILE_ROLES = ['patient', 'doctor', 'nurse', 'mis', 'equipment', 'hr', 'maintenance'] as const;
export type MobileRole = (typeof MOBILE_ROLES)[number];

/** Map a tenant RBAC roleKey (or the mobile-only `patient` role) onto an Android app. */
export function mobileAppForRole(roleKey: string): MobileRole | null {
  switch (roleKey) {
    case 'patient':
      return 'patient';
    case 'doctor':
      return 'doctor';
    case 'nurse':
      return 'nurse';
    case 'tenant_admin':
    case 'location_admin':
    case 'accounts':
    case 'front_desk':
    case 'cashier':
      return 'mis';
    case 'pharmacist':
    case 'lab_tech':
      return 'equipment';
    default:
      return null;
  }
}

export const APPOINTMENT_STATUSES = [
  'booked',
  'confirmed',
  'checked_in',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const BILL_STATUSES = ['draft', 'issued', 'partial', 'paid', 'overdue', 'cancelled'] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const ORDER_KINDS = ['test', 'medicine'] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];

export const CLINICAL_ORDER_STATUSES = ['draft', 'placed', 'in_progress', 'completed', 'cancelled'] as const;
export type ClinicalOrderStatus = (typeof CLINICAL_ORDER_STATUSES)[number];

export const FEEDBACK_CATEGORIES = ['wait_time', 'staff', 'cleanliness', 'treatment', 'billing'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const appointmentSchema = z.object({
  id,
  tenantId: id,
  locationId: id,
  locationName: z.string(),
  patientId: id,
  patientName: z.string(),
  uhid: z.string(),
  doctorId: id,
  doctorName: z.string(),
  speciality: z.string(),
  date: isoDate,
  slotStart: hhmm,
  slotEnd: hhmm,
  status: z.enum(APPOINTMENT_STATUSES),
  reason: z.string(),
  visitId: z.string().nullable(),
  createdAt: z.string(),
});
export type Appointment = z.infer<typeof appointmentSchema>;

export const doctorSlotSchema = z.object({
  doctorId: id,
  doctorName: z.string(),
  speciality: z.string(),
  locationId: id,
  locationName: z.string(),
  date: isoDate,
  start: hhmm,
  end: hhmm,
  available: z.boolean(),
});
export type DoctorSlot = z.infer<typeof doctorSlotSchema>;

export const doctorDirectoryItemSchema = z.object({
  id,
  name: z.string(),
  speciality: z.string(),
  locationId: id,
  locationName: z.string(),
  consultingDays: z.string(),
});
export type DoctorDirectoryItem = z.infer<typeof doctorDirectoryItemSchema>;

export const visitVitalsSchema = z.object({
  bpSystolic: z.number().int().nullable(),
  bpDiastolic: z.number().int().nullable(),
  pulse: z.number().int().nullable(),
  tempC: z.number().nullable(),
  spo2: z.number().int().nullable(),
  weightKg: z.number().nullable(),
});
export type VisitVitals = z.infer<typeof visitVitalsSchema>;

export const TEST_STATUSES = ['ordered', 'collected', 'reported'] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

export const GENDERS = ['female', 'male', 'other', 'not_recorded'] as const;
export type Gender = (typeof GENDERS)[number];

export const visitTestSchema = z.object({
  name: z.string(),
  status: z.enum(TEST_STATUSES),
  resultSummary: z.string().nullable(),
});
export const visitMedicineSchema = z.object({
  name: z.string(),
  dose: z.string(),
  frequency: z.string(),
  days: z.number().int(),
});

export const visitSchema = z.object({
  id,
  appointmentId: z.string().nullable(),
  patientId: id,
  patientName: z.string(),
  uhid: z.string(),
  doctorId: id,
  doctorName: z.string(),
  locationId: id,
  locationName: z.string(),
  visitedOn: isoDate,
  chiefComplaint: z.string(),
  diagnosis: z.string(),
  notes: z.string(),
  vitals: visitVitalsSchema,
  tests: z.array(visitTestSchema),
  medicines: z.array(visitMedicineSchema),
});
export type Visit = z.infer<typeof visitSchema>;

export const billLineSchema = z.object({
  description: z.string(),
  qty: z.number().int().positive(),
  unitPaise: paise,
  amountPaise: paise,
  /** Basis points. Healthcare from a clinical establishment is 0 (GST-exempt). */
  gstRateBp: paise,
});
export type BillLine = z.infer<typeof billLineSchema>;

export const billSchema = z.object({
  id,
  number: z.string(),
  patientId: id,
  patientName: z.string(),
  uhid: z.string(),
  locationName: z.string(),
  issuedOn: isoDate,
  status: z.enum(BILL_STATUSES),
  subtotalPaise: paise,
  /** Sum of CGST + SGST + IGST. Kept so older clients still read one tax total. */
  gstPaise: paise,
  cgstPaise: paise,
  sgstPaise: paise,
  igstPaise: paise,
  totalPaise: paise,
  paidPaise: paise,
  lines: z.array(billLineSchema),
});
export type Bill = z.infer<typeof billSchema>;

export const orderItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  notes: z.string().max(240).optional(),
  dose: z.string().max(80).optional(),
  frequency: z.string().max(80).optional(),
  days: z.number().int().positive().max(90).optional(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

export const orderSchema = z.object({
  id,
  visitId: id,
  patientId: id,
  patientName: z.string(),
  uhid: z.string(),
  doctorId: id,
  kind: z.enum(ORDER_KINDS),
  items: z.array(orderItemSchema).min(1),
  status: z.enum(CLINICAL_ORDER_STATUSES),
  createdAt: z.string(),
});
export type Order = z.infer<typeof orderSchema>;

export const patientProfileSchema = z.object({
  id,
  name: z.string(),
  uhid: z.string(),
  email: z.email(),
  mobile: z.string(),
  dob: isoDate,
  gender: z.enum(GENDERS),
  bloodGroup: z.string(),
  addressLine1: z.string(),
  city: z.string(),
  stateCode: z.string(),
  pincode: z.string(),
  locationId: id,
  locationName: z.string(),
  emergencyName: z.string(),
  emergencyMobile: z.string(),
});
export type PatientProfile = z.infer<typeof patientProfileSchema>;

export const feedbackSchema = z.object({
  id,
  patientId: id,
  visitId: z.string().nullable(),
  rating: z.number().int().min(1).max(5),
  comment: z.string(),
  categories: z.array(z.enum(FEEDBACK_CATEGORIES)),
  createdAt: z.string(),
});
export type Feedback = z.infer<typeof feedbackSchema>;

export const mobileListSchema = z.object({
  items: z.array(z.unknown()),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export interface MobileList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const bookAppointmentSchema = z.object({
  doctorId: id,
  date: isoDate,
  slotStart: hhmm,
  reason: z.string().trim().min(1, 'Say why you need this visit').max(240),
});
export type BookAppointmentInput = z.infer<typeof bookAppointmentSchema>;

export const submitFeedbackSchema = z.object({
  visitId: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(4, 'Write a short comment').max(1000),
  categories: z.array(z.enum(FEEDBACK_CATEGORIES)).default([]),
});
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;

export const placeOrderSchema = z.object({
  visitId: id,
  kind: z.enum(ORDER_KINDS),
  items: z.array(orderItemSchema).min(1, 'Add at least one item'),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const BILL_STATUS_LABEL: Record<BillStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  partial: 'Part paid',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: 'Booked',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'Did not attend',
};

export const ORDER_STATUS_LABEL: Record<ClinicalOrderStatus, string> = {
  draft: 'Draft',
  placed: 'Placed',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const FEEDBACK_CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  wait_time: 'Waiting time',
  staff: 'Staff',
  cleanliness: 'Cleanliness',
  treatment: 'Treatment',
  billing: 'Billing',
};

export const TEST_STATUS_LABEL: Record<TestStatus, string> = {
  ordered: 'Ordered',
  collected: 'Collected',
  reported: 'Reported',
};

export const GENDER_LABEL: Record<Gender, string> = {
  female: 'Female',
  male: 'Male',
  other: 'Other',
  not_recorded: 'Not recorded',
};

export const ORDER_KIND_LABEL: Record<OrderKind, string> = {
  test: 'Tests',
  medicine: 'Medicines',
};
