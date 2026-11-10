import { schema, type Tx } from '@hos/db';
import {
  ageLabel,
  clinicalCodesDto,
  type ClinicalCodesDto,
  type ClinicalNoteDto,
  type DoctorDto,
  type EncounterDetailDto,
  type PageDto,
  type PatientAlertDto,
  type PatientDto,
  type PatientSearchQuery,
  type PatientSummaryDto,
  type ServiceDto,
  type VitalSignsDto,
} from '@hos/shared';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { ApiError } from '../http';
import { encounterDto, patientSummary } from './encounters';

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function day(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function patientDto(row: typeof schema.patients.$inferSelect): PatientDto {
  return {
    id: row.id,
    uhid: row.uhid,
    registeredLocationId: row.registeredLocationId,
    title: row.title,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    fullName: row.fullName ?? '',
    gender: row.gender as PatientDto['gender'],
    dob: day(row.dob),
    ageYearsAtReg: row.ageYearsAtReg,
    dobEstimated: row.dobEstimated,
    ageLabel: ageLabel(day(row.dob)),
    mobile: row.mobile,
    altMobile: row.altMobile,
    email: row.email,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    district: row.district,
    stateCode: row.stateCode,
    pincode: row.pincode,
    bloodGroup: (row.bloodGroup as PatientDto['bloodGroup']) ?? null,
    maritalStatus: row.maritalStatus,
    guardianName: row.guardianName,
    guardianRelation: (row.guardianRelation as PatientDto['guardianRelation']) ?? null,
    emergencyName: row.emergencyName,
    emergencyMobile: row.emergencyMobile,
    idType: row.idType as PatientDto['idType'],
    idLast4: row.idLast4,
    abhaNumber: row.abhaNumber,
    abhaAddress: row.abhaAddress,
    photoPath: row.photoPath,
    status: row.status as PatientDto['status'],
    mergedIntoId: row.mergedIntoId,
    isSample: row.isSample,
    createdAt: iso(row.createdAt)!,
  };
}

export function alertDto(row: typeof schema.patientAlerts.$inferSelect): PatientAlertDto {
  return {
    id: row.id,
    patientId: row.patientId,
    kind: row.kind as PatientAlertDto['kind'],
    text: row.text,
    severity: row.severity as PatientAlertDto['severity'],
    recordedBy: row.recordedBy,
    inactiveAt: iso(row.inactiveAt),
    createdAt: iso(row.createdAt)!,
  };
}

export function vitalDto(row: typeof schema.vitalSigns.$inferSelect): VitalSignsDto {
  return {
    id: row.id,
    locationId: row.locationId,
    encounterId: row.encounterId,
    patientId: row.patientId,
    recordedAt: iso(row.recordedAt)!,
    recordedBy: row.recordedBy,
    bpSystolic: row.bpSystolic,
    bpDiastolic: row.bpDiastolic,
    pulse: row.pulse,
    respRate: row.respRate,
    tempC: row.tempCX10 == null ? null : row.tempCX10 / 10,
    spo2: row.spo2,
    weightKg: row.weightG == null ? null : row.weightG / 1000,
    heightCm: row.heightMm == null ? null : row.heightMm / 10,
    painScore: row.painScore,
    grbsMgDl: row.grbsMgDl,
    notes: row.notes,
    enteredInErrorAt: iso(row.enteredInErrorAt),
    errorReason: row.errorReason,
  };
}

export function noteDto(row: typeof schema.clinicalNotes.$inferSelect): ClinicalNoteDto {
  return {
    id: row.id,
    encounterId: row.encounterId,
    patientId: row.patientId,
    kind: row.kind as ClinicalNoteDto['kind'],
    body: row.body,
    code: row.code,
    codeDisplay: row.codeDisplay,
    authorUserId: row.authorUserId,
    supersedesId: row.supersedesId,
    createdAt: iso(row.createdAt)!,
  };
}

export async function searchPatients(tx: Tx, q: PatientSearchQuery): Promise<PageDto<PatientSummaryDto>> {
  const term = q.q?.replaceAll('%', '').replaceAll('_', '').trim();
  const filter = term
    ? or(ilike(schema.patients.fullName, `%${term}%`), ilike(schema.patients.uhid, `%${term}%`), ilike(schema.patients.mobile, `%${term}%`))
    : undefined;
  const rows = await tx
    .select()
    .from(schema.patients)
    .where(filter)
    .orderBy(asc(schema.patients.fullName))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const total = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.patients).where(filter);
  return { items: rows.map(patientSummary), total: Number(total[0]?.n ?? 0), page: q.page, pageSize: q.pageSize };
}

