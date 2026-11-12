import {
  CLINICAL_FEATURES,
  billCancelSchema,
  billListQuery,
  billRefundSchema,
  concessionSchema,
  createDepositSchema,
  createOpBillSchema,
  depositRefundSchema,
  hasPermission,
  reportRangeQuery,
  serviceCreateSchema,
  servicePatchSchema,
  settleSchema,
  tariffCreateSchema,
  tariffPatchSchema,
} from '@hos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError } from '../../http';
import { renderHtml, renderPdf } from '../print';
import { acceptDeposit, buildBill, cancelBill, concede, finalise, readBill, refund, refundDeposit, settle } from './engine';
import { createService, createTariff, listServiceMasters, patchService, patchTariff } from './masters';
import { billPrint } from './print-bill';
import { cashSummary, depositRegister, doctorSharing, listBills, listDeposits, listRefunds, outstanding, revenueReport, unbilled, visitStatistics } from './queries';

const MODULE = 'op-billing';
const PREFIX = `/api/v1/tenant/m/${MODULE}`;
const F = CLINICAL_FEATURES.opBilling;
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
  gate.requirePermission('billing.op.post');
}

function canApprove(gate: TenantGate): boolean {
  return hasPermission(gate.assignments, gate.locationId, 'billing.op.refund');
}

