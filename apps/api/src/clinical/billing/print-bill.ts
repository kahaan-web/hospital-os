import { schema, type Tx } from '@hos/db';
import { DOC_TYPE_LABEL, amountInWords, formatDate, formatINR, type ClinicalCtx, type PrintDoc } from '@hos/shared';
import { asc, eq } from 'drizzle-orm';
import { ApiError } from '../../http';
import { letterhead } from '../print';

const rupee = (paise: number) => formatINR(paise, { decimals: 'always' });

export async function billPrint(ctx: ClinicalCtx<Tx>, billId: string): Promise<PrintDoc> {
  const [bill] = await ctx.tx.select().from(schema.bills).where(eq(schema.bills.id, billId));
  if (!bill) throw new ApiError(404, 'not_found', 'Bill not found');
  const [patient] = await ctx.tx.select().from(schema.patients).where(eq(schema.patients.id, bill.patientId));
  if (!patient) throw new ApiError(404, 'not_found', 'Patient not found');
  const lines = await ctx.tx.select().from(schema.billLines).where(eq(schema.billLines.billId, bill.id)).orderBy(asc(schema.billLines.lineNo));
  const head = await letterhead(ctx.tx, bill.locationId);
  const docLabel = DOC_TYPE_LABEL[bill.docType as keyof typeof DOC_TYPE_LABEL] ?? bill.docType;
  return {
    size: 'A5',
    letterhead: head,
    blocks: [
      { kind: 'heading', text: docLabel },
      {
        kind: 'keyValues',
        rows: [
          { label: 'Bill no.', value: bill.number ?? 'Draft' },
          { label: 'Date', value: formatDate(bill.finalisedAt ?? bill.createdAt) },
          { label: 'Patient', value: patient.fullName ?? '' },
          { label: 'UHID', value: patient.uhid },
          { label: 'Pay class', value: bill.payClass },
        ],
      },
      {
        kind: 'table',
        columns: ['Description', 'Qty', 'Amount', 'Tax', 'Line total'],
        rows: lines.map((line) => {
          const tax = line.cgstPaise + line.sgstPaise + line.igstPaise;
          return [line.description, String(Number(line.qty)), rupee(line.amountPaise), rupee(tax), rupee(line.taxablePaise + tax)];
        }),
      },
      {
        kind: 'totals',
        rows: [
          { label: 'Subtotal', value: rupee(bill.subtotalPaise) },
          { label: 'Concession', value: rupee(bill.discountPaise) },
          { label: 'CGST', value: rupee(bill.cgstPaise) },
          { label: 'SGST', value: rupee(bill.sgstPaise) },
          { label: 'IGST', value: rupee(bill.igstPaise) },
          { label: 'Round-off', value: rupee(bill.roundOffPaise) },
          { label: 'Total', value: rupee(bill.totalPaise) },
          { label: 'Paid', value: rupee(bill.paidPaise) },
          { label: 'Balance', value: rupee(bill.totalPaise - bill.paidPaise) },
        ],
      },
      { kind: 'amountInWords', text: amountInWords(bill.totalPaise) },
      { kind: 'paragraph', text: 'GST rates are configuration. Confirm with your CA.' },
      { kind: 'signature', label: 'Cashier' },
    ],
  };
}
