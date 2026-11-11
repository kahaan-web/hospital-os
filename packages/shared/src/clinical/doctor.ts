import { z } from 'zod';
import { DOSE_FORMS, FREQUENCIES, ROUTES, WARD_TYPES } from './codes';
import type { ClinicalNoteDto } from './notes';
import type { ClinicalOrderDto } from './orders';
import type { PatientAlertDto, PatientSummaryDto } from './patient';
import type { VitalSignsDto } from './vitals';

const icd10 = z
  .string()
  .trim()
  .regex(/^[A-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?$/, 'Use an ICD-10 code');

export const casePaperDiagnosisSchema = z.object({
  code: icd10,
  codeDisplay: z.string().trim().min(1).max(200),
});

export const casePaperSchema = z.object({
  chiefComplaint: z.string().trim().max(8000).optional().default(''),
  history: z.string().trim().max(8000).optional().default(''),
  examination: z.string().trim().max(8000).optional().default(''),
  diagnoses: z.array(casePaperDiagnosisSchema).default([]),
  advice: z.string().trim().max(8000).optional().default(''),
});
export type CasePaperInput = z.infer<typeof casePaperSchema>;

export interface CasePaperDto {
  encounterId: string;
  patient: PatientSummaryDto;
  alerts: PatientAlertDto[];
  chiefComplaint: string;
  history: string;
  examination: string;
  diagnoses: { code: string; codeDisplay: string }[];
  advice: string;
  vitals: VitalSignsDto[];
  orders: ClinicalOrderDto[];
  notes: ClinicalNoteDto[];
}

const frequencyCodes = FREQUENCIES.map((f) => f.code) as [string, ...string[]];

export const prescriptionItemSchema = z.object({
  drugName: z.string().trim().min(1).max(160),
  genericCode: z.string().trim().min(1).max(40),
  strength: z.string().trim().max(40).optional(),
  doseForm: z.enum(DOSE_FORMS).optional(),
  dose: z.string().trim().max(40).optional(),
  frequencyCode: z.enum(frequencyCodes),
  routeCode: z.enum(ROUTES).optional(),
  durationDays: z.number().int().min(1).max(365).optional(),
  quantity: z.number().positive().max(10000).optional(),
  instructions: z.string().trim().max(500).optional(),
});

export const prescriptionSchema = z.object({
  items: z.array(prescriptionItemSchema).min(1, 'Add a medicine'),
  overrideReason: z.string().trim().min(3).max(300).optional(),
  priority: z.enum(['routine', 'urgent', 'stat'] as const).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type PrescriptionInput = z.infer<typeof prescriptionSchema>;

export const ORDER_SET_KINDS = ['lab', 'procedure', 'medicine'] as const;
export type OrderSetKind = (typeof ORDER_SET_KINDS)[number];

export const orderSetLabItemSchema = z.object({
  kind: z.literal('lab'),
  serviceId: z.uuid(),
  instructions: z.string().trim().max(500).optional(),
});

export const orderSetProcedureItemSchema = z.object({
  kind: z.literal('procedure'),
  serviceId: z.uuid(),
  instructions: z.string().trim().max(500).optional(),
});

export const orderSetMedicineItemSchema = z.object({
  kind: z.literal('medicine'),
  drugName: z.string().trim().min(1).max(160),
  genericCode: z.string().trim().min(1).max(40),
  strength: z.string().trim().max(40).optional(),
  doseForm: z.enum(DOSE_FORMS).optional(),
  dose: z.string().trim().max(40).optional(),
  frequencyCode: z.enum(frequencyCodes),
  routeCode: z.enum(ROUTES).optional(),
  durationDays: z.number().int().min(1).max(365).optional(),
  quantity: z.number().positive().max(10000).optional(),
  instructions: z.string().trim().max(500).optional(),
});

export const orderSetItemSchema = z.discriminatedUnion('kind', [
  orderSetLabItemSchema,
  orderSetProcedureItemSchema,
  orderSetMedicineItemSchema,
]);
export type OrderSetItem = z.infer<typeof orderSetItemSchema>;

export const orderSetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(ORDER_SET_KINDS),
  items: z.array(orderSetItemSchema).min(1, 'Add at least one item'),
});
export type OrderSetInput = z.infer<typeof orderSetSchema>;

export interface OrderSetDto {
  id: string;
  name: string;
  kind: OrderSetKind;
  items: OrderSetItem[];
  ownerDoctorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const prescriptionTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  items: z.array(prescriptionItemSchema).min(1),
});
export type PrescriptionTemplateInput = z.infer<typeof prescriptionTemplateSchema>;

export interface PrescriptionTemplateDto {
  id: string;
  name: string;
  items: z.infer<typeof prescriptionItemSchema>[];
  ownerDoctorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const serviceOrderSchema = z.object({
  items: z
    .array(
      z.object({
        serviceId: z.uuid(),
        instructions: z.string().trim().max(500).optional(),
      }),
    )
    .min(1, 'Add a service'),
  priority: z.enum(['routine', 'urgent', 'stat'] as const).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type ServiceOrderInput = z.infer<typeof serviceOrderSchema>;

export const cpoeAdmissionRequestSchema = z.object({
  reason: z.string().trim().min(2).max(500),
  plannedOn: z.string().date(),
  wardType: z.enum(WARD_TYPES).optional(),
});
export type CpoeAdmissionRequestInput = z.infer<typeof cpoeAdmissionRequestSchema>;

export interface VitalsGraphPoint {
  recordedAt: string;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  pulse: number | null;
  tempC: number | null;
  spo2: number | null;
  weightKg: number | null;
}

export interface VitalsGraphDto {
  encounterId: string;
  points: VitalsGraphPoint[];
}

export interface MyQueueItemDto {
  encounterId: string;
  encounterNumber: string;
  startedAt: string;
  visitType: string | null;
  patient: PatientSummaryDto;
  tokenHint: string | null;
}

export interface InpatientRowDto {
  encounterId: string;
  encounterNumber: string;
  patient: PatientSummaryDto;
  wardCode: string | null;
  bedLabel: string | null;
  startedAt: string;
  doctorId: string | null;
}
