import { z } from 'zod';

export const NOTE_KINDS = [
  'chief_complaint',
  'history',
  'examination',
  'diagnosis',
  'plan',
  'advice',
  'progress',
  'nursing',
  'procedure',
] as const;
export type ClinicalNoteKind = (typeof NOTE_KINDS)[number];

export interface ClinicalNoteDto {
  id: string;
  encounterId: string;
  patientId: string;
  kind: ClinicalNoteKind;
  body: string;
  code: string | null;
  codeDisplay: string | null;
  authorUserId: string | null;
  supersedesId: string | null;
  createdAt: string;
}

export const addClinicalNoteSchema = z.object({
  kind: z.enum(NOTE_KINDS),
  body: z.string().trim().min(1, 'Write the note').max(8000),
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?$/, 'Use an ICD-10 code')
    .nullable()
    .optional(),
  codeDisplay: z.string().trim().max(200).nullable().optional(),
  /** Amend by adding a row that points at the note it replaces. Notes are not edited. */
  supersedesId: z.uuid().nullable().optional(),
});
export type AddClinicalNoteInput = z.infer<typeof addClinicalNoteSchema>;
