// MVP demo slice: Doctors Accounting share rules and payout statements (docs/specs/06-doctors-accounting.md).
// Payments are record-only; no real payout. The sharing basis is OPEN with the client, so no engine runs here.
import { schema } from '@hos/db';
import { asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError } from '../../http';

const MODULE = 'doctor-accounting';
export const DOCTOR_ACCOUNTING_PREFIX = `/api/v1/tenant/m/${MODULE}`;

const idParams = z.object({ id: z.uuid() });
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ruleBody = z
  .object({
    doctorId: z.uuid(),
    serviceCategory: z.string().trim().min(1).max(60).default('all'),
    encounterType: z.enum(['op', 'ip', 'any']).default('any'),
    shareType: z.enum(['pct_net', 'pct_gross', 'fixed_per_unit']).default('pct_net'),
    shareValue: z.number().int().min(0).max(100_000_00),
    effectiveFrom: dateStr.optional(),
  })
  .refine((v) => v.shareType === 'fixed_per_unit' || v.shareValue <= 100, { message: 'A percentage share cannot exceed 100', path: ['shareValue'] });
const payoutBody = z
  .object({
    doctorId: z.uuid(),
    periodFrom: dateStr,
    periodTo: dateStr,
    grossPaise: z.number().int().min(0).max(100_000_000_00),
    sharePaise: z.number().int().min(0).max(100_000_000_00),
  })
  .refine((v) => v.periodTo >= v.periodFrom, { message: 'The period must end on or after it starts', path: ['periodTo'] })
  .refine((v) => v.sharePaise <= v.grossPaise, { message: 'The share cannot exceed the gross amount', path: ['sharePaise'] });
const payoutQuery = z.object({ doctorId: z.uuid().optional() });
const payBody = z.object({
  mode: z.enum(['bank_transfer', 'upi', 'cheque', 'cash']),
  reference: z.string().trim().max(80).default(''),
  paidOn: dateStr.optional(),
});

type Tx = TenantGate['tx'];

function tenantOf(gate: TenantGate): string {
  if (!gate.actor.tenantId) throw new ApiError(422, 'tenant_required', 'No hospital in this session');
  return gate.actor.tenantId;
}

async function requireDoctor(tx: Tx, doctorId: string) {
  const [doc] = await tx.select({ id: schema.doctors.id, name: schema.doctors.name }).from(schema.doctors).where(eq(schema.doctors.id, doctorId));
  if (!doc) throw new ApiError(422, 'doctor_invalid', 'Choose a doctor from this hospital');
  return doc;
}

async function loadPayout(tx: Tx, id: string) {
  const [row] = await tx
    .select({ payout: schema.doctorPayouts, doctorName: schema.doctors.name })
    .from(schema.doctorPayouts)
    .innerJoin(schema.doctors, eq(schema.doctors.id, schema.doctorPayouts.doctorId))
    .where(eq(schema.doctorPayouts.id, id));
  if (!row) throw new ApiError(404, 'not_found', 'Payout not found');
  return { ...row.payout, doctorName: row.doctorName };
}

export function registerDoctorAccounting(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);
  const guard = async (gate: TenantGate) => {
    await gate.requireModule(MODULE);
    gate.requirePermission('accounts.manage');
  };

  r.get(`${DOCTOR_ACCOUNTING_PREFIX}/doctors`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      return gate.tx
        .select({ id: schema.doctors.id, name: schema.doctors.name })
        .from(schema.doctors)
        .orderBy(asc(schema.doctors.name));
    }),
  );

  r.get(`${DOCTOR_ACCOUNTING_PREFIX}/rules`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const rows = await gate.tx
        .select({ rule: schema.doctorShareRules, doctorName: schema.doctors.name })
        .from(schema.doctorShareRules)
        .innerJoin(schema.doctors, eq(schema.doctors.id, schema.doctorShareRules.doctorId))
        .orderBy(asc(schema.doctors.name), desc(schema.doctorShareRules.effectiveFrom));
      return rows.map((row) => ({ ...row.rule, doctorName: row.doctorName }));
    }),
  );

  r.post(`${DOCTOR_ACCOUNTING_PREFIX}/rules`, { schema: { body: ruleBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const tenantId = tenantOf(gate);
      const doc = await requireDoctor(gate.tx, req.body.doctorId);
      const [row] = await gate.tx
        .insert(schema.doctorShareRules)
        .values({ tenantId, ...req.body, effectiveFrom: req.body.effectiveFrom })
        .returning();
      await gate.audit('doctor_accounting.rule.create', 'doctor_share_rule', row!.id, null, {
        doctorId: row!.doctorId,
        shareType: row!.shareType,
        shareValue: row!.shareValue,
      });
      return { ...row!, doctorName: doc.name };
    }),
  );

  r.get(`${DOCTOR_ACCOUNTING_PREFIX}/payouts`, { schema: { querystring: payoutQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const rows = await gate.tx
        .select({ payout: schema.doctorPayouts, doctorName: schema.doctors.name })
        .from(schema.doctorPayouts)
        .innerJoin(schema.doctors, eq(schema.doctors.id, schema.doctorPayouts.doctorId))
        .where(req.query.doctorId ? eq(schema.doctorPayouts.doctorId, req.query.doctorId) : undefined)
        .orderBy(desc(schema.doctorPayouts.periodFrom))
        .limit(200);
      return rows.map((row) => ({ ...row.payout, doctorName: row.doctorName }));
    }),
  );

  r.post(`${DOCTOR_ACCOUNTING_PREFIX}/payouts`, { schema: { body: payoutBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const tenantId = tenantOf(gate);
      const doc = await requireDoctor(gate.tx, req.body.doctorId);
      const [row] = await gate.tx.insert(schema.doctorPayouts).values({ tenantId, ...req.body, status: 'pending' }).returning();
      await gate.audit('doctor_accounting.payout.create', 'doctor_payout', row!.id, null, {
        doctorId: row!.doctorId,
        sharePaise: row!.sharePaise,
        periodFrom: row!.periodFrom,
        periodTo: row!.periodTo,
      });
      return { ...row!, doctorName: doc.name };
    }),
  );

  r.get(`${DOCTOR_ACCOUNTING_PREFIX}/payouts/:id`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      return loadPayout(gate.tx, req.params.id);
    }),
  );

  r.post(`${DOCTOR_ACCOUNTING_PREFIX}/payouts/:id/pay`, { schema: { params: idParams, body: payBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const current = await loadPayout(gate.tx, req.params.id);
      if (current.status === 'paid') throw new ApiError(409, 'already_paid', 'This payout is already marked paid');
      const paidOn = req.body.paidOn ?? new Date().toISOString().slice(0, 10);
      const [row] = await gate.tx
        .update(schema.doctorPayouts)
        .set({ status: 'paid', paidOn, payMode: req.body.mode, payRef: req.body.reference, paidBy: gate.user.id })
        .where(eq(schema.doctorPayouts.id, current.id))
        .returning();
      await gate.audit('doctor_accounting.payout.pay', 'doctor_payout', current.id, { status: current.status }, {
        status: 'paid',
        mode: req.body.mode,
        sharePaise: current.sharePaise,
      });
      return { ...row!, doctorName: current.doctorName };
    }),
  );
}
