import { schema, withTenant, type Tx } from '@hos/db';
import {
  CLINICAL_FEATURES,
  collectSampleSchema,
  emailResultSchema,
  labMisQuery,
  labParamPatchSchema,
  labParamSchema,
  labTestCreateSchema,
  labTestPatchSchema,
  labWorklistQuery,
  rejectSampleSchema,
  saveResultsSchema,
} from '@hos/shared';
import { desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { moduleStates, subscriptionDto } from '../../catalog';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { sha256Hex } from '../../crypto';
import { ApiError, requestMeta, writeAudit } from '../../http';
import { clinical } from '../registry';
import { letterhead, renderHtml, renderPdf } from '../print';
import { mockAstmAdapter } from './adapter';
import { labReportPrint } from './prints';
import {
  accessionDetail,
  applyAnalyzer,
  collectSample,
  createParam,
  createTest,
  emailReport,
  listParams,
  listTests,
  misReport,
  receiveSample,
  rejectSample,
  reportFor,
  reportsForPatient,
  saveResults,
  updateParam,
  updateTest,
  verifyAccession,
  worklist,
  type LabDeps,
} from './service';

const MODULE = 'lab';
const PREFIX = `/api/v1/tenant/m/${MODULE}`;
const features = CLINICAL_FEATURES.lab;

const idParams = z.object({ id: z.uuid() });
const paramParams = z.object({ id: z.uuid(), paramId: z.uuid() });
const reportQuery = z.object({ format: z.enum(['json', 'html', 'pdf']).optional() });

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

function labDeps(gate: TenantGate): LabDeps {
  const services = clinical(gate);
  return { billing: services.billing, orders: services.orders, numbering: services.numbering };
}

async function assertEquipment(tx: Tx): Promise<void> {
  const subscription = await subscriptionDto(tx);
  const access = await moduleStates(tx, subscription?.planId ?? null, subscription?.addons.map((addon) => addon.moduleId) ?? []);
  const enabled = access.states.find((state) => state.key === MODULE)?.access === 'enabled';
  if (!enabled || !access.features.includes(features.labEquipments)) {
    throw new ApiError(403, 'not_entitled', 'This feature is not included in your plan', undefined, { featureKey: features.labEquipments });
  }
}

export function registerLab(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  r.get(`${PREFIX}/tests`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.masterTemplate);
      gate.requirePermission('lab.manage');
      return listTests(ctx(gate));
    }),
  );

  r.post(`${PREFIX}/tests`, { schema: { body: labTestCreateSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.masterTemplate);
      gate.requirePermission('lab.manage');
      const created = await createTest(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.patch(`${PREFIX}/tests/:id`, { schema: { params: idParams, body: labTestPatchSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.masterTemplate);
      gate.requirePermission('lab.manage');
      return updateTest(ctx(gate), req.params.id, req.body);
    }),
  );

  r.get(`${PREFIX}/tests/:id/params`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.masterTemplate);
      gate.requirePermission('lab.manage');
      return listParams(ctx(gate), req.params.id);
    }),
  );

  r.post(`${PREFIX}/tests/:id/params`, { schema: { params: idParams, body: labParamSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.masterTemplate);
      gate.requirePermission('lab.manage');
      const created = await createParam(ctx(gate), req.params.id, req.body);
      reply.code(201);
      return created;
    }),
  );

  r.patch(`${PREFIX}/tests/:id/params/:paramId`, { schema: { params: paramParams, body: labParamPatchSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.masterTemplate);
      gate.requirePermission('lab.manage');
      return updateParam(ctx(gate), req.params.id, req.params.paramId, req.body);
    }),
  );

  r.get(`${PREFIX}/worklist`, { schema: { querystring: labWorklistQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.sampleStatus);
      gate.requirePermission('lab.manage');
      return worklist(ctx(gate), req.query.status);
    }),
  );

  r.get(`${PREFIX}/accessions/:id`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.sampleStatus);
      gate.requirePermission('lab.manage');
      return accessionDetail(ctx(gate), req.params.id);
    }),
  );

  r.post(`${PREFIX}/accessions`, { schema: { body: collectSampleSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.sampleCollection);
      gate.requirePermission('lab.manage');
      const created = await collectSample(ctx(gate), req.body, labDeps(gate));
      reply.code(201);
      return created;
    }),
  );

  r.post(`${PREFIX}/accessions/:id/receive`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.sampleCollection);
      gate.requirePermission('lab.manage');
      return receiveSample(ctx(gate), req.params.id);
    }),
  );

  r.post(`${PREFIX}/accessions/:id/reject`, { schema: { params: idParams, body: rejectSampleSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.sampleCollection);
      gate.requirePermission('lab.manage');
      return rejectSample(ctx(gate), req.params.id, req.body.reason, labDeps(gate));
    }),
  );

  r.put(`${PREFIX}/accessions/:id/results`, { schema: { params: idParams, body: saveResultsSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.resultEntry);
      gate.requirePermission('lab.manage');
      return saveResults(ctx(gate), req.params.id, req.body, labDeps(gate));
    }),
  );

  r.post(`${PREFIX}/accessions/:id/verify`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.resultEntry);
      gate.requirePermission('lab.verify');
      return verifyAccession(ctx(gate), req.params.id, labDeps(gate));
    }),
  );

  r.get(`${PREFIX}/accessions/:id/report`, { schema: { params: idParams, querystring: reportQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.labResultReport);
      gate.requirePermission('lab.manage');
      const report = await reportFor(ctx(gate), req.params.id);
      const format = req.query.format ?? 'json';
      if (format === 'json') return report;
      const head = await letterhead(gate.tx, gate.locationId!);
      const doc = labReportPrint(report, head);
      if (format === 'html') return reply.type('text/html; charset=utf-8').send(renderHtml(doc));
      const pdf = await renderPdf(doc);
      return reply.type('application/pdf').header('content-disposition', `inline; filename="${report.number.replaceAll('/', '-')}.pdf"`).send(Buffer.from(pdf));
    }),
  );

  r.post(`${PREFIX}/accessions/:id/email`, { schema: { params: idParams, body: emailResultSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.sendResultOnEmail);
      gate.requirePermission('lab.manage');
      return emailReport(ctx(gate), req.params.id, req.body.to, async (message) => {
        await deps.email.send(gate.tx, {
          tenantId: gate.actor.tenantId!,
          to: message.to,
          subject: message.subject,
          template: 'lab_result',
          body: message.body,
        });
      });
    }),
  );

  r.get(`${PREFIX}/patients/:id/history`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.patientHistory);
      gate.requirePermission('lab.manage');
      return reportsForPatient(ctx(gate), req.params.id);
    }),
  );

  r.get(`${PREFIX}/reports/mis`, { schema: { querystring: labMisQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(features.labMis);
      gate.requirePermission('lab.manage');
      return misReport(ctx(gate), req.query.from, req.query.to);
    }),
  );

  // Token auth, not a user session. The global CSRF hook still applies because app.ts is shared.
  // TENANT_GUARDS lists this route so the inventory stays closed; openTenant is intentionally not used.
  r.post(`${PREFIX}/interfaces/:id/ingest`, async (req, reply) => {
    const raw = req.headers['x-lab-interface-token'];
    const token = typeof raw === 'string' ? raw.trim() : '';
    if (!token) throw new ApiError(401, 'invalid_token', 'The analyser token is missing or not valid');
    const id = (req.params as { id?: string }).id ?? '';
    if (!z.uuid().safeParse(id).success) throw new ApiError(400, 'validation', 'Unknown interface');
    const opened = await deps.db.execute<{ tenant_id: string; location_id: string | null; interface_id: string }>(
      sql`select tenant_id, location_id, interface_id from hos_lab_interface_open(${id}::uuid, ${sha256Hex(token)})`,
    );
    const iface = opened.rows[0];
    if (!iface) throw new ApiError(401, 'invalid_token', 'The analyser token is missing or not valid');
    const body = mockAstmAdapter.parse(req.body);
    const meta = requestMeta(req);
    return withTenant(deps.db, iface.tenant_id, async (tx) => {
      await assertEquipment(tx);
      let locationId = iface.location_id;
      if (!locationId) {
        const [loc] = await tx.select({ id: schema.locations.id }).from(schema.locations).orderBy(desc(schema.locations.isPrimary)).limit(1);
        locationId = loc?.id ?? null;
      }
      if (!locationId) throw new ApiError(422, 'location_required', 'Choose a location');
      const services = clinical({ tx } as TenantGate);
      return applyAnalyzer(
        {
          tx,
          tenantId: iface.tenant_id,
          locationId,
          userId: '',
          audit: (action, entityType, entityId, before, after) =>
            writeAudit(
              tx,
              {
                actorType: 'system',
                actorId: null,
                actorLabel: `lab-interface:${iface.interface_id}`,
                tenantId: iface.tenant_id,
                locationId,
                ip: meta.ip,
                userAgent: meta.userAgent,
              },
              action,
              entityType,
              entityId,
              before,
              after,
            ),
        },
        body,
        { billing: services.billing, orders: services.orders, numbering: services.numbering },
      );
    });
  });
}
