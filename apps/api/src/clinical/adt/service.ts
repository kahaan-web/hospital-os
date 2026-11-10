import { schema, type Tx } from '@hos/db';
import type {
  AdmissionDto,
  AdmissionListQuery,
  AdmissionRegisterRow,
  AdmissionRequestDto,
  AdmissionRequestInput,
  AdmitInput,
  BedBoardDto,
  BedChargePostResult,
  BedDto,
  BedPatchInput,
  BedCreateInput,
  ClinicalCtx,
  DischargeInput,
  DischargeRegisterRow,
  DischargeSummaryDto,
  DischargeSummaryReportRow,
  DischargeSummarySections,
  GstTreatment,
  PageDto,
  RoomCreateInput,
  RoomDto,
  RoomPatchInput,
  SummarySaveInput,
  TransferInput,
  TransferRegisterRow,
  WardCreateInput,
  WardDto,
  WardPatchInput,
  WardType,
} from '@hos/shared';
import { HEALTHCARE_SAC, istDateKey, resolveLineGst } from '@hos/shared';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ApiError } from '../../http';
import { chargeDto, charges, prices } from '../charges';
import { encounterService, patientSummary } from '../encounters';
import { discharge } from '../ipbilling/public';
import { numbering } from '../numbering';

type Ctx = ClinicalCtx<Tx>;
type AdmissionRow = typeof schema.admissions.$inferSelect;

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof (error as { code: unknown }).code === 'string') {
    const code = (error as { code: string }).code;
    if (/^[0-9A-Z]{5}$/.test(code)) return code;
  }
  if ('cause' in error) return pgCode((error as { cause: unknown }).cause);
  return undefined;
}

function rethrowUnique(error: unknown, message: string, code = 'conflict'): never {
  if (pgCode(error) === '23505') throw new ApiError(409, code, message);
  throw error;
}

function sectionsOf(value: unknown): DischargeSummarySections {
  const raw = value && typeof value === 'object' ? (value as Partial<DischargeSummarySections>) : {};
  return {
    diagnosis: raw.diagnosis ?? '',
    course: raw.course ?? '',
    treatment: raw.treatment ?? '',
    condition: raw.condition ?? '',
    advice: raw.advice ?? '',
    followUp: raw.followUp ?? '',
  };
}

/** ICU, CCU and NICU stays are exempt. Other room rent uses the configured room-rent rule. */
export function gstTreatmentFor(ward: { isIcu: boolean; wardType: string }, configured: GstTreatment): GstTreatment {
  if (ward.isIcu || ward.wardType === 'icu' || ward.wardType === 'nicu') return 'exempt_healthcare';
  return configured;
}

export function assertDischargeClearance(
  clearance: { ok: boolean; balancePaise: number; reasons: string[] },
  canOverride: boolean,
  overrideReason: string | undefined,
): void {
  if (clearance.ok) return;
  const reason = overrideReason?.trim() ?? '';
  if (canOverride && reason.length >= 3) return;
  throw new ApiError(422, 'billing_not_cleared', 'Discharge is blocked until the bill is cleared', undefined, {
    balancePaise: clearance.balancePaise,
    reasons: clearance.reasons,
  });
}

function wardDto(row: typeof schema.wards.$inferSelect): WardDto {
  return {
    id: row.id,
    locationId: row.locationId,
    code: row.code,
    name: row.name,
    wardType: row.wardType as WardType,
    isIcu: row.isIcu,
    bedServiceId: row.bedServiceId,
    active: row.active,
  };
}

function roomDto(row: typeof schema.rooms.$inferSelect): RoomDto {
  return { id: row.id, wardId: row.wardId, code: row.code, name: row.name };
}

function bedDto(row: typeof schema.beds.$inferSelect): BedDto {
  return {
    id: row.id,
    roomId: row.roomId,
    label: row.label,
    wardClass: row.wardClass as WardType,
    status: row.status as BedDto['status'],
  };
}

function summaryDto(row: typeof schema.dischargeSummaries.$inferSelect): DischargeSummaryDto {
  return {
    id: row.id,
    admissionId: row.admissionId,
    status: row.status as DischargeSummaryDto['status'],
    sections: sectionsOf(row.sections),
    finalisedAt: iso(row.finalisedAt),
  };
}

async function lockBeds(tx: Tx, ids: string[]): Promise<void> {
  for (const id of [...new Set(ids)].sort()) {
    const locked = await tx.execute<{ id: string }>(sql`select id from beds where id = ${id}::uuid for update`);
    if (!locked.rows[0]) throw new ApiError(404, 'not_found', 'Bed not found');
  }
}

async function placeOf(tx: Tx, bedId: string, locationId: string) {
  const [bed] = await tx.select().from(schema.beds).where(eq(schema.beds.id, bedId));
  if (!bed) throw new ApiError(404, 'not_found', 'Bed not found');
  const [room] = await tx.select().from(schema.rooms).where(eq(schema.rooms.id, bed.roomId));
  if (!room) throw new ApiError(404, 'not_found', 'Room not found');
  const [ward] = await tx.select().from(schema.wards).where(eq(schema.wards.id, room.wardId));
  if (!ward || ward.locationId !== locationId) throw new ApiError(404, 'not_found', 'Bed not found');
  return { bed, room, ward };
}

