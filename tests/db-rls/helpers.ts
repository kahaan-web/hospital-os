// Low-level helpers for the DB-level RLS suite. Plain node-postgres, no ORM: every statement here is exactly what
// reaches Postgres, so a passing test proves the database itself (not app code) enforces isolation.
//
// Connections use HOS_RLS_DATABASE_URL (default database hos_u1). They do not follow HOS_DB_NAME, which the rest
// of `npm test` sets to hos_test. migrate() / seed() read HOS_DB_NAME, so preparation sets it only for that call.
import pg from 'pg';
import { migrate } from '../../packages/db/src/migrate';
import { seed } from '../../packages/db/src/seed';
import { dbEnv, type DbEnv } from '../../packages/db/src/env';
import { TENANT_A, TENANT_B, ensureTenant, type ProbeSpec, type TenantFixture } from './fixtures';

export const APP_ROLE = 'hos_app';
const DEFAULT_RLS_DB = 'hos_u1';

export async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

/** node-pg `end()` can hang on Windows; never block teardown on it. */
export function close(client: pg.Client): Promise<void> {
  return Promise.race([client.end().then(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, 2000))]);
}

/** Database name for this suite. A full HOS_RLS_DATABASE_URL wins; otherwise hos_u1. */
export function rlsDatabaseName(): string {
  const raw = process.env.HOS_RLS_DATABASE_URL?.trim();
  if (!raw) return DEFAULT_RLS_DB;
  if (raw.includes('://')) {
    const name = new URL(raw).pathname.replace(/^\//, '');
    if (!name) throw new Error('HOS_RLS_DATABASE_URL is missing a database name');
    return decodeURIComponent(name);
  }
  return raw;
}

/**
 * Create hos_u1 (or HOS_RLS_DATABASE_URL's database), migrate it, and load the catalogue seed.
 * Catalogue rows (plans, modules, system roles, privacy notice) are required by the fixtures.
 * HOS_DB_NAME is restored before this returns so later hos_test files are unchanged.
 */
export async function prepareRlsDatabase(): Promise<DbEnv> {
  const name = rlsDatabaseName();
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unsafe RLS database name: ${name}`);
  const previous = process.env.HOS_DB_NAME;
  process.env.HOS_DB_NAME = name;
  try {
    const log = (m: string) => console.log(`[db-rls] ${m}`);
    await migrate(log);
    await seed(log);
    const env = dbEnv();
    const explicit = process.env.HOS_RLS_DATABASE_URL;
    if (explicit?.includes('://')) {
      return { ...env, appUrl: explicit, database: name };
    }
    return env;
  } finally {
    if (previous === undefined) delete process.env.HOS_DB_NAME;
    else process.env.HOS_DB_NAME = previous;
  }
}

export type RlsReady =
  | {
      ok: true;
      owner: pg.Client;
      app: pg.Client;
      database: string;
      tenantA: TenantFixture;
      tenantB: TenantFixture;
    }
  | { ok: false; reason: string };

/** True only for "Postgres is not accepting connections". SQL and auth errors are real failures. */
export function isDbUnreachable(err: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (value: unknown): boolean => {
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    const e = value as { code?: string; message?: string; errors?: unknown[]; cause?: unknown };
    if (e.code && ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNRESET'].includes(e.code)) {
      return true;
    }
    // Postgres connection / availability class. Not 28P01 (auth) or 3D000 (missing database).
    if (e.code && ['08000', '08001', '08004', '08006', '57P01', '57P02', '57P03'].includes(e.code)) return true;
    if (
      typeof e.message === 'string' &&
      /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|getaddrinfo|connect ECONN|Connection refused|Connection terminated|the database system is (starting up|shutting down)|timeout expired|server closed the connection/i.test(
        e.message,
      )
    ) {
      return true;
    }
    if (Array.isArray(e.errors) && e.errors.some(walk)) return true;
    if (e.cause && walk(e.cause)) return true;
    return false;
  };
  return walk(err);
}

/**
 * Migrate hos_u1, connect as hos_migrator (fixtures only) and hos_app (assertions), and create tenants A and B.
 * Returns a skip reason when Postgres itself is unreachable.
 */
export async function tryStartRls(): Promise<RlsReady> {
  let owner: pg.Client | undefined;
  let app: pg.Client | undefined;
  try {
    const env = await prepareRlsDatabase();
    owner = await connect(env.migrationUrl);
    app = await connect(env.appUrl);
    const who = await app.query<{ u: string }>('select current_user as u');
    if (who.rows[0]?.u !== APP_ROLE) {
      throw new Error(`RLS app connection must be ${APP_ROLE}, got ${who.rows[0]?.u ?? 'nobody'}`);
    }
    const tenantA = await ensureTenant(owner, TENANT_A);
    const tenantB = await ensureTenant(owner, TENANT_B);
    console.log(`[db-rls] ready on ${env.database} (A=${TENANT_A.slug}, B=${TENANT_B.slug}); hos_test is not used`);
    return { ok: true, owner, app, database: env.database, tenantA, tenantB };
  } catch (err) {
    if (owner) await close(owner);
    if (app) await close(app);
    if (isDbUnreachable(err)) {
      const reason = `DB-level RLS tests skipped: Postgres for ${rlsDatabaseName()} is unreachable (${(err as Error).message}). Start the hospital-os Postgres container on port 55432 and re-run.`;
      console.warn(`\n${reason}\n`);
      return { ok: false, reason };
    }
    throw err;
  }
}

export type Scope = { scope: 'tenant' | 'platform'; tenantId: string | null } | null;

/**
 * Run `fn` in a transaction that is ALWAYS rolled back, with the same transaction-local settings the API uses
 * (`withTenant` / `withPlatform` in packages/db/src/client.ts). `null` = no settings at all.
 */
export async function inTx<T>(client: pg.Client, ctx: Scope, fn: () => Promise<T>): Promise<T> {
  await client.query('begin');
  try {
    if (ctx) await setScope(client, ctx.scope, ctx.tenantId);
    return await fn();
  } finally {
    await client.query('rollback');
  }
}

/** Switch tenant context inside an open transaction (set_config is transaction-local). */
export async function setScope(client: pg.Client, scope: 'tenant' | 'platform', tenantId: string | null): Promise<void> {
  await client.query("select set_config('app.scope', $1, true), set_config('app.tenant_id', $2, true)", [scope, tenantId ?? '']);
}

export type Attempt =
  | { ok: true; rowCount: number; rows: Record<string, unknown>[] }
  | { ok: false; code: string; message: string };

/** One statement under a savepoint so a failure does not poison the surrounding transaction. */
export async function attempt(client: pg.Client, text: string, values: unknown[] = []): Promise<Attempt> {
  await client.query('savepoint rls_probe');
  try {
    const r = await client.query(text, values);
    await client.query('release savepoint rls_probe');
    return { ok: true, rowCount: r.rowCount ?? 0, rows: r.rows };
  } catch (err) {
    await client.query('rollback to savepoint rls_probe');
    const e = err as { code?: string; message?: string };
    return { ok: false, code: e.code ?? '?', message: e.message ?? String(err) };
  }
}

export type Denial = 'rls' | 'privilege' | 'append-only';

/**
 * 42501 covers "permission denied", "new row violates row-level security policy", and the audit trigger
 * (`audit_log is append-only`, same errcode). The message tells them apart.
 */
export function denial(a: Attempt): Denial | null {
  if (a.ok || a.code !== '42501') return null;
  if (/append-only/i.test(a.message)) return 'append-only';
  return /row-level security/i.test(a.message) ? 'rls' : 'privilege';
}

export function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unexpected identifier ${name}`);
  return `"${name}"`;
}

/** Count plus a stable hash of the tenant's rows, used to prove an attack did not change them. */
export async function fingerprint(
  client: pg.Client,
  table: string,
  key: string,
  tenantId: string,
): Promise<{ n: number; fp: string }> {
  const r = await client.query<{ n: number; fp: string }>(
    `select count(*)::int as n,
            md5(coalesce(string_agg((to_jsonb(x))::text, '|' order by (to_jsonb(x))::text), '')) as fp
       from ${ident(table)} x
      where ${ident(key)} = $1`,
    [tenantId],
  );
  return r.rows[0]!;
}

export type { ProbeSpec, TenantFixture };
