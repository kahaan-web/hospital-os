import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { schema, type Tx } from '@hos/db';
import {
  CLINICAL_FEATURES,
  ageLabel,
  type ClinicalCtx,
  type MlcCaseDto,
  type MlcCaseInput,
  type PatientCreateInput,
  type PatientDocumentDto,
  type PatientDto,
  type PatientMailerInput,
  type PatientSummaryDto,
  type PatientUpdateInput,
  type RegisterReportQuery,
  type RegisterReportRow,
} from '@hos/shared';
import { and, asc, desc, eq, gte, ilike, lte, sql } from 'drizzle-orm';
import type { EmailSender, SmsSender } from '../../providers';
import { ApiError } from '../../http';
import { patientDto, readPatient } from '../patients-read';
import { patientSummary } from '../encounters';
import { numbering } from '../numbering';

function normalizeMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

function nameSimilar(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/\s+/g, ' ').trim();
  const nb = b.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return levenshtein(na, nb) / Math.max(na.length, nb.length) <= 0.28;
}

function dobSimilar(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

function rowToCreate(input: PatientCreateInput, uhid: string, tenantId: string, locationId: string | null, userId: string) {
  return {
    tenantId,
    uhid,
    registeredLocationId: input.registeredLocationId ?? locationId,
    title: input.title ?? '',
    firstName: input.firstName,
    middleName: input.middleName ?? '',
    lastName: input.lastName ?? '',
    gender: input.gender,
    dob: input.dob ?? null,
    ageYearsAtReg: input.ageYearsAtReg ?? null,
    dobEstimated: input.dobEstimated ?? false,
    mobile: input.mobile ?? '',
    altMobile: input.altMobile ?? '',
    email: input.email ?? '',
    addressLine1: input.addressLine1 ?? '',
    addressLine2: input.addressLine2 ?? '',
    city: input.city ?? '',
    district: input.district ?? '',
    stateCode: input.stateCode ?? '',
    pincode: input.pincode ?? '',
    bloodGroup: input.bloodGroup ?? null,
    maritalStatus: input.maritalStatus ?? '',
    guardianName: input.guardianName ?? '',
    guardianRelation: input.guardianRelation ?? null,
    emergencyName: input.emergencyName ?? '',
    emergencyMobile: input.emergencyMobile ?? '',
    idType: input.idType ?? 'none',
    idLast4: input.idLast4 ?? null,
    abhaNumber: input.abhaNumber ?? null,
    abhaAddress: input.abhaAddress ?? '',
    status: 'active' as const,
    isSample: false,
    createdBy: userId,
  };
}

export async function findPossibleDuplicates(tx: Tx, input: PatientCreateInput): Promise<PatientSummaryDto[]> {
  const mobile = normalizeMobile(input.mobile ?? '');
  if (mobile.length < 10) return [];
  const rows = await tx
    .select()
    .from(schema.patients)
    .where(and(sql`right(regexp_replace(${schema.patients.mobile}, '\\D', '', 'g'), 10) = ${mobile}`, eq(schema.patients.status, 'active')));
  const name = `${input.firstName} ${input.lastName ?? ''}`.trim();
  return rows
    .filter((row) => nameSimilar(row.fullName ?? name, name) || dobSimilar(row.dob, input.dob ?? null))
  .map(patientSummary);
}

export async function createPatient(ctx: ClinicalCtx<Tx>, input: PatientCreateInput): Promise<PatientDto> {
  if (input.idType === 'aadhaar_last4' && input.idLast4 && /^\d{12}$/.test(input.idLast4)) {
    throw new ApiError(400, 'validation', 'Store only the last 4 digits of Aadhaar', { idLast4: 'Full Aadhaar numbers are not stored' });
  }
  if (!input.confirmNew) {
    const dupes = await findPossibleDuplicates(ctx.tx, input);
    if (dupes.length) {
      throw new ApiError(409, 'possible_duplicate', 'A patient with this mobile may already be registered', undefined, { duplicates: dupes });
    }
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const uhid = await numbering.next(ctx, 'uhid');
    try {
      const [row] = await ctx.tx.insert(schema.patients).values(rowToCreate(input, uhid, ctx.tenantId, ctx.locationId, ctx.userId)).returning();
      await ctx.audit('registration.patient.create', 'patient', row!.id, null, { uhid });
      return patientDto(row!);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: string }).code) : '';
      if (code === '23505' && attempt < 3) continue;
      throw error;
    }
  }
  throw new ApiError(500, 'internal', 'Could not issue a UHID');
}

