import { schema, type Tx } from '@hos/db';
import type { BillDto, BillingStatusReader, ChargeSource, ClinicalCtx } from '@hos/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { billDto } from './map';

function sourceKey(source: ChargeSource): string {
  return `${source.type}:${source.id}:${source.line ?? ''}`;
}

/** A source is settled when its charge sits on a final bill that is paid, free, or posted on credit. */
export const billing: BillingStatusReader<Tx> = {
  async settledSources(ctx: ClinicalCtx<Tx>, sources) {
    const settled = new Set<string>();
    for (const source of sources) {
      const line = source.line ?? '';
      const [charge] = await ctx.tx
        .select()
        .from(schema.charges)
        .where(
          and(
            eq(schema.charges.sourceType, source.type),
            eq(schema.charges.sourceId, source.id),
            eq(schema.charges.sourceLine, line),
            isNull(schema.charges.reversalOfId),
          ),
        );
      if (!charge?.billId || charge.status !== 'billed') continue;
      const [row] = await ctx.tx.select().from(schema.bills).where(eq(schema.bills.id, charge.billId));
      if (!row || row.status !== 'final') continue;
      const closed = row.payClass === 'free' || row.payClass === 'credit' || row.paidPaise >= row.totalPaise;
      if (closed) settled.add(sourceKey(source));
    }
    return settled;
  },

  async billsForPatient(ctx: ClinicalCtx<Tx>, patientId): Promise<BillDto[]> {
    const rows = await ctx.tx.select().from(schema.bills).where(eq(schema.bills.patientId, patientId)).orderBy(desc(schema.bills.createdAt));
    return rows.map((row) => billDto(row));
  },
};
