import { schema } from '@hos/db';
import {
  PHARMACY_REPORTS,
  pharmacyAdjustmentSchema,
  pharmacyGrnSchema,
  pharmacyIpIssueSchema,
  pharmacyIpReturnSchema,
  pharmacyItemPatchSchema,
  pharmacyItemSchema,
  pharmacyReportQuery,
  pharmacySaleReturnSchema,
  pharmacySaleSchema,
  pharmacySupplierPatchSchema,
  pharmacySupplierReturnSchema,
  pharmacySupplierSchema,
} from '@hos/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError, sendCommittedDownload, type CommittedDownload } from '../../http';
import { letterhead, renderHtml, renderPdf } from '../print';
import { pharmacyReport } from './reports';
import { saleInvoiceDoc } from './prints';
import {
  createItem,
  createSupplier,
  listInpatients,
  listIpIssues,
  listItems,
  listStock,
  listSuppliers,
  openPrescriptions,
  pharmacyFeatures,
  postAdjustment,
  postGrn,
  postIpIssue,
  postSale,
  postSupplierReturn,
  readSale,
  returnIpIssue,
  returnSale,
  updateItem,
  updateSupplier,
} from './service';

const MODULE = 'pharmacy';
const PREFIX = `/api/v1/tenant/m/${MODULE}`;

const searchQuery = z.object({ q: z.string().trim().max(80).optional() });
const idParams = z.object({ id: z.uuid() });

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

async function guard(gate: TenantGate): Promise<void> {
  await gate.requireModule(MODULE);
  gate.requirePermission('pharmacy.manage');
}

export function registerPharmacy(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  r.get(`${PREFIX}/items`, { schema: { querystring: searchQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      return listItems(ctx(gate), req.query.q);
    }),
  );

  r.post(`${PREFIX}/items`, { schema: { body: pharmacyItemSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const created = await createItem(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.patch(`${PREFIX}/items/:id`, { schema: { params: idParams, body: pharmacyItemPatchSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      return updateItem(ctx(gate), req.params.id, req.body);
    }),
  );

  r.get(`${PREFIX}/suppliers`, { schema: { querystring: searchQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      return listSuppliers(ctx(gate), req.query.q);
    }),
  );

  r.post(`${PREFIX}/suppliers`, { schema: { body: pharmacySupplierSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const created = await createSupplier(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.patch(`${PREFIX}/suppliers/:id`, { schema: { params: idParams, body: pharmacySupplierPatchSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      return updateSupplier(ctx(gate), req.params.id, req.body);
    }),
  );

  r.post(`${PREFIX}/grns`, { schema: { body: pharmacyGrnSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      await gate.requireFeature(pharmacyFeatures.materialReceipts);
      const created = await postGrn(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.post(`${PREFIX}/supplier-returns`, { schema: { body: pharmacySupplierReturnSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      await gate.requireFeature(pharmacyFeatures.materialReturns);
      const created = await postSupplierReturn(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.get(`${PREFIX}/stock`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      await gate.requireFeature(pharmacyFeatures.stockRegister);
      return listStock(ctx(gate));
    }),
  );

  r.get(`${PREFIX}/prescriptions/open`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      await gate.requireFeature(pharmacyFeatures.issueToOp);
      return openPrescriptions(ctx(gate));
    }),
  );

  r.post(`${PREFIX}/sales`, { schema: { body: pharmacySaleSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      await gate.requireFeature(req.body.kind === 'outside' ? pharmacyFeatures.outsideSales : pharmacyFeatures.issueToOp);
      const created = await postSale(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.get(`${PREFIX}/sales/:id`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      return readSale(ctx(gate), req.params.id);
    }),
  );

  r.post(`${PREFIX}/sales/:id/return`, { schema: { params: idParams, body: pharmacySaleReturnSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const sale = await readSale(ctx(gate), req.params.id);
      await gate.requireFeature(sale.kind === 'outside' ? pharmacyFeatures.outsideSales : pharmacyFeatures.issueToOp);
      const created = await returnSale(ctx(gate), req.params.id, req.body);
      reply.code(201);
      return created;
    }),
  );

  r.get(`${PREFIX}/sales/:id/print`, { schema: { params: idParams, querystring: z.object({ format: z.enum(['pdf', 'html']).optional() }) } }, async (req, reply) => {
    const file = await run(req, reply, async (gate): Promise<CommittedDownload> => {
      await guard(gate);
      const sale = await readSale(ctx(gate), req.params.id);
      let label = sale.walkinName || 'Cash buyer';
      if (sale.patientId) {
        const [patient] = await gate.tx.select({ fullName: schema.patients.fullName, uhid: schema.patients.uhid }).from(schema.patients).where(eq(schema.patients.id, sale.patientId));
        if (patient) label = `${patient.fullName} (${patient.uhid})`;
      }
      const doc = saleInvoiceDoc(sale, await letterhead(gate.tx, gate.locationId!), label);
      if (req.query.format === 'html') return { download: 'html', html: renderHtml(doc) };
      const pdf = await renderPdf(doc);
      return { download: 'pdf', bytes: Buffer.from(pdf), filename: `${sale.number}.pdf` };
    });
    return sendCommittedDownload(reply, file);
  });

  r.get(`${PREFIX}/inpatients`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      await gate.requireFeature(pharmacyFeatures.issueToIp);
      return listInpatients(ctx(gate));
    }),
  );

  r.get(`${PREFIX}/ip-issues`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      await gate.requireFeature(pharmacyFeatures.issueToIp);
      return listIpIssues(ctx(gate));
    }),
  );

  r.post(`${PREFIX}/ip-issues`, { schema: { body: pharmacyIpIssueSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      await gate.requireFeature(pharmacyFeatures.issueToIp);
      const created = await postIpIssue(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.post(`${PREFIX}/ip-issues/:id/return`, { schema: { params: idParams, body: pharmacyIpReturnSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      await gate.requireFeature(pharmacyFeatures.issueToIp);
      const created = await returnIpIssue(ctx(gate), req.params.id, req.body);
      reply.code(201);
      return created;
    }),
  );

  r.post(`${PREFIX}/adjustments`, { schema: { body: pharmacyAdjustmentSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      await gate.requireFeature(pharmacyFeatures.stockAdjustments);
      const created = await postAdjustment(ctx(gate), req.body);
      reply.code(201);
      return created;
    }),
  );

  r.get(`${PREFIX}/reports/:report`, { schema: { params: z.object({ report: z.enum(PHARMACY_REPORTS) }), querystring: pharmacyReportQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(MODULE);
      gate.requireAnyPermission(['pharmacy.manage', 'reports.view']);
      const feature = {
        'stock-register': pharmacyFeatures.stockRegister,
        receipts: pharmacyFeatures.receiptRegister,
        rejections: pharmacyFeatures.rejectionRegister,
        issues: pharmacyFeatures.issueRegister,
        'issue-returns': pharmacyFeatures.issueReturnRegister,
        adjustments: pharmacyFeatures.stockAdjustmentRegister,
        'ip-statement': pharmacyFeatures.ipStatement,
        expiry: pharmacyFeatures.expiry,
        purchases: pharmacyFeatures.purchaseRegister,
      }[req.params.report];
      await gate.requireFeature(feature);
      return pharmacyReport(ctx(gate), req.params.report, req.query);
    }),
  );
}
