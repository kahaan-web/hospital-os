// Plans a minimal INSERT for a tenant table whose shape is not known at compile time
// (`credit_notes` lands with feat/mt-hardening). Only required columns are filled.
import type { Assignment, ColumnMeta, FkRef, InsertHints } from './types';

const SQL_EXPRS = new Set(['now()', 'current_date', "'{}'::jsonb", "'[]'::jsonb", 'gen_random_uuid()']);

export function assertSqlExpr(expr: string): string {
  if (!SQL_EXPRS.has(expr)) throw new Error(`Refusing SQL expression ${expr}`);
  return expr;
}

function normalize(def: string): string {
  return def.replace(/::[a-z0-9_ ]+/gi, '').replace(/\(\s*(\d+)\s*\)/g, '$1');
}

function quotes(fragment: string): string[] {
  const out: string[] = [];
  const re = /'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment))) out.push(m[1]!);
  return out;
}

/** Literals from `col IN (...)`, `col = ANY (ARRAY[...])`, or `col = 'x'`. */
export function stringChoices(definition: string, column: string): string[] {
  const any = definition.match(new RegExp(`\\b${column}\\b\\s*=\\s*ANY\\s*\\(\\s*ARRAY\\[([^\\]]*)\\]`, 'i'));
  if (any?.[1]) return quotes(any[1]);
  const inn = definition.match(new RegExp(`\\b${column}\\b\\s+IN\\s*\\(([^)]*)\\)`, 'i'));
  if (inn?.[1]) return quotes(inn[1]);
  const eq = definition.match(new RegExp(`\\b${column}\\b\\s*=\\s*'([^']*)'`, 'i'));
  if (eq?.[1]) return [eq[1]];
  return [];
}

export function maxTextLength(checks: string[], column: string): number | null {
  let max: number | null = null;
  for (const def of checks) {
    const m = def.match(new RegExp(`(?:char_length|character_length|length)\\s*\\(\\s*${column}\\s*\\)\\s*<=\\s*(\\d+)`, 'i'));
    if (!m?.[1]) continue;
    const n = Number(m[1]);
    if (max === null || n < max) max = n;
  }
  return max;
}

export function fitText(value: string, max: number | null): string {
  if (max === null) return value;
  if (max < 1) throw new Error(`text max length ${max} is unusable`);
  return value.length <= max ? value : value.slice(0, max);
}

/** Sample credit-note number. Unique per tag, and short enough for a char_length check (invoices use 16). */
export function creditNumber(tag: string, maxLen: number | null): string {
  const initial = (tag.replace(/[^a-z0-9]/gi, '')[0] ?? 'x').toUpperCase();
  const full = `CN${initial}/2627/000001`;
  const fitted = fitText(full, maxLen);
  if (fitted.length < 1) throw new Error('credit note number does not fit the length check');
  return fitted;
}

function choicesFor(checks: string[], column: string): string[] {
  const out: string[] = [];
  for (const def of checks) for (const c of stringChoices(def, column)) if (!out.includes(c)) out.push(c);
  return out;
}

function textValue(column: string, checks: string[], hints: InsertHints): string {
  const choices = choicesFor(checks, column);
  const max = maxTextLength(checks, column);
  if (choices.length > 0) {
    const fit = choices.find((c) => max === null || c.length <= max);
    if (!fit) throw new Error(`${hints.table}.${column}: no allowed value fits the length check`);
    return fit;
  }
  const key = column.toLowerCase();
  let value = 'sample';
  if (key === 'number' || key.endsWith('_number') || key === 'doc_no') value = creditNumber(hints.tag, max);
  else if (key.includes('email')) value = hints.email;
  else if (key.includes('mobile') || key.includes('phone')) value = hints.mobile;
  else if (key === 'fy' || key === 'financial_year') value = '2026-27';
  else if (key.includes('state')) value = '27';
  else if (key === 'currency') value = 'INR';
  else if (/name|reason|description|notes|body|text|label/.test(key)) value = hints.label;
  return fitText(value, max);
}

function numberValue(checks: string[], column: string): number {
  const src = checks.map(normalize).join('\n');
  const col = `\\b${column}\\b`;
  if (new RegExp(`${col}\\s*(?:=|<)\\s*0\\b`).test(src)) return 0;
  return 1;
}

function boolValue(column: string): boolean {
  return /sample|active|verified|accepted|enabled/.test(column);
}

function jsonExpr(column: string): string {
  if (/purposes|tags|lines/.test(column)) return "'[]'::jsonb";
  return "'{}'::jsonb";
}

function fkFor(fks: FkRef[], column: string): FkRef | undefined {
  return fks.find((f) => f.column === column);
}

/**
 * Columns the INSERT must name. Columns with a default, generated columns, and identity columns are left to the table.
 * `tenant_id` is always the probe tenant. Foreign keys are looked up by the caller.
 */
export function planRequiredInsert(columns: ColumnMeta[], checks: string[], fks: FkRef[], hints: InsertHints): Assignment[] {
  const plan: Assignment[] = [];
  for (const col of columns) {
    // Always stamp the probe tenant, even when the column has a default. Otherwise the row
    // would not show up in `where tenant_id = $tenant` and the suite would still fail.
    if (col.name === 'tenant_id') {
      if (!col.generated) plan.push({ column: col.name, kind: 'tenant' });
      continue;
    }
    if (col.generated || col.identity || col.hasDefault || col.nullable) continue;
    const name = col.name;
    const fk = fkFor(fks, name);
    if (fk) {
      if (fk.parentTable === hints.table) {
        throw new Error(`${hints.table}.${name} is a NOT NULL self-reference; the conditional fixture cannot invent one`);
      }
      plan.push({ column: name, kind: 'fk', parentTable: fk.parentTable, parentColumn: fk.parentColumn });
      continue;
    }
    const type = col.dataType.toLowerCase();
    if (type === 'uuid') {
      plan.push({ column: name, kind: 'sql', expr: 'gen_random_uuid()' });
      continue;
    }
    if (type === 'user-defined') {
      plan.push({ column: name, kind: 'enum', udtName: col.udtName });
      continue;
    }
    if (type === 'text' || type === 'character varying' || type === 'character') {
      plan.push({ column: name, kind: 'param', value: textValue(name, checks, hints) });
      continue;
    }
    if (['smallint', 'integer', 'bigint', 'numeric', 'real', 'double precision'].includes(type)) {
      plan.push({ column: name, kind: 'param', value: numberValue(checks, name) });
      continue;
    }
    if (type === 'boolean') {
      plan.push({ column: name, kind: 'param', value: boolValue(name) });
      continue;
    }
    if (type === 'date') {
      plan.push({ column: name, kind: 'sql', expr: 'current_date' });
      continue;
    }
    if (type.includes('timestamp') || type === 'time' || type === 'time without time zone' || type === 'time with time zone') {
      plan.push({ column: name, kind: 'sql', expr: 'now()' });
      continue;
    }
    if (type === 'json' || type === 'jsonb') {
      plan.push({ column: name, kind: 'sql', expr: assertSqlExpr(jsonExpr(name)) });
      continue;
    }
    if (type === 'array') {
      throw new Error(`${hints.table}.${name} is a required array; add an explicit fixture value`);
    }
    throw new Error(`${hints.table}.${name} has required type ${col.dataType} and the fixture planner has no value`);
  }
  const tenant = plan.find((a) => a.column === 'tenant_id');
  if (!tenant) throw new Error(`${hints.table} has no required tenant_id column to attach the probe row to`);
  return plan;
}
