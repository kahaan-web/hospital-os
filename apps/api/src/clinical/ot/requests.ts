import { schema, type Tx } from '@hos/db';
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError } from '../../http';
import { PREFIX, locationOf, nextRequestNumber, patientAgeYears, tenantOf } from './service';

const idParams = z.object({ id: z.uuid() });
const patientParams = z.object({ patientId: z.uuid() });

const requestBody = z.object({
  patientId: z.uuid(),
  doctorId: z.uuid(),
  patientType: z.enum(['ip', 'op']),
  admissionId: z.uuid().optional().nullable(),
  expectedDate: z.string(),
  expectedTime: z.string().optional().nullable(),
  officePermission: z.boolean().default(false),
  officePermissionRemark: z.string().default(''),
  diagnosis: z.string().default(''),
  surgeryType: z.enum(['major', 'minor']),
  surgeryId: z.uuid().optional().nullable(),
  frozenSection: z.boolean().default(false),
  teeRequired: z.boolean().default(false),
  specialRemarkIds: z.array(z.uuid()).default([]),
  weight: z.string().default(''),
  language: z.string().default(''),
  sex: z.string().default(''),
  indication: z.string().default(''),
  surgeonIds: z.array(z.uuid()).default([]),
  anaesthetistIds: z.array(z.uuid()).default([]),
  preferredResourceId: z.uuid().optional().nullable(),
});

async function requestDetail(gate: { tx: Tx }, tenantId: string, id: string) {
  const [row] = await gate.tx
    .select({
      req: schema.otRequests,
      patientName: schema.patients.fullName,
      uhid: schema.patients.uhid,
      doctorName: schema.doctors.name,
      surgeryName: schema.otSurgeryMaster.name,
    })
    .from(schema.otRequests)
    .innerJoin(schema.patients, and(eq(schema.patients.tenantId, schema.otRequests.tenantId), eq(schema.patients.id, schema.otRequests.patientId)))
    .innerJoin(schema.doctors, and(eq(schema.doctors.tenantId, schema.otRequests.tenantId), eq(schema.doctors.id, schema.otRequests.doctorId)))
    .leftJoin(schema.otSurgeryMaster, and(eq(schema.otSurgeryMaster.tenantId, schema.otRequests.tenantId), eq(schema.otSurgeryMaster.id, schema.otRequests.surgeryId)))
    .where(and(eq(schema.otRequests.tenantId, tenantId), eq(schema.otRequests.id, id)));
  if (!row) throw new ApiError(404, 'not_found', 'OT request not found');
  const remarks = await gate.tx
    .select({ id: schema.otSpecialRemarks.id, remark: schema.otSpecialRemarks.remark })
    .from(schema.otRequestSpecialRemarks)
    .innerJoin(schema.otSpecialRemarks, and(eq(schema.otSpecialRemarks.tenantId, schema.otRequestSpecialRemarks.tenantId), eq(schema.otSpecialRemarks.id, schema.otRequestSpecialRemarks.remarkId)))
    .where(and(eq(schema.otRequestSpecialRemarks.tenantId, tenantId), eq(schema.otRequestSpecialRemarks.requestId, id)));
  return { ...row.req, patientName: row.patientName, uhid: row.uhid, doctorName: row.doctorName, surgeryName: row.surgeryName ?? '', specialRemarks: remarks };
}

