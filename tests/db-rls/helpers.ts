// Low-level helpers for the DB-level RLS suite. Plain node-postgres, no ORM: every statement here is exactly what
// reaches Postgres, so a passing test proves the database itself (not app code) enforces isolation.
import pg from 'pg';
import { dbEnv } from '../../packages/db/src/env';

export const APP_ROLE = 'hos_app';

export async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

/** owner = hos_migrator (fixtures, catalogue questions); app = hos_app (the role under test, subject to RLS). */
export async function connectBoth(): Promise<{ owner: pg.Client; app: pg.Client; database: string }> {
  const env = dbEnv();
  const owner = await connect(env.migrationUrl);
  const app = await connect(env.appUrl);
  const who = await app.query<{ u: string }>('select current_user as u');
  if (who.rows[0]?.u !== APP_ROLE) throw new Error(`DATABASE_URL must connect as ${APP_ROLE}, got ${who.rows[0]?.u}`);
  return { owner, app, database: env.database };
}

/** node-pg `end()` can hang on Windows; never block teardown on it. */
export function close(client: pg.Client): Promise<void> {
  return Promise.race([client.end().then(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, 2000))]);
}

export type Scope = { scope: 'tenant' | 'platform'; tenantId: string | null } | null;

/**
 * Run `fn` in a transaction that is ALWAYS rolled back, with the same transaction-local settings the API uses
 * (`withTenant` / `withPlatform` in packages/db/src/client.ts). `null` = no settings at all.
 */
export async function inTx<T>(client: pg.Client, ctx: Scope, fn: () => Promise<T>): Promise<T> {
  await client.query('begin');
  try {
    if (ctx) {
      await client.query("select set_config('app.scope', $1, true), set_config('app.tenant_id', $2, true)", [
        ctx.scope,
        ctx.tenantId ?? '',
      ]);
    }
    return await fn();
  } finally {
    await client.query('rollback');
  }
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

export type Denial = 'rls' | 'privilege';

/** 42501 covers both "permission denied" (no GRANT) and "new row violates row-level security policy". */
export function denial(a: Attempt): Denial | null {
  if (a.ok || a.code !== '42501') return null;
  return /row-level security/i.test(a.message) ? 'rls' : 'privilege';
}

export function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unexpected identifier ${name}`);
  return `"${name}"`;
}
