import { z } from 'zod';
import { BED_STATUSES, DISCHARGE_TYPES, PAYER_TYPES, WARD_TYPES, type BedStatus, type DischargeType, type PayerType, type WardType } from './codes';
import type { ChargeDto } from './charges';
import type { PatientSummaryDto } from './patient';

export const ADMISSION_TYPES = ['emergency', 'elective', 'day_care'] as const;
export type AdmissionType = (typeof ADMISSION_TYPES)[number];

export const ADMISSION_STATUSES = ['admitted', 'discharge_initiated', 'discharged', 'cancelled'] as const;
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];

export const REQUEST_STATUSES = ['requested', 'admitted', 'cancelled'] as const;
export type AdmissionRequestStatus = (typeof REQUEST_STATUSES)[number];

export const SUMMARY_STATUSES = ['draft', 'final'] as const;
export type SummaryStatus = (typeof SUMMARY_STATUSES)[number];

const code = z
  .string()
  .trim()
  .min(1, 'Enter a code')
  .max(8)
  .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers or a hyphen')
  .transform((value) => value.toUpperCase());

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date');

export const wardCreateSchema = z.object({
  code,
  name: z.string().trim().min(1, 'Enter the ward name').max(80),
  wardType: z.enum(WARD_TYPES),
  isIcu: z.boolean().default(false),
  bedServiceId: z.uuid().nullable().optional(),
  active: z.boolean().optional(),
});
export type WardCreateInput = z.infer<typeof wardCreateSchema>;

export const wardPatchSchema = z.object({
  code: code.optional(),
  name: z.string().trim().min(1).max(80).optional(),
  wardType: z.enum(WARD_TYPES).optional(),
  isIcu: z.boolean().optional(),
  bedServiceId: z.uuid().nullable().optional(),
  active: z.boolean().optional(),
});
export type WardPatchInput = z.infer<typeof wardPatchSchema>;

export const roomCreateSchema = z.object({
  wardId: z.uuid(),
  code,
  name: z.string().trim().min(1, 'Enter the room name').max(80),
});
export type RoomCreateInput = z.infer<typeof roomCreateSchema>;

export const roomPatchSchema = z.object({
  code: code.optional(),
  name: z.string().trim().min(1).max(80).optional(),
});
export type RoomPatchInput = z.infer<typeof roomPatchSchema>;

export const bedCreateSchema = z.object({
  roomId: z.uuid(),
  label: z.string().trim().min(1, 'Enter the bed label').max(20),
  wardClass: z.enum(WARD_TYPES),
  status: z.enum(BED_STATUSES).default('vacant'),
});
export type BedCreateInput = z.infer<typeof bedCreateSchema>;

export const bedPatchSchema = z.object({
  label: z.string().trim().min(1).max(20).optional(),
  wardClass: z.enum(WARD_TYPES).optional(),
  status: z.enum(BED_STATUSES).optional(),
});
export type BedPatchInput = z.infer<typeof bedPatchSchema>;

export const admitSchema = z.object({
  patientId: z.uuid(),
  doctorId: z.uuid(),
  departmentId: z.uuid().optional(),
  bedId: z.uuid(),
  admissionType: z.enum(ADMISSION_TYPES),
  payerType: z.enum(PAYER_TYPES).default('self'),
  isMlc: z.boolean().default(false),
  attendant: z.string().trim().max(120).default(''),
  provisionalDiagnosis: z.string().trim().max(500).default(''),
  requestId: z.uuid().optional(),
});
export type AdmitInput = z.infer<typeof admitSchema>;

export const transferSchema = z.object({
  bedId: z.uuid(),
  reason: z.string().trim().max(300).optional(),
});
export type TransferInput = z.infer<typeof transferSchema>;

export const dischargeSchema = z.object({
  dischargeType: z.enum(DISCHARGE_TYPES),
  overrideReason: z.string().trim().max(500).optional(),
});
export type DischargeInput = z.infer<typeof dischargeSchema>;

export const summarySectionsSchema = z.object({
  diagnosis: z.string().trim().max(2000).default(''),
  course: z.string().trim().max(4000).default(''),
  treatment: z.string().trim().max(4000).default(''),
  condition: z.string().trim().max(1000).default(''),
  advice: z.string().trim().max(2000).default(''),
  followUp: z.string().trim().max(1000).default(''),
});
export type DischargeSummarySections = z.infer<typeof summarySectionsSchema>;