function assertVacant(status: string): void {
  if (status === 'occupied') throw new ApiError(409, 'bed_occupied', 'That bed already has a patient');
  if (status === 'housekeeping') throw new ApiError(409, 'bed_occupied', 'That bed is being cleaned. Mark it vacant first');
  if (status !== 'vacant') throw new ApiError(409, 'bed_occupied', 'That bed is not available');
}

async function openOnBed(tx: Tx, bedId: string) {
  const [row] = await tx
    .select({ id: schema.bedAssignments.id })
    .from(schema.bedAssignments)
    .where(and(eq(schema.bedAssignments.bedId, bedId), isNull(schema.bedAssignments.toAt)));
  return row ?? null;
}

function icuFlag(wardType: string, isIcu: boolean): boolean {
  return isIcu || wardType === 'icu' || wardType === 'nicu';
}

async function requireBedService(tx: Tx, serviceId: string | null | undefined): Promise<void> {
  if (!serviceId) return;
  const [svc] = await tx.select({ id: schema.services.id, category: schema.services.category }).from(schema.services).where(eq(schema.services.id, serviceId));
  if (!svc || svc.category !== 'bed') throw new ApiError(422, 'validation', 'Choose a bed-day service');
}

export async function listWards(tx: Tx, locationId: string): Promise<WardDto[]> {
  const rows = await tx.select().from(schema.wards).where(eq(schema.wards.locationId, locationId)).orderBy(asc(schema.wards.code));
  return rows.map(wardDto);
}

export async function listRooms(tx: Tx, locationId: string): Promise<RoomDto[]> {
  const wards = await tx.select({ id: schema.wards.id }).from(schema.wards).where(eq(schema.wards.locationId, locationId));
  if (wards.length === 0) return [];
  const rows = await tx
    .select()
    .from(schema.rooms)
    .where(inArray(schema.rooms.wardId, wards.map((w) => w.id)))
    .orderBy(asc(schema.rooms.code));
  return rows.map(roomDto);
}

export async function listBeds(tx: Tx, locationId: string): Promise<BedDto[]> {
  const rooms = await listRooms(tx, locationId);
  if (rooms.length === 0) return [];
  const rows = await tx
    .select()
    .from(schema.beds)
    .where(inArray(schema.beds.roomId, rooms.map((r) => r.id)))
    .orderBy(asc(schema.beds.label));
  return rows.map(bedDto);
}

export async function bedBoard(tx: Tx, locationId: string): Promise<BedBoardDto> {
  const wardRows = await tx.select().from(schema.wards).where(eq(schema.wards.locationId, locationId)).orderBy(asc(schema.wards.code));
  if (wardRows.length === 0) return { wards: [] };
  const roomRows = await tx
    .select()
    .from(schema.rooms)
    .where(inArray(schema.rooms.wardId, wardRows.map((w) => w.id)))
    .orderBy(asc(schema.rooms.code));
  const bedRows = roomRows.length
    ? await tx.select().from(schema.beds).where(inArray(schema.beds.roomId, roomRows.map((r) => r.id))).orderBy(asc(schema.beds.label))
    : [];
  const openRows = bedRows.length
    ? await tx
        .select()
        .from(schema.bedAssignments)
        .where(and(inArray(schema.bedAssignments.bedId, bedRows.map((b) => b.id)), isNull(schema.bedAssignments.toAt)))
    : [];
  const admissionRows = openRows.length
    ? await tx.select().from(schema.admissions).where(inArray(schema.admissions.id, openRows.map((a) => a.admissionId)))
    : [];
  const patientRows = admissionRows.length
    ? await tx.select().from(schema.patients).where(inArray(schema.patients.id, [...new Set(admissionRows.map((a) => a.patientId))]))
    : [];
  const patients = new Map(patientRows.map((p) => [p.id, p]));
  const admissions = new Map(admissionRows.map((a) => [a.id, a]));
  const byBed = new Map(openRows.map((a) => [a.bedId, a]));

  const wards = wardRows.map((ward) => {
    const rooms = roomRows
      .filter((room) => room.wardId === ward.id)
      .map((room) => ({
        ...roomDto(room),
        beds: bedRows
          .filter((bed) => bed.roomId === room.id)
          .map((bed) => {
            const open = byBed.get(bed.id);
            const admission = open ? admissions.get(open.admissionId) : undefined;
            const patient = admission ? patients.get(admission.patientId) : undefined;
            return {
              ...bedDto(bed),
              admission:
                admission && patient
                  ? {
                      id: admission.id,
                      number: admission.number,
                      patientId: admission.patientId,
                      patientName: patient.fullName ?? '',
                      uhid: patient.uhid,
                      admittedAt: iso(admission.admittedAt)!,
                    }
                  : null,
            };
          }),
      }));
    const occupied = rooms.some((room) => room.beds.some((bed) => bed.status === 'occupied'));
    return { ...wardDto(ward), rooms, occupied };
  });
  return { wards: wards.filter((ward) => ward.active || ward.occupied).map(({ occupied: _occupied, ...ward }) => ward) };
}

