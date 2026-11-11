import { randomUUID } from 'node:crypto';
import { schema, type Tx } from '@hos/db';
import type { ClinicalCtx } from '@hos/shared';
import { sql } from 'drizzle-orm';
import { ApiError } from '../../http';

export type PharmacyCtx = ClinicalCtx<Tx>;

export type MoveType = 'grn' | 'supplier_return' | 'sale' | 'sale_return' | 'ip_issue' | 'ip_return' | 'adjustment';

export interface Allocation {
  batchId: string;
  batchNo: string;
  expiry: string;
  mrpPaise: number;
  qty: number;
}

type StockCandidate = Record<string, unknown> & {
  batch_id: string;
  batch_no: string;
  expiry: string;
  mrp_paise: number;
  qty: number;
};

/** Calendar date in Asia/Kolkata, YYYY-MM-DD. */
export function todayIst(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function istDay(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return todayIst(date);
}

/**
 * Change on-hand stock and append a signed move. The stock row is locked with FOR UPDATE.
 * A negative result is 409 insufficient_stock and the transaction rolls back.
 */
export async function applyStock(
  ctx: PharmacyCtx,
  input: {
    batchId: string;
    qtyDelta: number;
    moveType: MoveType;
    refType: string;
    refId: string;
    refLine?: string;
    reason?: string;
  },
): Promise<void> {
  if (!ctx.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
  if (!Number.isInteger(input.qtyDelta) || input.qtyDelta === 0) throw new ApiError(422, 'validation', 'Quantity must be a non-zero whole number');
  await ctx.tx.execute(sql`
    insert into pharmacy_stock (tenant_id, batch_id, location_id, qty)
    values (${ctx.tenantId}::uuid, ${input.batchId}::uuid, ${ctx.locationId}::uuid, 0)
    on conflict (tenant_id, batch_id, location_id) do nothing
  `);
  const locked = await ctx.tx.execute<{ id: string; qty: number }>(sql`
    select id, qty::int as qty
      from pharmacy_stock
     where batch_id = ${input.batchId}::uuid
       and location_id = ${ctx.locationId}::uuid
     for update
  `);
  const row = locked.rows[0];
  if (!row) throw new ApiError(409, 'insufficient_stock', 'Not enough stock for this item');
  const next = Number(row.qty) + input.qtyDelta;
  if (next < 0) throw new ApiError(409, 'insufficient_stock', 'Not enough stock for this item');
  await ctx.tx.execute(sql`update pharmacy_stock set qty = ${next} where id = ${row.id}::uuid`);
  await ctx.tx.insert(schema.pharmacyStockMoves).values({
    id: randomUUID(),
    tenantId: ctx.tenantId,
    batchId: input.batchId,
    locationId: ctx.locationId,
    qty: input.qtyDelta,
    moveType: input.moveType,
    refType: input.refType,
    refId: input.refId,
    refLine: input.refLine ?? '',
    reason: input.reason ?? '',
    createdBy: ctx.userId,
  });
}

/**
 * First-expiry-first allocation. Expired batches are never used.
 * When the only stock that could cover the request is expired, the error is 422 expired_batch.
 * Otherwise a shortfall is 409 insufficient_stock.
 * Candidate rows are locked in batch-id order so two sales cannot deadlock.
 */
export async function allocateFefo(ctx: PharmacyCtx, itemId: string, qty: number): Promise<Allocation[]> {
  if (!ctx.locationId) throw new ApiError(422, 'location_required', 'Choose a location');
  if (!Number.isInteger(qty) || qty <= 0) throw new ApiError(422, 'validation', 'Quantity must be a whole number greater than zero');
  const found = await ctx.tx.execute<StockCandidate>(sql`
    select b.id as batch_id, b.batch_no, b.expiry::text as expiry, b.mrp_paise, s.qty::int as qty
      from pharmacy_batches b
      join pharmacy_stock s on s.batch_id = b.id and s.location_id = ${ctx.locationId}::uuid
     where b.item_id = ${itemId}::uuid
       and s.qty > 0
     order by b.id
       for update of s
  `);
  const today = todayIst();
  const usable = found.rows
    .filter((row) => String(row.expiry) >= today)
    .sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)) || a.batch_id.localeCompare(b.batch_id));
  const expiredQty = found.rows.filter((row) => String(row.expiry) < today).reduce((sum, row) => sum + Number(row.qty), 0);
  const parts: Allocation[] = [];
  let need = qty;
  for (const row of usable) {
    if (need <= 0) break;
    const take = Math.min(need, Number(row.qty));
    if (take <= 0) continue;
    parts.push({
      batchId: row.batch_id,
      batchNo: row.batch_no,
      expiry: String(row.expiry).slice(0, 10),
      mrpPaise: Number(row.mrp_paise),
      qty: take,
    });
    need -= take;
  }
  if (need > 0) {
    const usableQty = usable.reduce((sum, row) => sum + Number(row.qty), 0);
    if (usableQty === 0 && expiredQty > 0) {
      throw new ApiError(422, 'expired_batch', 'Expired batches cannot be sold or issued');
    }
    throw new ApiError(409, 'insufficient_stock', 'Not enough stock for this item');
  }
  return parts;
}
