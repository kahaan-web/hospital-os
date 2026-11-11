import {
  CLINICAL_FEATURES,
  billListQuery,
  concessionSchema,
  createDepositSchema,
  createIpBillSchema,
  depositRefundSchema,
  encounterPayerSchema,
  hasPermission,
  manualChargeSchema,
  payerCreateSchema,
  payerPatchSchema,
  reportRangeQuery,
  settleSchema,
  splitIpBillSchema,
} from '@hos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError } from '../../http';
import {
  acceptDeposit,
  buildIpBill,
  concede,
  createPayer,
  finalise,
  getEncounterPayer,
  ipBillRegister,
  listPayers,
  listReceivables,
  patchPayer,
  postManualCharge,
  readBill,
  refundDeposit,
  reverseCharge,
  runningBalances,
  settle,
  splitBill,
  statement,
  upsertEncounterPayer,
} from './engine';
import { cashSummary, concessionRegister, depositRegister, doctorSharing, outstanding, revenueReport } from './queries';

const MODULE = 'ip-billing';
const PREFIX = `/api/v1/tenant/m/${MODULE}`;
const F = CLINICAL_FEATURES.ipBilling;
const KEY = /^[A-Za-z0-9_-]{8,128}$/;

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

function requireKey(req: FastifyRequest): void {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || !KEY.test(key)) {
    throw new ApiError(400, 'idempotency_key_required', 'Send an Idempotency-Key header (8–128 letters, numbers, _ or -)');
  }
}

async function open(gate: TenantGate): Promise<void> {
  await gate.requireModule(MODULE);
  gate.requirePermission('billing.ip.manage');
}

function canApprove(gate: TenantGate): boolean {
  return hasPermission(gate.assignments, gate.locationId, 'billing.op.refund');
}