export async function createWard(ctx: Ctx, input: WardCreateInput): Promise<WardDto> {
  await requireBedService(ctx.tx, input.bedServiceId);
  try {
    const [row] = await ctx.tx
      .insert(schema.wards)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        code: input.code,
        name: input.name,
        wardType: input.wardType,
        isIcu: icuFlag(input.wardType, input.isIcu),
        bedServiceId: input.bedServiceId ?? null,
        active: input.active ?? true,
      })
      .returning();
    await ctx.audit('adt.ward.create', 'ward', row!.id, null, { code: row!.code });
    return wardDto(row!);
  } catch (error) {
    rethrowUnique(error, 'That ward code is already used');
  }
}

export async function patchWard(ctx: Ctx, id: string, input: WardPatchInput): Promise<WardDto> {
  const [row] = await ctx.tx.select().from(schema.wards).where(and(eq(schema.wards.id, id), eq(schema.wards.locationId, ctx.locationId)));
  if (!row) throw new ApiError(404, 'not_found', 'Ward not found');
  await requireBedService(ctx.tx, input.bedServiceId);
  const wardType = input.wardType ?? row.wardType;
  const isIcu = icuFlag(wardType, input.isIcu ?? row.isIcu);
  try {
    const [updated] = await ctx.tx
      .update(schema.wards)
      .set({
        code: input.code ?? row.code,
        name: input.name ?? row.name,
        wardType,
        isIcu,
        bedServiceId: input.bedServiceId === undefined ? row.bedServiceId : input.bedServiceId,
        active: input.active ?? row.active,
      })
      .where(eq(schema.wards.id, row.id))
      .returning();
    await ctx.audit('adt.ward.update', 'ward', row.id, { code: row.code, active: row.active }, { code: updated!.code, active: updated!.active });
    return wardDto(updated!);
  } catch (error) {
    rethrowUnique(error, 'That ward code is already used');
  }
}

export async function createRoom(ctx: Ctx, input: RoomCreateInput): Promise<RoomDto> {
  const [ward] = await ctx.tx.select().from(schema.wards).where(and(eq(schema.wards.id, input.wardId), eq(schema.wards.locationId, ctx.locationId)));
  if (!ward) throw new ApiError(404, 'not_found', 'Ward not found');
  try {
    const [row] = await ctx.tx
      .insert(schema.rooms)
      .values({ tenantId: ctx.tenantId, wardId: ward.id, code: input.code, name: input.name })
      .returning();
    await ctx.audit('adt.room.create', 'room', row!.id, null, { code: row!.code, wardId: ward.id });
    return roomDto(row!);
  } catch (error) {
    rethrowUnique(error, 'That room code is already used in this ward');
  }
}

export async function patchRoom(ctx: Ctx, id: string, input: RoomPatchInput): Promise<RoomDto> {
  const rooms = await listRooms(ctx.tx, ctx.locationId);
  if (!rooms.some((room) => room.id === id)) throw new ApiError(404, 'not_found', 'Room not found');
  const [row] = await ctx.tx.select().from(schema.rooms).where(eq(schema.rooms.id, id));
  if (!row) throw new ApiError(404, 'not_found', 'Room not found');
  try {
    const [updated] = await ctx.tx
      .update(schema.rooms)
      .set({ code: input.code ?? row.code, name: input.name ?? row.name })
      .where(eq(schema.rooms.id, row.id))
      .returning();
    await ctx.audit('adt.room.update', 'room', row.id, { code: row.code }, { code: updated!.code });
    return roomDto(updated!);
  } catch (error) {
    rethrowUnique(error, 'That room code is already used in this ward');
  }
}

export async function createBed(ctx: Ctx, input: BedCreateInput): Promise<BedDto> {
  const rooms = await listRooms(ctx.tx, ctx.locationId);
  if (!rooms.some((room) => room.id === input.roomId)) throw new ApiError(404, 'not_found', 'Room not found');
  if (input.status === 'occupied') throw new ApiError(422, 'validation', 'Admit a patient to occupy this bed');
  try {
    const [row] = await ctx.tx
      .insert(schema.beds)
      .values({
        tenantId: ctx.tenantId,
        roomId: input.roomId,
        label: input.label,
        wardClass: input.wardClass,
        status: input.status,
      })
      .returning();
    await ctx.audit('adt.bed.create', 'bed', row!.id, null, { label: row!.label });
    return bedDto(row!);
  } catch (error) {
    rethrowUnique(error, 'That bed label is already used in this room');
  }
}

export async function patchBed(ctx: Ctx, id: string, input: BedPatchInput): Promise<BedDto> {
  const beds = await listBeds(ctx.tx, ctx.locationId);
  if (!beds.some((bed) => bed.id === id)) throw new ApiError(404, 'not_found', 'Bed not found');
  await lockBeds(ctx.tx, [id]);
  const [row] = await ctx.tx.select().from(schema.beds).where(eq(schema.beds.id, id));
  if (!row) throw new ApiError(404, 'not_found', 'Bed not found');
  const open = await openOnBed(ctx.tx, row.id);
  if (input.status && input.status !== 'occupied' && open) throw new ApiError(409, 'bed_occupied', 'A patient is still in this bed');
  if (input.status === 'occupied' && !open) throw new ApiError(422, 'validation', 'Admit a patient to occupy this bed');
  try {
    const [updated] = await ctx.tx
      .update(schema.beds)
      .set({
        label: input.label ?? row.label,
        wardClass: input.wardClass ?? row.wardClass,
        status: input.status ?? row.status,
      })
      .where(eq(schema.beds.id, row.id))
      .returning();
    await ctx.audit('adt.bed.update', 'bed', row.id, { status: row.status, label: row.label }, { status: updated!.status, label: updated!.label });
    return bedDto(updated!);
  } catch (error) {
    rethrowUnique(error, 'That bed label is already used in this room');
  }
}

