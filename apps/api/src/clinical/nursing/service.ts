import { schema, type Tx } from '@hos/db';
import {
  ageLabel,
  istDateKey,
  type ClinicalCtx,
  type ClinicalNoteDto,
  type ClinicalOrderDto,
  type DietOrderView,
  type GiveDoseInput,
  type MarDose,
  type PlaceClinicalOrderInput,
  type VitalSignsDto,
  type WardPatient,
} from '@hos/shared';
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { ApiError } from '../../http';
import { noteDto, vitalDto } from '../patients-read';

const MODULE = 'nurse-station';

/** High-alert generics require a witness when the dose is given. */
export const HIGH_ALERT_GENERIC_CODES = new Set(['INSULIN_REGULAR', 'INSULIN_GLARGINE', 'HEPARIN', 'MORPHINE', 'WARFARIN']);

const DOSE_HOURS: Record<string, number[]> = {
  OD: [8],
  BD: [8, 20],
  TDS: [8, 14, 20],
  QID: [6, 12, 18, 22],
  HS: [21],
};

function istDayStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+05:30`);
}

function istDayEnd(dateKey: string): Date {
  return new Date(`${dateKey}T23:59:59.999+05:30`);
}

function scheduleAtIst(dateKey: string, hour: number): Date {
  return new Date(`${dateKey}T${String(hour).padStart(2, '0')}:00:00+05:30`);
}

function marDto(
  schedule: typeof schema.marSchedules.$inferSelect,
  item: typeof schema.clinicalOrderItems.$inferSelect,
  admin: typeof schema.medicationAdministrations.$inferSelect | null,
  givenByName: string | null,
): MarDose {
  let status: MarDose['status'] = 'due';
  let givenAt: string | null = null;
  let givenBy: string | null = null;
  let reason: string | null = null;
  if (schedule.voidedAt) status = 'missed';
  else if (admin) {
    status = admin.status as MarDose['status'];
    givenAt = admin.givenAt.toISOString();
    givenBy = givenByName;
    reason = admin.reason || null;
  }
  return {
    id: schedule.id,
    encounterId: schedule.encounterId,
    orderItemId: schedule.orderItemId,
    drugName: item.drugName ?? item.genericCode ?? 'Medicine',
    dose: item.dose,
    scheduledAt: schedule.scheduledAt.toISOString(),
    status,
    givenAt,
    givenBy,
    reason,
  };
}

async function loadItem(tx: Tx, orderItemId: string) {
  const [item] = await tx.select().from(schema.clinicalOrderItems).where(eq(schema.clinicalOrderItems.id, orderItemId));
  if (!item) throw new ApiError(404, 'not_found', 'Order item not found');
  return item;
}

async function voidFutureForItem(tx: Tx, orderItemId: string): Promise<void> {
  const now = new Date();
  const schedules = await tx
    .select({ id: schema.marSchedules.id })
    .from(schema.marSchedules)
    .where(
      and(eq(schema.marSchedules.orderItemId, orderItemId), isNull(schema.marSchedules.voidedAt), sql`${schema.marSchedules.scheduledAt} > ${now}`),
    );
  for (const row of schedules) {
    const [admin] = await tx
      .select({ id: schema.medicationAdministrations.id })
      .from(schema.medicationAdministrations)
      .where(eq(schema.medicationAdministrations.marScheduleId, row.id));
    if (!admin) await tx.update(schema.marSchedules).set({ voidedAt: now }).where(eq(schema.marSchedules.id, row.id));
  }
}

/** Idempotent MAR generation for IPD medicine lines on one encounter and calendar day (IST). */
export async function ensureMarForDay(tx: Tx, tenantId: string, encounterId: string, dateKey: string): Promise<void> {
  const rows = await tx
    .select({ item: schema.clinicalOrderItems, order: schema.clinicalOrders })
    .from(schema.clinicalOrderItems)
    .innerJoin(schema.clinicalOrders, eq(schema.clinicalOrders.id, schema.clinicalOrderItems.orderId))
    .innerJoin(schema.encounters, eq(schema.encounters.id, schema.clinicalOrders.encounterId))
    .where(
      and(
        eq(schema.clinicalOrders.encounterId, encounterId),
        eq(schema.clinicalOrders.kind, 'medicine'),
        eq(schema.encounters.kind, 'ipd'),
      ),
    );

  const dayStart = istDayStart(dateKey);
  const dayEnd = istDayEnd(dateKey);

  for (const { item, order } of rows) {
    if (order.status === 'cancelled') {
      await voidFutureForItem(tx, item.id);
      continue;
    }
    if (item.status === 'cancelled') {
      await voidFutureForItem(tx, item.id);
      continue;
    }

    const freq = item.frequencyCode;
    if (!freq || freq === 'SOS') continue;

    const placedAt = order.placedAt ?? order.createdAt;
    const placed = placedAt instanceof Date ? placedAt : new Date(placedAt);
    const durationDays = item.durationDays ?? 1;
    const endDay = new Date(placed);
    endDay.setDate(endDay.getDate() + durationDays - 1);
    const endKey = istDateKey(endDay);
    if (dateKey < istDateKey(placed) || dateKey > endKey) continue;

    const slots: Date[] = [];
    if (freq === 'STAT') {
      if (placed >= dayStart && placed <= dayEnd) slots.push(placed);
    } else {
      for (const hour of DOSE_HOURS[freq] ?? []) {
        const at = scheduleAtIst(dateKey, hour);
        if (at >= placed || dateKey > istDateKey(placed)) slots.push(at);
      }
    }

    for (const scheduledAt of slots) {
      await tx
        .insert(schema.marSchedules)
        .values({ tenantId, orderItemId: item.id, encounterId, scheduledAt })
        .onConflictDoNothing({
          target: [schema.marSchedules.tenantId, schema.marSchedules.orderItemId, schema.marSchedules.scheduledAt],
        });
    }
  }
}

export async function wardPatients(ctx: ClinicalCtx<Tx>, q: { wardCode?: string }): Promise<WardPatient[]> {
  const filters = [
    eq(schema.encounters.locationId, ctx.locationId),
    eq(schema.encounters.kind, 'ipd'),
    eq(schema.encounters.status, 'open'),
    q.wardCode ? eq(schema.encounters.currentWardCode, q.wardCode) : undefined,
  ].filter((f): f is NonNullable<typeof f> => !!f);

  const rows = await ctx.tx
    .select({
      encounter: schema.encounters,
      patient: schema.patients,
      doctor: schema.doctors,
    })
    .from(schema.encounters)
    .innerJoin(schema.patients, eq(schema.patients.id, schema.encounters.patientId))
    .leftJoin(schema.doctors, eq(schema.doctors.id, schema.encounters.doctorId))
    .where(and(...filters))
    .orderBy(asc(schema.encounters.currentWardCode), asc(schema.encounters.currentBedLabel));

  return rows.map((r) => ({
    encounterId: r.encounter.id,
    patientId: r.patient.id,
    uhid: r.patient.uhid,
    fullName: r.patient.fullName ?? `${r.patient.firstName} ${r.patient.lastName}`.trim(),
    ageLabel: ageLabel(r.patient.dob ? String(r.patient.dob).slice(0, 10) : null),
    gender: r.patient.gender,
    wardCode: r.encounter.currentWardCode,
    bedLabel: r.encounter.currentBedLabel,
    doctorName: r.doctor?.name ?? null,
  }));
}

export async function marForEncounter(ctx: ClinicalCtx<Tx>, encounterId: string, dateKey: string): Promise<MarDose[]> {
  const [encounter] = await ctx.tx.select().from(schema.encounters).where(eq(schema.encounters.id, encounterId));
  if (!encounter) throw new ApiError(404, 'not_found', 'Encounter not found');

  await ensureMarForDay(ctx.tx, ctx.tenantId, encounterId, dateKey);

  const dayStart = istDayStart(dateKey);
  const dayEnd = istDayEnd(dateKey);

  const schedules = await ctx.tx
    .select()
    .from(schema.marSchedules)
    .where(
      and(
        eq(schema.marSchedules.encounterId, encounterId),
        gte(schema.marSchedules.scheduledAt, dayStart),
        lte(schema.marSchedules.scheduledAt, dayEnd),
      ),
    )
    .orderBy(asc(schema.marSchedules.scheduledAt));

  const out: MarDose[] = [];
  for (const schedule of schedules) {
    const item = await loadItem(ctx.tx, schedule.orderItemId);
    const [admin] = await ctx.tx
      .select()
      .from(schema.medicationAdministrations)
      .where(eq(schema.medicationAdministrations.marScheduleId, schedule.id));
    let givenByName: string | null = null;
    if (admin?.givenBy) {
      const [user] = await ctx.tx.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, admin.givenBy));
      givenByName = user?.name ?? null;
    }
    out.push(marDto(schedule, item, admin ?? null, givenByName));
  }
  return out;
}

export async function giveDose(ctx: ClinicalCtx<Tx>, doseId: string, input: GiveDoseInput): Promise<MarDose> {
  const [schedule] = await ctx.tx.select().from(schema.marSchedules).where(eq(schema.marSchedules.id, doseId));
  if (!schedule) throw new ApiError(404, 'not_found', 'Dose not found');
  if (schedule.voidedAt) throw new ApiError(422, 'dose_voided', 'This dose was voided');

  const existing = await ctx.tx
    .select()
    .from(schema.medicationAdministrations)
    .where(eq(schema.medicationAdministrations.marScheduleId, schedule.id));
  if (existing.length > 0) throw new ApiError(409, 'already_given', 'This dose was already recorded');

  const item = await loadItem(ctx.tx, schedule.orderItemId);
  const generic = item.genericCode?.toUpperCase() ?? '';
  if (input.status === 'given' && HIGH_ALERT_GENERIC_CODES.has(generic) && !input.witnessUserId) {
    throw new ApiError(422, 'witness_required', 'High-alert medicine needs a witness');
  }

  const now = new Date();
  const earlyMs = schedule.scheduledAt.getTime() - now.getTime();
  if (earlyMs > 60 * 60 * 1000 && !input.reason?.trim()) {
    throw new ApiError(422, 'reason_required', 'Say why you are giving this dose more than 60 minutes early');
  }

  const [admin] = await ctx.tx
    .insert(schema.medicationAdministrations)
    .values({
      tenantId: ctx.tenantId,
      marScheduleId: schedule.id,
      status: input.status,
      doseGiven: input.doseGiven ?? item.dose ?? '',
      givenAt: now,
      givenBy: ctx.userId,
      reason: input.reason ?? '',
      witnessUserId: input.witnessUserId ?? null,
    })
    .returning();

  await ctx.audit('nursing.mar.administer', 'mar_schedule', schedule.id, null, {
    status: input.status,
    orderItemId: schedule.orderItemId,
  });

  let givenByName: string | null = null;
  const [user] = await ctx.tx.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, ctx.userId));
  givenByName = user?.name ?? null;

  if (input.status === 'given') {
    await ctx.tx
      .update(schema.clinicalOrderItems)
      .set({ status: 'in_progress', fulfilledQty: sql`${schema.clinicalOrderItems.fulfilledQty} + 1` })
      .where(eq(schema.clinicalOrderItems.id, item.id));
  }

  return marDto(schedule, item, admin!, givenByName);
}

export async function dietOrders(ctx: ClinicalCtx<Tx>, q: { wardCode?: string; encounterId?: string }): Promise<DietOrderView[]> {
  const filters = [
    eq(schema.clinicalOrders.kind, 'diet'),
    eq(schema.clinicalOrders.status, 'placed'),
    eq(schema.encounters.locationId, ctx.locationId),
    eq(schema.encounters.status, 'open'),
    q.encounterId ? eq(schema.clinicalOrders.encounterId, q.encounterId) : undefined,
    q.wardCode ? eq(schema.encounters.currentWardCode, q.wardCode) : undefined,
  ].filter((f): f is NonNullable<typeof f> => !!f);

  const rows = await ctx.tx
    .select({ item: schema.clinicalOrderItems, order: schema.clinicalOrders, patient: schema.patients, encounter: schema.encounters })
    .from(schema.clinicalOrderItems)
    .innerJoin(schema.clinicalOrders, eq(schema.clinicalOrders.id, schema.clinicalOrderItems.orderId))
    .innerJoin(schema.encounters, eq(schema.encounters.id, schema.clinicalOrders.encounterId))
    .innerJoin(schema.patients, eq(schema.patients.id, schema.encounters.patientId))
    .where(and(...filters))
    .orderBy(asc(schema.encounters.currentWardCode), asc(schema.encounters.currentBedLabel));

  return rows.map((r) => ({
    orderItemId: r.item.id,
    encounterId: r.encounter.id,
    patientName: r.patient.fullName ?? r.patient.firstName,
    bedLabel: r.encounter.currentBedLabel,
    dietCode: r.item.dietCode ?? 'normal',
    instructions: r.item.instructions,
    status: r.item.status,
  }));
}

export async function encounterOrders(ctx: ClinicalCtx<Tx>, encounterId: string): Promise<ClinicalOrderDto[]> {
  const orderRows = await ctx.tx
    .select()
    .from(schema.clinicalOrders)
    .where(and(eq(schema.clinicalOrders.encounterId, encounterId), or(eq(schema.clinicalOrders.kind, 'lab'), eq(schema.clinicalOrders.kind, 'medicine'))))
    .orderBy(desc(schema.clinicalOrders.placedAt));
  const out: ClinicalOrderDto[] = [];
  for (const order of orderRows) {
    const items = await ctx.tx
      .select()
      .from(schema.clinicalOrderItems)
      .where(eq(schema.clinicalOrderItems.orderId, order.id))
      .orderBy(asc(schema.clinicalOrderItems.lineNo));
    out.push({
      id: order.id,
      locationId: order.locationId,
      encounterId: order.encounterId,
      patientId: order.patientId,
      kind: order.kind as ClinicalOrderDto['kind'],
      number: order.number,
      source: order.source as ClinicalOrderDto['source'],
      priority: order.priority as ClinicalOrderDto['priority'],
      status: order.status as ClinicalOrderDto['status'],
      orderingDoctorId: order.orderingDoctorId,
      orderedByUserId: order.orderedByUserId,
      notes: order.notes,
      placedAt: (order.placedAt ?? order.createdAt).toISOString(),
      cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
      cancelReason: order.cancelReason,
      items: items.map((line) => ({
        id: line.id,
        orderId: line.orderId,
        lineNo: line.lineNo,
        serviceId: line.serviceId,
        drugName: line.drugName,
        genericCode: line.genericCode,
        strength: line.strength,
        doseForm: line.doseForm,
        dose: line.dose,
        frequencyCode: line.frequencyCode,
        routeCode: line.routeCode,
        durationDays: line.durationDays,
        quantity: line.quantity == null ? null : Number(line.quantity),
        dietCode: line.dietCode,
        instructions: line.instructions,
        status: line.status as ClinicalOrderDto['items'][0]['status'],
        fulfilledQty: Number(line.fulfilledQty),
        fulfilledRefType: line.fulfilledRefType,
        fulfilledRefId: line.fulfilledRefId,
      })),
    });
  }
  return out;
}

export async function encounterNotes(ctx: ClinicalCtx<Tx>, encounterId: string): Promise<ClinicalNoteDto[]> {
  const rows = await ctx.tx
    .select()
    .from(schema.clinicalNotes)
    .where(eq(schema.clinicalNotes.encounterId, encounterId))
    .orderBy(asc(schema.clinicalNotes.createdAt));
  return rows.map(noteDto);
}

export async function vitalsChart(ctx: ClinicalCtx<Tx>, encounterId: string): Promise<VitalSignsDto[]> {
  const rows = await ctx.tx
    .select()
    .from(schema.vitalSigns)
    .where(and(eq(schema.vitalSigns.encounterId, encounterId), isNull(schema.vitalSigns.enteredInErrorAt)))
    .orderBy(asc(schema.vitalSigns.recordedAt));
  return rows.map(vitalDto);
}

export async function placeDietOrder(ctx: ClinicalCtx<Tx>, encounterId: string, input: PlaceClinicalOrderInput): Promise<ClinicalOrderDto> {
  if (input.kind !== 'diet') throw new ApiError(422, 'validation', 'Use a diet order');
  const { orders } = await import('../orders');
  return orders.place({ ...ctx, locationId: ctx.locationId }, encounterId, { ...input, source: 'nurse' });
}

export { MODULE };
