import {
  cpoeAdmissionRequestSchema,
  casePaperSchema,
  orderSetSchema,
  prescriptionSchema,
  serviceOrderSchema,
  type PrintDoc,
} from '@hos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError, sendCommittedDownload, type CommittedDownload } from '../../http';
import { letterhead, renderHtml, renderPdf } from '../print';
import { doctorCasePaperDoc, investigationDoc, prescriptionDoc } from './prints';
import {
  admissionRequest,
  createOrderSet,
  doctorFeatures,
  doctorPrintContext,
  listInpatients,
  listOrderSets,
  loadCasePaper,
  myQueue,
  placeDiagnosticOrder,
  placePrescription,
  placeProcedureOrder,
  saveCasePaper,
  vitalsGraph,
} from './service';

export const PREFIX_OPD = '/api/v1/tenant/m/opd-visit/doctor';
export const PREFIX_CPOE = '/api/v1/tenant/m/cpoe';

const printKinds = ['case-paper', 'prescription', 'investigation'] as const;
const printFormats = ['pdf', 'html'] as const;

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

async function guardOpdDoctor(gate: TenantGate, writing: boolean): Promise<void> {
  await gate.requireModule('opd-visit');
  if (writing) {
    gate.requirePermission('clinical.order');
    await gate.requireFeature(doctorFeatures.visitRegistration);
    return;
  }
  gate.requirePermission('clinical.view');
}

async function guardCpoe(gate: TenantGate, feature: string, writing: boolean): Promise<void> {
  await gate.requireModule('cpoe');
  await gate.requireFeature(feature);
  gate.requirePermission(writing ? 'clinical.order' : 'clinical.view');
}

