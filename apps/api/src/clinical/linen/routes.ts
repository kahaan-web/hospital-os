import { schema } from '@hos/db';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError } from '../../http';

// Linen & Laundry, MVP demo slice (docs/specs/10-linen-laundry.md). Module key `linen-laundry`.
const MODULE = 'linen-laundry';
const PREFIX = `/api/v1/tenant/m/${MODULE}`;

const idParams = z.object({ id: z.uuid() });
const stockBody = z.object({
  name: z.string().trim().min(1).max(120),
  cleanQty: z.number().int().min(0).max(100000).default(0),
});
const sendBody = z.object({
  linenItemId: z.uuid(),
  qtySent: z.number().int().min(1).max(100000),
  vendor: z.string().trim().min(1).max(120).default('In-house laundry'),
});
const receiveBody = z.object({
  qtyReceived: z.number().int().min(0).max(100000),
});

export interface LinenItemDto {
  id: string;
  name: string;
  cleanQty: number;
  inLaundryQty: number;
}

export interface LaundryBatchDto {
  id: string;
  number: string;
  linenItemId: string;
  itemName: string;
  vendor: string;
  qtySent: number;
  qtyReceived: number | null;
  qtyMissing: number;
  status: string;
  sentAt: string;
}

function ctx(gate: TenantGate) {
  if (!gate.locationId || !gate.actor.tenantId) throw new ApiError(422, 'location_required', 'Choose a location');
  return { tx: gate.tx, tenantId: gate.actor.tenantId, locationId: gate.locationId, audit: gate.audit };
}

function number(prefix: string): string {
  return `${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

function itemDto(row: typeof schema.linenItems.$inferSelect): LinenItemDto {
  return { id: row.id, name: row.name, cleanQty: row.cleanQty, inLaundryQty: row.inLaundryQty };
}

export function registerLinen(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  const guard = async (gate: TenantGate) => {
    if (!gate.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
    await gate.requireModule(MODULE);
    gate.requirePermission('linen.manage');
  };

  r.get(`${PREFIX}/stock`, {}, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const c = ctx(gate);
      const rows = await c.tx
        .select()
        .from(schema.linenItems)
        .where(eq(schema.linenItems.locationId, c.locationId))
        .orderBy(schema.linenItems.name);
      return rows.map(itemDto);
    }),
  );

  r.post(`${PREFIX}/stock`, { schema: { body: stockBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const c = ctx(gate);
      const [row] = await c.tx
        .insert(schema.linenItems)
        .values({ tenantId: c.tenantId, locationId: c.locationId, name: req.body.name, cleanQty: req.body.cleanQty })
        .returning();
      await c.audit('linen.item.create', 'linen_item', row!.id, null, { name: row!.name, cleanQty: row!.cleanQty });
      return itemDto(row!);
    }),
  );

  r.get(`${PREFIX}/laundry-batches`, {}, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const c = ctx(gate);
      const rows = await c.tx
        .select({ batch: schema.laundryBatches, itemName: schema.linenItems.name })
        .from(schema.laundryBatches)
        .innerJoin(schema.linenItems, eq(schema.linenItems.id, schema.laundryBatches.linenItemId))
        .where(eq(schema.laundryBatches.locationId, c.locationId))
        .orderBy(desc(schema.laundryBatches.sentAt))
        .limit(200);
      return rows.map(
        ({ batch, itemName }): LaundryBatchDto => ({
          id: batch.id,
          number: batch.number,
          linenItemId: batch.linenItemId,
          itemName,
          vendor: batch.vendor,
          qtySent: batch.qtySent,
          qtyReceived: batch.qtyReceived,
          qtyMissing: batch.qtyMissing,
          status: batch.status,
          sentAt: batch.sentAt.toISOString(),
        }),
      );
    }),
  );

  // Send clean linen to the laundry: clean stock moves to "in laundry". Refuses to go negative.
  r.post(`${PREFIX}/laundry-batches`, { schema: { body: sendBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const c = ctx(gate);
      const { linenItemId, qtySent, vendor } = req.body;
      const [moved] = await c.tx
        .update(schema.linenItems)
        .set({
          cleanQty: sql`${schema.linenItems.cleanQty} - ${qtySent}`,
          inLaundryQty: sql`${schema.linenItems.inLaundryQty} + ${qtySent}`,
        })
        .where(and(eq(schema.linenItems.id, linenItemId), eq(schema.linenItems.locationId, c.locationId), sql`${schema.linenItems.cleanQty} >= ${qtySent}`))
        .returning();
      if (!moved) throw new ApiError(422, 'insufficient_stock', 'Not enough clean linen of that item to send');
      const [batch] = await c.tx
        .insert(schema.laundryBatches)
        .values({ tenantId: c.tenantId, locationId: c.locationId, number: number('LB'), linenItemId, vendor, qtySent })
        .returning();
      await c.audit('linen.laundry.send', 'laundry_batch', batch!.id, null, { number: batch!.number, qtySent });
      return { id: batch!.id, number: batch!.number, itemName: moved.name, cleanQty: moved.cleanQty, inLaundryQty: moved.inLaundryQty };
    }),
  );

  // Receive back: returned clean linen goes back to stock, and any shortfall is recorded as missing.
  r.post(`${PREFIX}/laundry-batches/:id/receive`, { schema: { params: idParams, body: receiveBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guard(gate);
      const c = ctx(gate);
      const [batch] = await c.tx.select().from(schema.laundryBatches).where(eq(schema.laundryBatches.id, req.params.id));
      if (!batch) throw new ApiError(404, 'not_found', 'Laundry batch not found');
      if (batch.status !== 'sent') throw new ApiError(409, 'invalid_state', 'This batch has already been received');
      const received = req.body.qtyReceived;
      if (received > batch.qtySent) throw new ApiError(422, 'over_receipt', 'Received quantity cannot exceed the quantity sent');
      await c.tx
        .update(schema.linenItems)
        .set({
          inLaundryQty: sql`${schema.linenItems.inLaundryQty} - ${batch.qtySent}`,
          cleanQty: sql`${schema.linenItems.cleanQty} + ${received}`,
        })
        .where(eq(schema.linenItems.id, batch.linenItemId));
      const [done] = await c.tx
        .update(schema.laundryBatches)
        .set({ status: 'received', qtyReceived: received, qtyMissing: batch.qtySent - received, receivedAt: new Date() })
        .where(eq(schema.laundryBatches.id, batch.id))
        .returning();
      await c.audit('linen.laundry.receive', 'laundry_batch', batch.id, { status: 'sent' }, { status: 'received', qtyReceived: received, qtyMissing: done!.qtyMissing });
      return { id: done!.id, status: done!.status, qtyReceived: done!.qtyReceived, qtyMissing: done!.qtyMissing };
    }),
  );
}
