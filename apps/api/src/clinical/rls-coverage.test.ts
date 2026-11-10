import { dbEnv } from '@hos/db';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { clinicalFixture, closeClinicalPools } from './testkit';

beforeAll(async () => {
  await clinicalFixture();
}, 180_000);

afterAll(async () => {
  await closeClinicalPools();
});

it('forces RLS, a tenant policy, and unique (tenant_id, id) on tenant tables', async () => {
  const client = new pg.Client({ connectionString: dbEnv().migrationUrl });
  await client.connect();
  try {
    const tables = await client.query<{ relname: string; rls: boolean; forced: boolean }>(`
      select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname <> '_migrations'
    `);
    const open = tables.rows.filter((row) => !row.rls || !row.forced).map((row) => row.relname);
    expect(open).toEqual([]);

    const tenantTables = await client.query<{ table_name: string; has_id: boolean }>(`
      select c.table_name, bool_or(c.column_name = 'id') as has_id
      from information_schema.columns c
      where c.table_schema = 'public' and c.column_name in ('tenant_id', 'id')
      group by c.table_name
      having bool_or(c.column_name = 'tenant_id')
    `);
    const policies = await client.query<{ relname: string; expr: string | null }>(`
      select c.relname, pg_get_expr(p.polqual, p.polrelid) as expr
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
    `);
    const policyText = new Map<string, string>();
    for (const row of policies.rows) policyText.set(row.relname, `${policyText.get(row.relname) ?? ''} ${row.expr ?? ''}`);
    const missingPolicy = tenantTables.rows
      .map((row) => row.table_name)
      .filter((name) => name !== 'sessions' && !policyText.get(name)?.includes('hos_tenant_id()'));
    expect(missingPolicy).toEqual([]);

    const uniques = await client.query<{ relname: string }>(`
      select t.relname
      from pg_index i
      join pg_class t on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = any (i.indkey)
      where n.nspname = 'public' and i.indisunique
      group by t.relname, i.indexrelid
      having array_agg(a.attname::text) @> array['tenant_id', 'id']::text[]
    `);
    const uniqueTables = new Set(uniques.rows.map((row) => row.relname));
    const missingUnique = tenantTables.rows.filter((row) => row.has_id && !uniqueTables.has(row.table_name)).map((row) => row.table_name);
    expect(missingUnique).toEqual([]);
  } finally {
    await Promise.race([client.end(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
});
