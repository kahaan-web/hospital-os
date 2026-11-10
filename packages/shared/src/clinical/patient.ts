import { z } from 'zod';
import { BLOOD_GROUPS, GENDERS, ID_TYPES, RELATIONS, type BloodGroup, type ClinicalGender, type IdType, type Relation } from './codes';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date');
const optionalText = (max: number) => z.string().trim().max(max).optional();

export interface PatientDto {
  id: string;
  uhid: string;
  registeredLocationId: string | null;
  title: string;
  firstName: string;
  middleName: string;
  lastName: string;
  fullName: string;
  gender: ClinicalGender;
  dob: string | null;
  ageYearsAtReg: number | null;
  dobEstimated: boolean;
  ageLabel: string;
  mobile: string;
  altMobile: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  district: string;
  stateCode: string;
  pincode: string;
  bloodGroup: BloodGroup | null;
  maritalStatus: string;
  guardianName: string;
  guardianRelation: Relation | null;
  emergencyName: string;
  emergencyMobile: string;
  idType: IdType;
  idLast4: string | null;
  abhaNumber: string | null;
  abhaAddress: string | null;
  photoPath: string | null;
  status: 'active' | 'merged' | 'inactive';
  mergedIntoId: string | null;
  isSample: boolean;
  createdAt: string;
}

export interface PatientSummaryDto {
  id: string;
  uhid: string;
  fullName: string;
  gender: ClinicalGender;
  ageLabel: string;
  mobileMasked: string;
  city: string;
}

export interface PatientAlertDto {
  id: string;
  patientId: string;
  kind: 'allergy' | 'condition' | 'alert';
  text: string;
  severity: 'low' | 'high';
  recordedBy: string | null;
  inactiveAt: string | null;
  createdAt: string;
}

function ymd(date: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: pick('year'), m: pick('month'), d: pick('day') };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `34 Y` once a year old, otherwise `8 M`, otherwise `12 D`. Empty when the date of birth is unknown. */
export function ageLabel(dob: string | Date | null | undefined, at: Date = new Date()): string {
  if (!dob) return '';
  let y: number;
  let m: number;
  let d: number;
  if (typeof dob === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
    if (!match) return '';
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else {
    const parts = ymd(dob);
    y = parts.y;
    m = parts.m;
    d = parts.d;
  }
  const now = ymd(at);
  let years = now.y - y;
  let months = now.m - m;
  let days = now.d - d;
  if (days < 0) {
    months -= 1;
    const prevMonth = now.m === 1 ? 12 : now.m - 1;
    const prevYear = now.m === 1 ? now.y - 1 : now.y;
    days += daysInMonth(prevYear, prevMonth);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years >= 1) return `${years} Y`;
  if (months >= 1) return `${months} M`;
  return `${Math.max(days, 0)} D`;
}

/** Keep the first two and last two digits. */
export function maskMobile(mobile: string | null | undefined): string {
  const digits = (mobile ?? '').replace(/\D/g, '');
  const core = digits.length > 10 ? digits.slice(-10) : digits;
  if (core.length < 6) return core ? '•'.repeat(core.length) : '';
  return `${core.slice(0, 2)}${'•'.repeat(core.length - 4)}${core.slice(-2)}`;
}

const person = {
  title: optionalText(16),
  firstName: z.string().trim().min(1, 'Enter the first name').max(80),
  middleName: optionalText(80),
  lastName: optionalText(80),
  gender: z.enum(GENDERS),
  dob: dateOnly.nullable().optional(),
  ageYearsAtReg: z.number().int().min(0).max(130).nullable().optional(),
  dobEstimated: z.boolean().optional(),
  mobile: optionalText(15),
  altMobile: optionalText(15),
  email: z.string().trim().max(254).optional(),
  addressLine1: optionalText(160),
  addressLine2: optionalText(160),
  city: optionalText(80),
  district: optionalText(80),
  stateCode: z.string().trim().max(2).optional(),
  pincode: z.string().trim().max(6).optional(),
  bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
  maritalStatus: optionalText(32),
  guardianName: optionalText(120),
  guardianRelation: z.enum(RELATIONS).nullable().optional(),
  emergencyName: optionalText(120),
  emergencyMobile: optionalText(15),
  idType: z.enum(ID_TYPES).optional(),
  idLast4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Store only the last 4 digits')
    .nullable()
    .optional(),
  abhaNumber: z
    .string()
    .trim()
    .regex(/^\d{2}-\d{4}-\d{4}-\d{4}$/, 'ABHA looks like 12-3456-7890-1234')
    .nullable()
    .optional(),
  abhaAddress: optionalText(80),
};

function idLast4Only(value: { idType?: IdType; idLast4?: string | null }, ctx: z.RefinementCtx): void {
  if (value.idType && value.idType !== 'none' && !value.idLast4) {
    ctx.addIssue({ code: 'custom', path: ['idLast4'], message: 'Enter the last 4 digits only' });
  }
  if (value.idLast4 && value.idLast4.length !== 4) {
    ctx.addIssue({ code: 'custom', path: ['idLast4'], message: 'Aadhaar and other IDs are stored as the last 4 digits' });
  }
}

export const patientCreateSchema = z
  .object({
    ...person,
    registeredLocationId: z.uuid().nullable().optional(),
    /** Set when the counter has reviewed a possible duplicate. Used by registration. */
    confirmNew: z.boolean().optional(),
  })
  .superRefine(idLast4Only);
export type PatientCreateInput = z.infer<typeof patientCreateSchema>;

export const patientUpdateSchema = z
  .object({
    ...person,
    firstName: person.firstName.optional(),
    gender: z.enum(GENDERS).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .superRefine(idLast4Only);
export type PatientUpdateInput = z.infer<typeof patientUpdateSchema>;

export const patientSearchQuery = z.object({
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PatientSearchQuery = z.infer<typeof patientSearchQuery>;

export const patientAlertSchema = z.object({
  kind: z.enum(['allergy', 'condition', 'alert']),
  text: z.string().trim().min(2, 'Write the alert').max(240),
  severity: z.enum(['low', 'high']).default('low'),
});
export type PatientAlertInput = z.infer<typeof patientAlertSchema>;
