import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

// Postgres BIGINT (paise totals, audit ids) is returned as a string by default; our values fit safely in a JS number.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Anything queries can run on. */
export type Queryable = Db | Tx;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export function createDb(connectionString: string, opts: { max?: number } = {}): DbHandle {
  const pool = new pg.Pool({ connectionString, max: opts.max ?? 8, idleTimeoutMillis: 30_000 });
  const db = drizzle({ client: pool, schema });
  return { db, pool, close: () => pool.end() };
}

/**
 * App-pool → platform-pool. `withPlatform` runs on the platform login when one is attached.
 * Without it, the call stays on the given pool and `hos_scope()` downgrades a platform claim to `none`.
 */
const platformDbs = new WeakMap<Db, Db>();

export function attachPlatformDb(appDb: Db, platformDb: Db): void {
  platformDbs.set(appDb, platformDb);
}

function dbForPlatform(db: Db): Db {
  return platformDbs.get(db) ?? db;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuid(id: string, label = 'id'): void {
  if (!UUID_RE.test(id)) throw new Error(`Invalid ${label}`);
}

/**
 * Run `fn` in a transaction scoped to one tenant. Row-level security policies read `app.tenant_id`, so every
 * query inside sees and writes only that tenant's rows — even a query with no WHERE clause.
 * The settings are transaction-local (`set_config(..., true)`), so pooled connections never leak a tenant.
 */
export async function withTenant<T>(db: Db, tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  assertUuid(tenantId, 'tenant id');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.scope', 'tenant', true), set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/**
 * Run `fn` in platform scope with no tenant selected. Catalogue tables stay readable and writable.
 * This sees no tenant-owned rows: `app.tenant_id` is empty, so every tenant policy matches nothing.
 * To work on one hospital as App Admin, use `withPlatformOnTenant`.
 * The transaction runs on the pool registered with `attachPlatformDb`. If none is attached, it runs on `db`
 * and a `hos_app` session cannot actually obtain platform scope (`hos_scope()` returns `none`).
 */
export async function withPlatform<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return dbForPlatform(db).transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.scope', 'platform', true), set_config('app.tenant_id', '', true)`);
    return fn(tx);
  });
}

/**
 * Platform scope aimed at a single tenant (suspend, overrides, admin actions that must land on that tenant's
 * audit chain). Tenant policies match the target; write policies that also require `hos_scope() = 'platform'` pass.
 * Same pool rule as `withPlatform`: fail closed when the platform login is not attached.
 */
export async function withPlatformOnTenant<T>(db: Db, tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  assertUuid(tenantId, 'tenant id');
  return dbForPlatform(db).transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.scope', 'platform', true), set_config('app.tenant_id', ${tenantId}, true)`,
    );
    return fn(tx);
  });
}