export function registerBilling(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);
  const id = z.object({ id: z.uuid() });

  r.get(`${PREFIX}/services`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      gate.requireAnyPermission(['billing.op.post', 'tenant.manage', 'accounts.manage']);
      return listServiceMasters(ctx(gate));
    }),
  );

  r.post(`${PREFIX}/services`, { schema: { body: serviceCreateSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      gate.requireAnyPermission(['tenant.manage', 'accounts.manage']);
      const created = await createService(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.patch(`${PREFIX}/services/:id`, { schema: { params: id, body: servicePatchSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      gate.requireAnyPermission(['tenant.manage', 'accounts.manage']);
      return patchService(ctx(gate), req.params.id, req.body);
    }),
  );

  r.post(`${PREFIX}/tariffs`, { schema: { body: tariffCreateSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      gate.requireAnyPermission(['tenant.manage', 'accounts.manage']);
      const created = await createTariff(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.patch(`${PREFIX}/tariffs/:id`, { schema: { params: id, body: tariffPatchSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      gate.requireAnyPermission(['tenant.manage', 'accounts.manage']);
      return patchTariff(ctx(gate), req.params.id, req.body);
    }),
  );

  r.get(`${PREFIX}/worklist`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.voucherPosting);
      return unbilled(ctx(gate));
    }),
  );

  r.get(`${PREFIX}/bills`, { schema: { querystring: billListQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.voucherPosting);
      return listBills(ctx(gate), req.query);
    }),
  );

  r.post(`${PREFIX}/bills`, { schema: { body: createOpBillSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      requireKey(req);
      await open(gate);
      await gate.requireFeature(F.voucherPosting);
      const created = await buildBill(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.get(`${PREFIX}/bills/:id`, { schema: { params: id } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.voucherPosting);
      return readBill(ctx(gate), req.params.id);
    }),
  );

  r.post(`${PREFIX}/bills/:id/finalise`, { schema: { params: id } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      requireKey(req);
      await open(gate);
      await gate.requireFeature(F.voucherPosting);
      return finalise(ctx(gate), req.params.id);
    }),
  );

  r.post(`${PREFIX}/bills/:id/cancel`, { schema: { params: id, body: billCancelSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      requireKey(req);
      await open(gate);
      await gate.requireFeature(F.voucherPosting);
      return cancelBill(ctx(gate), req.params.id, req.body.reason);
    }),
  );

  r.post(`${PREFIX}/bills/:id/settle`, { schema: { params: id, body: settleSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      requireKey(req);
      await open(gate);
      await gate.requireFeature(F.settlements);
      return settle(ctx(gate), req.params.id, req.body);
    }),
  );

  r.post(`${PREFIX}/bills/:id/concessions`, { schema: { params: id, body: concessionSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      requireKey(req);
      await open(gate);
      await gate.requireFeature(F.concessions);
      const created = await concede(ctx(gate), req.params.id, req.body, canApprove(gate));
      reply.code(201);
      return created;
    }),
  );

  r.post(`${PREFIX}/bills/:id/refund`, { schema: { params: id, body: billRefundSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      requireKey(req);
      await open(gate);
      await gate.requireFeature(F.opRefund);
      gate.requirePermission('billing.op.refund');
      const updated = await refund(ctx(gate), req.params.id, req.body);
      reply.code(201);
      return updated;
    }),
  );

  r.get(`${PREFIX}/bills/:id/print`, { schema: { params: id, querystring: z.object({ format: z.enum(['pdf', 'html']).default('pdf') }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.voucherDocument);
      const doc = await billPrint(ctx(gate), req.params.id);
      if (req.query.format === 'html') return reply.type('text/html; charset=utf-8').send(renderHtml(doc));
      const pdf = await renderPdf(doc);
      return reply.type('application/pdf').header('content-disposition', 'inline; filename="op-bill.pdf"').send(Buffer.from(pdf));
    }),
  );

  r.get(`${PREFIX}/deposits`, { schema: { querystring: z.object({ patientId: z.uuid().optional() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.acceptDeposit);
      return listDeposits(ctx(gate), req.query.patientId);
    }),
  );

  r.post(`${PREFIX}/deposits`, { schema: { body: createDepositSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      requireKey(req);
      await open(gate);
      await gate.requireFeature(F.acceptDeposit);
      const created = await acceptDeposit(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.post(`${PREFIX}/deposits/:id/refund`, { schema: { params: id, body: depositRefundSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      requireKey(req);
      await open(gate);
      await gate.requireFeature(F.refundDeposit);
      gate.requirePermission('billing.op.refund');
      const updated = await refundDeposit(ctx(gate), req.params.id, req.body);
      reply.code(201);
      return updated;
    }),
  );

  r.get(`${PREFIX}/refunds`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await open(gate);
      await gate.requireFeature(F.opRefund);
      return listRefunds(ctx(gate));
    }),
  );

  r.get(`${PREFIX}/reports/cash`, { schema: { querystring: reportRangeQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(F.cashSummary);
      gate.requireAnyPermission(['billing.op.post', 'reports.view']);
      return cashSummary(ctx(gate), req.query.from, req.query.to);
    }),
  );

  r.get(`${PREFIX}/reports/revenue`, { schema: { querystring: reportRangeQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(F.revenueSummary);
      gate.requireAnyPermission(['billing.op.post', 'reports.view']);
      return revenueReport(ctx(gate), req.query.from, req.query.to);
    }),
  );

  r.get(`${PREFIX}/reports/doctor-sharing`, { schema: { querystring: reportRangeQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(F.doctorSharing);
      gate.requireAnyPermission(['billing.op.post', 'reports.view', 'accounts.manage']);
      return doctorSharing(ctx(gate), req.query.from, req.query.to);
    }),
  );

  r.get(`${PREFIX}/reports/outstanding`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(F.patientOutstanding);
      gate.requireAnyPermission(['billing.op.post', 'reports.view']);
      return outstanding(ctx(gate));
    }),
  );

  r.get(`${PREFIX}/reports/deposits`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(F.depositRegister);
      gate.requireAnyPermission(['billing.op.post', 'reports.view']);
      return depositRegister(ctx(gate));
    }),
  );

  r.get(`${PREFIX}/reports/visit-statistics`, { schema: { querystring: reportRangeQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      await gate.requireFeature(F.visitStatistics);
      gate.requireAnyPermission(['billing.op.post', 'reports.view']);
      return visitStatistics(ctx(gate), req.query.from, req.query.to);
    }),
  );
}