export async function updatePatient(ctx: ClinicalCtx<Tx>, id: string, input: PatientUpdateInput): Promise<PatientDto> {
  if (input.idType === 'aadhaar_last4' && input.idLast4 && /^\d{12}$/.test(input.idLast4)) {
    throw new ApiError(400, 'validation', 'Store only the last 4 digits of Aadhaar', { idLast4: 'Full Aadhaar numbers are not stored' });
  }
  const existing = await readPatient(ctx.tx, id);
  const patch: Partial<typeof schema.patients.$inferInsert> = {};
  for (const key of [
    'title', 'firstName', 'middleName', 'lastName', 'gender', 'dob', 'ageYearsAtReg', 'dobEstimated',
    'mobile', 'altMobile', 'email', 'addressLine1', 'addressLine2', 'city', 'district', 'stateCode', 'pincode',
    'bloodGroup', 'maritalStatus', 'guardianName', 'guardianRelation', 'emergencyName', 'emergencyMobile',
    'idType', 'idLast4', 'abhaNumber', 'abhaAddress', 'status',
  ] as const) {
    if (input[key] !== undefined) patch[key] = input[key] as never;
  }
  const [row] = await ctx.tx.update(schema.patients).set(patch).where(eq(schema.patients.id, id)).returning();
  if (!row) throw new ApiError(404, 'not_found', 'Patient not found');
  await ctx.audit('registration.patient.update', 'patient', id, existing, patientDto(row));
  return patientDto(row);
}

export async function savePatientPhoto(ctx: ClinicalCtx<Tx>, patientId: string, relativePath: string): Promise<PatientDto> {
  await readPatient(ctx.tx, patientId);
  const [row] = await ctx.tx.update(schema.patients).set({ photoPath: relativePath }).where(eq(schema.patients.id, patientId)).returning();
  await ctx.audit('registration.patient.photo', 'patient', patientId, null, { photo: true });
  return patientDto(row!);
}