async function assignmentViews(tx: Tx, admissionId: string): Promise<AdmissionDto['assignments']> {
  const rows = await tx.select().from(schema.bedAssignments).where(eq(schema.bedAssignments.admissionId, admissionId)).orderBy(asc(schema.bedAssignments.fromAt));
  const out: AdmissionDto['assignments'] = [];
  for (const row of rows) {
    const [bed] = await tx.select().from(schema.beds).where(eq(schema.beds.id, row.bedId));
    const [room] = bed ? await tx.select().from(schema.rooms).where(eq(schema.rooms.id, bed.roomId)) : [];
    const [ward] = room ? await tx.select().from(schema.wards).where(eq(schema.wards.id, room.wardId)) : [];
    out.push({
      id: row.id,
      bedId: row.bedId,
      bedLabel: bed?.label ?? '',
      wardCode: ward?.code ?? '',
      roomCode: room?.code ?? '',
      fromAt: iso(row.fromAt)!,
      toAt: iso(row.toAt),
    });
  }
  return out;
}

async function toAdmission(tx: Tx, row: AdmissionRow): Promise<AdmissionDto> {
  const [patient] = await tx.select().from(schema.patients).where(eq(schema.patients.id, row.patientId));
  if (!patient) throw new ApiError(404, 'not_found', 'Patient not found');
  const [doctor] = row.doctorId ? await tx.select({ name: schema.doctors.name }).from(schema.doctors).where(eq(schema.doctors.id, row.doctorId)) : [];
  const [encounter] = await tx.select({ payerType: schema.encounters.payerType }).from(schema.encounters).where(eq(schema.encounters.id, row.encounterId));
  return {
    id: row.id,
    encounterId: row.encounterId,
    patientId: row.patientId,
    locationId: row.locationId,
    number: row.number,
    admissionType: row.admissionType as AdmissionDto['admissionType'],
    attendant: row.attendant,
    provisionalDiagnosis: row.provisionalDiagnosis,
    status: row.status as AdmissionDto['status'],
    dischargeType: (row.dischargeType as AdmissionDto['dischargeType']) ?? null,
    doctorId: row.doctorId,
    doctorName: doctor?.name ?? null,
    admittedAt: iso(row.admittedAt)!,
    dischargedAt: iso(row.dischargedAt),
    payerType: (encounter?.payerType as AdmissionDto['payerType']) ?? 'self',
    patient: patientSummary(patient),
    assignments: await assignmentViews(tx, row.id),
  };
}

async function requireAdmission(tx: Tx, id: string, locationId: string): Promise<AdmissionRow> {
  const [row] = await tx.select().from(schema.admissions).where(and(eq(schema.admissions.id, id), eq(schema.admissions.locationId, locationId)));
  if (!row) throw new ApiError(404, 'not_found', 'Admission not found');
  return row;
}

export async function getAdmission(tx: Tx, id: string, locationId: string): Promise<AdmissionDto> {
  return toAdmission(tx, await requireAdmission(tx, id, locationId));
}