export function registerDoctor(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  r.get(`${PREFIX_OPD}/my-queue`, { schema: { querystring: z.object({ date: z.string().date() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardOpdDoctor(gate, false);
      return myQueue(ctx(gate), req.query.date);
    }),
  );

  r.get(`${PREFIX_OPD}/encounters/:id/case-paper`, { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardOpdDoctor(gate, false);
      return loadCasePaper(ctx(gate), req.params.id);
    }),
  );

  r.put(`${PREFIX_OPD}/encounters/:id/case-paper`, { schema: { params: z.object({ id: z.uuid() }), body: casePaperSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardOpdDoctor(gate, true);
      return saveCasePaper(ctx(gate), req.params.id, req.body);
    }),
  );

  r.post(`${PREFIX_OPD}/encounters/:id/prescription`, { schema: { params: z.object({ id: z.uuid() }), body: prescriptionSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardOpdDoctor(gate, true);
      const created = await placePrescription(ctx(gate), req.params.id, req.body);
      reply.code(201);
      return created;
    }),
  );

  r.get(
    `${PREFIX_OPD}/encounters/:id/print/:kind/:format`,
    { schema: { params: z.object({ id: z.uuid(), kind: z.enum(printKinds), format: z.enum(printFormats) }) } },
    async (req, reply) => {
      const file = await run(req, reply, async (gate): Promise<CommittedDownload> => {
        await guardOpdDoctor(gate, false);
        const { kind, format } = req.params;
        const c = ctx(gate);
        const head = await letterhead(gate.tx, gate.locationId!);
        const bundle = await doctorPrintContext(c, req.params.id);
        if (kind === 'prescription') {
          const latest = bundle.orderList.find((o) => o.kind === 'medicine') ?? bundle.orderList[0];
          if (!latest) throw new ApiError(422, 'validation', 'No prescription order to print');
          const doc = prescriptionDoc(bundle.patient, latest, head, bundle.doctor);
          return renderDownload(format, doc, 'prescription.pdf');
        }
        if (kind === 'investigation') {
          const labs = bundle.orderList.filter((o) => o.kind === 'lab' || o.kind === 'procedure' || o.kind === 'radiology');
          const doc = investigationDoc(bundle.patient, labs, head);
          return renderDownload(format, doc, 'investigation.pdf');
        }
        const doc = doctorCasePaperDoc(bundle.patient, bundle.paper, head);
        return renderDownload(format, doc, 'case-paper.pdf');
      });
      return sendCommittedDownload(reply, file);
    },
  );

  r.get(`${PREFIX_CPOE}/inpatients`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule('cpoe');
      gate.requirePermission('clinical.view');
      return listInpatients(ctx(gate));
    }),
  );

  r.post(
    `${PREFIX_CPOE}/encounters/:id/orders/diagnostic`,
    { schema: { params: z.object({ id: z.uuid() }), body: serviceOrderSchema } },
    async (req, reply) =>
      run(req, reply, async (gate) => {
        await gate.requireModule('lab');
        await guardCpoe(gate, doctorFeatures.diagnosticOrders, true);
        const created = await placeDiagnosticOrder(ctx(gate), req.params.id, req.body);
        reply.code(201);
        return created;
      }),
  );

  r.post(
    `${PREFIX_CPOE}/encounters/:id/orders/procedure`,
    { schema: { params: z.object({ id: z.uuid() }), body: serviceOrderSchema } },
    async (req, reply) =>
      run(req, reply, async (gate) => {
        await guardCpoe(gate, doctorFeatures.procedureOrders, true);
        const created = await placeProcedureOrder(ctx(gate), req.params.id, req.body);
        reply.code(201);
        return created;
      }),
  );

  r.get(`${PREFIX_CPOE}/order-sets`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardCpoe(gate, doctorFeatures.diagnosticOrders, false);
      return listOrderSets(ctx(gate));
    }),
  );

  r.post(`${PREFIX_CPOE}/order-sets`, { schema: { body: orderSetSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardCpoe(gate, doctorFeatures.diagnosticOrders, true);
      const created = await createOrderSet(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.post(
    `${PREFIX_CPOE}/encounters/:id/admission-request`,
    { schema: { params: z.object({ id: z.uuid() }), body: cpoeAdmissionRequestSchema } },
    async (req, reply) =>
      run(req, reply, async (gate) => {
        await guardCpoe(gate, doctorFeatures.requestAdmission, true);
        return admissionRequest(ctx(gate), req.params.id, req.body);
      }),
  );

  r.get(`${PREFIX_CPOE}/encounters/:id/vitals-graph`, { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardCpoe(gate, doctorFeatures.vitalsTable, false);
      return vitalsGraph(ctx(gate), req.params.id);
    }),
  );

  r.get(
    `${PREFIX_CPOE}/encounters/:id/print/:kind/:format`,
    { schema: { params: z.object({ id: z.uuid(), kind: z.enum(printKinds), format: z.enum(printFormats) }) } },
    async (req, reply) => {
      const file = await run(req, reply, async (gate): Promise<CommittedDownload> => {
        gate.requirePermission('clinical.view');
        await gate.requireAnyModule(['opd-visit', 'cpoe']);
        const { kind, format } = req.params;
        const c = ctx(gate);
        const head = await letterhead(gate.tx, gate.locationId!);
        const bundle = await doctorPrintContext(c, req.params.id);
        if (kind === 'prescription') {
          const latest = bundle.orderList.find((o) => o.kind === 'medicine') ?? bundle.orderList[0];
          if (!latest) throw new ApiError(422, 'validation', 'No prescription order to print');
          const doc = prescriptionDoc(bundle.patient, latest, head, bundle.doctor);
          return renderDownload(format, doc);
        }
        if (kind === 'investigation') {
          const labs = bundle.orderList.filter((o) => o.kind === 'lab' || o.kind === 'procedure');
          const doc = investigationDoc(bundle.patient, labs, head);
          return renderDownload(format, doc);
        }
        const doc = doctorCasePaperDoc(bundle.patient, bundle.paper, head);
        return renderDownload(format, doc);
      });
      return sendCommittedDownload(reply, file);
    },
  );

}

async function renderDownload(format: 'html' | 'pdf', doc: PrintDoc, filename?: string): Promise<CommittedDownload> {
  if (format === 'html') return { download: 'html', html: renderHtml(doc) };
  const pdf = await renderPdf(doc);
  return filename ? { download: 'pdf', bytes: Buffer.from(pdf), filename } : { download: 'pdf', bytes: Buffer.from(pdf) };
}