export async function readPatient(tx: Tx, id: string): Promise<PatientDto> {
  const [row] = await tx.select().from(schema.patients).where(eq(schema.patients.id, id));
  if (!row) throw new ApiError(404, 'not_found', 'Patient not found');
  return patientDto(row);
}

export async function listAlerts(tx: Tx, patientId: string): Promise<PatientAlertDto[]> {
  await readPatient(tx, patientId);
  const rows = await tx.select().from(schema.patientAlerts).where(eq(schema.patientAlerts.patientId, patientId)).orderBy(desc(schema.patientAlerts.createdAt));
  return rows.map(alertDto);
}

export async function addAlert(
  tx: Tx,
  tenantId: string,
  patientId: string,
  userId: string,
  input: { kind: PatientAlertDto['kind']; text: string; severity: PatientAlertDto['severity'] },
  audit: (id: string) => Promise<void>,
): Promise<PatientAlertDto> {
  await readPatient(tx, patientId);
  const [row] = await tx
    .insert(schema.patientAlerts)
    .values({ tenantId, patientId, kind: input.kind, text: input.text, severity: input.severity, recordedBy: userId })
    .returning();
  await audit(row!.id);
  return alertDto(row!);
}

export function codes(): ClinicalCodesDto {
  return clinicalCodesDto();
}

export async function listDoctors(tx: Tx): Promise<DoctorDto[]> {
  const rows = await tx.select().from(schema.doctors).orderBy(asc(schema.doctors.name));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    qualification: row.qualification,
    speciality: row.speciality,
    registrationNo: row.registrationNo,
    departmentId: row.departmentId,
    locationId: row.locationId,
    userId: row.userId,
    active: row.active,
  }));
}

export async function listServices(tx: Tx, locationId: string | null, q: { category?: string; q?: string }): Promise<ServiceDto[]> {
  const term = q.q?.trim();
  const filters = [eq(schema.services.active, true)];
  if (q.category) filters.push(eq(schema.services.category, q.category));
  if (term) filters.push(ilike(schema.services.name, `%${term}%`));
  const rows = await tx.select().from(schema.services).where(and(...filters)).orderBy(asc(schema.services.name));
  const today = new Date().toISOString().slice(0, 10);
  const out: ServiceDto[] = [];
  for (const row of rows) {
    const tariffs = await tx
      .select()
      .from(schema.tariffs)
      .where(and(eq(schema.tariffs.serviceId, row.id), eq(schema.tariffs.payerClass, 'general')))
      .orderBy(desc(schema.tariffs.effectiveFrom));
    const price = tariffs.find((t) => String(t.effectiveFrom).slice(0, 10) <= today && (t.locationId === null || t.locationId === locationId));
    out.push({
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      doctorId: row.doctorId,
      hsnSac: row.hsnSac,
      gstTreatment: row.gstTreatment as ServiceDto['gstTreatment'],
      gstRateBp: row.gstRateBp,
      active: row.active,
      unitPricePaise: price?.pricePaise ?? null,
    });
  }
  return out;
}

export async function readEncounterDetail(tx: Tx, id: string): Promise<EncounterDetailDto> {
  const [row] = await tx.select().from(schema.encounters).where(eq(schema.encounters.id, id));
  if (!row) throw new ApiError(404, 'not_found', 'Encounter not found');
  const [patient] = await tx.select().from(schema.patients).where(eq(schema.patients.id, row.patientId));
  if (!patient) throw new ApiError(404, 'not_found', 'Patient not found');
  const alerts = await tx
    .select()
    .from(schema.patientAlerts)
    .where(and(eq(schema.patientAlerts.patientId, patient.id), sql`${schema.patientAlerts.inactiveAt} is null`));
  return { ...encounterDto(row, patientSummary(patient)), patient: patientSummary(patient), alerts: alerts.map(alertDto) };
}