export async function listAdmissions(tx: Tx, locationId: string, query: AdmissionListQuery): Promise<PageDto<AdmissionDto>> {
  const filters = [eq(schema.admissions.locationId, locationId)];
  if (query.status) filters.push(eq(schema.admissions.status, query.status));
  const where = and(...filters);
  const totalRow = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.admissions).where(where);
  const rows = await tx
    .select()
    .from(schema.admissions)
    .where(where)
    .orderBy(desc(schema.admissions.admittedAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  const items: AdmissionDto[] = [];
  for (const row of rows) items.push(await toAdmission(tx, row));
  return { items, total: Number(totalRow[0]?.n ?? 0), page: query.page, pageSize: query.pageSize };
}

async function occupy(ctx: Ctx, admissionId: string, bedId: string, fromAt: Date) {
  try {
    const [row] = await ctx.tx
      .insert(schema.bedAssignments)
      .values({ tenantId: ctx.tenantId, admissionId, bedId, fromAt })
      .returning();
    return row!;
  } catch (error) {
    rethrowUnique(error, 'That bed already has a patient', 'bed_occupied');
  }
}

export async function admit(ctx: Ctx, input: AdmitInput): Promise<AdmissionDto> {
  await lockBeds(ctx.tx, [input.bedId]);
  const place = await placeOf(ctx.tx, input.bedId, ctx.locationId);
  assertVacant(place.bed.status);
  if (await openOnBed(ctx.tx, place.bed.id)) throw new ApiError(409, 'bed_occupied', 'That bed already has a patient');
  const [patient] = await ctx.tx.select().from(schema.patients).where(eq(schema.patients.id, input.patientId));
  if (!patient || patient.status !== 'active') throw new ApiError(404, 'not_found', 'Patient not found');
  const [doctor] = await ctx.tx.select({ id: schema.doctors.id }).from(schema.doctors).where(eq(schema.doctors.id, input.doctorId));
  if (!doctor) throw new ApiError(404, 'not_found', 'Doctor not found');
  const [openStay] = await ctx.tx
    .select({ id: schema.admissions.id })
    .from(schema.admissions)
    .where(and(eq(schema.admissions.patientId, patient.id), inArray(schema.admissions.status, ['admitted', 'discharge_initiated'])));
  if (openStay) throw new ApiError(409, 'already_admitted', 'This patient already has an open admission');
  if (input.requestId) {
    const [request] = await ctx.tx.select().from(schema.admissionRequests).where(eq(schema.admissionRequests.id, input.requestId));
    if (!request || request.patientId !== patient.id) throw new ApiError(422, 'validation', 'That admission request does not match this patient');
  }
  const number = await numbering.next(ctx, 'ip_admission');
  const encounter = await encounterService.openIpd(ctx, {
    patientId: patient.id,
    doctorId: input.doctorId,
    departmentId: input.departmentId,
    number,
    payerType: input.payerType,
    isMlc: input.isMlc,
  });
  const [row] = await ctx.tx
    .insert(schema.admissions)
    .values({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      encounterId: encounter.id,
      patientId: patient.id,
      doctorId: input.doctorId,
      number,
      admissionType: input.admissionType,
      attendant: input.attendant,
      provisionalDiagnosis: input.provisionalDiagnosis,
      status: 'admitted',
      createdBy: ctx.userId,
    })
    .returning();
  await occupy(ctx, row!.id, place.bed.id, new Date());
  await ctx.tx.update(schema.beds).set({ status: 'occupied' }).where(eq(schema.beds.id, place.bed.id));
  await encounterService.setBedLabels(ctx, encounter.id, { wardCode: place.ward.code, bedLabel: place.bed.label });
  if (input.requestId) {
    await ctx.tx
      .update(schema.admissionRequests)
      .set({ status: 'admitted', admissionId: row!.id })
      .where(eq(schema.admissionRequests.id, input.requestId));
  }
  await ctx.audit('adt.admission.create', 'admission', row!.id, null, { number, bedId: place.bed.id });
  return toAdmission(ctx.tx, row!);
}

export async function transfer(ctx: Ctx, admissionId: string, input: TransferInput): Promise<AdmissionDto> {
  const admission = await requireAdmission(ctx.tx, admissionId, ctx.locationId);
  if (admission.status !== 'admitted' && admission.status !== 'discharge_initiated') {
    throw new ApiError(422, 'not_admitted', 'This admission is not open');
  }
  const [current] = await ctx.tx
    .select()
    .from(schema.bedAssignments)
    .where(and(eq(schema.bedAssignments.admissionId, admission.id), isNull(schema.bedAssignments.toAt)));
  if (!current) throw new ApiError(422, 'not_admitted', 'This admission has no bed');
  if (current.bedId === input.bedId) throw new ApiError(422, 'validation', 'The patient is already in that bed');
  await lockBeds(ctx.tx, [current.bedId, input.bedId]);
  const dest = await placeOf(ctx.tx, input.bedId, ctx.locationId);
  assertVacant(dest.bed.status);
  if (await openOnBed(ctx.tx, dest.bed.id)) throw new ApiError(409, 'bed_occupied', 'That bed already has a patient');
  const now = new Date();
  await ctx.tx.update(schema.bedAssignments).set({ toAt: now }).where(eq(schema.bedAssignments.id, current.id));
  await ctx.tx.update(schema.beds).set({ status: 'housekeeping' }).where(eq(schema.beds.id, current.bedId));
  await occupy(ctx, admission.id, dest.bed.id, now);
  await ctx.tx.update(schema.beds).set({ status: 'occupied' }).where(eq(schema.beds.id, dest.bed.id));
  await encounterService.setBedLabels(ctx, admission.encounterId, { wardCode: dest.ward.code, bedLabel: dest.bed.label });
  await ctx.audit('adt.admission.transfer', 'admission', admission.id, { bedId: current.bedId }, { bedId: dest.bed.id, reason: input.reason ?? null });
  return toAdmission(ctx.tx, admission);
}

export async function dischargePatient(ctx: Ctx, admissionId: string, input: DischargeInput, canOverride: boolean): Promise<AdmissionDto> {
  const admission = await requireAdmission(ctx.tx, admissionId, ctx.locationId);
  if (admission.status !== 'admitted' && admission.status !== 'discharge_initiated') {
    throw new ApiError(422, 'not_admitted', 'This admission is not open');
  }
  const clearance = await discharge.check(ctx, admission.encounterId);
  assertDischargeClearance(clearance, canOverride, input.overrideReason);
  const [current] = await ctx.tx
    .select()
    .from(schema.bedAssignments)
    .where(and(eq(schema.bedAssignments.admissionId, admission.id), isNull(schema.bedAssignments.toAt)));
  const now = new Date();
  if (current) {
    await lockBeds(ctx.tx, [current.bedId]);
    await ctx.tx.update(schema.bedAssignments).set({ toAt: now }).where(eq(schema.bedAssignments.id, current.id));
    await ctx.tx.update(schema.beds).set({ status: 'housekeeping' }).where(eq(schema.beds.id, current.bedId));
  }
  await encounterService.setBedLabels(ctx, admission.encounterId, { wardCode: null, bedLabel: null });
  const [updated] = await ctx.tx
    .update(schema.admissions)
    .set({ status: 'discharged', dischargeType: input.dischargeType, dischargedAt: now })
    .where(eq(schema.admissions.id, admission.id))
    .returning();
  await encounterService.close(ctx, admission.encounterId, now);
  await ctx.audit(
    'adt.admission.discharge',
    'admission',
    admission.id,
    { status: admission.status },
    { status: 'discharged', dischargeType: input.dischargeType, override: Boolean(input.overrideReason && canOverride && !clearance.ok) },
  );
  return toAdmission(ctx.tx, updated!);
}

export async function getSummary(tx: Tx, admissionId: string, locationId: string): Promise<DischargeSummaryDto> {
  await requireAdmission(tx, admissionId, locationId);
  const [row] = await tx.select().from(schema.dischargeSummaries).where(eq(schema.dischargeSummaries.admissionId, admissionId));
  if (!row) throw new ApiError(404, 'not_found', 'No discharge summary yet');
  return summaryDto(row);
}

export async function saveSummary(ctx: Ctx, admissionId: string, input: SummarySaveInput): Promise<DischargeSummaryDto> {
  await requireAdmission(ctx.tx, admissionId, ctx.locationId);
  const [existing] = await ctx.tx.select().from(schema.dischargeSummaries).where(eq(schema.dischargeSummaries.admissionId, admissionId));
  if (existing?.status === 'final') throw new ApiError(409, 'summary_final', 'This summary is final');
  if (existing) {
    const [updated] = await ctx.tx
      .update(schema.dischargeSummaries)
      .set({ sections: input.sections })
      .where(eq(schema.dischargeSummaries.id, existing.id))
      .returning();
    await ctx.audit('adt.summary.save', 'discharge_summary', existing.id, null, { admissionId });
    return summaryDto(updated!);
  }
  const [row] = await ctx.tx
    .insert(schema.dischargeSummaries)
    .values({ tenantId: ctx.tenantId, admissionId, sections: input.sections, status: 'draft' })
    .returning();
  await ctx.audit('adt.summary.save', 'discharge_summary', row!.id, null, { admissionId });
  return summaryDto(row!);
}

export async function finaliseSummary(ctx: Ctx, admissionId: string): Promise<DischargeSummaryDto> {
  await requireAdmission(ctx.tx, admissionId, ctx.locationId);
  const [existing] = await ctx.tx.select().from(schema.dischargeSummaries).where(eq(schema.dischargeSummaries.admissionId, admissionId));
  if (!existing) throw new ApiError(404, 'not_found', 'No discharge summary yet');
  if (existing.status === 'final') return summaryDto(existing);
  const sections = sectionsOf(existing.sections);
  if (!sections.diagnosis.trim()) throw new ApiError(422, 'validation', 'Add the diagnosis before finalising');
  const [updated] = await ctx.tx
    .update(schema.dischargeSummaries)
    .set({ status: 'final', finalisedAt: new Date(), finalisedBy: ctx.userId })
    .where(eq(schema.dischargeSummaries.id, existing.id))
    .returning();
  await ctx.audit('adt.summary.finalise', 'discharge_summary', existing.id, { status: 'draft' }, { status: 'final' });
  return summaryDto(updated!);
}

function occupiedOn(fromAt: Date | string, toAt: Date | string | null, date: string): boolean {
  const from = istDateKey(fromAt instanceof Date ? fromAt : new Date(fromAt));
  if (from > date) return false;
  if (!toAt) return true;
  const to = istDateKey(toAt instanceof Date ? toAt : new Date(toAt));
  return to >= date;
}

export async function postBedCharges(ctx: Ctx, date: string): Promise<BedChargePostResult> {
  const rows = await ctx.tx
    .select({
      assignment: schema.bedAssignments,
      bed: schema.beds,
      ward: schema.wards,
      admission: schema.admissions,
    })
    .from(schema.bedAssignments)
    .innerJoin(schema.beds, eq(schema.beds.id, schema.bedAssignments.bedId))
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.beds.roomId))
    .innerJoin(schema.wards, eq(schema.wards.id, schema.rooms.wardId))
    .innerJoin(schema.admissions, eq(schema.admissions.id, schema.bedAssignments.admissionId))
    .where(and(eq(schema.wards.locationId, ctx.locationId), sql`${schema.admissions.status} <> 'cancelled'`));

  const posted: BedChargePostResult['charges'] = [];
  const skipped: BedChargePostResult['skipped'] = [];
  for (const row of rows) {
    if (!occupiedOn(row.assignment.fromAt, row.assignment.toAt, date)) continue;
    if (!row.ward.bedServiceId) {
      skipped.push({ bedLabel: row.bed.label, reason: 'This ward has no bed-day service' });
      continue;
    }
    try {
      const priced = await prices.priceFor(ctx, { serviceId: row.ward.bedServiceId, wardClass: row.bed.wardClass, on: date });
      const treatment = gstTreatmentFor(row.ward, priced.gstTreatment);
      const resolved = resolveLineGst({
        treatment,
        configuredRateBp: priced.gstRateBp,
        unitPricePaise: priced.unitPricePaise,
      });
      const charge = await charges.post(ctx, {
        encounterId: row.admission.encounterId,
        patientId: row.admission.patientId,
        serviceId: row.ward.bedServiceId,
        description: `${row.ward.name} · ${row.bed.label} bed day`,
        qty: 1,
        unitPricePaise: priced.unitPricePaise,
        gstTreatment: resolved.treatment,
        gstRateBp: resolved.gstRateBp,
        hsnSac: priced.hsnSac || HEALTHCARE_SAC,
        serviceDate: date,
        performingDoctorId: row.admission.doctorId,
        source: { module: 'adt', type: 'bed_assignment', id: row.assignment.id, line: date },
      });
      posted.push(charge);
    } catch (error) {
      if (pgCode(error) === '23505') {
        const [existing] = await ctx.tx
          .select()
          .from(schema.charges)
          .where(
            and(
              eq(schema.charges.sourceType, 'bed_assignment'),
              eq(schema.charges.sourceId, row.assignment.id),
              eq(schema.charges.sourceLine, date),
              isNull(schema.charges.reversalOfId),
            ),
          );
        if (existing) posted.push(chargeDto(existing));
        continue;
      }
      if (error instanceof ApiError && (error.code === 'tariff_missing' || error.code === 'validation')) {
        skipped.push({ bedLabel: row.bed.label, reason: error.message });
        continue;
      }
      throw error;
    }
  }
  await ctx.audit('adt.bed_charge.post', 'bed_charge', null, null, { date, chargeIds: posted.map((c) => c.id) });
  return { date, charges: posted, skipped };
}

