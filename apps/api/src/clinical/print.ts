import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { schema, type Tx } from '@hos/db';
import type { LetterheadDto, PrintBlock, PrintDoc } from '@hos/shared';
import fontkit from '@pdf-lib/fontkit';
import { eq } from 'drizzle-orm';
import { PDFDocument, rgb } from 'pdf-lib';
import { ApiError } from '../http';

const require = createRequire(import.meta.url);

/** Code 128 patterns, values 0–106. 104 is Start B (`211214`). 106 is Stop. */
const CODE128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
] as const;

const PAGE: Record<PrintDoc['size'], [number, number]> = {
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  label_50x25: [(50 * 72) / 25.4, (25 * 72) / 25.4],
};

export function code128B(value: string): string[] {
  if (CODE128.length !== 107) throw new Error('Code128 table is incomplete');
  const codes = [104];
  for (const ch of value) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) throw new ApiError(422, 'validation', 'Barcode text must be printable ASCII');
    codes.push(c - 32);
  }
  let sum = codes[0]!;
  for (let i = 1; i < codes.length; i++) sum += codes[i]! * i;
  codes.push(sum % 103, 106);
  return codes.map((c) => CODE128[c]!);
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function barsSvg(value: string): string {
  const patterns = code128B(value);
  const units = patterns.join('');
  let x = 10;
  let d = '';
  let bar = true;
  for (const ch of units) {
    const w = Number(ch);
    if (bar) d += `<rect x="${x}" y="0" width="${w}" height="40" fill="#1c2430"/>`;
    x += w;
    bar = !bar;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 10} 48" width="${Math.min(220, x + 10)}" height="48" role="img" aria-label="Barcode ${escapeHtml(value)}">${d}</svg>`;
}

export async function letterhead(tx: Tx, locationId: string): Promise<LetterheadDto> {
  const [loc] = await tx.select().from(schema.locations).where(eq(schema.locations.id, locationId));
  if (!loc) throw new ApiError(404, 'not_found', 'Location not found');
  const [hospital] = await tx.select().from(schema.tenants);
  if (!hospital) throw new ApiError(404, 'not_found', 'Hospital not found');
  const address = [loc.addressLine1, loc.addressLine2, loc.city, loc.stateCode, loc.pincode].filter(Boolean).join(', ');
  return {
    name: hospital.displayName || hospital.legalName,
    address,
    gstin: hospital.gstin,
    registrationNo: hospital.registrationNo,
    logoPath: hospital.logoPath,
    phone: loc.phone,
  };
}

function blockHtml(block: PrintBlock): string {
  switch (block.kind) {
    case 'heading':
      return `<h2>${escapeHtml(block.text)}</h2>`;
    case 'paragraph':
      return `<p>${escapeHtml(block.text)}</p>`;
    case 'amountInWords':
      return `<p class="words">${escapeHtml(block.text)}</p>`;
    case 'signature':
      return `<p class="sign">${escapeHtml(block.label)}</p>`;
    case 'spacer':
      return `<div style="height:${block.mm ?? 4}mm"></div>`;
    case 'barcode':
      return `<div class="barcode">${barsSvg(block.value)}<div>${escapeHtml(block.value)}</div></div>`;
    case 'keyValues':
    case 'totals':
      return `<table>${block.rows.map((row) => `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`).join('')}</table>`;
    case 'table':
      return `<table class="grid"><thead><tr>${block.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${block.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`;
    default:
      return '';
  }
}

export function renderHtml(doc: PrintDoc): string {
  const head = doc.letterhead;
  const width = doc.size === 'label_50x25' ? '50mm' : doc.size === 'A5' ? '148mm' : '210mm';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(head.name)}</title>
  <style>
    body { font-family: "IBM Plex Sans", "Segoe UI", sans-serif; color: #1c2430; margin: 0; }
    article { width: ${width}; padding: 12mm; box-sizing: border-box; }
    h1 { font-size: 16px; margin: 0; }
    h2 { font-size: 13px; margin: 12px 0 4px; }
    p, td, th { font-size: 11px; }
    .muted { color: #5c6b7a; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0; }
    th, td { text-align: left; padding: 3px 4px; border-bottom: 1px solid #d5dde5; vertical-align: top; }
    .sign { margin-top: 18px; border-top: 1px solid #1c2430; display: inline-block; min-width: 140px; padding-top: 4px; }
  </style>
</head>
<body>
  <article>
    <h1>${escapeHtml(head.name)}</h1>
    <p class="muted">${escapeHtml(head.address)}${head.phone ? ` · ${escapeHtml(head.phone)}` : ''}</p>
    <p class="muted">${head.gstin ? `GSTIN ${escapeHtml(head.gstin)}` : ''}${head.registrationNo ? ` · Reg. ${escapeHtml(head.registrationNo)}` : ''}</p>
    ${doc.blocks.map(blockHtml).join('')}
  </article>
</body>
</html>`;
}

function drawBarcode(page: import('pdf-lib').PDFPage, value: string, x: number, y: number): void {
  const patterns = code128B(value);
  let cursor = x;
  let bar = true;
  const moduleWidth = 0.9;
  for (const pattern of patterns) {
    for (const ch of pattern) {
      const w = Number(ch) * moduleWidth;
      if (bar) page.drawRectangle({ x: cursor, y, width: w, height: 28, color: rgb(0.11, 0.14, 0.19) });
      cursor += w;
      bar = !bar;
    }
  }
}

export async function renderPdf(doc: PrintDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontPath = require.resolve('@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff');
  const font = await pdf.embedFont(readFileSync(fontPath), { subset: true });
  const [width, height] = PAGE[doc.size];
  const page = pdf.addPage([width, height]);
  const margin = doc.size === 'label_50x25' ? 8 : 36;
  let y = height - margin;
  const ink = rgb(0.11, 0.14, 0.19);
  const muted = rgb(0.36, 0.42, 0.48);
  const size = doc.size === 'label_50x25' ? 7 : 10;
  const line = (text: string, color = ink, gap = size + 4) => {
    page.drawText(text.slice(0, 120), { x: margin, y, size, font, color });
    y -= gap;
  };
  line(doc.letterhead.name, ink, size + 3);
  if (doc.letterhead.address) line(doc.letterhead.address, muted, size + 2);
  const meta = [doc.letterhead.gstin ? `GSTIN ${doc.letterhead.gstin}` : '', doc.letterhead.registrationNo ? `Reg. ${doc.letterhead.registrationNo}` : '']
    .filter(Boolean)
    .join('  ');
  if (meta) line(meta, muted, size + 8);
  for (const block of doc.blocks) {
    if (y < margin + 20) break;
    if (block.kind === 'heading' || block.kind === 'paragraph' || block.kind === 'amountInWords' || block.kind === 'signature') {
      line(block.kind === 'signature' ? block.label : block.text);
    } else if (block.kind === 'spacer') {
      y -= (block.mm ?? 4) * 2.83;
    } else if (block.kind === 'barcode') {
      drawBarcode(page, block.value, margin, y - 28);
      y -= 32;
      line(block.value, muted);
    } else if (block.kind === 'keyValues' || block.kind === 'totals') {
      for (const row of block.rows) line(`${row.label}: ${row.value}`);
    } else if (block.kind === 'table') {
      line(block.columns.join('  |  '));
      for (const row of block.rows) line(row.join('  |  '));
    }
  }
  return pdf.save();
}
