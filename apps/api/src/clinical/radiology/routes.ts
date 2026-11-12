import { randomInt } from 'node:crypto';
import { schema, type Tx } from '@hos/db';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError } from '../../http';

/** MVP demo slice: orders worklist, start/done, report draft and sign. PC-PNDT Form F is not in this slice. */
const MODULE = 'radiology';
const PREFIX = `/api/v1/tenant/m/${MODULE}`;

const idParams = z.object({ id: z.uuid() });
const listQuery = z.object({
  status: z.enum(['ordered', 'in_progress', 'done', 'reported', 'cancelled']).optional(),
  modality: z.enum(['xray', 'usg', 'ct', 'mri', 'mammo', 'other']).optional(),
});
const createBody = z.object({
  patientId: z.uuid(),
  modality: z.enum(['xray', 'usg', 'ct', 'mri', 'mammo', 'other']),
  studyName: z.string().trim().min(2).max(160),
  priority: z.enum(['routine', 'urgent', 'stat']).default('routine'),
  orderingDoctorName: z.string().trim().max(120).default(''),
  clinicalNotes: z.string().trim().max(1000).default(''),
});
const reportBody = z.object({
  findings: z.string().trim().max(8000),
  impression: z.string().trim().max(2000),
});

function locationOf(gate: TenantGate): string {
  if (!gate.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
  return gate.locationId;
}

async function detail(tx: Tx, id: string) {
  const [row] = await tx
    .select({ o: schema.radOrders, patientName: schema.patients.fullName, uhid: schema.patients.uhid })
    .from(schema.radOrders)
    .innerJoin(schema.patients, and(eq(schema.patients.tenantId, schema.radOrders.tenantId), eq(schema.patients.id, schema.radOrders.patientId)))
    .where(eq(schema.radOrders.id, id));
  if (!row) throw new ApiError(404, 'not_found', 'Radiology order not found');
  return { ...row.o, patientName: row.patientName, uhid: row.uhid };
}

async function latestReport(tx: Tx, orderId: string) {
  const [report] = await tx
    .select()
    .from(schema.radReports)
    .where(eq(schema.radReports.orderId, orderId))
    .orderBy(desc(schema.radReports.version))
    .limit(1);
  return report ?? null;
}

export function registerRadiology(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  r.get(`${PREFIX}/orders`, { schema: { querystring: listQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const locationId = locationOf(gate);
      const rows = await gate.tx
        .select({ o: schema.radOrders, patientName: schema.patients.fullName, uhid: schema.patients.uhid })
        .from(schema.radOrders)
        .innerJoin(schema.patients, and(eq(schema.patients.tenantId, schema.radOrders.tenantId), eq(schema.patients.id, schema.radOrders.patientId)))
        .where(
          and(
            eq(schema.radOrders.locationId, locationId),
            req.query.status ? eq(schema.radOrders.status, req.query.status) : undefined,
            req.query.modality ? eq(schema.radOrders.modality, req.query.modality) : undefined,
          ),
        )
        .orderBy(asc(schema.radOrders.createdAt))
        .limit(200);
      return rows.map((row) => ({ ...row.o, patientName: row.patientName, uhid: row.uhid }));
    }),
  );

  r.get(`${PREFIX}/orders/:id`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const order = await detail(gate.tx, req.params.id);
      return { ...order, report: await latestReport(gate.tx, order.id) };
    }),
  );

  r.post(`${PREFIX}/orders`, { schema: { body: createBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const locationId = locationOf(gate);
      const tenantId = gate.actor.tenantId;
      if (!tenantId) throw new ApiError(422, 'location_required', 'Choose a location');
      const body = req.body;
      const [patient] = await gate.tx.select({ id: schema.patients.id }).from(schema.patients).where(eq(schema.patients.id, body.patientId));
      if (!patient) throw new ApiError(404, 'not_found', 'Patient not found');
      const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      const [created] = await gate.tx
        .insert(schema.radOrders)
        .values({
          tenantId,
          locationId,
          patientId: body.patientId,
          number: `RAD-${stamp}-${randomInt(1000, 10000)}`,
          modality: body.modality,
          studyName: body.studyName,
          priority: body.priority,
          orderingDoctorName: body.orderingDoctorName,
          clinicalNotes: body.clinicalNotes,
          createdBy: gate.user.id,
        })
        .returning();
      if (!created) throw new ApiError(500, 'insert_failed', 'Could not save the order');
      await gate.audit('radiology.order.create', 'rad_order', created.id, null, { number: created.number, modality: created.modality, status: created.status });
      reply.code(201);
      return detail(gate.tx, created.id);
    }),
  );

  const move = (action: 'start' | 'done', from: string, to: string) =>
    r.post(`${PREFIX}/orders/:id/${action}`, { schema: { params: idParams } }, async (req, reply) =>
      run(req, reply, async (gate) => {
        const current = await detail(gate.tx, req.params.id);
        if (current.status !== from) throw new ApiError(409, 'bad_state', `A ${current.status.replace('_', ' ')} study cannot be moved to ${to.replace('_', ' ')}`);
        await gate.tx
          .update(schema.radOrders)
          .set({ status: to, performedAt: action === 'done' ? new Date() : current.performedAt })
          .where(eq(schema.radOrders.id, current.id));
        await gate.audit(`radiology.order.${action}`, 'rad_order', current.id, { status: current.status }, { status: to });
        return detail(gate.tx, current.id);
      }),
    );
  move('start', 'ordered', 'in_progress');
  move('done', 'in_progress', 'done');

  r.put(`${PREFIX}/orders/:id/report`, { schema: { params: idParams, body: reportBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = gate.actor.tenantId;
      if (!tenantId) throw new ApiError(422, 'location_required', 'Choose a location');
      const order = await detail(gate.tx, req.params.id);
      if (order.status !== 'done') {
        throw new ApiError(409, 'bad_state', order.status === 'reported' ? 'A signed report cannot be changed' : 'Mark the study done before reporting');
      }
      const existing = await latestReport(gate.tx, order.id);
      if (existing?.status === 'final') throw new ApiError(409, 'bad_state', 'A signed report cannot be changed');
      if (existing) {
        await gate.tx.update(schema.radReports).set({ findings: req.body.findings, impression: req.body.impression }).where(eq(schema.radReports.id, existing.id));
      } else {
        await gate.tx.insert(schema.radReports).values({ tenantId, orderId: order.id, findings: req.body.findings, impression: req.body.impression });
      }
      // Report text is clinical data and stays out of the audit log.
      await gate.audit('radiology.report.draft', 'rad_order', order.id, null, { status: 'draft' });
      return latestReport(gate.tx, order.id);
    }),
  );

  r.post(`${PREFIX}/orders/:id/report/sign`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const order = await detail(gate.tx, req.params.id);
      const report = await latestReport(gate.tx, order.id);
      if (!report) throw new ApiError(409, 'bad_state', 'Write the report before signing');
      if (report.status === 'final') throw new ApiError(409, 'bad_state', 'This report is already signed');
      if (!report.findings.trim() || !report.impression.trim()) throw new ApiError(422, 'report_incomplete', 'Findings and impression are both required to sign');
      await gate.tx
        .update(schema.radReports)
        .set({ status: 'final', signedAt: new Date(), radiologistId: gate.user.id })
        .where(eq(schema.radReports.id, report.id));
      await gate.tx.update(schema.radOrders).set({ status: 'reported' }).where(eq(schema.radOrders.id, order.id));
      await gate.audit('radiology.report.sign', 'rad_order', order.id, { status: 'draft' }, { status: 'final', version: report.version });
      return { ...(await detail(gate.tx, order.id)), report: await latestReport(gate.tx, order.id) };
    }),
  );
}
