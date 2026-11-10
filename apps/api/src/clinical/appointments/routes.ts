import {
  bookCounterAppointmentSchema,
  cancelAppointmentSchema,
  CLINICAL_FEATURES,
  putScheduleSchema,
  registerVisitSchema,
  rescheduleAppointmentSchema,
  setVisitStatusSchema,
  visitReportQuery,
} from '@hos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError, idempotencyKey } from '../../http';
import {
  bookCounter,
  cancelAppointment,
  getAppointment,
  getSchedule,
  listQueue,
  listSlots,
  loadDiary,
  putSchedule,
  registerVisit,
  rescheduleAppointment,
  setQueueStatus,
  visitRegister,
  visitStatistics,
} from './service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const idParam = z.object({ id: z.uuid() });
const doctorParam = z.object({ doctorId: z.uuid() });

const slotQuery = z.object({ doctorId: z.uuid(), date: isoDate });
const diaryQuery = z.object({ date: isoDate, doctorId: z.uuid().optional() });
const queueQuery = z.object({ date: isoDate.optional(), doctorId: z.uuid().optional() });

function ctx(gate: TenantGate) {
  if (!gate.locationId || !gate.actor.tenantId) throw new ApiError(422, 'location_required', 'Choose a location');
  return {
    tx: gate.tx,
    tenantId: gate.actor.tenantId,
    locationId: gate.locationId,
    userId: gate.user.id,
    audit: gate.audit,
  };
}

/** Every appointment and visit feature in the sheet is Basic. The check still runs so a later override is honoured. */
async function requireOneFeature(gate: TenantGate, keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      await gate.requireFeature(key);
      return;
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'not_entitled') throw error;
    }
  }
  throw new ApiError(403, 'not_entitled', 'This feature is not included in your plan', undefined, { featureKey: keys[0] });
}

function requireIdempotency(req: FastifyRequest): void {
  if (!idempotencyKey(req)) {
    throw new ApiError(400, 'idempotency_key_required', 'Send an Idempotency-Key header (8–128 letters, numbers, _ or -)');
  }
}

export function registerAppointments(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);
  const appt = CLINICAL_FEATURES.appointments;
  const visit = CLINICAL_FEATURES.opdVisit;

  r.get('/api/v1/tenant/m/appointments/schedules/:doctorId', { schema: { params: doctorParam } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('appointments.manage');
      await gate.requireModule('appointments');
      await requireOneFeature(gate, [appt.diary, appt.takeAppointment]);
      return getSchedule(ctx(gate), req.params.doctorId);
    }),
  );

  r.put('/api/v1/tenant/m/appointments/schedules/:doctorId', { schema: { params: doctorParam, body: putScheduleSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('appointments.manage');
      await gate.requireModule('appointments');
      await gate.requireFeature(appt.takeAppointment);
      return putSchedule(ctx(gate), req.params.doctorId, req.body);
    }),
  );

  r.get('/api/v1/tenant/m/appointments/slots', { schema: { querystring: slotQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('appointments.manage');
      await gate.requireModule('appointments');
      await requireOneFeature(gate, [appt.takeAppointment, appt.diary, appt.cancelReschedule]);
      return listSlots(ctx(gate), req.query);
    }),
  );

  r.get('/api/v1/tenant/m/appointments/diary', { schema: { querystring: diaryQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('appointments.manage');
      await gate.requireModule('appointments');
      await gate.requireFeature(appt.diary);
      return loadDiary(ctx(gate), req.query);
    }),
  );

  r.get('/api/v1/tenant/m/appointments/appointments/:id', { schema: { params: idParam } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requireAnyPermission(['appointments.manage', 'opd.manage']);
      await gate.requireModule('appointments');
      await requireOneFeature(gate, [appt.diary, appt.takeAppointment, visit.visitRegistration]);
      return getAppointment(ctx(gate), req.params.id);
    }),
  );

  r.post('/api/v1/tenant/m/appointments/appointments', { schema: { body: bookCounterAppointmentSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('appointments.manage');
      await gate.requireModule('appointments');
      await gate.requireFeature(appt.takeAppointment);
      await gate.requireFeature(req.body.patientId ? appt.counter : appt.phoneAppointment);
      reply.code(201);
      return bookCounter(ctx(gate), req.body);
    }),
  );

  r.post('/api/v1/tenant/m/appointments/appointments/:id/reschedule', { schema: { params: idParam, body: rescheduleAppointmentSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('appointments.manage');
      await gate.requireModule('appointments');
      await gate.requireFeature(appt.cancelReschedule);
      return rescheduleAppointment(ctx(gate), req.params.id, req.body);
    }),
  );

  r.post('/api/v1/tenant/m/appointments/appointments/:id/cancel', { schema: { params: idParam, body: cancelAppointmentSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('appointments.manage');
      await gate.requireModule('appointments');
      await gate.requireFeature(appt.cancelReschedule);
      return cancelAppointment(ctx(gate), req.params.id, req.body.reason);
    }),
  );

  r.post('/api/v1/tenant/m/opd-visit/visits', { schema: { body: registerVisitSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      requireIdempotency(req);
      gate.requirePermission('opd.manage');
      await gate.requireModule('opd-visit');
      await gate.requireFeature(visit.visitRegistration);
      reply.code(201);
      return registerVisit(ctx(gate), req.body);
    }),
  );

  r.get('/api/v1/tenant/m/opd-visit/queue', { schema: { querystring: queueQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('opd.manage');
      await gate.requireModule('opd-visit');
      await gate.requireFeature(visit.visitRegistration);
      return listQueue(ctx(gate), req.query);
    }),
  );

  r.post('/api/v1/tenant/m/opd-visit/visits/:id/status', { schema: { params: idParam, body: setVisitStatusSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('opd.manage');
      await gate.requireModule('opd-visit');
      await gate.requireFeature(visit.visitRegistration);
      return setQueueStatus(ctx(gate), req.params.id, req.body.status);
    }),
  );

  r.get('/api/v1/tenant/m/opd-visit/reports/visit-register', { schema: { querystring: visitReportQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requireAnyPermission(['opd.manage', 'reports.view']);
      await gate.requireModule('opd-visit');
      await gate.requireFeature(visit.visitRegister);
      return visitRegister(ctx(gate), req.query);
    }),
  );

  r.get('/api/v1/tenant/m/opd-visit/reports/visit-detail-by-doctor', { schema: { querystring: visitReportQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requireAnyPermission(['opd.manage', 'reports.view']);
      await gate.requireModule('opd-visit');
      await gate.requireFeature(visit.visitDetailByDoctor);
      if (!req.query.doctorId) throw new ApiError(422, 'validation', 'Choose a doctor', { doctorId: 'Choose a doctor' });
      return visitRegister(ctx(gate), req.query);
    }),
  );

  r.get('/api/v1/tenant/m/opd-visit/reports/visit-statistics', { schema: { querystring: visitReportQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requireAnyPermission(['opd.manage', 'reports.view']);
      await gate.requireModule('opd-visit');
      await gate.requireFeature(visit.visitStatistics);
      return visitStatistics(ctx(gate), { from: req.query.from, to: req.query.to });
    }),
  );
}
