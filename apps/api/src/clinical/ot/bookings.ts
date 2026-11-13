import { schema } from '@hos/db';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError } from '../../http';
import {
  PREFIX,
  assertBookingCutoff,
  assertNoOverlap,
  combineIstDateTime,
  loadCutoffPolicy,
  locationOf,
  nextApptNo,
  tenantOf,
  zTee,
  zSurgeryKind,
  zOptUuid,
  zBookingType,
  zCaseType,
} from './service';

const idParams = z.object({ id: z.uuid() });
const requestBookParams = z.object({ id: z.uuid() });

const bookingFields = z.object({
  patientId: z.uuid(),
  doctorId: z.uuid(),
  patientType: z.enum(['ip', 'op']),
  admissionId: zOptUuid,
  diagnosis: z.string().default(''),
  surgeryType: zSurgeryKind.default('major'),
  surgeryId: zOptUuid,
  frozenSection: z.boolean().default(false),
  teeRequired: zTee.default(false),
  weight: z.string().default(''),
  language: z.string().default(''),
  sex: z.string().default(''),
  indication: z.string().default(''),
  surgeonIds: z.array(z.uuid()).default([]),
  anaesthetistIds: z.array(z.uuid()).default([]),
  serviceNames: z.array(z.string()).default([]),
  employeeNames: z.array(z.string()).default([]),
  nurseName: z.string().default(''),
  remarks: z.string().default(''),
});

const createBookingBody = bookingFields.extend({
  resourceId: z.uuid(),
  date: z.string(),
  startTime: z.string(),
  durationMin: z.coerce.number().int().min(15).max(720),
  bookingType: zBookingType.default('planned'),
  caseType: zCaseType.default('elective'),
});

async function bookingDetail(gate: { tx: import('@hos/db').Tx }, tenantId: string, id: string) {
  const [row] = await gate.tx
    .select({
      booking: schema.otBookings,
      patientName: schema.patients.fullName,
      uhid: schema.patients.uhid,
      doctorName: schema.doctors.name,
      resourceCode: schema.otResources.code,
      surgeryName: schema.otSurgeryMaster.name,
    })
    .from(schema.otBookings)
    .innerJoin(schema.patients, and(eq(schema.patients.tenantId, schema.otBookings.tenantId), eq(schema.patients.id, schema.otBookings.patientId)))
    .innerJoin(schema.doctors, and(eq(schema.doctors.tenantId, schema.otBookings.tenantId), eq(schema.doctors.id, schema.otBookings.doctorId)))
    .innerJoin(schema.otResources, and(eq(schema.otResources.tenantId, schema.otBookings.tenantId), eq(schema.otResources.id, schema.otBookings.resourceId)))
    .leftJoin(schema.otSurgeryMaster, and(eq(schema.otSurgeryMaster.tenantId, schema.otBookings.tenantId), eq(schema.otSurgeryMaster.id, schema.otBookings.surgeryId)))
    .where(and(eq(schema.otBookings.tenantId, tenantId), eq(schema.otBookings.id, id)));
  if (!row) throw new ApiError(404, 'not_found', 'Booking not found');
  return {
    ...row.booking,
    patientName: row.patientName,
    uhid: row.uhid,
    doctorName: row.doctorName,
    resourceCode: row.resourceCode,
    surgeryName: row.surgeryName ?? '',
  };
}

