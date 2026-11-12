import { schema, type Tx } from '@hos/db';
import type { CashEntryDto, CashEntryInput, CashLedger, ClinicalCtx, DocSeriesKey, PaymentMode } from '@hos/shared';
import { eq, sql } from 'drizzle-orm';
import { ApiError } from '../http';
import { billingDefiner } from './billing/definers';
import { numbering } from './numbering';

const SERIES: Record<CashEntryInput['entryType'], DocSeriesKey> = {
  receipt: 'receipt',
  refund: 'refund',
  deposit: 'deposit',
  deposit_refund: 'refund',
  deposit_adjust: 'deposit',
};

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDto(row: typeof schema.cashLedger.$inferSelect): CashEntryDto {
  return {
    id: row.id,
    locationId: row.locationId,
    counterCode: row.counterCode,
    entryType: row.entryType as CashEntryDto['entryType'],
    direction: row.direction as CashEntryDto['direction'],
    mode: row.mode as PaymentMode,
    amountPaise: row.amountPaise,
    number: row.number,
    patientId: row.patientId,
    encounterId: row.encounterId,
    refType: row.refType as CashEntryDto['refType'],
    refId: row.refId,
    instrumentRef: row.instrumentRef,
    receivedBy: row.receivedBy,
    receivedAt: iso(row.receivedAt)!,
    voidedAt: iso(row.voidedAt),
    voidReason: row.voidReason,
  };
}

export const cash: CashLedger<Tx> = {
  async record(ctx: ClinicalCtx<Tx>, entry) {
    if (entry.amountPaise <= 0) throw new ApiError(422, 'validation', 'Amount must be greater than zero');
    const number = await numbering.next(ctx, SERIES[entry.entryType]);
    const [row] = await ctx.tx
      .insert(schema.cashLedger)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        counterCode: entry.counterCode ?? '',
        entryType: entry.entryType,
        direction: entry.direction,
        mode: entry.mode,
        amountPaise: entry.amountPaise,
        number,
        patientId: entry.patientId ?? null,
        encounterId: entry.encounterId ?? null,
        refType: entry.refType,
        refId: entry.refId,
        instrumentRef: entry.instrumentRef ?? null,
        receivedBy: ctx.userId,
      })
      .returning();
    await ctx.audit('clinical.cash.record', 'cash_ledger', row!.id, null, { number, entryType: entry.entryType, amountPaise: entry.amountPaise });
    return toDto(row!);
  },

  async void(ctx, entryId, reason) {
    const [row] = await ctx.tx.select().from(schema.cashLedger).where(eq(schema.cashLedger.id, entryId));
    if (!row) throw new ApiError(404, 'not_found', 'Cash entry not found');
    if (row.voidedAt) return toDto(row);
    await billingDefiner(ctx.tx, sql`select hos_cash_void(${entryId}::uuid, ${reason})`);
    const [updated] = await ctx.tx.select().from(schema.cashLedger).where(eq(schema.cashLedger.id, entryId));
    await ctx.audit('clinical.cash.void', 'cash_ledger', entryId, { voidedAt: null }, { voidReason: reason });
    return toDto(updated ?? row);
  },
};