function checkRange(query: { from: string; to: string }): void {
  if (query.from > query.to) throw new ApiError(422, 'validation', 'The from date is after the to date');
}

export async function admissionRegister(tx: Tx, locationId: string, query: { from: string; to: string }): Promise<AdmissionRegisterRow[]> {
  checkRange(query);
  const found = await tx.execute<{
    number: string;
    admitted_at: Date;
    patient_name: string;
    uhid: string;
    ward_code: string;
    bed_label: string;
    doctor_name: string;
    admission_type: string;
    status: string;
  }>(sql`
    select a.number, a.admitted_at, p.full_name as patient_name, p.uhid,
           coalesce(w.code, '') as ward_code, coalesce(b.label, '') as bed_label,
           coalesce(d.name, '') as doctor_name, a.admission_type, a.status
    from admissions a
    join patients p on p.tenant_id = a.tenant_id and p.id = a.patient_id
    left join lateral (
      select bed_id from bed_assignments
      where tenant_id = a.tenant_id and admission_id = a.id
      order by from_at asc
      limit 1
    ) first_bed on true
    left join beds b on b.id = first_bed.bed_id
    left join rooms r on r.id = b.room_id
    left join wards w on w.id = r.ward_id
    left join doctors d on d.id = a.doctor_id
    where a.location_id = ${locationId}::uuid
      and (a.admitted_at at time zone 'Asia/Kolkata')::date between ${query.from}::date and ${query.to}::date
    order by a.admitted_at desc
  `);
  return found.rows.map((row) => ({
    number: row.number,
    admittedAt: iso(row.admitted_at)!,
    patientName: row.patient_name ?? '',
    uhid: row.uhid,
    wardCode: row.ward_code,
    bedLabel: row.bed_label,
    doctorName: row.doctor_name,
    admissionType: row.admission_type,
    status: row.status,
  }));
}