async function createBooking(
  gate: { tx: import('@hos/db').Tx; user: { id: string }; audit: import('../../guard').TenantGate['audit'] },
  tenantId: string,
  locationId: string,
  body: z.infer<typeof createBookingBody> & { requestId?: string | null },
) {
  const [resource] = await gate.tx.select().from(schema.otResources).where(eq(schema.otResources.id, body.resourceId));
  if (!resource?.bookingActive) throw new ApiError(422, 'validation', 'This OT is not open for booking');
  const policy = await loadCutoffPolicy(gate.tx, tenantId, body.resourceId);
  assertBookingCutoff(policy, body.date, body.caseType);
  const start = combineIstDateTime(body.date, body.startTime);
  const end = new Date(start.getTime() + body.durationMin * 60_000);
  await assertNoOverlap(gate.tx, tenantId, body.resourceId, start, end);
  const slots = Math.max(1, Math.ceil(body.durationMin / (resource.slotMinutes || 15)));
  const apptNo = await nextApptNo(gate.tx, tenantId, body.resourceId, body.date);
  const [created] = await gate.tx
    .insert(schema.otBookings)
    .values({
      tenantId,
      locationId,
      requestId: body.requestId ?? null,
      resourceId: body.resourceId,
      bookingDate: body.date,
      scheduledStart: start,
      scheduledEnd: end,
      durationMin: body.durationMin,
      apptNo,
      slots,
      bookingType: body.bookingType,
      caseType: body.caseType,
      patientId: body.patientId,
      doctorId: body.doctorId,
      patientType: body.patientType,
      admissionId: body.admissionId ?? null,
      diagnosis: body.diagnosis,
      surgeryType: body.surgeryType,
      surgeryId: body.surgeryId ?? null,
      frozenSection: body.frozenSection,
      teeRequired: body.teeRequired,
      weight: body.weight,
      language: body.language,
      sex: body.sex,
      indication: body.indication,
      surgeonIds: body.surgeonIds,
      anaesthetistIds: body.anaesthetistIds,
      serviceNames: body.serviceNames,
      employeeNames: body.employeeNames,
      nurseName: body.nurseName,
      remarks: body.remarks,
      createdBy: gate.user.id,
    })
    .returning();
  if (!created) throw new ApiError(500, 'insert_failed', 'Could not save booking');
  await gate.audit('ot.booking.create', 'ot_booking', created.id, null, { apptNo, resourceId: body.resourceId });
  return bookingDetail(gate, tenantId, created.id);
}

