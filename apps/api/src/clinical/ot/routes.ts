import { randomInt } from 'node:crypto';
import { schema, type Tx } from '@hos/db';
import { and, asc, eq, gt, inArray, lt, ne } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError } from '../../http';

import { registerOtBoards } from './boards';
import { registerOtBookings } from './bookings';
import { registerOtMasters } from './masters';
import { registerOtReports } from './reports';
import { registerOtRequests } from './requests';
import { PREFIX, locationOf } from './service';

/** MVP demo slice: OT list, schedule, start, complete, cancel. Tenant and permission checks come from TENANT_GUARDS. */

const idParams = z.object({ id: z.uuid() });
const listQuery = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
});
const createBody = z.object({
  patientId: z.uuid(),
  procedureName: z.string().trim().min(2).max(160),
  surgeonName: z.string().trim().min(2).max(120),
  anaesthetistName: z.string().trim().max(120).default(''),
  roomCode: z.string().trim().min(1).max(20),
  priority: z.enum(['elective', 'emergency']).default('elective'),
  anaesthesiaType: z.string().trim().max(60).default(''),
  scheduledStart: z.coerce.date(),
  durationMin: z.coerce.number().int().min(15).max(720),
  notes: z.string().trim().max(1000).default(''),
});
const completeBody = z.object({ notes: z.string().trim().max(2000).optional() });
const cancelBody = z.object({ reason: z.string().trim().min(3, 'Say why the case is cancelled').max(300) });

async function detail(tx: Tx, id: string) {
  const [row] = await tx
    .select({ c: schema.otCases, patientName: schema.patients.fullName, uhid: schema.patients.uhid })
    .from(schema.otCases)
    .innerJoin(schema.patients, and(eq(schema.patients.tenantId, schema.otCases.tenantId), eq(schema.patients.id, schema.otCases.patientId)))
    .where(eq(schema.otCases.id, id));
  if (!row) throw new ApiError(404, 'not_found', 'OT case not found');
  return { ...row.c, patientName: row.patientName, uhid: row.uhid };
}

export function registerOt(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  r.get(`${PREFIX}/cases`, { schema: { querystring: listQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const locationId = locationOf(gate);
      const rows = await gate.tx
        .select({ c: schema.otCases, patientName: schema.patients.fullName, uhid: schema.patients.uhid })
        .from(schema.otCases)
        .innerJoin(schema.patients, and(eq(schema.patients.tenantId, schema.otCases.tenantId), eq(schema.patients.id, schema.otCases.patientId)))
        .where(and(eq(schema.otCases.locationId, locationId), req.query.status ? eq(schema.otCases.status, req.query.status) : undefined))
        .orderBy(asc(schema.otCases.scheduledStart))
        .limit(200);
      return rows.map((row) => ({ ...row.c, patientName: row.patientName, uhid: row.uhid }));
    }),
  );

  r.get(`${PREFIX}/cases/:id`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => detail(gate.tx, req.params.id)),
  );

  r.post(`${PREFIX}/cases`, { schema: { body: createBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const locationId = locationOf(gate);
      const tenantId = gate.actor.tenantId;
      if (!tenantId) throw new ApiError(422, 'location_required', 'Choose a location');
      const body = req.body;
      const start = body.scheduledStart;
      const end = new Date(start.getTime() + body.durationMin * 60_000);
      const [patient] = await gate.tx.select({ id: schema.patients.id }).from(schema.patients).where(eq(schema.patients.id, body.patientId));
      if (!patient) throw new ApiError(404, 'not_found', 'Patient not found');
      const clash = await gate.tx
        .select({ number: schema.otCases.number })
        .from(schema.otCases)
        .where(
          and(
            eq(schema.otCases.locationId, locationId),
            eq(schema.otCases.roomCode, body.roomCode),
            inArray(schema.otCases.status, ['scheduled', 'in_progress']),
            lt(schema.otCases.scheduledStart, end),
            gt(schema.otCases.scheduledEnd, start),
          ),
        )
        .limit(1);
      if (clash[0]) throw new ApiError(409, 'room_clash', `Room ${body.roomCode} is already booked for that time (${clash[0].number})`);
      const stamp = start.toISOString().slice(0, 10).replaceAll('-', '');
      const [created] = await gate.tx
        .insert(schema.otCases)
        .values({
          tenantId,
          locationId,
          patientId: body.patientId,
          number: `OT-${stamp}-${randomInt(1000, 10000)}`,
          procedureName: body.procedureName,
          surgeonName: body.surgeonName,
          anaesthetistName: body.anaesthetistName,
          roomCode: body.roomCode,
          priority: body.priority,
          anaesthesiaType: body.anaesthesiaType,
          scheduledStart: start,
          scheduledEnd: end,
          notes: body.notes,
          createdBy: gate.user.id,
        })
        .returning();
      if (!created) throw new ApiError(500, 'insert_failed', 'Could not schedule the case');
      // Audit carries ids and status only: no procedure or clinical text.
      await gate.audit('ot.case.schedule', 'ot_case', created.id, null, { number: created.number, roomCode: created.roomCode, status: created.status });
      reply.code(201);
      return detail(gate.tx, created.id);
    }),
  );

  r.post(`${PREFIX}/cases/:id/start`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const current = await detail(gate.tx, req.params.id);
      if (current.status !== 'scheduled') throw new ApiError(409, 'bad_state', `A ${current.status.replace('_', ' ')} case cannot be started`);
      await gate.tx.update(schema.otCases).set({ status: 'in_progress', inRoomAt: new Date() }).where(eq(schema.otCases.id, current.id));
      await gate.audit('ot.case.start', 'ot_case', current.id, { status: current.status }, { status: 'in_progress' });
      return detail(gate.tx, current.id);
    }),
  );

  r.post(`${PREFIX}/cases/:id/complete`, { schema: { params: idParams, body: completeBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const current = await detail(gate.tx, req.params.id);
      if (current.status !== 'in_progress' && current.status !== 'scheduled') {
        throw new ApiError(409, 'bad_state', `A ${current.status.replace('_', ' ')} case cannot be completed`);
      }
      const now = new Date();
      await gate.tx
        .update(schema.otCases)
        .set({
          status: 'completed',
          inRoomAt: current.inRoomAt ?? now,
          outRoomAt: now,
          notes: req.body.notes ?? current.notes,
        })
        .where(and(eq(schema.otCases.id, current.id), ne(schema.otCases.status, 'completed')));
      await gate.audit('ot.case.complete', 'ot_case', current.id, { status: current.status }, { status: 'completed' });
      return detail(gate.tx, current.id);
    }),
  );

  r.post(`${PREFIX}/cases/:id/cancel`, { schema: { params: idParams, body: cancelBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const current = await detail(gate.tx, req.params.id);
      if (current.status === 'completed' || current.status === 'cancelled') {
        throw new ApiError(409, 'bad_state', `A ${current.status} case cannot be cancelled`);
      }
      const notes = [current.notes, `Cancelled: ${req.body.reason}`].filter(Boolean).join('\n');
      await gate.tx.update(schema.otCases).set({ status: 'cancelled', notes }).where(eq(schema.otCases.id, current.id));
      await gate.audit('ot.case.cancel', 'ot_case', current.id, { status: current.status }, { status: 'cancelled' });
      return detail(gate.tx, current.id);
    }),
  );

  registerOtMasters(app, deps);
  registerOtRequests(app, deps);
  registerOtBookings(app, deps);
  registerOtBoards(app, deps);
  registerOtReports(app, deps);
}