export async function transferRegister(tx: Tx, locationId: string, query: { from: string; to: string }): Promise<TransferRegisterRow[]> {
  checkRange(query);
  const found = await tx.execute<{
    admission_number: string;
    patient_name: string;
    uhid: string;
    from_bed: string;
    to_bed: string;
    at: Date;
  }>(sql`
    select a.number as admission_number, p.full_name as patient_name, p.uhid,
           trim(both ' ' from coalesce(wb.code, '') || ' ' || coalesce(bb.label, '')) as from_bed,
           trim(both ' ' from coalesce(w.code, '') || ' ' || coalesce(b.label, '')) as to_bed,
           cur.from_at as at
    from bed_assignments cur
    join admissions a on a.id = cur.admission_id
    join patients p on p.id = a.patient_id
    join lateral (
      select bed_id from bed_assignments prev
      where prev.admission_id = cur.admission_id and prev.from_at < cur.from_at
      order by prev.from_at desc
      limit 1
    ) prev on true
    join beds b on b.id = cur.bed_id
    join rooms r on r.id = b.room_id
    join wards w on w.id = r.ward_id
    join beds bb on bb.id = prev.bed_id
    join rooms rb on rb.id = bb.room_id
    join wards wb on wb.id = rb.ward_id
    where a.location_id = ${locationId}::uuid
      and (cur.from_at at time zone 'Asia/Kolkata')::date between ${query.from}::date and ${query.to}::date
    order by cur.from_at desc
  `);
  return found.rows.map((row) => ({
    admissionNumber: row.admission_number,
    patientName: row.patient_name ?? '',
    uhid: row.uhid,
    fromBed: row.from_bed,
    toBed: row.to_bed,
    at: iso(row.at)!,
  }));
}

