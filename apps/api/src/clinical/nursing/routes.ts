import { schema } from '@hos/db';
import { CLINICAL_FEATURES, giveDoseSchema, istDateKey, placeClinicalOrderSchema } from '@hos/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError } from '../../http';
import { clinical } from '../registry';
import { letterhead, renderHtml, renderPdf } from '../print';
import { readPatient } from '../patients-read';
import { investigationPrescriptionDoc, medicinePrescriptionDoc } from './prints';
import {
  dietOrders,
  encounterNotes,
  encounterOrders,
  giveDose,
  marForEncounter,
  placeDietOrder,
  vitalsChart,
  wardPatients,
} from './service';

const MODULE = 'nurse-station';
const PREFIX = `/api/v1/tenant/m/${MODULE}`;
const features = CLINICAL_FEATURES.nurseStation;

const encounterParams = z.object({ id: z.uuid() });
const marQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const wardQuery = z.object({ wardCode: z.string().trim().max(20).optional() });
const dietListQuery = wardQuery.extend({ encounterId: z.uuid().optional() });
const doseParams = z.object({ doseId: z.uuid() });
const printParams = z.object({
  id: z.uuid(),
  kind: z.enum(['investigation', 'medicine']),
  format: z.enum(['pdf', 'html']),
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

function clinicalCtx(gate: TenantGate) {
  return ctx(gate);
}

export function registerNursing(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  const guard = async (gate: TenantGate, feature?: string) => {
    if (!gate.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
    await gate.requireModule(MODULE);
    gate.requirePermission('nursing.manage');
    if (feature) await gate.requireFeature(feature);
  };

  r.get(`${PREFIX}/ward`, { schema: { querystring: wardQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.medicineOrders);
      return wardPatients(clinicalCtx(gate), req.query);
    }),
  );

  r.get(`${PREFIX}/encounters/:id/orders`, { schema: { params: encounterParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.labOrders);
      return encounterOrders(clinicalCtx(gate), req.params.id);
    }),
  );

  r.get(`${PREFIX}/encounters/:id/results`, { schema: { params: encounterParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.viewTestResults);
      const orders = await encounterOrders(clinicalCtx(gate), req.params.id);
      const labItems = orders.filter((o) => o.kind === 'lab').flatMap((o) => o.items.map((i) => i.id));
      const summaries = await clinical(gate).labResults.summaries(clinicalCtx(gate), labItems);
      return labItems.map((id) => ({ orderItemId: id, summary: summaries.get(id) ?? null }));
    }),
  );

  r.get(`${PREFIX}/encounters/:id/doctor-notes`, { schema: { params: encounterParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.doctorsNotes);
      return encounterNotes(clinicalCtx(gate), req.params.id);
    }),
  );

  r.get(`${PREFIX}/encounters/:id/vitals-chart`, { schema: { params: encounterParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.vitalsTable);
      return vitalsChart(clinicalCtx(gate), req.params.id);
    }),
  );

  r.get(`${PREFIX}/encounters/:id/mar`, { schema: { params: encounterParams, querystring: marQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const dateKey = req.query.date ?? istDateKey(new Date());
      return marForEncounter(clinicalCtx(gate), req.params.id, dateKey);
    }),
  );

  r.post(`${PREFIX}/mar/:doseId/administer`, { schema: { params: doseParams, body: giveDoseSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      return giveDose(clinicalCtx(gate), req.params.doseId, req.body);
    }),
  );

  r.get(`${PREFIX}/diet`, { schema: { querystring: dietListQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      return dietOrders(clinicalCtx(gate), req.query);
    }),
  );

  r.post(`${PREFIX}/encounters/:id/diet`, { schema: { params: encounterParams, body: placeClinicalOrderSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      return placeDietOrder(clinicalCtx(gate), req.params.id, req.body);
    }),
  );

  r.get(`${PREFIX}/encounters/:id/print/:kind/:format`, { schema: { params: printParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const feature = req.params.kind === 'medicine' ? features.medicinePrescription : features.investigationPrescription;
      await guard(gate, feature);
      const all = await encounterOrders(clinicalCtx(gate), req.params.id);
      const filtered = all.filter((o) => o.kind === (req.params.kind === 'medicine' ? 'medicine' : 'lab'));
      const [encRow] = await gate.tx.select().from(schema.encounters).where(eq(schema.encounters.id, req.params.id));
      if (!encRow) throw new ApiError(404, 'not_found', 'Encounter not found');
      const patient = await readPatient(gate.tx, encRow.patientId);
      const head = await letterhead(gate.tx, gate.locationId!);
      const doc = req.params.kind === 'medicine' ? medicinePrescriptionDoc(patient, filtered, head) : investigationPrescriptionDoc(patient, filtered, head);
      if (req.params.format === 'html') return reply.type('text/html; charset=utf-8').send(renderHtml(doc));
      const pdf = await renderPdf(doc);
      return reply.type('application/pdf').header('content-disposition', `inline; filename="${req.params.kind}-${req.params.id}.pdf"`).send(Buffer.from(pdf));
    }),
  );
}