export function registerIpbilling(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);
  const id = z.object({ id: z.uuid() });
  const enc = z.object({ encounterId: z.uuid() });

  r.get(`${PREFIX}/running`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      return runningBalances(ctx(gate));
    }),
  );

  r.post(`${PREFIX}/encounters/:encounterId/charges`, { schema: { params: enc, body: manualChargeSchema } }, async (req, reply) => {
    requireKey(req);
    return run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.postingCharges);
      const created = await postManualCharge(ctx(gate), req.params.encounterId, req.body);
      reply.code(201);
      return created;
    });
  });

  r.post(`${PREFIX}/charges/:id/reverse`, { schema: { params: id, body: z.object({ reason: z.string().trim().min(3).max(200) }) } }, async (req, reply) => {
    requireKey(req);
    return run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.postingReversals);
      return reverseCharge(ctx(gate), req.params.id, req.body.reason);
    });
  });

  r.get(`${PREFIX}/encounters/:encounterId/statement`, { schema: { params: enc } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.statement);
      return statement(ctx(gate), req.params.encounterId);
    }),
  );

  r.post(`${PREFIX}/encounters/:encounterId/bills`, { schema: { params: enc, body: createIpBillSchema } }, async (req, reply) => {
    requireKey(req);
    return run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.billPreparation);
      const created = await buildIpBill(ctx(gate), req.params.encounterId, req.body);
      reply.code(201);
      return created;
    });
  });

  r.get(`${PREFIX}/bills`, { schema: { querystring: billListQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.billPreparation);
      const { listBills } = await import('../billing/queries');
      const page = await listBills(ctx(gate), req.query);
      return { ...page, items: page.items.filter((b) => b.kind === 'ip') };
    }),
  );

  r.get(`${PREFIX}/bills/:id`, { schema: { params: id } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.billPreparation);
      const bill = await readBill(ctx(gate), req.params.id);
      if (bill.kind !== 'ip') throw new ApiError(404, 'not_found', 'Bill not found');
      return bill;
    }),
  );

  r.post(`${PREFIX}/bills/:id/finalise`, { schema: { params: id } }, async (req, reply) => {
    requireKey(req);
    return run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.billPreparation);
      const bill = await readBill(ctx(gate), req.params.id);
      if (bill.kind !== 'ip') throw new ApiError(404, 'not_found', 'Bill not found');
      return finalise(ctx(gate), req.params.id);
    });
  });

  r.post(`${PREFIX}/bills/:id/split`, { schema: { params: id, body: splitIpBillSchema } }, async (req, reply) => {
    requireKey(req);
    return run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.billSettlement);
      return splitBill(ctx(gate), req.params.id, req.body);
    });
  });

  r.get(`${PREFIX}/bills/:id/receivables`, { schema: { params: id } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.billSettlement);
      return listReceivables(ctx(gate), req.params.id);
    }),
  );

  r.post(`${PREFIX}/bills/:id/settle`, { schema: { params: id, body: settleSchema } }, async (req, reply) => {
    requireKey(req);
    return run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.billSettlement);
      return settle(ctx(gate), req.params.id, req.body);
    });
  });

  r.post(`${PREFIX}/bills/:id/concessions`, { schema: { params: id, body: concessionSchema } }, async (req, reply) => {
    requireKey(req);
    return run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.concessions);
      const created = await concede(ctx(gate), req.params.id, req.body, canApprove(gate));
      reply.code(201);
      return created;
    });
  });

  r.get(`${PREFIX}/deposits`, { schema: { querystring: z.object({ patientId: z.uuid().optional(), encounterId: z.uuid().optional() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.acceptDeposit);
      const { listDeposits } = await import('../billing/queries');
      return listDeposits(ctx(gate), req.query.patientId);
    }),
  );

  r.post(`${PREFIX}/deposits`, { schema: { body: createDepositSchema } }, async (req, reply) => {
    requireKey(req);
    return run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.acceptDeposit);
      const created = await acceptDeposit(ctx(gate), req.body);
      reply.code(201);
      return created;
    });
  });

  r.post(`${PREFIX}/deposits/:id/refund`, { schema: { params: id, body: depositRefundSchema } }, async (req, reply) => {
    requireKey(req);
    return run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.refundDeposit);
      gate.requirePermission('billing.op.refund');
      const updated = await refundDeposit(ctx(gate), req.params.id, req.body);
      reply.code(201);
      return updated;
    });
  });

  r.get(`${PREFIX}/payers`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      return listPayers(ctx(gate));
    }),
  );

  r.post(`${PREFIX}/payers`, { schema: { body: payerCreateSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      const created = await createPayer(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.patch(`${PREFIX}/payers/:id`, { schema: { params: id, body: payerPatchSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      return patchPayer(ctx(gate), req.params.id, req.body);
    }),
  );

  r.get(`${PREFIX}/encounters/:encounterId/payer`, { schema: { params: enc } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      const row = await getEncounterPayer(ctx(gate), req.params.encounterId);
      if (!row) throw new ApiError(404, 'not_found', 'No payer on this visit');
      return row;
    }),
  );

  r.put(`${PREFIX}/encounters/:encounterId/payer`, { schema: { params: enc, body: encounterPayerSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      return upsertEncounterPayer(ctx(gate), req.params.encounterId, req.body);
    }),
  );

  r.get(`${PREFIX}/reports/bill-register`, { schema: { querystring: reportRangeQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(F.billRegister);
      gate.requireAnyPermission(['billing.ip.manage', 'reports.view']);
      return ipBillRegister(ctx(gate), req.query.from, req.query.to);
    }),
  );

  r.get(`${PREFIX}/reports/cash`, { schema: { querystring: reportRangeQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(F.cashSummary);
      gate.requireAnyPermission(['billing.ip.manage', 'reports.view']);
      return cashSummary(ctx(gate), req.query.from, req.query.to);
    }),
  );

  r.get(`${PREFIX}/reports/revenue`, { schema: { querystring: reportRangeQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(F.revenueSummary);
      gate.requireAnyPermission(['billing.ip.manage', 'reports.view']);
      return revenueReport(ctx(gate), req.query.from, req.query.to);
    }),
  );

  r.get(`${PREFIX}/reports/doctor-sharing`, { schema: { querystring: reportRangeQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(F.doctorSharing);
      gate.requireAnyPermission(['billing.ip.manage', 'reports.view', 'accounts.manage']);
      return doctorSharing(ctx(gate), req.query.from, req.query.to);
    }),
  );

  r.get(`${PREFIX}/reports/outstanding`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(F.patientOutstanding);
      gate.requireAnyPermission(['billing.ip.manage', 'reports.view']);
      return outstanding(ctx(gate));
    }),
  );

  r.get(`${PREFIX}/reports/deposits`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(F.depositRegister);
      gate.requireAnyPermission(['billing.ip.manage', 'reports.view']);
      return depositRegister(ctx(gate));
    }),
  );

  r.get(`${PREFIX}/reports/concessions`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(F.concessionRegister);
      gate.requireAnyPermission(['billing.ip.manage', 'reports.view']);
      return concessionRegister(ctx(gate));
    }),
  );
}