export async function dischargeRegister(tx: Tx, locationId: string, query: { from: string; to: string }): Promise<DischargeRegisterRow[]> {
  checkRange(query);
  const found = await tx.execute<{
    number: string;
    patient_name: string;
    uhid: string;
    admitted_at: Date;
    discharged_at: Date;
    discharge_type: string | null;
    ward_code: string;
    bed_label: string;
  }>(sql`
    select a.number, p.full_name as patient_name, p.uhid, a.admitted_at, a.discharged_at, a.discharge_type,
           coalesce(w.code, '') as ward_code, coalesce(b.label, '') as bed_label
    from admissions a
    join patients p on p.id = a.patient_id
    left join lateral (
      select bed_id from bed_assignments
      where admission_id = a.id
      order by from_at desc
      limit 1
    ) last_bed on true
    left join beds b on b.id = last_bed.bed_id
    left join rooms r on r.id = b.room_id
    left join wards w on w.id = r.ward_id
    where a.location_id = ${locationId}::uuid
      and a.status = 'discharged'
      and a.discharged_at is not null
      and (a.discharged_at at time zone 'Asia/Kolkata')::date between ${query.from}::date and ${query.to}::date
    order by a.discharged_at desc
  `);
  return found.rows.map((row) => ({
    number: row.number,
    patientName: row.patient_name ?? '',
    uhid: row.uhid,
    admittedAt: iso(row.admitted_at)!,
    dischargedAt: iso(row.discharged_at)!,
    dischargeType: row.discharge_type ?? '',
    wardCode: row.ward_code,
    bedLabel: row.bed_label,
  }));
}

export async function summaryReport(tx: Tx, locationId: string, query: { from: string; to: string }): Promise<DischargeSummaryReportRow[]> {
  checkRange(query);
  const found = await tx.execute<{
    number: string;
    patient_name: string;
    uhid: string;
    discharged_at: Date | null;
    summary_status: string | null;
  }>(sql`
    select a.number, p.full_name as patient_name, p.uhid, a.discharged_at, s.status as summary_status
    from admissions a
    join patients p on p.id = a.patient_id
    left join discharge_summaries s on s.admission_id = a.id
    where a.location_id = ${locationId}::uuid
      and a.status = 'discharged'
      and a.discharged_at is not null
      and (a.discharged_at at time zone 'Asia/Kolkata')::date between ${query.from}::date and ${query.to}::date
    order by a.discharged_at desc
  `);
  return found.rows.map((row) => ({
    number: row.number,
    patientName: row.patient_name ?? '',
    uhid: row.uhid,
    dischargedAt: iso(row.discharged_at),
    summaryStatus: row.summary_status === 'draft' || row.summary_status === 'final' ? row.summary_status : 'none',
  }));
}

function requestDto(row: typeof schema.admissionRequests.$inferSelect): AdmissionRequestDto {
  return {
    id: row.id,
    patientId: row.patientId,
    fromEncounterId: row.fromEncounterId,
    doctorId: row.doctorId,
    reason: row.reason,
    plannedOn: String(row.plannedOn).slice(0, 10),
    wardType: (row.wardType as WardType | null) ?? null,
    status: row.status,
  };
}

export async function requestAdmission(ctx: Ctx, input: AdmissionRequestInput): Promise<AdmissionRequestDto> {
  const [patient] = await ctx.tx.select({ id: schema.patients.id }).from(schema.patients).where(eq(schema.patients.id, input.patientId));
  if (!patient) throw new ApiError(404, 'not_found', 'Patient not found');
  const [encounter] = await ctx.tx.select().from(schema.encounters).where(eq(schema.encounters.id, input.fromEncounterId));
  if (!encounter) throw new ApiError(404, 'not_found', 'Encounter not found');
  if (encounter.patientId !== input.patientId) throw new ApiError(422, 'validation', 'That encounter is for a different patient');
  const [doctor] = await ctx.tx.select({ id: schema.doctors.id }).from(schema.doctors).where(eq(schema.doctors.id, input.doctorId));
  if (!doctor) throw new ApiError(404, 'not_found', 'Doctor not found');
  const [row] = await ctx.tx
    .insert(schema.admissionRequests)
    .values({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      patientId: input.patientId,
      fromEncounterId: input.fromEncounterId,
      doctorId: input.doctorId,
      reason: input.reason,
      plannedOn: input.plannedOn,
      wardType: input.wardType ?? null,
      status: 'requested',
    })
    .returning();
  await ctx.audit('adt.admission_request.create', 'admission_request', row!.id, null, { patientId: input.patientId });
  return requestDto(row!);
}

export async function listRequests(tx: Tx, locationId: string, status?: string): Promise<AdmissionRequestDto[]> {
  const filters = [eq(schema.admissionRequests.locationId, locationId)];
  if (status) filters.push(eq(schema.admissionRequests.status, status));
  const rows = await tx.select().from(schema.admissionRequests).where(and(...filters)).orderBy(desc(schema.admissionRequests.createdAt));
  return rows.map(requestDto);
}
