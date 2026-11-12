import { schema } from '@hos/db';
import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError } from '../../http';

// Indents & Purchase, MVP demo slice (docs/specs/07-indents-purchase.md). Module key `indents-purchase`.
const MODULE = 'indents-purchase';
const PREFIX = `/api/v1/tenant/m/${MODULE}`;
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const idParams = z.object({ id: z.uuid() });
const createBody = z.object({
  department: z.string().trim().min(1).max(80),
  priority: z.enum(['routine', 'urgent']).default('routine'),
  requiredBy: ymd.optional(),
  lines: z
    .array(
      z.object({
        itemName: z.string().trim().min(1).max(120),
        unit: z.string().trim().min(1).max(20).default('nos'),
        qty: z.number().int().min(1).max(100000),
      }),
    )
    .min(1)
    .max(50),
});
const convertBody = z.object({
  supplierName: z.string().trim().min(1).max(120),
  expectedBy: ymd.optional(),
});

export interface IndentLineDto {
  id: string;
  lineNo: number;
  itemName: string;
  unit: string;
  qty: number;
}

export interface PurchaseOrderDto {
  id: string;
  number: string;
  supplierName: string;
  expectedBy: string | null;
  status: string;
}

export interface IndentDto {
  id: string;
  number: string;
  department: string;
  priority: string;
  requiredBy: string | null;
  status: string;
  approvedAt: string | null;
  createdAt: string;
  lines: IndentLineDto[];
  purchaseOrder: PurchaseOrderDto | null;
}

function ctx(gate: TenantGate) {
  if (!gate.locationId || !gate.actor.tenantId) throw new ApiError(422, 'location_required', 'Choose a location');
  return { tx: gate.tx, tenantId: gate.actor.tenantId, locationId: gate.locationId, audit: gate.audit };
}

function number(prefix: string): string {
  return `${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

/** Lines and purchase order for a set of indent headers, in two queries. */
async function withChildren(tx: TenantGate['tx'], rows: (typeof schema.indents.$inferSelect)[]): Promise<IndentDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const lines = await tx
    .select()
    .from(schema.indentLines)
    .where(inArray(schema.indentLines.indentId, ids))
    .orderBy(asc(schema.indentLines.lineNo));
  const pos = await tx.select().from(schema.purchaseOrders).where(inArray(schema.purchaseOrders.indentId, ids));
  return rows.map((r) => {
    const po = pos.find((p) => p.indentId === r.id);
    return {
      id: r.id,
      number: r.number,
      department: r.department,
      priority: r.priority,
      requiredBy: r.requiredBy ?? null,
      status: r.status,
      approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      lines: lines
        .filter((l) => l.indentId === r.id)
        .map((l) => ({ id: l.id, lineNo: l.lineNo, itemName: l.itemName, unit: l.unit, qty: l.qtyRequested })),
      purchaseOrder: po ? { id: po.id, number: po.number, supplierName: po.supplierName, expectedBy: po.expectedBy ?? null, status: po.status } : null,
    };
  });
}

export function registerIndents(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  const guard = async (gate: TenantGate) => {
    if (!gate.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
    await gate.requireModule(MODULE);
    gate.requirePermission('indents.manage');
  };

  const loadIndent = async (tx: TenantGate['tx'], id: string) => {
    const [row] = await tx.select().from(schema.indents).where(eq(schema.indents.id, id));
    if (!row) throw new ApiError(404, 'not_found', 'Indent not found');
    return row;
  };

  r.get(`${PREFIX}/indents`, {}, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const c = ctx(gate);
      const rows = await c.tx
        .select()
        .from(schema.indents)
        .where(eq(schema.indents.locationId, c.locationId))
        .orderBy(desc(schema.indents.createdAt))
        .limit(200);
      return withChildren(c.tx, rows);
    }),
  );

  r.post(`${PREFIX}/indents`, { schema: { body: createBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const c = ctx(gate);
      const body = req.body;
      const [row] = await c.tx
        .insert(schema.indents)
        .values({
          tenantId: c.tenantId,
          locationId: c.locationId,
          number: number('IND'),
          department: body.department,
          priority: body.priority,
          requiredBy: body.requiredBy ?? null,
        })
        .returning();
      await c.tx.insert(schema.indentLines).values(
        body.lines.map((line, i) => ({
          tenantId: c.tenantId,
          indentId: row!.id,
          lineNo: i + 1,
          itemName: line.itemName,
          unit: line.unit,
          qtyRequested: line.qty,
        })),
      );
      await c.audit('indents.indent.create', 'indent', row!.id, null, { number: row!.number, lines: body.lines.length });
      const [dto] = await withChildren(c.tx, [row!]);
      return dto;
    }),
  );

  r.get(`${PREFIX}/indents/:id`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const c = ctx(gate);
      const row = await loadIndent(c.tx, req.params.id);
      const [dto] = await withChildren(c.tx, [row]);
      return dto;
    }),
  );

  r.post(`${PREFIX}/indents/:id/approve`, { schema: { params: idParams } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const c = ctx(gate);
      const before = await loadIndent(c.tx, req.params.id);
      if (before.status !== 'draft') throw new ApiError(409, 'invalid_state', 'Only a draft indent can be approved');
      const [row] = await c.tx
        .update(schema.indents)
        .set({ status: 'approved', approvedAt: new Date() })
        .where(eq(schema.indents.id, before.id))
        .returning();
      await c.audit('indents.indent.approve', 'indent', before.id, { status: before.status }, { status: 'approved' });
      const [dto] = await withChildren(c.tx, [row!]);
      return dto;
    }),
  );

  r.post(`${PREFIX}/indents/:id/convert-to-po`, { schema: { params: idParams, body: convertBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const c = ctx(gate);
      const before = await loadIndent(c.tx, req.params.id);
      if (before.status !== 'approved') throw new ApiError(409, 'invalid_state', 'Only an approved indent can be turned into a purchase order');
      const [po] = await c.tx
        .insert(schema.purchaseOrders)
        .values({
          tenantId: c.tenantId,
          locationId: c.locationId,
          number: number('PO'),
          indentId: before.id,
          supplierName: req.body.supplierName,
          expectedBy: req.body.expectedBy ?? null,
        })
        .returning();
      await c.tx.update(schema.indents).set({ status: 'converted' }).where(eq(schema.indents.id, before.id));
      await c.audit('indents.po.create', 'purchase_order', po!.id, null, { number: po!.number, indentId: before.id });
      const row = await loadIndent(c.tx, before.id);
      const [dto] = await withChildren(c.tx, [row]);
      return dto;
    }),
  );

  r.get(`${PREFIX}/purchase-orders`, {}, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const c = ctx(gate);
      const rows = await c.tx
        .select()
        .from(schema.purchaseOrders)
        .where(and(eq(schema.purchaseOrders.locationId, c.locationId)))
        .orderBy(desc(schema.purchaseOrders.createdAt))
        .limit(200);
      return rows.map((p) => ({
        id: p.id,
        number: p.number,
        indentId: p.indentId,
        supplierName: p.supplierName,
        expectedBy: p.expectedBy ?? null,
        status: p.status,
      }));
    }),
  );
}
