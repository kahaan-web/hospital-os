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
 * Run `fn` in a transaction scoped to one tenant. Row-level security policies read `app.tenant_id`, so every
 * query inside sees and writes only that tenant's rows — even a query with no WHERE clause.
 * The settings are transaction-local (`set_config(..., true)`), so pooled connections never leak a tenant.
 */
export async function withTenant<T>(db: Db, tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.scope', 'tenant', true), set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/**
 * Run `fn` in platform scope: App Admin console, authentication look-ups and provisioning.
 * Platform scope can see every tenant, so call sites are deliberately few and explicit.
 */
export async function withPlatform<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.scope', 'platform', true), set_config('app.tenant_id', '', true)`);
    return fn(tx);
  });
}
