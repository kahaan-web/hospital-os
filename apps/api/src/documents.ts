import { amountInWords, formatDate, formatINR, stateName } from '@hos/shared';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { InvoiceDto } from '@hos/shared';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function invoiceHtml(invoice: InvoiceDto): string {
  const rows = invoice.lines
    .map(
      (line) => `<tr>
        <td>${escapeHtml(line.description)}</td>
        <td>${escapeHtml(line.sacCode)}</td>
        <td class="num">${line.quantity}</td>
        <td class="num">${formatINR(line.unitPaise, { decimals: 'always' })}</td>
        <td class="num">${formatINR(line.amountPaise, { decimals: 'always' })}</td>
        <td class="num">${(line.gstRateBp / 100).toFixed(2)}%</td>
      </tr>`,
    )
    .join('');
  const taxRows = invoice.interState
    ? `<tr><td>IGST</td><td class="num">${formatINR(invoice.igstPaise, { decimals: 'always' })}</td></tr>`
    : `<tr><td>CGST</td><td class="num">${formatINR(invoice.cgstPaise, { decimals: 'always' })}</td></tr>
       <tr><td>SGST</td><td class="num">${formatINR(invoice.sgstPaise, { decimals: 'always' })}</td></tr>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Tax invoice ${escapeHtml(invoice.number)}</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; color: #1c2430; margin: 32px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .muted { color: #5c6b7a; font-size: 13px; }
    .grid { display: flex; gap: 32px; margin: 24px 0; }
    .grid section { flex: 1; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #d5dde5; font-size: 13px; }
    .num { text-align: right; }
    .totals { margin-left: auto; width: 280px; }
    .note { margin-top: 28px; font-size: 12px; color: #5c6b7a; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <p class="muted">Hospital OS · Sample price · Tax invoice</p>
  <h1>${escapeHtml(invoice.number)}</h1>
  <p class="muted">Issued ${escapeHtml(formatDate(invoice.issueDate))} · Place of supply ${escapeHtml(stateName(invoice.placeOfSupplyStateCode))} (${escapeHtml(invoice.placeOfSupplyStateCode)})</p>
  <div class="grid">
    <section>
      <strong>Supplier</strong>
      <p>${escapeHtml(invoice.supplier.legalName)}<br />${escapeHtml(invoice.supplier.address)}<br />GSTIN ${escapeHtml(invoice.supplier.gstin)}</p>
    </section>
    <section>
      <strong>Billed to</strong>
      <p>${escapeHtml(invoice.customer.legalName)}<br />${escapeHtml(invoice.customer.address)}<br />GSTIN ${escapeHtml(invoice.customer.gstin || '—')}</p>
    </section>
  </div>
  <table>
    <thead><tr><th>Description</th><th>SAC</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Taxable</th><th class="num">GST</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Taxable value</td><td class="num">${formatINR(invoice.taxablePaise, { decimals: 'always' })}</td></tr>
    ${taxRows}
    <tr><td><strong>Total</strong></td><td class="num"><strong>${formatINR(invoice.totalPaise, { decimals: 'always' })}</strong></td></tr>
  </table>
  <p>${escapeHtml(invoice.amountInWords)}</p>
  <p class="note">${escapeHtml(invoice.notes || 'Sample price. This is a mock invoice — no tax is remitted and no money has moved.')}</p>
</body>
</html>`;
}

/** Helvetica is WinAnsi. The rupee sign and other non-latin-1 marks become ASCII here; the HTML invoice keeps ₹. */
function pdfText(value: string): string {
  return value
    .replaceAll('₹', 'Rs. ')
    .replaceAll('\u2014', '-')
    .replaceAll('\u2013', '-')
    .replaceAll('\u2212', '-')
    .replaceAll('\u00a0', ' ')
    .replaceAll('\u202f', ' ')
    .replace(/[\u0100-\uffff]/g, '');
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      if (current) lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

export async function invoicePdf(invoice: InvoiceDto): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Tax invoice ${invoice.number}`);
  doc.setAuthor('Hospital OS');
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.14, 0.18);
  const muted = rgb(0.36, 0.42, 0.48);
  let y = 800;
  const draw = (text: string, size: number, face = font, color = ink) => {
    page.drawText(pdfText(text), { x: 48, y, size, font: face, color });
    y -= size + 6;
  };
  draw('HOSPITAL OS', 11, bold, muted);
  draw('Tax invoice  ·  Sample price', 18, bold);
  draw(invoice.number, 14, bold);
  draw(`Issued ${formatDate(invoice.issueDate)}    Place of supply ${stateName(invoice.placeOfSupplyStateCode)} (${invoice.placeOfSupplyStateCode})`, 10, font, muted);
  y -= 8;
  draw('Supplier', 11, bold);
  for (const line of wrap(`${invoice.supplier.legalName}, ${invoice.supplier.address}. GSTIN ${invoice.supplier.gstin}`, 90)) draw(line, 10);
  y -= 4;
  draw('Billed to', 11, bold);
  for (const line of wrap(`${invoice.customer.legalName}, ${invoice.customer.address}. GSTIN ${invoice.customer.gstin || '—'}`, 90)) draw(line, 10);
  y -= 8;
  draw('Description', 10, bold);
  for (const line of invoice.lines) {
    for (const part of wrap(`${line.description}  ·  SAC ${line.sacCode}  ·  Qty ${line.quantity}  ·  ${formatINR(line.amountPaise, { decimals: 'always' })}  ·  GST ${(line.gstRateBp / 100).toFixed(2)}%`, 92)) {
      draw(part, 10);
    }
  }
  y -= 6;
  draw(`Taxable value  ${formatINR(invoice.taxablePaise, { decimals: 'always' })}`, 11);
  if (invoice.interState) draw(`IGST  ${formatINR(invoice.igstPaise, { decimals: 'always' })}`, 11);
  else {
    draw(`CGST  ${formatINR(invoice.cgstPaise, { decimals: 'always' })}`, 11);
    draw(`SGST  ${formatINR(invoice.sgstPaise, { decimals: 'always' })}`, 11);
  }
  draw(`Total  ${formatINR(invoice.totalPaise, { decimals: 'always' })}`, 13, bold);
  y -= 4;
  for (const line of wrap(amountInWords(invoice.totalPaise), 90)) draw(line, 10);
  y -= 8;
  const note = invoice.notes || 'Sample price. This mock invoice is for the Hospital OS demo. No tax is remitted and no money has moved. The supplier GSTIN and SAC code are placeholders until a chartered accountant confirms them.';
  for (const line of wrap(note, 95)) draw(line, 9, font, muted);
  draw('Generated by Hospital OS for demonstration on this computer.', 9, font, muted);
  return doc.save();
}
