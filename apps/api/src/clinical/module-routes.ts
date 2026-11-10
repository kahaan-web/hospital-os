import { schema } from '@hos/db';
import {
  addClinicalNoteSchema,
  cancelOrderSchema,
  patientAlertSchema,
  patientSearchQuery,
  placeClinicalOrderSchema,
  recordVitalsSchema,
  type ClinicalOrderKind,
  type ClinicalOrderSource,
} from '@hos/shared';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../guard';
import { openTenant } from '../guard';
import { ApiError } from '../http';
import { chargeDto } from './charges';
import { encounterDto } from './encounters';
import { orders } from './orders';
import { addAlert, codes, listAlerts, listDoctors, listServices, noteDto, readEncounterDetail, readPatient, searchPatients, vitalDto } from './patients-read';

const encounterQuery = z.object({
  patientId: z.uuid().optional(),
  kind: z.enum(['opd', 'ipd', 'daycare', 'emergency']).optional(),
  status: z.enum(['open', 'closed', 'cancelled']).optional(),
  mine: z.enum(['1', 'true', '0', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const serviceQuery = z.object({
  category: z.string().trim().max(40).optional(),
  q: z.string().trim().max(80).optional(),
});

const errorBody = z.object({
  reason: z.string().trim().min(2, 'Say why this reading is wrong').max(300),
});

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

async function gateOrder(gate: TenantGate, kind: ClinicalOrderKind, source: ClinicalOrderSource | undefined, writing: boolean) {
  if (kind === 'radiology') throw new ApiError(422, 'not_available', 'Radiology orders are not available yet');
  if (kind === 'lab') await gate.requireModule('lab');
  else if (kind === 'diet') await gate.requireAnyModule(['nurse-station', 'adt']);
  else if (source === 'cpoe') await gate.requireModule('cpoe');
  else await gate.requireAnyModule(['opd-visit', 'cpoe']);
  if (!writing) {
    gate.requireAnyPermission(['clinical.view', 'clinical.order', 'opd.manage', 'nursing.manage', 'adt.manage']);
    return;
  }
  if (kind === 'lab') gate.requireAnyPermission(['opd.manage', 'clinical.order']);
  else if (kind === 'diet') gate.requireAnyPermission(['nursing.manage', 'clinical.order']);
  else gate.requirePermission('clinical.order');
}

export function registerModuleRoutes(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  r.get('/api/v1/tenant/clinical/patients', { schema: { querystring: patientSearchQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule('patient-registration');
      gate.requireAnyPermission(['patients.view', 'patients.manage']);
      return searchPatients(gate.tx, req.query);
    }),
  );

  r.get('/api/v1/tenant/clinical/patients/:id', { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule('patient-registration');
      gate.requireAnyPermission(['patients.view', 'patients.manage']);
      return readPatient(gate.tx, req.params.id);
    }),
  );

  r.get('/api/v1/tenant/clinical/patients/:id/alerts', { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule('patient-registration');
      gate.requireAnyPermission(['clinical.view', 'clinical.order', 'patients.manage', 'patients.view']);
      return listAlerts(gate.tx, req.params.id);
    }),
  );

  r.post('/api/v1/tenant/clinical/patients/:id/alerts', { schema: { params: z.object({ id: z.uuid() }), body: patientAlertSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule('patient-registration');
      gate.requireAnyPermission(['clinical.order', 'patients.manage']);
      const c = ctx(gate);
      return addAlert(gate.tx, c.tenantId, req.params.id, c.userId, req.body, (id) => gate.audit('clinical.alert.create', 'patient_alert', id, null, req.body));
    }),
  );

  r.get('/api/v1/tenant/clinical/encounters', { schema: { querystring: encounterQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireAnyModule(['opd-visit', 'adt']);
      gate.requireAnyPermission(['clinical.view', 'opd.manage', 'adt.manage']);
      const q = req.query;
      const filters = [
        q.patientId ? eq(schema.encounters.patientId, q.patientId) : undefined,
        q.kind ? eq(schema.encounters.kind, q.kind) : undefined,
        q.status ? eq(schema.encounters.status, q.status) : undefined,
      ];
      if (q.mine === '1' || q.mine === 'true') {
        const [doctor] = await gate.tx.select({ id: schema.doctors.id }).from(schema.doctors).where(eq(schema.doctors.userId, gate.user.id));
        filters.push(doctor ? eq(schema.encounters.doctorId, doctor.id) : sql`false`);
      }
      const where = and(...filters.filter((f): f is NonNullable<typeof f> => f != null));
      const rows = await gate.tx
        .select()
        .from(schema.encounters)
        .where(where)
        .orderBy(desc(schema.encounters.startedAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize);
      const total = await gate.tx.select({ n: sql<number>`count(*)::int` }).from(schema.encounters).where(where);
      return { items: rows.map((row) => encounterDto(row)), total: Number(total[0]?.n ?? 0), page: q.page, pageSize: q.pageSize };
    }),
  );

  r.get('/api/v1/tenant/clinical/encounters/:id', { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireAnyModule(['opd-visit', 'adt']);
      gate.requireAnyPermission(['clinical.view', 'opd.manage', 'adt.manage']);
      return readEncounterDetail(gate.tx, req.params.id);
    }),
  );

  r.get('/api/v1/tenant/clinical/encounters/:id/orders', { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const [encounter] = await gate.tx.select().from(schema.encounters).where(eq(schema.encounters.id, req.params.id));
      if (!encounter) throw new ApiError(404, 'not_found', 'Encounter not found');
      await gate.requireAnyModule(['opd-visit', 'cpoe', 'lab', 'nurse-station', 'adt']);
      gate.requireAnyPermission(['clinical.view', 'clinical.order', 'opd.manage', 'nursing.manage', 'adt.manage']);
      const rows = await gate.tx.select({ id: schema.clinicalOrders.id }).from(schema.clinicalOrders).where(eq(schema.clinicalOrders.encounterId, encounter.id)).orderBy(desc(schema.clinicalOrders.placedAt));
      const loaded = [];
      for (const row of rows) {
        const [order] = await gate.tx.select().from(schema.clinicalOrders).where(eq(schema.clinicalOrders.id, row.id));
        if (!order) continue;
        const lines = await gate.tx.select().from(schema.clinicalOrderItems).where(eq(schema.clinicalOrderItems.orderId, order.id)).orderBy(asc(schema.clinicalOrderItems.lineNo));
        loaded.push({
          id: order.id,
          locationId: order.locationId,
          encounterId: order.encounterId,
          patientId: order.patientId,
          kind: order.kind,
          number: order.number,
          source: order.source,
          priority: order.priority,
          status: order.status,
          orderingDoctorId: order.orderingDoctorId,
          orderedByUserId: order.orderedByUserId,
          notes: order.notes,
          placedAt: order.placedAt instanceof Date ? order.placedAt.toISOString() : new Date(order.placedAt).toISOString(),
          cancelledAt: order.cancelledAt ? (order.cancelledAt instanceof Date ? order.cancelledAt.toISOString() : new Date(order.cancelledAt).toISOString()) : null,
          cancelReason: order.cancelReason,
          items: lines.map((line) => ({
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
            status: line.status,
            fulfilledQty: Number(line.fulfilledQty),
            fulfilledRefType: line.fulfilledRefType,
            fulfilledRefId: line.fulfilledRefId,
          })),
        });
      }
      return loaded;
    }),
  );

  r.post('/api/v1/tenant/clinical/encounters/:id/orders', { schema: { params: z.object({ id: z.uuid() }), body: placeClinicalOrderSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gateOrder(gate, req.body.kind, req.body.source, true);
      return orders.place(ctx(gate), req.params.id, req.body);
    }),
  );

  r.post('/api/v1/tenant/clinical/orders/:id/cancel', { schema: { params: z.object({ id: z.uuid() }), body: cancelOrderSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const [order] = await gate.tx.select().from(schema.clinicalOrders).where(eq(schema.clinicalOrders.id, req.params.id));
      if (!order) throw new ApiError(404, 'not_found', 'Order not found');
      await gateOrder(gate, order.kind as ClinicalOrderKind, order.source as ClinicalOrderSource, true);
      return orders.cancel(ctx(gate), order.id, req.body.reason);
    }),
  );

  r.get('/api/v1/tenant/clinical/encounters/:id/vitals', { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireAnyModule(['opd-visit', 'nurse-station', 'cpoe']);
      gate.requireAnyPermission(['clinical.order', 'nursing.manage', 'opd.manage', 'clinical.view']);
      const rows = await gate.tx.select().from(schema.vitalSigns).where(eq(schema.vitalSigns.encounterId, req.params.id)).orderBy(desc(schema.vitalSigns.recordedAt));
      if (rows.length === 0) {
        const [encounter] = await gate.tx.select({ id: schema.encounters.id }).from(schema.encounters).where(eq(schema.encounters.id, req.params.id));
        if (!encounter) throw new ApiError(404, 'not_found', 'Encounter not found');
      }
      return rows.map(vitalDto);
    }),
  );

  r.post('/api/v1/tenant/clinical/encounters/:id/vitals', { schema: { params: z.object({ id: z.uuid() }), body: recordVitalsSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireAnyModule(['opd-visit', 'nurse-station', 'cpoe']);
      gate.requireAnyPermission(['clinical.order', 'nursing.manage', 'opd.manage']);
      const c = ctx(gate);
      const [encounter] = await gate.tx.select().from(schema.encounters).where(eq(schema.encounters.id, req.params.id));
      if (!encounter) throw new ApiError(404, 'not_found', 'Encounter not found');
      const body = req.body;
      const [row] = await gate.tx
        .insert(schema.vitalSigns)
        .values({
          tenantId: c.tenantId,
          locationId: encounter.locationId,
          encounterId: encounter.id,
          patientId: encounter.patientId,
          recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date(),
          recordedBy: c.userId,
          bpSystolic: body.bpSystolic ?? null,
          bpDiastolic: body.bpDiastolic ?? null,
          pulse: body.pulse ?? null,
          respRate: body.respRate ?? null,
          tempCX10: body.tempC == null ? null : Math.round(body.tempC * 10),
          spo2: body.spo2 ?? null,
          weightG: body.weightKg == null ? null : Math.round(body.weightKg * 1000),
          heightMm: body.heightCm == null ? null : Math.round(body.heightCm * 10),
          painScore: body.painScore ?? null,
          grbsMgDl: body.grbsMgDl ?? null,
          notes: body.notes ?? null,
        })
        .returning();
      await gate.audit('clinical.vital.record', 'vital_signs', row!.id, null, { encounterId: encounter.id });
      return vitalDto(row!);
    }),
  );

  r.post('/api/v1/tenant/clinical/vitals/:id/entered-in-error', { schema: { params: z.object({ id: z.uuid() }), body: errorBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireAnyModule(['opd-visit', 'nurse-station', 'cpoe']);
      gate.requireAnyPermission(['clinical.order', 'nursing.manage', 'opd.manage']);
      const [row] = await gate.tx.select().from(schema.vitalSigns).where(eq(schema.vitalSigns.id, req.params.id));
      if (!row) throw new ApiError(404, 'not_found', 'Vital signs not found');
      const [updated] = await gate.tx
        .update(schema.vitalSigns)
        .set({ enteredInErrorAt: new Date(), errorReason: req.body.reason })
        .where(eq(schema.vitalSigns.id, row.id))
        .returning();
      await gate.audit('clinical.vital.entered_in_error', 'vital_signs', row.id, { enteredInErrorAt: null }, { reason: req.body.reason });
      return vitalDto(updated!);
    }),
  );

  r.get('/api/v1/tenant/clinical/encounters/:id/notes', { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireAnyModule(['opd-visit', 'cpoe', 'nurse-station']);
      gate.requireAnyPermission(['clinical.view', 'clinical.order', 'nursing.manage']);
      const [encounter] = await gate.tx.select({ id: schema.encounters.id }).from(schema.encounters).where(eq(schema.encounters.id, req.params.id));
      if (!encounter) throw new ApiError(404, 'not_found', 'Encounter not found');
      const rows = await gate.tx.select().from(schema.clinicalNotes).where(eq(schema.clinicalNotes.encounterId, encounter.id)).orderBy(asc(schema.clinicalNotes.createdAt));
      return rows.map(noteDto);
    }),
  );

  r.post('/api/v1/tenant/clinical/encounters/:id/notes', { schema: { params: z.object({ id: z.uuid() }), body: addClinicalNoteSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireAnyModule(['opd-visit', 'cpoe', 'nurse-station']);
      gate.requireAnyPermission(['clinical.order', 'nursing.manage']);
      const c = ctx(gate);
      const [encounter] = await gate.tx.select().from(schema.encounters).where(eq(schema.encounters.id, req.params.id));
      if (!encounter) throw new ApiError(404, 'not_found', 'Encounter not found');
      const [row] = await gate.tx
        .insert(schema.clinicalNotes)
        .values({
          tenantId: c.tenantId,
          encounterId: encounter.id,
          patientId: encounter.patientId,
          kind: req.body.kind,
          body: req.body.body,
          code: req.body.code ?? null,
          codeDisplay: req.body.codeDisplay ?? null,
          authorUserId: c.userId,
          supersedesId: req.body.supersedesId ?? null,
        })
        .returning();
      await gate.audit('clinical.note.add', 'clinical_note', row!.id, null, { kind: req.body.kind });
      return noteDto(row!);
    }),
  );

  r.get('/api/v1/tenant/clinical/encounters/:id/charges', { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule('op-billing');
      gate.requireAnyPermission(['billing.op.post', 'billing.ip.manage']);
      const [encounter] = await gate.tx.select({ id: schema.encounters.id }).from(schema.encounters).where(eq(schema.encounters.id, req.params.id));
      if (!encounter) throw new ApiError(404, 'not_found', 'Encounter not found');
      const rows = await gate.tx.select().from(schema.charges).where(eq(schema.charges.encounterId, encounter.id)).orderBy(asc(schema.charges.createdAt));
      return rows.map(chargeDto);
    }),
  );

  r.get('/api/v1/tenant/clinical/codes', async (req, reply) => run(req, reply, async () => codes()));

  r.get('/api/v1/tenant/clinical/doctors', async (req, reply) => run(req, reply, async (gate) => listDoctors(gate.tx)));

  r.get('/api/v1/tenant/clinical/services', { schema: { querystring: serviceQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => listServices(gate.tx, gate.locationId, req.query)),
  );
}
