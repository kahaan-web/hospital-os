import { PHARMACY_GST_NOTE, amountInWords, formatDate, formatINR, type PharmacySaleDto, type PrintDoc } from '@hos/shared';
import type { LetterheadDto } from '@hos/shared';

function money(paise: number): string {
  return formatINR(paise, { decimals: 'always' });
}

/** Counter-sale tax invoice. MRP is GST-inclusive; the tax is extracted, not added. */
export function saleInvoiceDoc(sale: PharmacySaleDto, head: LetterheadDto, patientLabel: string): PrintDoc {
  return {
    size: 'A5',
    letterhead: head,
    blocks: [
      { kind: 'heading', text: sale.docType === 'tax_invoice' ? 'Tax invoice' : sale.docType === 'bill_of_supply' ? 'Bill of supply' : 'Invoice-cum-bill of supply' },
      { kind: 'paragraph', text: PHARMACY_GST_NOTE },
      {
        kind: 'keyValues',
        rows: [
          { label: 'Number', value: sale.number },
          { label: 'Patient', value: patientLabel },
          { label: 'Kind', value: sale.kind === 'op' ? 'OP issue' : 'Outside sale' },
          { label: 'Mode', value: sale.mode },
        ],
      },
      {
        kind: 'table',
        columns: ['Item', 'Batch', 'Qty', 'MRP', 'Taxable', 'GST'],
        rows: sale.lines.map((line) => [line.brand, line.batchNo, String(line.qty), money(line.mrpPaise), money(line.taxablePaise), money(line.taxPaise)]),
      },
      {
        kind: 'totals',
        rows: [
          { label: 'Taxable', value: money(sale.taxablePaise) },
          { label: 'CGST', value: money(sale.cgstPaise) },
          { label: 'SGST', value: money(sale.sgstPaise) },
          { label: 'Total', value: money(sale.totalPaise) },
        ],
      },
      { kind: 'amountInWords', text: amountInWords(sale.totalPaise) },
      { kind: 'paragraph', text: `Printed ${formatDate(new Date())}. MRP includes GST.` },
      { kind: 'signature', label: 'Pharmacist' },
    ],
  };
}
