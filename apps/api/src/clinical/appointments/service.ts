import { schema, type Tx } from '@hos/db';
import type {
  AppointmentDto,
  BookCounterAppointmentInput,
  ClinicalCtx,
  ConsultationChargeDto,
  DiaryDto,
  DoctorScheduleDto,
  OpdQueueItemDto,
  OpdQueueStatus,
  PutScheduleInput,
  RegisteredVisitDto,
  RegisterVisitInput,
  ScheduleExceptionDto,
  SlotDto,
  VisitRegisterDto,
  VisitRegisterRowDto,
  VisitStatisticsDto,
} from '@hos/shared';
import { addMinutes, istDateKey, normaliseMobile, weekdayIndex } from '@hos/shared';
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { ApiError } from '../../http';
import { encounterDto, patientSummary } from '../encounters';
import { clinical } from '../registry';

/**
 * Serialises bookings for one doctor slot until the transaction ends. Without it, a second
 * request can read the free seats before the first commits and take seq 2 of a one-seat slot.
 */
async function lockSlot(tx: Tx, doctorId: string, date: string, slotStart: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'appt:' + doctorId + ':' + date + ':' + slotStart}, 0))`);
}

type Ctx = ClinicalCtx<Tx>;
type Appt = typeof schema.appointments.$inferSelect;

function svc() {
  return clinical({} as never);
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof (error as { code: unknown }).code === 'string' && /^[0-9A-Z]{5}$/.test((error as { code: string }).code)) {
    return (error as { code: string }).code;
  }
  if ('cause' in error) return pgCode((error as { cause: unknown }).cause);
  return undefined;
}

function overlaps(start: string, end: string, rangeStart: string, rangeEnd: string): boolean {
  return start < rangeEnd && end > rangeStart;
}

async function assertDoctor(ctx: Ctx, doctorId: string) {
  const [doctor] = await ctx.tx.select().from(schema.doctors).where(eq(schema.doctors.id, doctorId));
  if (!doctor || !doctor.active) throw new ApiError(404, 'not_found', 'Doctor not found');
  if (doctor.locationId !== ctx.locationId) throw new ApiError(422, 'wrong_location', 'That doctor does not consult at this location');
  return doctor;
}

async function assertPatient(ctx: Ctx, patientId: string) {
  const [patient] = await ctx.tx.select().from(schema.patients).where(eq(schema.patients.id, patientId));
  if (!patient || patient.status === 'merged' || patient.status === 'inactive') throw new ApiError(404, 'not_found', 'Patient not found');
  return patient;
}

function appointmentDto(
  row: Appt,
  extra: { patientName?: string | null; uhid?: string | null; doctorName?: string | null; token?: number | null } = {},
): AppointmentDto {
  return {
    id: row.id,
    doctorId: row.doctorId,
    patientId: row.patientId,
    date: row.apptDate,
    slotStart: row.slotStart,
    slotEnd: row.slotEnd,
    status: row.status,
    channel: row.channel,
    locationId: row.locationId,
    encounterId: row.encounterId,
    reason: row.reason,
    walkinName: row.walkinName || null,
    walkinMobile: row.walkinMobile || null,
    seq: row.seq,
    counterKind: (row.counterKind as AppointmentDto['counterKind']) ?? null,
    patientName: extra.patientName ?? null,
    uhid: extra.uhid ?? null,
    doctorName: extra.doctorName ?? null,
    cancelReason: row.cancelReason,
    token: extra.token ?? null,
  };
}

async function decorate(ctx: Ctx, rows: Appt[]): Promise<AppointmentDto[]> {
  if (rows.length === 0) return [];
  const patientIds = [...new Set(rows.map((row) => row.patientId).filter((id): id is string => Boolean(id)))];
  const doctorIds = [...new Set(rows.map((row) => row.doctorId))];
  const apptIds = rows.map((row) => row.id);
  const patients = patientIds.length
    ? await ctx.tx.select().from(schema.patients).where(inArray(schema.patients.id, patientIds))
    : [];
  const doctors = await ctx.tx.select().from(schema.doctors).where(inArray(schema.doctors.id, doctorIds));
  const tokens = await ctx.tx
    .select({ appointmentId: schema.opdQueue.appointmentId, token: schema.opdQueue.token })
    .from(schema.opdQueue)
    .where(inArray(schema.opdQueue.appointmentId, apptIds));
  const patientById = new Map(patients.map((row) => [row.id, row]));
  const doctorById = new Map(doctors.map((row) => [row.id, row]));
  const tokenByAppt = new Map(tokens.filter((row) => row.appointmentId).map((row) => [row.appointmentId as string, row.token]));
  return rows.map((row) => {
    const patient = row.patientId ? patientById.get(row.patientId) : undefined;
    return appointmentDto(row, {
      patientName: patient?.fullName ?? null,
      uhid: patient?.uhid ?? null,
      doctorName: doctorById.get(row.doctorId)?.name ?? null,
      token: tokenByAppt.get(row.id) ?? null,
    });
  });
}

export async function listSlots(ctx: Ctx, q: { doctorId: string; date: string }): Promise<SlotDto[]> {
  await assertDoctor(ctx, q.doctorId);
  const weekday = weekdayIndex(q.date);
  const windows = await ctx.tx
    .select()
    .from(schema.doctorSchedules)
    .where(and(eq(schema.doctorSchedules.doctorId, q.doctorId), eq(schema.doctorSchedules.locationId, ctx.locationId), eq(schema.doctorSchedules.weekday, weekday)))
    .orderBy(asc(schema.doctorSchedules.startTime));
  const exceptions = await ctx.tx
    .select()
    .from(schema.scheduleExceptions)
    .where(and(eq(schema.scheduleExceptions.doctorId, q.doctorId), eq(schema.scheduleExceptions.locationId, ctx.locationId), eq(schema.scheduleExceptions.onDate, q.date)));
  const booked = await ctx.tx
    .select({ slotStart: schema.appointments.slotStart })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.doctorId, q.doctorId),
        eq(schema.appointments.locationId, ctx.locationId),
        eq(schema.appointments.apptDate, q.date),
        ne(schema.appointments.status, 'cancelled'),
      ),
    );
  const counts = new Map<string, number>();
  for (const row of booked) counts.set(row.slotStart, (counts.get(row.slotStart) ?? 0) + 1);

  const allDay = exceptions.some((row) => row.kind === 'closed' && !row.startTime);
  type Win = { start: string; end: string; slotMinutes: number; max: number; closed: boolean };
  const wins: Win[] = [];
  if (allDay) {
    for (const row of windows) wins.push({ start: row.startTime, end: row.endTime, slotMinutes: row.slotMinutes, max: row.maxPerSlot, closed: true });
  } else {
    const override = exceptions.find((row) => row.kind === 'override' && row.startTime && row.endTime);
    if (override?.startTime && override.endTime) {
      wins.push({
        start: override.startTime,
        end: override.endTime,
        slotMinutes: override.slotMinutes ?? 15,
        max: override.maxPerSlot ?? 1,
        closed: false,
      });
    } else {
      for (const row of windows) wins.push({ start: row.startTime, end: row.endTime, slotMinutes: row.slotMinutes, max: row.maxPerSlot, closed: false });
    }
    for (const extra of exceptions) {
      if (extra.kind !== 'extra' || !extra.startTime || !extra.endTime) continue;
      wins.push({ start: extra.startTime, end: extra.endTime, slotMinutes: extra.slotMinutes ?? 15, max: extra.maxPerSlot ?? 1, closed: false });
    }
  }
  const closedRanges = exceptions.filter((row) => row.kind === 'closed' && row.startTime && row.endTime);
  const slots: SlotDto[] = [];
  const seen = new Set<string>();
  for (const win of wins) {
    let cursor = win.start;
    let guard = 0;
    while (guard < 200) {
      const end = addMinutes(cursor, win.slotMinutes);
      if (end <= cursor || end > win.end) break;
      if (!seen.has(cursor)) {
        seen.add(cursor);
        const count = counts.get(cursor) ?? 0;
        const shut = win.closed || closedRanges.some((row) => overlaps(cursor, end, row.startTime!, row.endTime!));
        const remaining = Math.max(0, win.max - count);
        const available = !shut && remaining > 0;
        slots.push({
          doctorId: q.doctorId,
          date: q.date,
          start: cursor,
          end,
          available,
          remaining: shut ? 0 : remaining,
          note: shut ? 'Closed' : remaining <= 0 ? 'Full' : null,
        });
      }
      cursor = end;
      guard += 1;
    }
  }
  slots.sort((a, b) => a.start.localeCompare(b.start));
  return slots;
}

async function nextSeq(ctx: Ctx, doctorId: string, date: string, slotStart: string): Promise<number> {
  const rows = await ctx.tx
    .select({ seq: schema.appointments.seq })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.doctorId, doctorId),
        eq(schema.appointments.apptDate, date),
        eq(schema.appointments.slotStart, slotStart),
        ne(schema.appointments.status, 'cancelled'),
      ),
    );
  const used = new Set(rows.map((row) => row.seq));
  let seq = 1;
  while (used.has(seq)) seq += 1;
  return seq;
}

async function counterKindFor(ctx: Ctx, patientId: string, doctorId: string): Promise<'new' | 'repeat'> {
  const [prior] = await ctx.tx
    .select({ id: schema.encounters.id })
    .from(schema.encounters)
    .where(and(eq(schema.encounters.patientId, patientId), eq(schema.encounters.doctorId, doctorId), eq(schema.encounters.kind, 'opd'), ne(schema.encounters.status, 'cancelled')))
    .limit(1);
  return prior ? 'repeat' : 'new';
}

export interface BookArgs {
  doctorId: string;
  date: string;
  slotStart: string;
  reason: string;
  patientId: string | null;
  channel: 'counter' | 'phone' | 'portal';
  walkinName?: string;
  walkinMobile?: string;
  counterKind?: 'new' | 'repeat';
}

export async function bookAppointment(ctx: Ctx, input: BookArgs): Promise<AppointmentDto> {
  const doctor = await assertDoctor(ctx, input.doctorId);
  if (!input.patientId && input.channel !== 'phone') {
    throw new ApiError(422, 'patient_required', 'A phone booking is the only appointment that can omit the patient');
  }
  let walkinMobile = '';
  if (!input.patientId) {
    const mobile = normaliseMobile(input.walkinMobile ?? '');
    if (!mobile) throw new ApiError(422, 'validation', 'Enter a 10-digit Indian mobile number', { walkinMobile: 'Enter a 10-digit Indian mobile number' });
    if (!input.walkinName || input.walkinName.trim().length < 2) throw new ApiError(422, 'validation', "Enter the caller's name", { walkinName: "Enter the caller's name" });
    walkinMobile = mobile;
  } else {
    await assertPatient(ctx, input.patientId);
  }
  await lockSlot(ctx.tx, input.doctorId, input.date, input.slotStart);
  const slots = await listSlots(ctx, { doctorId: input.doctorId, date: input.date });
  const slot = slots.find((row) => row.start === input.slotStart);
  if (!slot) throw new ApiError(422, 'not_on_schedule', 'That time is not a clinic slot');
  if (slot.note === 'Closed') throw new ApiError(422, 'slot_closed', 'The clinic is closed at that time');
  if (!slot.available) throw new ApiError(409, 'slot_full', 'That slot is full. Choose another time.');
  const seq = await nextSeq(ctx, input.doctorId, input.date, input.slotStart);
  const max = (slot.remaining ?? 0) + (seq - 1);
  if (seq > max) throw new ApiError(409, 'slot_full', 'That slot is full. Choose another time.');
  const counterKind = input.patientId ? (input.counterKind ?? (await counterKindFor(ctx, input.patientId, input.doctorId))) : null;
  try {
    const [row] = await ctx.tx
      .insert(schema.appointments)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        patientId: input.patientId,
        walkinName: input.patientId ? '' : input.walkinName!.trim(),
        walkinMobile,
        doctorId: input.doctorId,
        apptDate: input.date,
        slotStart: slot.start,
        slotEnd: slot.end,
        seq,
        channel: input.channel,
        status: 'booked',
        reason: input.reason.trim(),
        counterKind,
        createdBy: ctx.userId,
      })
      .returning();
    await ctx.audit('appointments.book', 'appointment', row!.id, null, { doctorId: input.doctorId, date: input.date, slotStart: slot.start, channel: input.channel });
    const [dto] = await decorate(ctx, [row!]);
    return dto ?? appointmentDto(row!, { doctorName: doctor.name });
  } catch (error) {
    if (pgCode(error) === '23505') throw new ApiError(409, 'slot_taken', 'That slot was just taken. Choose another time.');
    throw error;
  }
}

export async function bookCounter(ctx: Ctx, input: BookCounterAppointmentInput): Promise<AppointmentDto> {
  return bookAppointment(ctx, {
    doctorId: input.doctorId,
    date: input.date,
    slotStart: input.slotStart,
    reason: input.reason,
    patientId: input.patientId ?? null,
    channel: input.patientId ? 'counter' : 'phone',
    walkinName: input.walkinName,
    walkinMobile: input.walkinMobile,
    counterKind: input.counterKind,
  });
}

async function loadAppointment(ctx: Ctx, id: string): Promise<Appt> {
  const [row] = await ctx.tx.select().from(schema.appointments).where(eq(schema.appointments.id, id));
  if (!row) throw new ApiError(404, 'not_found', 'Appointment not found');
  return row;
}

export async function getAppointment(ctx: Ctx, id: string): Promise<AppointmentDto> {
  const row = await loadAppointment(ctx, id);
  const [dto] = await decorate(ctx, [row]);
  return dto!;
}

export async function rescheduleAppointment(ctx: Ctx, id: string, next: { date: string; slotStart: string }): Promise<AppointmentDto> {
  const row = await loadAppointment(ctx, id);
  if (row.status === 'cancelled') throw new ApiError(409, 'appointment_closed', 'This appointment is already cancelled');
  if (row.status !== 'booked' && row.status !== 'confirmed') {
    throw new ApiError(409, 'appointment_closed', 'Check-in has started. Change the queue instead of the appointment.');
  }
  if (row.apptDate === next.date && row.slotStart === next.slotStart) {
    const [dto] = await decorate(ctx, [row]);
    return dto!;
  }
  await lockSlot(ctx.tx, row.doctorId, next.date, next.slotStart);
  const slots = await listSlots(ctx, { doctorId: row.doctorId, date: next.date });
  const slot = slots.find((item) => item.start === next.slotStart);
  if (!slot) throw new ApiError(422, 'not_on_schedule', 'That time is not a clinic slot');
  if (slot.note === 'Closed') throw new ApiError(422, 'slot_closed', 'The clinic is closed at that time');
  if (!slot.available) throw new ApiError(409, 'slot_full', 'That slot is full. Choose another time.');
  const seq = await nextSeq(ctx, row.doctorId, next.date, next.slotStart);
  try {
    const [updated] = await ctx.tx
      .update(schema.appointments)
      .set({ apptDate: next.date, slotStart: slot.start, slotEnd: slot.end, seq })
      .where(eq(schema.appointments.id, row.id))
      .returning();
    await ctx.audit('appointments.reschedule', 'appointment', row.id, { date: row.apptDate, slotStart: row.slotStart }, { date: next.date, slotStart: slot.start });
    const [dto] = await decorate(ctx, [updated!]);
    return dto!;
  } catch (error) {
    if (pgCode(error) === '23505') throw new ApiError(409, 'slot_taken', 'That slot was just taken. Choose another time.');
    throw error;
  }
}

export async function cancelAppointment(ctx: Ctx, id: string, reason: string): Promise<AppointmentDto> {
  const row = await loadAppointment(ctx, id);
  if (row.status === 'cancelled') {
    const [dto] = await decorate(ctx, [row]);
    return dto!;
  }
  if (row.status === 'checked_in' || row.status === 'completed') {
    throw new ApiError(409, 'appointment_closed', 'This patient is already in the clinic. Update the OPD queue instead.');
  }
  const [updated] = await ctx.tx
    .update(schema.appointments)
    .set({ status: 'cancelled', cancelReason: reason.trim(), cancelledAt: new Date() })
    .where(eq(schema.appointments.id, row.id))
    .returning();
  await ctx.audit('appointments.cancel', 'appointment', row.id, { status: row.status }, { status: 'cancelled', reason: reason.trim() });
  const [dto] = await decorate(ctx, [updated!]);
  return dto!;
}

export async function loadDiary(ctx: Ctx, q: { date: string; doctorId?: string | null }): Promise<DiaryDto> {
  const doctorRows = await ctx.tx
    .select()
    .from(schema.doctors)
    .where(and(eq(schema.doctors.locationId, ctx.locationId), eq(schema.doctors.active, true)))
    .orderBy(asc(schema.doctors.name));
  const scheduled = await ctx.tx
    .select({ doctorId: schema.doctorSchedules.doctorId })
    .from(schema.doctorSchedules)
    .where(eq(schema.doctorSchedules.locationId, ctx.locationId));
  const scheduledIds = new Set(scheduled.map((row) => row.doctorId));
  const apptRows = await ctx.tx
    .select()
    .from(schema.appointments)
    .where(and(eq(schema.appointments.locationId, ctx.locationId), eq(schema.appointments.apptDate, q.date), ne(schema.appointments.status, 'cancelled')))
    .orderBy(asc(schema.appointments.slotStart), asc(schema.appointments.seq));
  const decorated = await decorate(ctx, apptRows);
  const byDoctor = new Map<string, AppointmentDto[]>();
  for (const row of decorated) {
    const list = byDoctor.get(row.doctorId) ?? [];
    list.push(row);
    byDoctor.set(row.doctorId, list);
  }
  let columns = doctorRows
    .filter((doctor) => scheduledIds.has(doctor.id) || byDoctor.has(doctor.id))
    .map((doctor) => ({
      doctorId: doctor.id,
      doctorName: doctor.name,
      speciality: doctor.speciality,
      appointments: byDoctor.get(doctor.id) ?? [],
    }));
  for (const [doctorId, appointments] of byDoctor) {
    if (!columns.some((column) => column.doctorId === doctorId)) {
      columns.push({ doctorId, doctorName: appointments[0]?.doctorName ?? 'Doctor', speciality: '', appointments });
    }
  }
  if (q.doctorId) columns = columns.filter((column) => column.doctorId === q.doctorId);
  return { date: q.date, locationId: ctx.locationId, doctorId: q.doctorId ?? null, columns };
}

function exceptionDto(row: typeof schema.scheduleExceptions.$inferSelect): ScheduleExceptionDto {
  return {
    id: row.id,
    date: row.onDate,
    kind: row.kind as ScheduleExceptionDto['kind'],
    start: row.startTime,
    end: row.endTime,
    slotMinutes: row.slotMinutes,
    maxPerSlot: row.maxPerSlot,
    reason: row.reason,
  };
}

export async function getSchedule(ctx: Ctx, doctorId: string): Promise<DoctorScheduleDto> {
  await assertDoctor(ctx, doctorId);
  const windows = await ctx.tx
    .select()
    .from(schema.doctorSchedules)
    .where(and(eq(schema.doctorSchedules.doctorId, doctorId), eq(schema.doctorSchedules.locationId, ctx.locationId)))
    .orderBy(asc(schema.doctorSchedules.weekday), asc(schema.doctorSchedules.startTime));
  const exceptions = await ctx.tx
    .select()
    .from(schema.scheduleExceptions)
    .where(and(eq(schema.scheduleExceptions.doctorId, doctorId), eq(schema.scheduleExceptions.locationId, ctx.locationId)))
    .orderBy(asc(schema.scheduleExceptions.onDate));
  return {
    doctorId,
    locationId: ctx.locationId,
    windows: windows.map((row) => ({ weekday: row.weekday, start: row.startTime, end: row.endTime, slotMinutes: row.slotMinutes, maxPerSlot: row.maxPerSlot })),
    exceptions: exceptions.map(exceptionDto),
  };
}

export async function putSchedule(ctx: Ctx, doctorId: string, body: PutScheduleInput): Promise<DoctorScheduleDto> {
  await assertDoctor(ctx, doctorId);
  const seen = new Set<string>();
  for (const window of body.windows) {
    const key = `${window.weekday}|${window.start}`;
    if (seen.has(key)) throw new ApiError(422, 'validation', 'Two windows start at the same time on the same day');
    seen.add(key);
  }
  const before = await getSchedule(ctx, doctorId);
  await ctx.tx.delete(schema.doctorSchedules).where(and(eq(schema.doctorSchedules.doctorId, doctorId), eq(schema.doctorSchedules.locationId, ctx.locationId)));
  if (body.windows.length > 0) {
    await ctx.tx.insert(schema.doctorSchedules).values(
      body.windows.map((window) => ({
        tenantId: ctx.tenantId,
        doctorId,
        locationId: ctx.locationId,
        weekday: window.weekday,
        startTime: window.start,
        endTime: window.end,
        slotMinutes: window.slotMinutes,
        maxPerSlot: window.maxPerSlot,
      })),
    );
  }
  if (body.exceptions) {
    await ctx.tx.delete(schema.scheduleExceptions).where(and(eq(schema.scheduleExceptions.doctorId, doctorId), eq(schema.scheduleExceptions.locationId, ctx.locationId)));
    if (body.exceptions.length > 0) {
      await ctx.tx.insert(schema.scheduleExceptions).values(
        body.exceptions.map((row) => ({
          tenantId: ctx.tenantId,
          doctorId,
          locationId: ctx.locationId,
          onDate: row.date,
          kind: row.kind,
          startTime: row.start ?? null,
          endTime: row.end ?? null,
          slotMinutes: row.slotMinutes ?? null,
          maxPerSlot: row.maxPerSlot ?? null,
          reason: row.reason ?? '',
        })),
      );
    }
  }
  const after = await getSchedule(ctx, doctorId);
  await ctx.audit('appointments.schedule.replace', 'doctor_schedule', doctorId, { windows: before.windows.length, exceptions: before.exceptions.length }, { windows: after.windows.length, exceptions: after.exceptions.length });
  return after;
}

async function consultationService(ctx: Ctx, visitType: 'new' | 'follow_up') {
  const rows = await ctx.tx
    .select()
    .from(schema.services)
    .where(and(eq(schema.services.category, 'consultation'), eq(schema.services.active, true)))
    .orderBy(asc(schema.services.code));
  const preferred = visitType === 'follow_up' ? 'CON-FU' : 'CON-NEW';
  const match = rows.find((row) => row.code === preferred) ?? rows.find((row) => row.code === 'CON-NEW') ?? rows[0];
  if (!match) throw new ApiError(422, 'tariff_missing', 'No consultation service is set up');
  return match;
}

function consultationOf(row: typeof schema.charges.$inferSelect | undefined, description: string): ConsultationChargeDto {
  if (!row) return { description, amountPaise: 0, gstTreatment: 'exempt_healthcare', gstRateBp: 0, hsnSac: '9993' };
  return {
    description: row.description,
    amountPaise: row.amountPaise,
    gstTreatment: row.gstTreatment as ConsultationChargeDto['gstTreatment'],
    gstRateBp: row.gstRateBp,
    hsnSac: row.hsnSac,
  };
}

async function registeredFrom(ctx: Ctx, encounterId: string): Promise<RegisteredVisitDto> {
  const [enc] = await ctx.tx.select().from(schema.encounters).where(eq(schema.encounters.id, encounterId));
  if (!enc) throw new ApiError(404, 'not_found', 'Visit not found');
  const [patient] = await ctx.tx.select().from(schema.patients).where(eq(schema.patients.id, enc.patientId));
  const [queue] = await ctx.tx.select().from(schema.opdQueue).where(eq(schema.opdQueue.encounterId, enc.id));
  if (!queue) throw new ApiError(409, 'conflict', 'This appointment is already checked in');
  const [charge] = await ctx.tx
    .select()
    .from(schema.charges)
    .where(and(eq(schema.charges.encounterId, enc.id), eq(schema.charges.sourceLine, 'consultation'), isNull(schema.charges.reversalOfId)));
  return {
    ...encounterDto(enc, patient ? patientSummary(patient) : undefined),
    token: queue.token,
    queueStatus: queue.status as OpdQueueStatus,
    consultation: consultationOf(charge, 'Consultation'),
  };
}

export async function registerVisit(ctx: Ctx, input: RegisterVisitInput): Promise<RegisteredVisitDto> {
  const patient = await assertPatient(ctx, input.patientId);
  const doctor = await assertDoctor(ctx, input.doctorId);
  let appointment: Appt | null = null;
  if (input.appointmentId) {
    appointment = await loadAppointment(ctx, input.appointmentId);
    if (appointment.locationId !== ctx.locationId) throw new ApiError(422, 'wrong_location', 'That appointment is at another location');
    if (appointment.doctorId !== input.doctorId) throw new ApiError(422, 'validation', 'This appointment is with another doctor');
    if (appointment.encounterId) return registeredFrom(ctx, appointment.encounterId);
    if (appointment.status === 'cancelled' || appointment.status === 'completed' || appointment.status === 'no_show') {
      throw new ApiError(409, 'appointment_closed', 'This appointment can no longer be checked in');
    }
    if (appointment.patientId && appointment.patientId !== input.patientId) {
      throw new ApiError(409, 'wrong_patient', 'This appointment is for a different patient');
    }
  }
  let visitType = input.visitType;
  if (!visitType && appointment?.counterKind === 'repeat') visitType = 'follow_up';
  else if (!visitType && appointment?.counterKind === 'new') visitType = 'new';
  else if (!visitType) visitType = (await counterKindFor(ctx, input.patientId, input.doctorId)) === 'repeat' ? 'follow_up' : 'new';
  const encounter = await svc().encounters.openOpd(ctx, {
    patientId: input.patientId,
    doctorId: input.doctorId,
    departmentId: input.departmentId ?? doctor.departmentId ?? undefined,
    appointmentId: appointment?.id,
    visitType,
    payerType: input.payerType ?? 'self',
  });
  const service = await consultationService(ctx, visitType);
  const price = await svc().prices.priceFor(ctx, { serviceId: service.id, payerClass: 'general', on: istDateKey(new Date()) });
  const charge = await svc().charges.post(ctx, {
    encounterId: encounter.id,
    patientId: input.patientId,
    serviceId: service.id,
    description: service.name,
    qty: 1,
    unitPricePaise: price.unitPricePaise,
    gstTreatment: price.gstTreatment,
    gstRateBp: price.gstRateBp,
    hsnSac: price.hsnSac,
    serviceDate: istDateKey(new Date()),
    performingDoctorId: input.doctorId,
    source: { module: 'opd', type: 'encounter', id: encounter.id, line: 'consultation' },
  });
  const token = Number(await svc().numbering.next(ctx, `opd_token:${input.doctorId}`));
  const [queue] = await ctx.tx
    .insert(schema.opdQueue)
    .values({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      encounterId: encounter.id,
      appointmentId: appointment?.id ?? null,
      patientId: input.patientId,
      doctorId: input.doctorId,
      token,
      status: 'waiting',
      visitDate: istDateKey(new Date()),
    })
    .returning();
  if (appointment) {
    await ctx.tx
      .update(schema.appointments)
      .set({
        status: 'checked_in',
        encounterId: encounter.id,
        patientId: input.patientId,
        counterKind: appointment.counterKind ?? (visitType === 'follow_up' ? 'repeat' : 'new'),
      })
      .where(eq(schema.appointments.id, appointment.id));
  }
  await ctx.audit('opd.visit.register', 'encounter', encounter.id, null, { token, appointmentId: appointment?.id ?? null, visitType, patientId: patient.id });
  return {
    ...encounter,
    token: queue!.token,
    queueStatus: 'waiting',
    consultation: {
      description: charge.description,
      amountPaise: charge.amountPaise,
      gstTreatment: charge.gstTreatment,
      gstRateBp: charge.gstRateBp,
      hsnSac: charge.hsnSac,
    },
  };
}

export async function listQueue(ctx: Ctx, q: { date?: string; doctorId?: string }): Promise<OpdQueueItemDto[]> {
  const date = q.date ?? istDateKey(new Date());
  const filters = [eq(schema.opdQueue.locationId, ctx.locationId), eq(schema.opdQueue.visitDate, date)];
  if (q.doctorId) filters.push(eq(schema.opdQueue.doctorId, q.doctorId));
  const rows = await ctx.tx
    .select()
    .from(schema.opdQueue)
    .where(and(...filters))
    .orderBy(asc(schema.opdQueue.token));
  if (rows.length === 0) return [];
  const encounters = await ctx.tx.select().from(schema.encounters).where(inArray(schema.encounters.id, rows.map((row) => row.encounterId)));
  const patients = await ctx.tx.select().from(schema.patients).where(inArray(schema.patients.id, rows.map((row) => row.patientId)));
  const doctors = await ctx.tx.select().from(schema.doctors).where(inArray(schema.doctors.id, [...new Set(rows.map((row) => row.doctorId))]));
  const apptIds = rows.map((row) => row.appointmentId).filter((id): id is string => Boolean(id));
  const appts = apptIds.length ? await ctx.tx.select().from(schema.appointments).where(inArray(schema.appointments.id, apptIds)) : [];
  const encById = new Map(encounters.map((row) => [row.id, row]));
  const patientById = new Map(patients.map((row) => [row.id, row]));
  const doctorById = new Map(doctors.map((row) => [row.id, row]));
  const apptById = new Map(appts.map((row) => [row.id, row]));
  return rows.map((row) => {
    const enc = encById.get(row.encounterId);
    const patient = patientById.get(row.patientId);
    return {
      encounterId: row.encounterId,
      encounterNumber: enc?.number ?? '—',
      appointmentId: row.appointmentId,
      patientId: row.patientId,
      patientName: patient?.fullName || '—',
      uhid: patient?.uhid ?? '—',
      doctorId: row.doctorId,
      doctorName: doctorById.get(row.doctorId)?.name ?? '—',
      token: row.token,
      status: row.status as OpdQueueStatus,
      visitType: (enc?.visitType as OpdQueueItemDto['visitType']) ?? null,
      channel: row.appointmentId ? (apptById.get(row.appointmentId)?.channel ?? null) : null,
      arrivedAt: iso(row.createdAt) ?? '',
    };
  });
}

export async function setQueueStatus(ctx: Ctx, encounterId: string, status: OpdQueueStatus): Promise<OpdQueueItemDto> {
  const [row] = await ctx.tx.select().from(schema.opdQueue).where(eq(schema.opdQueue.encounterId, encounterId));
  if (!row || row.locationId !== ctx.locationId) throw new ApiError(404, 'not_found', 'This visit is not on the queue');
  const [updated] = await ctx.tx.update(schema.opdQueue).set({ status }).where(eq(schema.opdQueue.id, row.id)).returning();
  if (row.appointmentId) {
    const apptStatus = status === 'done' ? 'completed' : status === 'skipped' ? 'no_show' : 'checked_in';
    await ctx.tx.update(schema.appointments).set({ status: apptStatus }).where(eq(schema.appointments.id, row.appointmentId));
  }
  await ctx.audit('opd.visit.status', 'opd_queue', row.id, { status: row.status }, { status });
  const match = (await listQueue(ctx, { date: updated!.visitDate })).find((entry) => entry.encounterId === encounterId);
  if (!match) throw new ApiError(404, 'not_found', 'This visit is not on the queue');
  return match;
}

async function locationName(ctx: Ctx): Promise<string> {
  const [loc] = await ctx.tx.select({ name: schema.locations.name }).from(schema.locations).where(eq(schema.locations.id, ctx.locationId));
  return loc?.name ?? '';
}

async function visitRows(ctx: Ctx, q: { from: string; to: string; doctorId?: string }): Promise<{ rows: VisitRegisterRowDto[]; truncated: boolean; locationName: string }> {
  const filters = [
    eq(schema.encounters.kind, 'opd'),
    eq(schema.encounters.locationId, ctx.locationId),
    sql`(${schema.encounters.startedAt} at time zone 'Asia/Kolkata')::date >= ${q.from}::date`,
    sql`(${schema.encounters.startedAt} at time zone 'Asia/Kolkata')::date <= ${q.to}::date`,
  ];
  if (q.doctorId) filters.push(eq(schema.encounters.doctorId, q.doctorId));
  const found = await ctx.tx
    .select()
    .from(schema.encounters)
    .where(and(...filters))
    .orderBy(asc(schema.encounters.startedAt))
    .limit(1001);
  const truncated = found.length > 1000;
  const encounters = truncated ? found.slice(0, 1000) : found;
  const name = await locationName(ctx);
  if (encounters.length === 0) return { rows: [], truncated, locationName: name };
  const patients = await ctx.tx.select().from(schema.patients).where(inArray(schema.patients.id, [...new Set(encounters.map((row) => row.patientId))]));
  const doctorIds = [...new Set(encounters.map((row) => row.doctorId).filter((id): id is string => Boolean(id)))];
  const doctors = doctorIds.length ? await ctx.tx.select().from(schema.doctors).where(inArray(schema.doctors.id, doctorIds)) : [];
  const queues = await ctx.tx.select().from(schema.opdQueue).where(inArray(schema.opdQueue.encounterId, encounters.map((row) => row.id)));
  const patientById = new Map(patients.map((row) => [row.id, row]));
  const doctorById = new Map(doctors.map((row) => [row.id, row]));
  const queueByEnc = new Map(queues.map((row) => [row.encounterId, row]));
  const rows: VisitRegisterRowDto[] = encounters.map((row) => {
    const patient = patientById.get(row.patientId);
    return {
      encounterId: row.id,
      number: row.number,
      startedAt: iso(row.startedAt) ?? '',
      patientName: patient?.fullName || '—',
      uhid: patient?.uhid ?? '—',
      doctorId: row.doctorId,
      doctorName: row.doctorId ? (doctorById.get(row.doctorId)?.name ?? '—') : '—',
      visitType: (row.visitType as VisitRegisterRowDto['visitType']) ?? null,
      token: queueByEnc.get(row.id)?.token ?? null,
      payerType: row.payerType as VisitRegisterRowDto['payerType'],
      status: row.status,
    };
  });
  return { rows, truncated, locationName: name };
}

export async function visitRegister(ctx: Ctx, q: { from: string; to: string; doctorId?: string }): Promise<VisitRegisterDto> {
  const loaded = await visitRows(ctx, q);
  return { from: q.from, to: q.to, locationId: ctx.locationId, locationName: loaded.locationName, rows: loaded.rows, truncated: loaded.truncated };
}

export async function visitStatistics(ctx: Ctx, q: { from: string; to: string }): Promise<VisitStatisticsDto> {
  const loaded = await visitRows(ctx, q);
  const byDoctor = new Map<string, { doctorId: string | null; doctorName: string; total: number; newCount: number; followUpCount: number }>();
  for (const row of loaded.rows) {
    const key = row.doctorId ?? '';
    const current = byDoctor.get(key) ?? { doctorId: row.doctorId, doctorName: row.doctorName, total: 0, newCount: 0, followUpCount: 0 };
    current.total += 1;
    if (row.visitType === 'follow_up') current.followUpCount += 1;
    else current.newCount += 1;
    byDoctor.set(key, current);
  }
  const stats = [...byDoctor.values()].sort((a, b) => a.doctorName.localeCompare(b.doctorName, 'en-IN'));
  return {
    from: q.from,
    to: q.to,
    locationId: ctx.locationId,
    locationName: loaded.locationName,
    total: loaded.rows.length,
    newCount: loaded.rows.filter((row) => row.visitType !== 'follow_up').length,
    followUpCount: loaded.rows.filter((row) => row.visitType === 'follow_up').length,
    byDoctor: stats,
    truncated: loaded.truncated,
  };
}
