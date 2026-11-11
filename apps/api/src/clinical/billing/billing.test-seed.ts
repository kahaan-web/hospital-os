import { createDb, dbEnv, schema } from '@hos/db';
import { eq } from 'drizzle-orm';
import { clinicalFixture } from '../testkit';

export async function billingIsolationIds(): Promise<{
  billId: string;
  lineId: string;
  depositId: string;
  settlementId: string;
  concessionId: string;
  refundId: string;
  creditNoteId: string;
}> {
  const fx = await clinicalFixture();
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const tenantId = fx.lotus.tenantId;
    const [bill] = await handle.db.select({ id: schema.bills.id }).from(schema.bills).where(eq(schema.bills.tenantId, tenantId));
    const [line] = await handle.db.select({ id: schema.billLines.id }).from(schema.billLines).where(eq(schema.billLines.tenantId, tenantId));
    const [deposit] = await handle.db.select({ id: schema.deposits.id }).from(schema.deposits).where(eq(schema.deposits.tenantId, tenantId));
    const [settlement] = await handle.db.select({ id: schema.billSettlements.id }).from(schema.billSettlements).where(eq(schema.billSettlements.tenantId, tenantId));
    const [concession] = await handle.db.select({ id: schema.concessions.id }).from(schema.concessions).where(eq(schema.concessions.tenantId, tenantId));
    const [refund] = await handle.db.select({ id: schema.refunds.id }).from(schema.refunds).where(eq(schema.refunds.tenantId, tenantId));
    const [note] = await handle.db.select({ id: schema.creditNotes.id }).from(schema.creditNotes).where(eq(schema.creditNotes.tenantId, tenantId));
    if (!bill || !line || !deposit || !settlement || !concession || !refund || !note) {
      throw new Error('billing seed rows missing; run db:seed:demo after migrations');
    }
    return {
      billId: bill.id,
      lineId: line.id,
      depositId: deposit.id,
      settlementId: settlement.id,
      concessionId: concession.id,
      refundId: refund.id,
      creditNoteId: note.id,
    };
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}
