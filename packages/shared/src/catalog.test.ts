import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FEATURE_DEFS, MODULE_DEFS, SHEET_FEATURE_DEFS, SHEET_ROWS, type SheetRow } from './catalog';

const CSV_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/source/features-by-tier.csv');

/**
 * Sheet1 spells one IP Billing row "Cash handling". The generator merges it into the
 * canonical module name (scripts/gen-catalog.mjs). Tier flags are unchanged by that alias.
 */
const MODULE_ALIASES: Record<string, string> = {
  'IP Billing & Cash handling': 'IP Billing & Cash Handling',
};

const TYPE_MAP: Record<string, SheetRow['type']> = {
  Functions: 'function',
  Reports: 'report',
  Interface: 'interface',
};

/** RFC-4180 parser, independent of the generator, so the catalogue is checked against the CSV itself. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c ?? '';
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((f) => f !== '')) rows.push(row);
  }
  return rows;
}

function sheetFromCsv(text: string): SheetRow[] {
  const [header, ...data] = parseCsv(text);
  expect(header).toEqual([
    'Module',
    'Type',
    'Function / Report Description',
    'Status',
    'Status Count',
    'Basic',
    'Medium',
    'Premium',
  ]);
  return data.map((cols, i) => {
    const mod = cols[0];
    const typeRaw = cols[1];
    const name = cols[2];
    const status = cols[3];
    const basic = cols[5];
    const medium = cols[6];
    const premium = cols[7];
    const row = i + 2;
    if (mod === undefined || typeRaw === undefined || name === undefined || status === undefined) {
      throw new Error(`Row ${row} is missing columns`);
    }
    const type = TYPE_MAP[typeRaw];
    if (!type) throw new Error(`Row ${row}: unknown type "${typeRaw}"`);
    for (const v of [basic, medium, premium]) {
      if (v !== 'Y' && v !== 'N') throw new Error(`Row ${row}: tier cell must be Y or N`);
    }
    const sheetStatus = status === '' ? null : status;
    if (sheetStatus !== null && sheetStatus !== 'Change' && sheetStatus !== 'No Change' && sheetStatus !== 'New') {
      throw new Error(`Row ${row}: unexpected status "${sheetStatus}"`);
    }
    return {
      row,
      sheetModule: MODULE_ALIASES[mod] ?? mod,
      type,
      name: name.trim(),
      status: sheetStatus,
      basic: basic === 'Y',
      medium: medium === 'Y',
      premium: premium === 'Y',
    };
  });
}

describe('module catalogue vs features-by-tier.csv', () => {
  const csvRows = sheetFromCsv(readFileSync(CSV_PATH, 'utf8'));

  it('counts 112 sheet items, Basic 66, Medium 82, Premium 112', () => {
    expect(csvRows).toHaveLength(112);
    expect(csvRows.filter((r) => r.basic)).toHaveLength(66);
    expect(csvRows.filter((r) => r.medium)).toHaveLength(82);
    expect(csvRows.filter((r) => r.premium)).toHaveLength(112);

    expect(SHEET_ROWS).toHaveLength(112);
    expect(SHEET_ROWS.filter((r) => r.basic)).toHaveLength(66);
    expect(SHEET_ROWS.filter((r) => r.medium)).toHaveLength(82);
    expect(SHEET_ROWS.filter((r) => r.premium)).toHaveLength(112);

    expect(SHEET_FEATURE_DEFS).toHaveLength(112);
    expect(SHEET_FEATURE_DEFS.filter((f) => f.tiers.basic)).toHaveLength(66);
    expect(SHEET_FEATURE_DEFS.filter((f) => f.tiers.medium)).toHaveLength(82);
    expect(SHEET_FEATURE_DEFS.filter((f) => f.tiers.premium)).toHaveLength(112);
  });

  it('matches every Sheet1 row, including names, types and tier flags', () => {
    expect([...SHEET_ROWS]).toEqual(csvRows);
    expect(new Set(csvRows.map((r) => r.sheetModule.toLowerCase())).size).toBe(10);

    for (const row of csvRows) {
      const feature = SHEET_FEATURE_DEFS.find((f) => f.sheetRow === row.row);
      expect(feature, `sheet row ${row.row} ${row.name}`).toBeDefined();
      expect(feature?.name).toBe(row.name);
      expect(feature?.sheetModule).toBe(row.sheetModule);
      expect(feature?.type).toBe(row.type);
      expect(feature?.source).toBe('sheet');
      expect(feature?.tiers).toEqual({ basic: row.basic, medium: row.medium, premium: row.premium });
    }
  });

  it('lists 27 HMIS modules, CPOE and 7 Android apps, with unique entitlement keys', () => {
    expect(MODULE_DEFS.filter((m) => m.kind === 'hmis' && m.key !== 'cpoe')).toHaveLength(27);
    expect(MODULE_DEFS.filter((m) => m.kind === 'android')).toHaveLength(7);
    expect(MODULE_DEFS.find((m) => m.key === 'cpoe')?.sheetModule).toBe('CPOE');

    const keys = FEATURE_DEFS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(FEATURE_DEFS.filter((f) => f.source === 'sheet').length).toBe(112);
  });
});
