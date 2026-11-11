import { schema, type Tx } from '@hos/db';
import type { ClinicalCtx } from '@hos/shared';
import { desc, eq } from 'drizzle-orm';
import {
  cashSummary as opCash,
  depositRegister as opDeposits,
  doctorSharing as opDoctor,
  outstanding as opOutstanding,
  revenueReport as opRevenue,
} from '../billing/queries';

type Ctx = ClinicalCtx<Tx>;

export async function cashSummary(ctx: Ctx, from: string, to: string) {
  return opCash(ctx, from, to);
}

export async function revenueReport(ctx: Ctx, from: string, to: string) {
  return opRevenue(ctx, from, to);
}

export async function doctorSharing(ctx: Ctx, from: string, to: string) {
  return opDoctor(ctx, from, to);
}

export async function outstanding(ctx: Ctx) {
  const report = await opOutstanding(ctx);
  return {
    ...report,
    rows: report.rows.filter((row) => row.number?.includes('/IB/')),
  };
}

export async function depositRegister(ctx: Ctx) {
  return opDeposits(ctx);
}

export async function concessionRegister(ctx: Ctx) {
  const rows = await ctx.tx
    .select({
      id: schema.concessions.id,
      billId: schema.concessions.billId,
      amountPaise: schema.concessions.amountPaise,
      reason: schema.concessions.reason,
      status: schema.concessions.status,
      number: schema.bills.number,
    })
    .from(schema.concessions)
    .innerJoin(schema.bills, eq(schema.bills.id, schema.concessions.billId))
    .where(eq(schema.bills.kind, 'ip'))
    .orderBy(desc(schema.concessions.createdAt));
  return { rows };
}
