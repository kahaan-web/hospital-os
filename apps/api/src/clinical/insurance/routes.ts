// MVP demo slice: Insurance / TPA payers and pre-auth / claim requests (docs/specs/05-insurance-tpa.md).
// Status is recorded here only. Nothing is sent to a payer or NHCX.
import { schema } from '@hos/db';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError } from '../../http';

const MODULE = 'insurance';
export const INSURANCE_PREFIX = `/api/v1/tenant/m/${MODULE}`;

const idParams = z.object({ id: z.uuid() });
const payerBody = z.object({
  name: z.string().trim().min(2).max(120),
  payerType: z.enum(['insurer', 'tpa', 'corporate', 'government']).default('insurer'),
  copayPct: z.number().int().min(0).max(100).default(0),
  creditDays: z.number().int().min(0).max(365).default(30),
});
const requestBody = z.object({
  payerId: z.uuid(),
  kind: z.enum(['preauth', 'claim']).default('preauth'),
  patientName: z.string().trim().min(2).max(120),
  uhid: z.string().trim().max(40).default(''),
  policyNo: z.string().trim().max(60).default(''),
  diagnosis: z.string().trim().max(300).default(''),
  estimatedPaise: z.number().int().min(0).max(100_000_000_00),
});
const listQuery = z.object({ status: z.enum(['draft', 'submitted', 'approved', 'rejected']).optional() });
const approveBody = z.object({ approvedPaise: z.number().int().min(1).max(100_000_000_00) });
const rejectBody = z.object({ reason: z.string().trim().min(3).max(300) });

type Tx = TenantGate['tx'];

function tenantOf(gate: TenantGate): string {
  if (!gate.actor.tenantId) throw new ApiError(422, 'tenant_required', 'No hospital in this session');
  return gate.actor.tenantId;
}

async function loadRequest(tx: Tx, id: string) {
  const [row] = await tx
    .select({ req: schema.insuranceRequests, payerName: schema.insurancePayers.name })
    .from(schema.insuranceRequests)
    .innerJoin(schema.insurancePayers, eq(schema.insurancePayers.id, schema.insuranceRequests.payerId))
    .where(eq(schema.insuranceRequests.id, id));
  if (!row) throw new ApiError(404, 'not_found', 'Request not found');
  return { ...row.req, payerName: row.payerName };
}

export function registerInsurance(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);
  const guard = async (gate: TenantGate) => {
    await gate.requireModule(MODULE);
    gate.requirePermission('billing.ip.manage');
  };

  r.get(`${INSURANCE_PREFIX}/payers`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      return gate.tx.select().from(schema.insurancePayers).orderBy(asc(schema.insurancePayers.name));
    }),
  );

  r.post(`${INSURANCE_PREFIX}/payers`, { schema: { body: payerBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const tenantId = tenantOf(gate);
      const [dupe] = await gate.tx
        .select({ id: schema.insurancePayers.id })
        .from(schema.insurancePayers)
        .where(and(eq(schema.insurancePayers.tenantId, tenantId), eq(schema.insurancePayers.name, req.body.name)));
      if (dupe) throw new ApiError(409, 'payer_exists', 'A payer with this name already exists');
      const [row] = await gate.tx.insert(schema.insurancePayers).values({ tenantId, ...req.body }).returning();
      await gate.audit('insurance.payer.create', 'insurance_payer', row!.id, null, { name: row!.name, payerType: row!.payerType });
      return row!;
    }),
  );

  r.get(`${INSURANCE_PREFIX}/requests`, { schema: { querystring: listQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const rows = await gate.tx
        .select({ req: schema.insuranceRequests, payerName: schema.insurancePayers.name })
        .from(schema.insuranceRequests)
        .innerJoin(schema.insurancePayers, eq(schema.insurancePayers.id, schema.insuranceRequests.payerId))
        .where(req.query.status ? eq(schema.insuranceRequests.status, req.query.status) : undefined)
        .orderBy(desc(schema.insuranceRequests.createdAt))
        .limit(200);
      return rows.map((row) => ({ ...row.req, payerName: row.payerName }));
    }),
  );

  r.post(`${INSURANCE_PREFIX}/requests`, { schema: { body: requestBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const tenantId = tenantOf(gate);
      const [payer] = await gate.tx.select().from(schema.insurancePayers).where(eq(schema.insurancePayers.id, req.body.payerId));
      if (!payer || !payer.active) throw new ApiError(422, 'payer_invalid', 'Choose an active payer');
      const [row] = await gate.tx
        .insert(schema.insuranceRequests)
        .values({ tenantId, ...req.body, status: 'submitted' })
        .returning();
      await gate.audit('insurance.request.create', 'insurance_request', row!.id, null, {
        kind: row!.kind,
        payerId: row!.payerId,
        estimatedPaise: row!.estimatedPaise,
      });
      return { ...row!, payerName: payer.name };
    }),
  );

  r.get(`${INSURANCE_PREFIX}/requests/:id`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      return loadRequest(gate.tx, req.params.id);
    }),
  );

  r.post(`${INSURANCE_PREFIX}/requests/:id/approve`, { schema: { params: idParams, body: approveBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const current = await loadRequest(gate.tx, req.params.id);
      if (current.status !== 'submitted') throw new ApiError(409, 'not_pending', 'Only a submitted request can be decided');
      const [row] = await gate.tx
        .update(schema.insuranceRequests)
        .set({ status: 'approved', approvedPaise: req.body.approvedPaise, decidedAt: new Date(), decidedBy: gate.user.id, rejectReason: '' })
        .where(eq(schema.insuranceRequests.id, current.id))
        .returning();
      await gate.audit('insurance.request.approve', 'insurance_request', current.id, { status: current.status }, {
        status: 'approved',
        approvedPaise: req.body.approvedPaise,
      });
      return { ...row!, payerName: current.payerName };
    }),
  );

  r.post(`${INSURANCE_PREFIX}/requests/:id/reject`, { schema: { params: idParams, body: rejectBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const current = await loadRequest(gate.tx, req.params.id);
      if (current.status !== 'submitted') throw new ApiError(409, 'not_pending', 'Only a submitted request can be decided');
      const [row] = await gate.tx
        .update(schema.insuranceRequests)
        .set({ status: 'rejected', approvedPaise: null, decidedAt: new Date(), decidedBy: gate.user.id, rejectReason: req.body.reason })
        .where(eq(schema.insuranceRequests.id, current.id))
        .returning();
      await gate.audit('insurance.request.reject', 'insurance_request', current.id, { status: current.status }, {
        status: 'rejected',
        reason: req.body.reason,
      });
      return { ...row!, payerName: current.payerName };
    }),
  );
}