export function registerOtBookings(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  r.get(`${PREFIX}/bookings`, { schema: { querystring: z.object({ date: z.string(), resourceId: z.uuid() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const rows = await gate.tx
        .select({
          booking: schema.otBookings,
          patientName: schema.patients.fullName,
          uhid: schema.patients.uhid,
          doctorName: schema.doctors.name,
        })
        .from(schema.otBookings)
        .innerJoin(schema.patients, and(eq(schema.patients.tenantId, schema.otBookings.tenantId), eq(schema.patients.id, schema.otBookings.patientId)))
        .innerJoin(schema.doctors, and(eq(schema.doctors.tenantId, schema.otBookings.tenantId), eq(schema.doctors.id, schema.otBookings.doctorId)))
        .where(
          and(
            eq(schema.otBookings.tenantId, tenantId),
            eq(schema.otBookings.resourceId, req.query.resourceId),
            eq(schema.otBookings.bookingDate, req.query.date),
            inArray(schema.otBookings.status, ['booked', 'completed']),
          ),
        )
        .orderBy(asc(schema.otBookings.scheduledStart));
      const [resource] = await gate.tx.select().from(schema.otResources).where(eq(schema.otResources.id, req.query.resourceId));
      return {
        resource,
        timeline: rows.map((row) => ({
          ...row.booking,
          patientName: row.patientName,
          uhid: row.uhid,
          doctorName: row.doctorName,
          label: `${row.uhid} ${row.patientName}`,
        })),
        grid: rows,
      };
    }),
  );

  r.post(`${PREFIX}/bookings`, { schema: { body: createBookingBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const locationId = locationOf(gate);
      const row = await createBooking(gate, tenantOf(gate), locationId, req.body);
      reply.code(201);
      return row;
    }),
  );

  r.post(`${PREFIX}/requests/:id/book`, { schema: { params: requestBookParams, body: createBookingBody.omit({ patientId: true, doctorId: true, patientType: true }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const locationId = locationOf(gate);
      const [request] = await gate.tx.select().from(schema.otRequests).where(and(eq(schema.otRequests.tenantId, tenantId), eq(schema.otRequests.id, req.params.id)));
      if (!request) throw new ApiError(404, 'not_found', 'Request not found');
      if (request.status !== 'requested') throw new ApiError(409, 'bad_state', 'Request is not open for booking');
      const merged = {
        ...req.body,
        patientId: request.patientId,
        doctorId: request.doctorId,
        patientType: request.patientType as 'ip' | 'op',
        admissionId: request.admissionId,
        diagnosis: request.diagnosis || req.body.diagnosis,
        surgeryType: request.surgeryType as 'major' | 'minor',
        surgeryId: request.surgeryId,
        frozenSection: request.frozenSection,
        teeRequired: request.teeRequired,
        weight: request.weight || req.body.weight,
        language: request.language || req.body.language,
        sex: request.sex || req.body.sex,
        indication: request.indication || req.body.indication,
        surgeonIds: request.surgeonIds.length ? request.surgeonIds : req.body.surgeonIds,
        anaesthetistIds: request.anaesthetistIds.length ? request.anaesthetistIds : req.body.anaesthetistIds,
        requestId: request.id,
      };
      const row = await createBooking(gate, tenantId, locationId, merged);
      await gate.tx.update(schema.otRequests).set({ status: 'booked' }).where(eq(schema.otRequests.id, request.id));
      reply.code(201);
      return row;
    }),
  );

  r.patch(
    `${PREFIX}/bookings/:id`,
    {
      schema: {
        params: idParams,
        body: z.object({
          startTime: z.string().optional(),
          durationMin: z.coerce.number().int().min(15).max(720).optional(),
          bookingType: z.enum(['planned', 'emergency']).optional(),
          caseType: z.enum(['elective', 'emergency']).optional(),
          remarks: z.string().optional(),
          surgeonIds: z.array(z.uuid()).optional(),
          anaesthetistIds: z.array(z.uuid()).optional(),
        }),
      },
    },
    async (req, reply) =>
      run(req, reply, async (gate) => {
        const tenantId = tenantOf(gate);
        const current = await bookingDetail(gate, tenantId, req.params.id);
        if (current.status !== 'booked') throw new ApiError(409, 'bad_state', 'Only active bookings can be modified');
        const date = String(current.bookingDate);
        const startTime = req.body.startTime ?? current.scheduledStart.toISOString().slice(11, 16);
        const durationMin = req.body.durationMin ?? current.durationMin;
        const caseType = req.body.caseType ?? (current.caseType as 'elective' | 'emergency');
        const policy = await loadCutoffPolicy(gate.tx, tenantId, current.resourceId);
        assertBookingCutoff(policy, date, caseType);
        const start = combineIstDateTime(date, startTime);
        const end = new Date(start.getTime() + durationMin * 60_000);
        await assertNoOverlap(gate.tx, tenantId, current.resourceId, start, end, req.params.id);
        await gate.tx
          .update(schema.otBookings)
          .set({
            scheduledStart: start,
            scheduledEnd: end,
            durationMin,
            bookingType: req.body.bookingType ?? current.bookingType,
            caseType,
            remarks: req.body.remarks ?? current.remarks,
            surgeonIds: req.body.surgeonIds ?? current.surgeonIds,
            anaesthetistIds: req.body.anaesthetistIds ?? current.anaesthetistIds,
          })
          .where(eq(schema.otBookings.id, req.params.id));
        return bookingDetail(gate, tenantId, req.params.id);
      }),
  );

  r.post(`${PREFIX}/bookings/:id/cancel`, { schema: { params: idParams, body: z.object({ remarks: z.string().trim().min(3).max(500) }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const current = await bookingDetail(gate, tenantId, req.params.id);
      if (current.status === 'cancelled') throw new ApiError(409, 'bad_state', 'Already cancelled');
      await gate.tx.update(schema.otBookings).set({ status: 'cancelled', cancelRemarks: req.body.remarks }).where(eq(schema.otBookings.id, req.params.id));
      return bookingDetail(gate, tenantId, req.params.id);
    }),
  );

  r.post(
    `${PREFIX}/bookings/:id/shift`,
    { schema: { params: idParams, body: z.object({ resourceId: z.uuid(), date: z.string(), startTime: z.string() }) } },
    async (req, reply) =>
      run(req, reply, async (gate) => {
        const tenantId = tenantOf(gate);
        const current = await bookingDetail(gate, tenantId, req.params.id);
        if (current.status !== 'booked') throw new ApiError(409, 'bad_state', 'Only active bookings can be shifted');
        const caseType = current.caseType as 'elective' | 'emergency';
        const policy = await loadCutoffPolicy(gate.tx, tenantId, req.body.resourceId);
        assertBookingCutoff(policy, req.body.date, caseType);
        const start = combineIstDateTime(req.body.date, req.body.startTime);
        const end = new Date(start.getTime() + current.durationMin * 60_000);
        await assertNoOverlap(gate.tx, tenantId, req.body.resourceId, start, end, req.params.id);
        await gate.tx
          .update(schema.otBookings)
          .set({
            resourceId: req.body.resourceId,
            bookingDate: req.body.date,
            scheduledStart: start,
            scheduledEnd: end,
            shiftedFrom: current.id,
          })
          .where(eq(schema.otBookings.id, req.params.id));
        return bookingDetail(gate, tenantId, req.params.id);
      }),
  );

  r.post(`${PREFIX}/bookings/:id/shift-now`, { schema: { params: idParams, body: z.object({ resourceId: z.uuid().optional() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const current = await bookingDetail(gate, tenantId, req.params.id);
      if (current.status !== 'booked') throw new ApiError(409, 'bad_state', 'Only active bookings can be shifted');
      const resourceId = req.body.resourceId ?? current.resourceId;
      const today = new Date().toISOString().slice(0, 10);
      const startHm = '08:00';
      const body = { resourceId, date: today, startTime: startHm };
      const caseType = current.caseType as 'elective' | 'emergency';
      const policy = await loadCutoffPolicy(gate.tx, tenantId, resourceId);
      assertBookingCutoff(policy, today, caseType);
      const start = combineIstDateTime(today, startHm);
      const end = new Date(start.getTime() + current.durationMin * 60_000);
      await assertNoOverlap(gate.tx, tenantId, resourceId, start, end, req.params.id);
      await gate.tx
        .update(schema.otBookings)
        .set({ resourceId, bookingDate: today, scheduledStart: start, scheduledEnd: end, shiftedFrom: current.id })
        .where(eq(schema.otBookings.id, req.params.id));
      return bookingDetail(gate, tenantId, req.params.id);
    }),
  );

  const postOpBody = z.object({
    preOpAt: z.coerce.date().optional().nullable(),
    wheelingInAt: z.coerce.date().optional().nullable(),
    anesthesiaStartAt: z.coerce.date().optional().nullable(),
    surgeryStartAt: z.coerce.date().optional().nullable(),
    surgeryEndAt: z.coerce.date().optional().nullable(),
    anesthesiaEndAt: z.coerce.date().optional().nullable(),
    wheelingOutAt: z.coerce.date().optional().nullable(),
    executedSurgery: z.string().default(''),
    findings: z.string().default(''),
    assistedDoctors: z.string().default(''),
    scrubNurse: z.string().default(''),
    floorNurse: z.string().default(''),
    adverseEvent: z.string().default(''),
    changeOfPlan: z.string().default(''),
    anaesthesiaType: z.string().default(''),
    surgeryType: z.string().default(''),
    complication: z.string().default(''),
    outcome: z.string().default(''),
    antibiotic: z.string().default(''),
  });

  r.get(`${PREFIX}/bookings/:id/post-op`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const [row] = await gate.tx.select().from(schema.otPostOp).where(and(eq(schema.otPostOp.tenantId, tenantId), eq(schema.otPostOp.bookingId, req.params.id)));
      return row ?? null;
    }),
  );

  r.put(`${PREFIX}/bookings/:id/post-op`, { schema: { params: idParams, body: postOpBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      await bookingDetail(gate, tenantId, req.params.id);
      const [existing] = await gate.tx.select().from(schema.otPostOp).where(and(eq(schema.otPostOp.tenantId, tenantId), eq(schema.otPostOp.bookingId, req.params.id)));
      if (existing) {
        const [row] = await gate.tx.update(schema.otPostOp).set(req.body).where(eq(schema.otPostOp.id, existing.id)).returning();
        await gate.tx.update(schema.otBookings).set({ status: 'completed' }).where(eq(schema.otBookings.id, req.params.id));
        return row;
      }
      const [row] = await gate.tx.insert(schema.otPostOp).values({ tenantId, bookingId: req.params.id, ...req.body }).returning();
      await gate.tx.update(schema.otBookings).set({ status: 'completed' }).where(eq(schema.otBookings.id, req.params.id));
      return row;
    }),
  );

  const bulkFilter = z.object({
    ids: z.array(z.uuid()).optional(),
    doctorId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
    from: z.string().optional(),
    to: z.string().optional(),
    reason: z.string().trim().min(3).optional(),
    shiftDays: z.coerce.number().int().optional(),
    toDate: z.string().optional(),
  });

  async function listBulkIds(gate: { tx: import('@hos/db').Tx }, tenantId: string, q: z.infer<typeof bulkFilter>): Promise<string[]> {
    if (q.ids?.length) return q.ids;
    const filters = [eq(schema.otBookings.tenantId, tenantId), eq(schema.otBookings.status, 'booked')];
    if (q.doctorId) filters.push(eq(schema.otBookings.doctorId, q.doctorId));
    if (q.from) filters.push(gte(schema.otBookings.bookingDate, q.from));
    if (q.to) filters.push(lte(schema.otBookings.bookingDate, q.to));
    const rows = await gate.tx.select({ id: schema.otBookings.id }).from(schema.otBookings).where(and(...filters));
    return rows.map((r) => r.id);
  }

  r.post(`${PREFIX}/bookings/bulk-cancel`, { schema: { body: bulkFilter.extend({ reason: z.string().trim().min(3) }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const ids = await listBulkIds(gate, tenantId, req.body);
      const done: string[] = [];
      const failed: { id: string; code: string; message: string }[] = [];
      for (const id of ids) {
        try {
          await gate.tx.update(schema.otBookings).set({ status: 'cancelled', cancelRemarks: req.body.reason }).where(eq(schema.otBookings.id, id));
          done.push(id);
        } catch (e) {
          failed.push({ id, code: 'error', message: e instanceof Error ? e.message : 'failed' });
        }
      }
      return { done, failed };
    }),
  );

  r.post(`${PREFIX}/bookings/bulk-reschedule`, { schema: { body: bulkFilter } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const ids = await listBulkIds(gate, tenantId, req.body);
      const done: string[] = [];
      const failed: { id: string; code: string; message: string }[] = [];
      for (const id of ids) {
        try {
          const current = await bookingDetail(gate, tenantId, id);
          const base = String(current.bookingDate);
          let newDate = base;
          if (req.body.toDate) newDate = req.body.toDate;
          else if (req.body.shiftDays) {
            const d = new Date(`${base}T00:00:00.000Z`);
            d.setUTCDate(d.getUTCDate() + req.body.shiftDays);
            newDate = d.toISOString().slice(0, 10);
          }
          const startHm = current.scheduledStart.toISOString().slice(11, 16);
          const caseType = current.caseType as 'elective' | 'emergency';
          const policy = await loadCutoffPolicy(gate.tx, tenantId, current.resourceId);
          assertBookingCutoff(policy, newDate, caseType);
          const start = combineIstDateTime(newDate, startHm);
          const end = new Date(start.getTime() + current.durationMin * 60_000);
          await assertNoOverlap(gate.tx, tenantId, current.resourceId, start, end, id);
          await gate.tx
            .update(schema.otBookings)
            .set({ bookingDate: newDate, scheduledStart: start, scheduledEnd: end, shiftedFrom: current.id })
            .where(eq(schema.otBookings.id, id));
          done.push(id);
        } catch (e) {
          const code = e instanceof ApiError ? e.code : 'error';
          const message = e instanceof Error ? e.message : 'failed';
          failed.push({ id, code, message });
        }
      }
      return { done, failed };
    }),
  );
}
