import { schema, type Tx } from '@hos/db';
import type { ChargeCapture, ChargeDto, ChargeInput, ChargeSource, ClinicalCtx, GstTreatment, PriceLookup } from '@hos/shared';
import { and, desc, eq, isNull, lte } from 'drizzle-orm';
import { ApiError } from '../http';

function day(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function chargeDto(row: typeof schema.charges.$inferSelect): ChargeDto {
  return {
    id: row.id,
    locationId: row.locationId,
    encounterId: row.encounterId,
    patientId: row.patientId,
    serviceId: row.serviceId,
    description: row.description,
    qty: Number(row.qty),
    unitPricePaise: row.unitPricePaise,
    amountPaise: row.amountPaise,
    discountPaise: row.discountPaise,
    gstTreatment: row.gstTreatment as GstTreatment,
    gstRateBp: row.gstRateBp,
    hsnSac: row.hsnSac,
    serviceDate: day(row.serviceDate),
    performingDoctorId: row.performingDoctorId,
    referringDoctorId: row.referringDoctorId,
    sourceModule: row.sourceModule as ChargeDto['sourceModule'],
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceLine: row.sourceLine,
    status: row.status as ChargeDto['status'],
    billId: row.billId,
    reversalOfId: row.reversalOfId,
    postedBy: row.postedBy,
    createdAt: iso(row.createdAt)!,
  };
}

async function findActive(ctx: ClinicalCtx<Tx>, source: ChargeSource, line: string) {
  const [row] = await ctx.tx
    .select()
    .from(schema.charges)
    .where(and(eq(schema.charges.sourceType, source.type), eq(schema.charges.sourceId, source.id), eq(schema.charges.sourceLine, line), isNull(schema.charges.reversalOfId)));
  return row ?? null;
}

export const charges: ChargeCapture<Tx> = {
  async post(ctx, input: ChargeInput) {
    const line = input.source.line ?? '';
    const existing = await findActive(ctx, input.source, line);
    if (existing) return chargeDto(existing);
    if (!ctx.locationId) throw new ApiError(422, 'location_required', 'Choose a location before posting a charge');
    const qty = input.qty;
    const discount = input.discountPaise ?? 0;
    const amount = Math.round(qty * input.unitPricePaise);
    if (qty <= 0 || amount < 0 || discount < 0 || discount > amount) throw new ApiError(422, 'validation', 'Check the quantity and price');
    const [row] = await ctx.tx
      .insert(schema.charges)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        encounterId: input.encounterId,
        patientId: input.patientId,
        serviceId: input.serviceId,
        description: input.description,
        qty,
        unitPricePaise: input.unitPricePaise,
        amountPaise: amount,
        discountPaise: discount,
        gstTreatment: input.gstTreatment,
        gstRateBp: input.gstRateBp,
        hsnSac: input.hsnSac,
        serviceDate: input.serviceDate,
        performingDoctorId: input.performingDoctorId ?? null,
        referringDoctorId: input.referringDoctorId ?? null,
        sourceModule: input.source.module,
        sourceType: input.source.type,
        sourceId: input.source.id,
        sourceLine: line,
        status: 'unbilled',
        postedBy: ctx.userId,
      })
      .returning();
    await ctx.audit('clinical.charge.post', 'charge', row!.id, null, { source: input.source, amountPaise: amount });
    return chargeDto(row!);
  },

  async reverse(ctx, chargeId, reason) {
    const [row] = await ctx.tx.select().from(schema.charges).where(eq(schema.charges.id, chargeId));
    if (!row) throw new ApiError(404, 'not_found', 'Charge not found');
    if (row.status === 'billed' || row.billId) throw new ApiError(409, 'on_final_bill', 'That charge is already on a bill');
    if (row.status === 'reversed') return chargeDto(row);
    const [updated] = await ctx.tx
      .update(schema.charges)
      .set({ status: 'reversed' })
      .where(eq(schema.charges.id, chargeId))
      .returning();
    await ctx.audit('clinical.charge.reverse', 'charge', chargeId, { status: row.status }, { status: 'reversed', reason });
    return chargeDto(updated!);
  },

  async reverseBySource(ctx, source, reason) {
    const filters = [eq(schema.charges.sourceType, source.type), eq(schema.charges.sourceId, source.id), isNull(schema.charges.reversalOfId)];
    if (source.line != null) filters.push(eq(schema.charges.sourceLine, source.line));
    const rows = await ctx.tx.select().from(schema.charges).where(and(...filters));
    const out: ChargeDto[] = [];
    for (const row of rows) {
      if (row.status === 'reversed') {
        out.push(chargeDto(row));
        continue;
      }
      out.push(await charges.reverse(ctx, row.id, reason));
    }
    return out;
  },

  async listUnbilled(ctx, encounterId) {
    const rows = await ctx.tx
      .select()
      .from(schema.charges)
      .where(and(eq(schema.charges.encounterId, encounterId), eq(schema.charges.status, 'unbilled')));
    return rows.map(chargeDto);
  },

  async markBilled(ctx, chargeIds, billId) {
    if (chargeIds.length === 0) return;
    for (const id of chargeIds) {
      const [row] = await ctx.tx.select().from(schema.charges).where(eq(schema.charges.id, id));
      if (!row) throw new ApiError(404, 'not_found', 'Charge not found');
      if (row.status === 'reversed') throw new ApiError(409, 'conflict', 'A reversed charge cannot be billed');
      await ctx.tx
        .update(schema.charges)
        .set({ status: billId ? 'billed' : 'unbilled', billId })
        .where(eq(schema.charges.id, id));
    }
    await ctx.audit('clinical.charge.mark_billed', 'charge', chargeIds[0] ?? null, null, { chargeIds, billId });
  },
};

export const prices: PriceLookup<Tx> = {
  async priceFor(ctx, q) {
    const [service] = await ctx.tx.select().from(schema.services).where(eq(schema.services.id, q.serviceId));
    if (!service || !service.active) throw new ApiError(422, 'tariff_missing', 'That service is not available');
    const on = q.on ?? new Date().toISOString().slice(0, 10);
    const payer = q.payerClass ?? 'general';
    const rows = await ctx.tx
      .select()
      .from(schema.tariffs)
      .where(and(eq(schema.tariffs.serviceId, q.serviceId), lte(schema.tariffs.effectiveFrom, on)))
      .orderBy(desc(schema.tariffs.effectiveFrom));
    let best: { score: number; price: number } | null = null;
    for (const row of rows) {
      if (row.locationId && row.locationId !== ctx.locationId) continue;
      if (row.wardClass && q.wardClass && row.wardClass !== q.wardClass) continue;
      if (row.wardClass && !q.wardClass) continue;
      if (row.payerClass !== payer && row.payerClass !== 'general') continue;
      let score = 0;
      if (row.locationId) score += 4;
      if (row.wardClass) score += 2;
      if (row.payerClass === payer) score += 1;
      if (!best || score > best.score) best = { score, price: row.pricePaise };
    }
    if (!best) throw new ApiError(422, 'tariff_missing', 'No tariff covers this service');
    return {
      unitPricePaise: best.price,
      gstTreatment: service.gstTreatment as GstTreatment,
      gstRateBp: service.gstRateBp,
      hsnSac: service.hsnSac,
    };
  },
};
