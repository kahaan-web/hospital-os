// feat/mt-hardening adds `credit_notes` and revokes UPDATE/DELETE on the billing tables.
// The table is not on this branch. When it is, insert one sample row per probe tenant so the
// suite does not fail for a missing fixture. The column list is read from the catalogue because
// the CREATE TABLE is not here yet. Append-only: insert only, never update.
import type pg from 'pg';
import { assertSqlExpr, planRequiredInsert } from './plan-insert';
import { quoteIdent } from './sql';
import type { Assignment, ColumnMeta, FkRef, ProbeSpec } from './types';

interface Resolved {
  column: string;
  expr: string;
  value?: unknown;
}

function bareTable(name: string): string {
  const last = name.split('.').pop() ?? name;
  return last.replaceAll('"', '');
}

async function tableExists(owner: pg.Client): Promise<boolean> {
  const r = await owner.query<{ rel: string | null }>(`select to_regclass('public.credit_notes')::text as rel`);
  return Boolean(r.rows[0]?.rel);
}

async function loadColumns(owner: pg.Client): Promise<ColumnMeta[]> {
  const r = await owner.query<{
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
    is_generated: string;
    is_identity: string;
  }>(
    `select column_name, data_type, udt_name, is_nullable, column_default, is_generated, is_identity
       from information_schema.columns
      where table_schema = 'public' and table_name = 'credit_notes'
      order by ordinal_position`,
  );
  return r.rows.map((c) => ({
    name: c.column_name,
    dataType: c.data_type,
    udtName: c.udt_name,
    nullable: c.is_nullable === 'YES',
    hasDefault: c.column_default !== null,
    generated: c.is_generated === 'ALWAYS',
    identity: c.is_identity === 'YES',
  }));
}

async function loadChecks(owner: pg.Client): Promise<string[]> {
  const r = await owner.query<{ def: string }>(
    `select pg_get_constraintdef(oid) as def
       from pg_constraint
      where conrelid = 'public.credit_notes'::regclass and contype = 'c'`,
  );
  return r.rows.map((row) => row.def);
}

async function loadFks(owner: pg.Client): Promise<FkRef[]> {
  const r = await owner.query<{ column_name: string; parent_table: string; parent_column: string }>(
    `select src.attname as column_name,
            c.confrelid::regclass::text as parent_table,
            dst.attname as parent_column
       from pg_constraint c
       join lateral unnest(c.conkey) with ordinality as sk(attnum, ord) on true
       join lateral unnest(c.confkey) with ordinality as fk(attnum, ord) on fk.ord = sk.ord
       join pg_attribute src on src.attrelid = c.conrelid and src.attnum = sk.attnum and not src.attisdropped
       join pg_attribute dst on dst.attrelid = c.confrelid and dst.attnum = fk.attnum and not dst.attisdropped
      where c.contype = 'f' and c.conrelid = 'public.credit_notes'::regclass`,
  );
  return r.rows.map((row) => ({
    column: row.column_name,
    parentTable: bareTable(row.parent_table),
    parentColumn: row.parent_column,
  }));
}

async function lookupFk(owner: pg.Client, tenantId: string, fk: { parentTable: string; parentColumn: string }): Promise<unknown> {
  const parent = quoteIdent(fk.parentTable);
  const col = quoteIdent(fk.parentColumn);
  const scoped = await owner.query(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = $1 and column_name = 'tenant_id'`,
    [fk.parentTable],
  );
  const sql =
    (scoped.rowCount ?? 0) > 0
      ? `select ${col} as v from ${parent} where tenant_id = $1 limit 1`
      : `select ${col} as v from ${parent} limit 1`;
  const r = await owner.query<{ v: unknown }>(sql, (scoped.rowCount ?? 0) > 0 ? [tenantId] : []);
  if (r.rows[0]?.v === undefined || r.rows[0]?.v === null) {
    throw new Error(`credit_notes: ${fk.parentTable} has no row to satisfy the foreign key`);
  }
  return r.rows[0].v;
}

async function lookupEnum(owner: pg.Client, udtName: string): Promise<string> {
  const r = await owner.query<{ label: string }>(
    `select e.enumlabel as label
       from pg_type t
       join pg_enum e on e.enumtypid = t.oid
      where t.typname = $1
      order by e.enumsortorder
      limit 1`,
    [udtName],
  );
  const label = r.rows[0]?.label;
  if (!label) throw new Error(`credit_notes: type ${udtName} has no enum label`);
  return label;
}

async function resolve(owner: pg.Client, tenantId: string, plan: Assignment[]): Promise<Resolved[]> {
  const out: Resolved[] = [];
  for (const step of plan) {
    if (step.kind === 'tenant') {
      out.push({ column: step.column, expr: '', value: tenantId });
      continue;
    }
    if (step.kind === 'param') {
      out.push({ column: step.column, expr: '', value: step.value });
      continue;
    }
    if (step.kind === 'sql') {
      out.push({ column: step.column, expr: assertSqlExpr(step.expr) });
      continue;
    }
    if (step.kind === 'enum') {
      out.push({ column: step.column, expr: '', value: await lookupEnum(owner, step.udtName) });
      continue;
    }
    out.push({
      column: step.column,
      expr: '',
      value: await lookupFk(owner, tenantId, step),
    });
  }
  return out;
}

export async function seedCreditNotes(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  if (!(await tableExists(owner))) return;
  const columns = await loadColumns(owner);
  if (!columns.some((c) => c.name === 'tenant_id')) return;
  const existing = await owner.query(`select 1 from credit_notes where tenant_id = $1 limit 1`, [tenantId]);
  if ((existing.rowCount ?? 0) > 0) return;

  const plan = planRequiredInsert(columns, await loadChecks(owner), await loadFks(owner), {
    table: 'credit_notes',
    tag: spec.tag,
    email: `${spec.tag}.credit@sbx`,
    mobile: spec.tag === 'alpha' ? '9000011991' : '9000011992',
    label: 'Sample credit note (Sample)',
  });
  const resolved = await resolve(owner, tenantId, plan);
  const typeByName = new Map(columns.map((c) => [c.name, c.dataType.toLowerCase()]));
  const params: unknown[] = [];
  const exprs = resolved.map((slot) => {
    if (slot.expr) return slot.expr;
    params.push(slot.value);
    // A bare SELECT list does not infer uuid from the INSERT target on every Postgres version.
    const cast = typeByName.get(slot.column) === 'uuid' ? '::uuid' : '';
    return `$${params.length}${cast}`;
  });
  params.push(tenantId);
  const tenantParam = `$${params.length}`;
  const cols = resolved.map((slot) => quoteIdent(slot.column)).join(', ');
  try {
    const inserted = await owner.query(
      `insert into credit_notes (${cols})
       select ${exprs.join(', ')}
       where not exists (select 1 from credit_notes where tenant_id = ${tenantParam}::uuid)`,
      params,
    );
    if ((inserted.rowCount ?? 0) > 0) return;
  } catch (err) {
    throw new Error(`credit_notes: ${(err as Error).message}`, { cause: err });
  }
  const have = await owner.query(`select 1 from credit_notes where tenant_id = $1 limit 1`, [tenantId]);
  if ((have.rowCount ?? 0) > 0) return;
  throw new Error('credit_notes: insert did not add a row');
}