export function registerOtRequests(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  r.get(
    `${PREFIX}/requests`,
    {
      schema: {
        querystring: z.object({
          from: z.string().optional(),
          to: z.string().optional(),
          otId: z.uuid().optional(),
          sort: z.enum(['number', 'patient', 'doctor', 'date']).optional(),
          q: z.string().optional(),
          status: z.enum(['requested', 'booked', 'cancelled']).optional(),
        }),
      },
    },
    async (req, reply) =>
      run(req, reply, async (gate) => {
        const locationId = locationOf(gate);
        const tenantId = tenantOf(gate);
        const filters = [eq(schema.otRequests.tenantId, tenantId), eq(schema.otRequests.locationId, locationId)];
        if (req.query.from) filters.push(gte(schema.otRequests.expectedDate, req.query.from));
        if (req.query.to) filters.push(lte(schema.otRequests.expectedDate, req.query.to));
        if (req.query.status) filters.push(eq(schema.otRequests.status, req.query.status));
        if (req.query.otId) filters.push(eq(schema.otRequests.preferredResourceId, req.query.otId));
        let order = desc(schema.otRequests.expectedDate);
        if (req.query.sort === 'number') order = asc(schema.otRequests.number);
        if (req.query.sort === 'patient') order = asc(schema.patients.fullName);
        if (req.query.sort === 'doctor') order = asc(schema.doctors.name);
        const rows = await gate.tx
          .select({
            req: schema.otRequests,
            patientName: schema.patients.fullName,
            uhid: schema.patients.uhid,
            doctorName: schema.doctors.name,
            mobile: schema.patients.mobile,
            dob: schema.patients.dob,
          })
          .from(schema.otRequests)
          .innerJoin(schema.patients, and(eq(schema.patients.tenantId, schema.otRequests.tenantId), eq(schema.patients.id, schema.otRequests.patientId)))
          .innerJoin(schema.doctors, and(eq(schema.doctors.tenantId, schema.otRequests.tenantId), eq(schema.doctors.id, schema.otRequests.doctorId)))
          .where(
            and(
              ...filters,
              req.query.q
                ? or(ilike(schema.patients.fullName, `%${req.query.q}%`), ilike(schema.otRequests.number, `%${req.query.q}%`), ilike(schema.patients.uhid, `%${req.query.q}%`))
                : undefined,
            ),
          )
          .orderBy(order)
          .limit(300);
        return rows.map((row) => ({
          ...row.req,
          patientName: row.patientName,
          uhid: row.uhid,
          doctorName: row.doctorName,
          mobile: row.mobile,
          age: row.dob ? `${patientAgeYears(new Date(row.dob))} Y` : '',
        }));
      }),
  );

  r.post(`${PREFIX}/requests`, { schema: { body: requestBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const locationId = locationOf(gate);
      const tenantId = tenantOf(gate);
      const number = await nextRequestNumber(gate.tx, tenantId);
      const { specialRemarkIds, ...body } = req.body;
      const { expectedTime, ...rest } = body;
      const [created] = await gate.tx
        .insert(schema.otRequests)
        .values({
          tenantId,
          locationId,
          number,
          ...rest,
          expectedTime: expectedTime ? sql`${expectedTime}::time` : null,
          createdBy: gate.user.id,
        })
        .returning();
      if (!created) throw new ApiError(500, 'insert_failed', 'Could not save request');
      if (specialRemarkIds.length > 0) {
        await gate.tx.insert(schema.otRequestSpecialRemarks).values(specialRemarkIds.map((remarkId) => ({ tenantId, requestId: created.id, remarkId })));
      }
      reply.code(201);
      return requestDetail(gate, tenantId, created.id);
    }),
  );

  r.get(`${PREFIX}/requests/:id`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => requestDetail(gate, tenantOf(gate), req.params.id)),
  );

  r.patch(`${PREFIX}/requests/:id`, { schema: { params: idParams, body: requestBody.partial() } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const current = await requestDetail(gate, tenantId, req.params.id);
      if (current.status !== 'requested') throw new ApiError(409, 'bad_state', 'Only requested OT requests can be edited');
      const { specialRemarkIds, ...body } = req.body;
      await gate.tx.update(schema.otRequests).set(body).where(eq(schema.otRequests.id, req.params.id));
      if (specialRemarkIds) {
        await gate.tx.delete(schema.otRequestSpecialRemarks).where(and(eq(schema.otRequestSpecialRemarks.tenantId, tenantId), eq(schema.otRequestSpecialRemarks.requestId, req.params.id)));
        if (specialRemarkIds.length > 0) {
          await gate.tx.insert(schema.otRequestSpecialRemarks).values(specialRemarkIds.map((remarkId) => ({ tenantId, requestId: req.params.id, remarkId })));
        }
      }
      return requestDetail(gate, tenantId, req.params.id);
    }),
  );

  r.post(`${PREFIX}/requests/:id/cancel`, { schema: { params: idParams, body: z.object({ reason: z.string().trim().min(3).max(500) }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const current = await requestDetail(gate, tenantId, req.params.id);
      if (current.status === 'cancelled') throw new ApiError(409, 'bad_state', 'Already cancelled');
      await gate.tx
        .update(schema.otRequests)
        .set({ status: 'cancelled', cancelReason: req.body.reason })
        .where(eq(schema.otRequests.id, req.params.id));
      return requestDetail(gate, tenantId, req.params.id);
    }),
  );

  r.get(`${PREFIX}/requests/:id/outstanding`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const current = await requestDetail(gate, tenantId, req.params.id);
      const unsettled = await gate.tx.execute<{ n: number }>(sql`
        select coalesce(sum(total_paise - paid_paise), 0)::int as n
        from bills where tenant_id = ${tenantId}::uuid and patient_id = ${current.patientId}::uuid and status = 'final' and paid_paise < total_paise
      `);
      const deposits = await gate.tx.execute<{ n: number }>(sql`
        select coalesce(sum(balance_paise), 0)::int as n from deposits where tenant_id = ${tenantId}::uuid and patient_id = ${current.patientId}::uuid and status = 'active'
      `);
      const unbilled = await gate.tx.execute<{ n: number }>(sql`
        select coalesce(sum(amount_paise), 0)::int as n from charges where tenant_id = ${tenantId}::uuid and patient_id = ${current.patientId}::uuid and bill_id is null
      `);
      const unsettledPaise = Number(unsettled.rows[0]?.n ?? 0);
      const depositPaise = Number(deposits.rows[0]?.n ?? 0);
      const unbilledPaise = Number(unbilled.rows[0]?.n ?? 0);
      const duePaise = Math.max(0, unsettledPaise + unbilledPaise - depositPaise);
      return {
        unsettledPaise,
        unbilledPaise,
        depositPaise,
        duePaise,
        officePermission: current.officePermission,
      };
    }),
  );

  r.post(
    `${PREFIX}/requests/:id/office-permission`,
    { schema: { params: idParams, body: z.object({ granted: z.boolean(), remark: z.string().default('') }) } },
    async (req, reply) =>
      run(req, reply, async (gate) => {
        const tenantId = tenantOf(gate);
        await gate.tx
          .update(schema.otRequests)
          .set({ officePermission: req.body.granted, officePermissionRemark: req.body.remark })
          .where(and(eq(schema.otRequests.tenantId, tenantId), eq(schema.otRequests.id, req.params.id)));
        return requestDetail(gate, tenantId, req.params.id);
      }),
  );

  r.get(`${PREFIX}/patients/:patientId/future`, { schema: { params: patientParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const today = new Date().toISOString().slice(0, 10);
      const requests = await gate.tx
        .select()
        .from(schema.otRequests)
        .where(and(eq(schema.otRequests.tenantId, tenantId), eq(schema.otRequests.patientId, req.params.patientId), gte(schema.otRequests.expectedDate, today), inArray(schema.otRequests.status, ['requested', 'booked'])));
      const bookings = await gate.tx
        .select()
        .from(schema.otBookings)
        .where(and(eq(schema.otBookings.tenantId, tenantId), eq(schema.otBookings.patientId, req.params.patientId), gte(schema.otBookings.bookingDate, today), eq(schema.otBookings.status, 'booked')));
      return { requests, bookings };
    }),
  );

  r.get(`${PREFIX}/patients/:patientId/context`, { schema: { params: patientParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const [patient] = await gate.tx.select().from(schema.patients).where(and(eq(schema.patients.tenantId, tenantId), eq(schema.patients.id, req.params.patientId)));
      if (!patient) throw new ApiError(404, 'not_found', 'Patient not found');
      const [admission] = await gate.tx
        .select({ admission: schema.admissions, ward: schema.wards.name, bed: schema.beds.label })
        .from(schema.admissions)
        .leftJoin(schema.bedAssignments, and(eq(schema.bedAssignments.tenantId, schema.admissions.tenantId), eq(schema.bedAssignments.admissionId, schema.admissions.id), sql`${schema.bedAssignments.toAt} is null`))
        .leftJoin(schema.beds, and(eq(schema.beds.tenantId, schema.bedAssignments.tenantId), eq(schema.beds.id, schema.bedAssignments.bedId)))
        .leftJoin(schema.rooms, and(eq(schema.rooms.tenantId, schema.beds.tenantId), eq(schema.rooms.id, schema.beds.roomId)))
        .leftJoin(schema.wards, and(eq(schema.wards.tenantId, schema.rooms.tenantId), eq(schema.wards.id, schema.rooms.wardId)))
        .where(and(eq(schema.admissions.tenantId, tenantId), eq(schema.admissions.patientId, req.params.patientId), eq(schema.admissions.status, 'admitted')))
        .limit(1);
      return {
        patientType: admission ? 'ip' : 'op',
        sex: patient.gender ?? '',
        age: patient.dob ? patientAgeYears(new Date(patient.dob)) : '',
        ward: admission?.ward ?? '',
        bed: admission?.bed ?? '',
        admissionId: admission?.admission.id ?? null,
      };
    }),
  );
}
