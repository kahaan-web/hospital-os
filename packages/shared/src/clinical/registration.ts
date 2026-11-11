import { z } from 'zod';
import { GENDERS } from './codes';

export interface PatientDocumentDto {
  id: string;
  patientId: string;
  kind: string;
  mime: string;
  size: number;
  uploadedBy: string | null;
  createdAt: string;
}

export interface MlcCaseDto {
  id: string;
  patientId: string;
  encounterId: string;
  number: string;
  policeStation: string;
  broughtBy: string;
  injurySummary: string;
  reportedAt: string;
  patientName?: string;
  patientUhid?: string;
}

export const patientDocumentKindSchema = z.object({
  kind: z.string().trim().min(1, 'Name the document type').max(60),
});

export const patientMailerSchema = z.object({
  channel: z.enum(['email', 'sms', 'both']),
  template: z.enum(['registration_welcome', 'uhid_reminder']).default('registration_welcome'),
  message: z.string().trim().max(500).optional(),
});

export type PatientMailerInput = z.infer<typeof patientMailerSchema>;

export const mlcCaseSchema = z.object({
  patientId: z.uuid(),
  encounterId: z.uuid(),
  policeStation: z.string().trim().max(120).default(''),
  broughtBy: z.string().trim().max(120).default(''),
  injurySummary: z.string().trim().min(3, 'Summarise the injury').max(2000),
  reportedAt: z.string().datetime().optional(),
});

export type MlcCaseInput = z.infer<typeof mlcCaseSchema>;

export const registerReportQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(2).optional(),
  gender: z.enum(GENDERS).optional(),
  ageMin: z.coerce.number().int().min(0).max(130).optional(),
  ageMax: z.coerce.number().int().min(0).max(130).optional(),
});

export type RegisterReportQuery = z.infer<typeof registerReportQuery>;

export interface RegisterReportRow {
  uhid: string;
  fullName: string;
  gender: string;
  ageLabel: string;
  mobile: string;
  city: string;
  stateCode: string;
  registeredAt: string;
}