export function documentDto(row: typeof schema.patientDocuments.$inferSelect): PatientDocumentDto {
  return {
    id: row.id,
    patientId: row.patientId,
    kind: row.kind,
    mime: row.mime,
    size: row.size,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listDocuments(tx: Tx, patientId: string): Promise<PatientDocumentDto[]> {
  await readPatient(tx, patientId);
  const rows = await tx.select().from(schema.patientDocuments).where(eq(schema.patientDocuments.patientId, patientId)).orderBy(desc(schema.patientDocuments.createdAt));
  return rows.map(documentDto);
}

export async function addDocument(
  ctx: ClinicalCtx<Tx>,
  patientId: string,
  kind: string,
  relativePath: string,
  mime: string,
  size: number,
): Promise<PatientDocumentDto> {
  await readPatient(ctx.tx, patientId);
  const [row] = await ctx.tx
    .insert(schema.patientDocuments)
    .values({
      tenantId: ctx.tenantId,
      patientId,
      kind,
      filePath: relativePath,
      mime,
      size,
      uploadedBy: ctx.userId,
    })
    .returning();
  await ctx.audit('registration.document.create', 'patient_document', row!.id, null, { kind });
  return documentDto(row!);
}

export async function deleteDocument(ctx: ClinicalCtx<Tx>, patientId: string, docId: string): Promise<void> {
  const [row] = await ctx.tx
    .select()
    .from(schema.patientDocuments)
    .where(and(eq(schema.patientDocuments.patientId, patientId), eq(schema.patientDocuments.id, docId)));
  if (!row) throw new ApiError(404, 'not_found', 'Document not found');
  await ctx.tx.delete(schema.patientDocuments).where(eq(schema.patientDocuments.id, docId));
  await ctx.audit('registration.document.delete', 'patient_document', docId, row, null);
}

export async function sendMailer(
  ctx: ClinicalCtx<Tx>,
  patientId: string,
  input: PatientMailerInput,
  email: EmailSender,
  sms: SmsSender,
): Promise<{ queued: boolean }> {
  const patient = await readPatient(ctx.tx, patientId);
  const body = input.message ?? `Your UHID at our hospital is ${patient.uhid}. Keep it for future visits.`;
  if ((input.channel === 'email' || input.channel === 'both') && patient.email) {
    await email.send(ctx.tx, {
      tenantId: ctx.tenantId,
      to: patient.email,
      subject: 'Hospital registration',
      template: input.template,
      body,
    });
  }
  if ((input.channel === 'sms' || input.channel === 'both') && patient.mobile) {
    await sms.send(ctx.tx, { tenantId: ctx.tenantId, to: patient.mobile, template: input.template, body });
  }
  await ctx.audit('registration.mailer.send', 'patient', patientId, null, { channel: input.channel, template: input.template });
  return { queued: true };
}

function mlcDto(row: typeof schema.mlcCases.$inferSelect, patient?: { fullName: string; uhid: string }): MlcCaseDto {
  return {
    id: row.id,
    patientId: row.patientId,
    encounterId: row.encounterId,
    number: row.number,
    policeStation: row.policeStation,
    broughtBy: row.broughtBy,
    injurySummary: row.injurySummary,
    reportedAt: row.reportedAt.toISOString(),
    ...(patient ? { patientName: patient.fullName, patientUhid: patient.uhid } : {}),
  };
}

export async function createMlc(ctx: ClinicalCtx<Tx>, input: MlcCaseInput): Promise<MlcCaseDto> {
  await readPatient(ctx.tx, input.patientId);
  const [encounter] = await ctx.tx
    .select()
    .from(schema.encounters)
    .where(and(eq(schema.encounters.id, input.encounterId), eq(schema.encounters.patientId, input.patientId)));
  if (!encounter) throw new ApiError(404, 'not_found', 'Encounter not found for this patient');
  const number = await numbering.next(ctx, 'mlc');
  const [row] = await ctx.tx
    .insert(schema.mlcCases)
    .values({
      tenantId: ctx.tenantId,
      patientId: input.patientId,
      encounterId: input.encounterId,
      number,
      policeStation: input.policeStation ?? '',
      broughtBy: input.broughtBy ?? '',
      injurySummary: input.injurySummary,
      reportedAt: input.reportedAt ? new Date(input.reportedAt) : new Date(),
    })
    .returning();
  await ctx.tx.update(schema.encounters).set({ isMlc: true }).where(eq(schema.encounters.id, input.encounterId));
  await ctx.audit('registration.mlc.create', 'mlc_case', row!.id, null, { number });
  const patient = await readPatient(ctx.tx, input.patientId);
  return mlcDto(row!, { fullName: patient.fullName, uhid: patient.uhid });
}

export async function listMlc(tx: Tx): Promise<MlcCaseDto[]> {
  const rows = await tx.select().from(schema.mlcCases).orderBy(desc(schema.mlcCases.reportedAt));
  const out: MlcCaseDto[] = [];
  for (const row of rows) {
    const [patient] = await tx.select({ fullName: schema.patients.fullName, uhid: schema.patients.uhid }).from(schema.patients).where(eq(schema.patients.id, row.patientId));
    out.push(mlcDto(row, patient ? { fullName: patient.fullName ?? '', uhid: patient.uhid } : undefined));
  }
  return out;
}

export async function registerReport(tx: Tx, q: RegisterReportQuery): Promise<RegisterReportRow[]> {
  const filters = [
    gte(schema.patients.createdAt, new Date(`${q.from}T00:00:00+05:30`)),
    lte(schema.patients.createdAt, new Date(`${q.to}T23:59:59+05:30`)),
    q.city ? ilike(schema.patients.city, q.city) : undefined,
    q.state ? eq(schema.patients.stateCode, q.state) : undefined,
    q.gender ? eq(schema.patients.gender, q.gender) : undefined,
  ].filter((f): f is NonNullable<typeof f> => f != null);
  const rows = await tx
    .select()
    .from(schema.patients)
    .where(and(...filters))
    .orderBy(asc(schema.patients.createdAt));
  return rows
    .filter((row) => {
      if (q.ageMin == null && q.ageMax == null) return true;
      const years = row.ageYearsAtReg ?? (row.dob ? Number(ageLabel(row.dob).replace(/\D/g, '')) || 0 : null);
      if (years == null) return false;
      if (q.ageMin != null && years < q.ageMin) return false;
      if (q.ageMax != null && years > q.ageMax) return false;
      return true;
    })
    .map((row) => ({
      uhid: row.uhid,
      fullName: row.fullName ?? '',
      gender: row.gender,
      ageLabel: ageLabel(row.dob),
      mobile: row.mobile,
      city: row.city,
      stateCode: row.stateCode,
      registeredAt: row.createdAt.toISOString(),
    }));
}

export function registerReportCsv(rows: RegisterReportRow[]): string {
  const header = ['UHID', 'Name', 'Gender', 'Age', 'Mobile', 'City', 'State', 'Registered at'];
  // Prefix cells that a spreadsheet would read as a formula (CSV injection), then quote.
  const esc = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const lines = [header.join(',')].concat(
    rows.map((r) => [r.uhid, r.fullName, r.gender, r.ageLabel, r.mobile, r.city, r.stateCode, r.registeredAt].map(esc).join(',')),
  );
  return `\uFEFF${lines.join('\r\n')}`;
}

export async function ensureUploadDir(base: string, parts: string[]): Promise<string> {
  const dir = join(base, ...parts);
  await mkdir(dir, { recursive: true });
  return dir;
}

export function docFileName(): string {
  return randomUUID();
}

export const registrationFeatures = CLINICAL_FEATURES.patientRegistration;
