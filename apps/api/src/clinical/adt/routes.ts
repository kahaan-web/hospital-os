import { CLINICAL_FEATURES, istDateKey } from '@hos/shared';
import {
  admissionListQuery,
  admissionRequestQuery,
  admissionRequestSchema,
  admitSchema,
  adtReportQuery,
  bedChargeQuery,
  bedCreateSchema,
  bedPatchSchema,
  dischargeSchema,
  roomCreateSchema,
  roomPatchSchema,
  summarySaveSchema,
  transferSchema,
  wardCreateSchema,
  wardPatchSchema,
} from '@hos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError } from '../../http';
import { letterhead, renderHtml, renderPdf } from '../print';
import { readPatient } from '../patients-read';
import { admissionStickerDoc, summaryDoc } from './prints';
import {
  admit,
  admissionRegister,
  bedBoard,
  createBed,
  createRoom,
  createWard,
  dischargePatient,
  dischargeRegister,
  finaliseSummary,
  getAdmission,
  getSummary,
  listAdmissions,
  listBeds,
  listRequests,
  listRooms,
  listWards,
  patchBed,
  patchRoom,
  patchWard,
  postBedCharges,
  requestAdmission,
  saveSummary,
  summaryReport,
  transfer,
  transferRegister,
} from './service';

