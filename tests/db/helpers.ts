import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { dbEnv } from '../../packages/db/src/env';

/**
 * Shared-database fixtures for the RLS suite.
 *
 * Decision: talk to the already-running Postgres (127.0.0.1:55432, container hospital-os-postgres).
 * Do not create, drop, stop or recreate that database. Fixtures use a `zz-test-` slug prefix and are
 * deleted by the migrator role. Mutations from hos_app are committed only when the row count is exactly
 * the fixture tenant's rows, so a missing policy cannot wipe other tenants.
 *
 * Session setup sets `app.tenant_id` (the contract) and `app.scope = 'tenant'` because that is what
 * `withTenant` in packages/db sets before any query.
 */

export interface DbGate {
  /** Set when Postgres cannot be reached. Every DB test skips. */
  unreachable: string | null;
  /** Set when the api worker has not applied the tenant schema yet. Role checks still run. */
  schema: string | null;
  app: pg.Client | null;
  migrator: pg.Client | null;
}

export interface TenantFixture {
  id: string;
  slug: string;
  locationId: string;
  city: string;
}

export interface FixturePair {
  runId: string;
  a: TenantFixture;
  b: TenantFixture;
}

const CONNECT_MS = 4_000;

function describeUrl(url: string): string {
  try {
    const u = new URL(url);
    const db = u.pathname.replace(/^\//, '') || '(none)';
    return `${u.hostname}:${u.port || '5432'}/${db} as ${decodeURIComponent(u.username)}`;
  } catch {
    return '(unparseable database url)';
  }
}

async function open(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: CONNECT_MS });
  await client.connect();
  return client;
}

export async function openDb(): Promise<DbGate> {
  const env = dbEnv();
  let app: pg.Client;
  try {
    app = await open(env.appUrl);
  } catch (err) {
    return {
      unreachable: `cannot connect to DATABASE_URL (${describeUrl(env.appUrl)}): ${(err as Error).message}`,
      schema: null,
      app: null,
      migrator: null,
    };
  }

  let migrator: pg.Client;
  try {
    migrator = await open(env.migrationUrl);
  } catch (err) {
    await app.end();
    return {
      unreachable: `cannot connect to DATABASE_MIGRATION_URL (${describeUrl(env.migrationUrl)}): ${(err as Error).message}`,
      schema: null,
      app: null,
      migrator: null,
    };
  }

  const tables = await app.query<{ relname: string; relrowsecurity: boolean }>(
    `select c.relname, c.relrowsecurity
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('tenants', 'locations', 'audit_log')`,
  );
  const found = new Set(tables.rows.map((r) => r.relname));
  const missing = ['tenants', 'locations', 'audit_log'].filter((name) => !found.has(name));
  const schema = missing.length
    ? `schema not migrated yet (missing ${missing.join(', ')}). The api worker owns migrations on feat/api; DB tests skip until then.`
    : null;

  return { unreachable: null, schema, app, migrator };
}

export async function closeDb(gate: DbGate): Promise<void> {
  await gate.app?.end().catch(() => undefined);
  await gate.migrator?.end().catch(() => undefined);
}

async function asPlatform<T>(migrator: pg.Client, fn: () => Promise<T>): Promise<T> {
  await migrator.query('begin');
  try {
    await migrator.query(`select set_config('app.scope', 'platform', true), set_config('app.tenant_id', '', true)`);
    const result = await fn();
    await migrator.query('commit');
    return result;
  } catch (err) {
    await migrator.query('rollback').catch(() => undefined);
    throw err;
  }
}

export async function insertTenantPair(migrator: pg.Client): Promise<FixturePair> {
  const runId = randomUUID().slice(0, 8);
  return asPlatform(migrator, async () => {
    const created: TenantFixture[] = [];
    for (const [mark, city, state] of [
      ['a', 'Mumbai', '27'],
      ['b', 'Indore', '23'],
    ] as const) {
      const slug = `zz-test-${runId}-${mark}`;
      const tenant = await migrator.query<{ id: string }>(
        `insert into tenants (slug, legal_name, display_name)
         values ($1, $2, $3)
         returning id`,
        [slug, `Fictional Nursing Home ${mark.toUpperCase()}`, `Demo Home ${mark.toUpperCase()}`],
      );
      const id = tenant.rows[0]?.id;
      if (!id) throw new Error('tenant insert did not return an id');
      const location = await migrator.query<{ id: string }>(
        `insert into locations (tenant_id, name, code, city, state_code, address_line1, pincode)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id`,
        [id, city, mark.toUpperCase(), city, state, '1 Demo Marg', state === '27' ? '400001' : '452001'],
      );
      const locationId = location.rows[0]?.id;
      if (!locationId) throw new Error('location insert did not return an id');
      created.push({ id, slug, locationId, city });
    }
    const a = created[0];
    const b = created[1];
    if (!a || !b) throw new Error('fixture pair was not created');
    return { runId, a, b };
  });
}

export async function deleteTenantPair(migrator: pg.Client, pair: FixturePair | null): Promise<void> {
  if (!pair) return;
  await asPlatform(migrator, async () => {
    await migrator.query(`delete from locations where tenant_id = any($1::uuid[])`, [[pair.a.id, pair.b.id]]);
    await migrator.query(`delete from tenants where id = any($1::uuid[])`, [[pair.a.id, pair.b.id]]);
  });
}

/** Transaction-local tenant scope. Caller owns BEGIN/COMMIT. */
export async function scopeToTenant(client: pg.Client, tenantId: string): Promise<void> {
  await client.query(`select set_config('app.scope', 'tenant', true), set_config('app.tenant_id', $1, true)`, [tenantId]);
}

export async function queryInSavepoint<T extends pg.QueryResultRow>(
  client: pg.Client,
  sql: string,
  params: unknown[] = [],
): Promise<{ ok: true; result: pg.QueryResult<T> } | { ok: false; error: Error }> {
  const mark = `sp_${randomUUID().replace(/-/g, '')}`;
  await client.query(`savepoint ${mark}`);
  try {
    const result = await client.query<T>(sql, params);
    await client.query(`release savepoint ${mark}`);
    return { ok: true, result };
  } catch (err) {
    await client.query(`rollback to savepoint ${mark}`);
    return { ok: false, error: err as Error };
  }
}