export const summarySaveSchema = z.object({
  sections: summarySectionsSchema,
});
export type SummarySaveInput = z.infer<typeof summarySaveSchema>;

export const admissionRequestSchema = z.object({
  patientId: z.uuid(),
  fromEncounterId: z.uuid(),
  doctorId: z.uuid(),
  reason: z.string().trim().min(3, 'Say why admission is needed').max(500),
  plannedOn: day,
  wardType: z.enum(WARD_TYPES).optional(),
});
export type AdmissionRequestInput = z.infer<typeof admissionRequestSchema>;

export const admissionListQuery = z.object({
  status: z.enum(ADMISSION_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdmissionListQuery = z.infer<typeof admissionListQuery>;

export const admissionRequestQuery = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
});

export const adtReportQuery = z.object({
  from: day,
  to: day,
});
export type AdtReportQuery = z.infer<typeof adtReportQuery>;

export const bedChargeQuery = z.object({
  date: day.optional(),
});

export interface WardDto {
  id: string;
  locationId: string;
  code: string;
  name: string;
  wardType: WardType;
  isIcu: boolean;
  bedServiceId: string | null;
  active: boolean;
}

export interface RoomDto {
  id: string;
  wardId: string;
  code: string;
  name: string;
}

export interface BedDto {
  id: string;
  roomId: string;
  label: string;
  wardClass: WardType;
  status: BedStatus;
}

export interface BedBoardAdmissionDto {
  id: string;
  number: string;
  patientId: string;
  patientName: string;
  uhid: string;
  admittedAt: string;
}

export interface BedBoardBedDto {
  id: string;
  label: string;
  wardClass: WardType;
  status: BedStatus;
  admission: BedBoardAdmissionDto | null;
}

export interface BedBoardRoomDto {
  id: string;
  code: string;
  name: string;
  beds: BedBoardBedDto[];
}

export interface BedBoardWardDto extends WardDto {
  rooms: BedBoardRoomDto[];
}

export interface BedBoardDto {
  wards: BedBoardWardDto[];
}

export interface AdmissionAssignmentDto {
  id: string;
  bedId: string;
  bedLabel: string;
  wardCode: string;
  roomCode: string;
  fromAt: string;
  toAt: string | null;
}

export interface AdmissionDto {
  id: string;
  encounterId: string;
  patientId: string;
  locationId: string;
  number: string;
  admissionType: AdmissionType;
  attendant: string;
  provisionalDiagnosis: string;
  status: AdmissionStatus;
  dischargeType: DischargeType | null;
  doctorId: string | null;
  doctorName: string | null;
  admittedAt: string;
  dischargedAt: string | null;
  payerType: PayerType;
  patient: PatientSummaryDto;
  assignments: AdmissionAssignmentDto[];
}

export interface DischargeSummaryDto {
  id: string;
  admissionId: string;
  status: SummaryStatus;
  sections: DischargeSummarySections;
  finalisedAt: string | null;
}

export interface BedChargeSkip {
  bedLabel: string;
  reason: string;
}

export interface BedChargePostResult {
  date: string;
  charges: ChargeDto[];
  skipped: BedChargeSkip[];
}

export interface AdmissionRegisterRow {
  number: string;
  admittedAt: string;
  patientName: string;
  uhid: string;
  wardCode: string;
  bedLabel: string;
  doctorName: string;
  admissionType: string;
  status: string;
}

export interface TransferRegisterRow {
  admissionNumber: string;
  patientName: string;
  uhid: string;
  fromBed: string;
  toBed: string;
  at: string;
}

export interface DischargeRegisterRow {
  number: string;
  patientName: string;
  uhid: string;
  admittedAt: string;
  dischargedAt: string;
  dischargeType: string;
  wardCode: string;
  bedLabel: string;
}

export interface DischargeSummaryReportRow {
  number: string;
  patientName: string;
  uhid: string;
  dischargedAt: string | null;
  summaryStatus: 'none' | SummaryStatus;
}