const MODULE = 'adt';
const PREFIX = `/api/v1/tenant/m/${MODULE}`;
const features = CLINICAL_FEATURES.adt;
const idParams = z.object({ id: z.uuid() });
const printParams = z.object({
  id: z.uuid(),
  kind: z.enum(['sticker', 'summary']),
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

function canOverrideBilling(gate: TenantGate): boolean {
  try {
    gate.requirePermission('billing.ip.manage');
    return true;
  } catch {
    return false;
  }
}

export function registerAdt(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  const guard = async (gate: TenantGate, feature?: string) => {
    if (!gate.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
    await gate.requireModule(MODULE);
    gate.requirePermission('adt.manage');
    if (feature) await gate.requireFeature(feature);
  };

  r.get(`${PREFIX}/wards`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.admission);
      return listWards(gate.tx, gate.locationId!);
    }),
  );

  r.post(`${PREFIX}/wards`, { schema: { body: wardCreateSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.admission);
      const created = await createWard(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.patch(`${PREFIX}/wards/:id`, { schema: { params: idParams, body: wardPatchSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.admission);
      return patchWard(ctx(gate), req.params.id, req.body);
    }),
  );

  r.get(`${PREFIX}/rooms`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.admission);
      return listRooms(gate.tx, gate.locationId!);
    }),
  );

  r.post(`${PREFIX}/rooms`, { schema: { body: roomCreateSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.admission);
      const created = await createRoom(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.patch(`${PREFIX}/rooms/:id`, { schema: { params: idParams, body: roomPatchSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.admission);
      return patchRoom(ctx(gate), req.params.id, req.body);
    }),
  );

  r.get(`${PREFIX}/beds`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.admission);
      return listBeds(gate.tx, gate.locationId!);
    }),
  );

  r.post(`${PREFIX}/beds`, { schema: { body: bedCreateSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.admission);
      const created = await createBed(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.patch(`${PREFIX}/beds/:id`, { schema: { params: idParams, body: bedPatchSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.admission);
      return patchBed(ctx(gate), req.params.id, req.body);
    }),
  );

  r.get(`${PREFIX}/bed-board`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.admission);
      return bedBoard(gate.tx, gate.locationId!);
    }),
  );

  r.get(`${PREFIX}/admissions`, { schema: { querystring: admissionListQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.admission);
      return listAdmissions(gate.tx, gate.locationId!, req.query);
    }),
  );

  r.post(`${PREFIX}/admissions`, { schema: { body: admitSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.admission);
      const created = await admit(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.get(`${PREFIX}/admissions/:id`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.admission);
      return getAdmission(gate.tx, req.params.id, gate.locationId!);
    }),
  );

  r.post(`${PREFIX}/admissions/:id/transfer`, { schema: { params: idParams, body: transferSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.transfer);
      return transfer(ctx(gate), req.params.id, req.body);
    }),
  );

  r.post(`${PREFIX}/admissions/:id/discharge`, { schema: { params: idParams, body: dischargeSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.discharge);
      return dischargePatient(ctx(gate), req.params.id, req.body, canOverrideBilling(gate));
    }),
  );

  r.get(`${PREFIX}/admissions/:id/summary`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.dischargeSummary);
      return getSummary(gate.tx, req.params.id, gate.locationId!);
    }),
  );

  r.put(`${PREFIX}/admissions/:id/summary`, { schema: { params: idParams, body: summarySaveSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.dischargeSummary);
      return saveSummary(ctx(gate), req.params.id, req.body);
    }),
  );

  r.post(`${PREFIX}/admissions/:id/summary/finalise`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.dischargeSummary);
      return finaliseSummary(ctx(gate), req.params.id);
    }),
  );

  r.post(`${PREFIX}/bed-charges/post`, { schema: { querystring: bedChargeQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.admission);
      return postBedCharges(ctx(gate), req.query.date ?? istDateKey(new Date()));
    }),
  );

  r.get(`${PREFIX}/admission-requests`, { schema: { querystring: admissionRequestQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.admission);
      return listRequests(gate.tx, gate.locationId!, req.query.status);
    }),
  );

  r.post(`${PREFIX}/admission-requests`, { schema: { body: admissionRequestSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate, features.admission);
      const created = await requestAdmission(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.get(`${PREFIX}/admissions/:id/print/:kind/:format`, { schema: { params: printParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      if (!gate.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
      await gate.requireModule(MODULE);
      gate.requirePermission('adt.manage');
      const feature = req.params.kind === 'sticker' ? features.patientStickers : features.dischargeSummary;
      await gate.requireFeature(feature);
      const admission = await getAdmission(gate.tx, req.params.id, gate.locationId!);
      const patient = await readPatient(gate.tx, admission.patientId);
      const head = await letterhead(gate.tx, gate.locationId!);
      const doc =
        req.params.kind === 'sticker'
          ? admissionStickerDoc(admission, patient, head)
          : summaryDoc(admission, await getSummary(gate.tx, admission.id, gate.locationId!), patient, head);
      if (req.params.format === 'html') return reply.type('text/html; charset=utf-8').send(renderHtml(doc));
      const pdf = await renderPdf(doc);
      return reply.type('application/pdf').header('content-disposition', `inline; filename="${req.params.kind}-${admission.number}.pdf"`).send(Buffer.from(pdf));
    }),
  );

  const report = async (
    req: FastifyRequest,
    reply: FastifyReply,
    feature: string,
    load: (gate: TenantGate) => Promise<unknown>,
  ) =>
    run(req, reply, async (gate) => {
      if (!gate.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
      await gate.requireModule(MODULE);
      gate.requirePermission('reports.view');
      await gate.requireFeature(feature);
      return { items: await load(gate) };
    });

  r.get(`${PREFIX}/reports/admissions`, { schema: { querystring: adtReportQuery } }, async (req, reply) =>
    report(req, reply, features.admissionRegister, (gate) => admissionRegister(gate.tx, gate.locationId!, req.query)),
  );

  r.get(`${PREFIX}/reports/transfers`, { schema: { querystring: adtReportQuery } }, async (req, reply) =>
    report(req, reply, features.transferRegister, (gate) => transferRegister(gate.tx, gate.locationId!, req.query)),
  );

  r.get(`${PREFIX}/reports/discharges`, { schema: { querystring: adtReportQuery } }, async (req, reply) =>
    report(req, reply, features.dischargeRegister, (gate) => dischargeRegister(gate.tx, gate.locationId!, req.query)),
  );

  r.get(`${PREFIX}/reports/discharge-summaries`, { schema: { querystring: adtReportQuery } }, async (req, reply) =>
    report(req, reply, features.dischargeSummaryReport, (gate) => summaryReport(gate.tx, gate.locationId!, req.query)),
  );
}
