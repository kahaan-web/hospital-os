import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { dbEnv } from './env';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export const MIGRATOR_ROLE = 'hos_migrator';
export const APP_ROLE = 'hos_app';
/** Login role for platform scope. Member of hos_app; hos_app is not a member of this role. */
export const PLATFORM_ROLE = 'hos_platform';

function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Shared-cluster role DDL can lose to another worktree's migrate. Retry that race only. */
function concurrentCatalogUpdate(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('tuple concurrently updated');
}

async function retryCatalog<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!concurrentCatalogUpdate(err) || attempt >= 5) throw err;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

function credentials(url: string, expectedRole: string): { password: string } {
  const u = new URL(url);
  const user = decodeURIComponent(u.username);
  if (user !== expectedRole) throw new Error(`Expected the connection user to be "${expectedRole}" but got "${user}"`);
  return { password: decodeURIComponent(u.password) };
}

/**
 * Bootstrap (superuser, once per database): create the database if missing and the least-privilege roles.
 *  - hos_migrator owns the schema and runs migrations. NOSUPERUSER, NOBYPASSRLS.
 *  - hos_app is what the API connects as for tenant traffic. NOSUPERUSER, NOBYPASSRLS, NOINHERIT.
 *  - hos_platform is the only login that may hold platform scope. It inherits hos_app. hos_app cannot become it.
 * In production this step is done by infrastructure (Terraform / DBA) and the superuser URL is never given to the app.
 * The platform password comes from DATABASE_PLATFORM_URL (dev default hos_dev_platform).
 */
export async function bootstrapRoles(log: (m: string) => void = () => {}): Promise<void> {
  const env = dbEnv();
  const migrator = credentials(env.migrationUrl, MIGRATOR_ROLE);
  const app = credentials(env.appUrl, APP_ROLE);
  const platform = credentials(env.platformUrl, PLATFORM_ROLE);
  if (!/^[a-z_][a-z0-9_]*$/.test(env.database)) throw new Error(`Unsafe database name: ${env.database}`);

  // Create the database when it does not exist (connect to the maintenance DB for that).
  const maintenanceUrl = new URL(env.adminUrl);
  maintenanceUrl.pathname = '/postgres';
  const maint = new pg.Client({ connectionString: maintenanceUrl.toString() });
  await maint.connect();
  try {
    const exists = await maint.query('select 1 from pg_database where datname = $1', [env.database]);
    if (exists.rowCount === 0) {
      await maint.query(`create database ${env.database}`);
      log(`created database ${env.database}`);
    }
    for (const [role, password, inherit] of [
      [MIGRATOR_ROLE, migrator.password, 'noinherit'],
      [APP_ROLE, app.password, 'noinherit'],
      [PLATFORM_ROLE, platform.password, 'inherit'],
    ] as const) {
      const found = await maint.query('select 1 from pg_roles where rolname = $1', [role]);
      const attrs = `login password ${literal(password)} nosuperuser nobypassrls nocreatedb nocreaterole ${inherit}`;
      await retryCatalog(() => maint.query(found.rowCount === 0 ? `create role ${role} ${attrs}` : `alter role ${role} ${attrs}`));
    }
    // One direction only. hos_platform inherits hos_app's grants; hos_app cannot SET ROLE hos_platform.
    await retryCatalog(() => maint.query(`grant ${APP_ROLE} to ${PLATFORM_ROLE}`));
  } finally {
    await closeClient(maint);
  }

  const admin = new pg.Client({ connectionString: env.adminUrl });
  await admin.connect();
  try {
    await admin.query(`grant connect on database ${env.database} to ${MIGRATOR_ROLE}, ${APP_ROLE}, ${PLATFORM_ROLE}`);
    await admin.query(`grant usage, create on schema public to ${MIGRATOR_ROLE}`);
    await admin.query(`grant usage on schema public to ${APP_ROLE}`);
    // 0001_rls.sql (frozen) creates public.sha256(bytea) on top of pgcrypto.digest.
    // Postgres has had pg_catalog.sha256(bytea) since version 11. The extension exists only so
    // that frozen migration can apply on a fresh database. 0003 switches the audit trigger to
    // pg_catalog.sha256 and drops the wrapper; migrate() then drops the extension.
    await admin.query('create extension if not exists pgcrypto');
    for (const role of [APP_ROLE, PLATFORM_ROLE]) {
      await retryCatalog(() => admin.query(`alter role ${role} set statement_timeout = '10s'`));
      await retryCatalog(() => admin.query(`alter role ${role} set idle_in_transaction_session_timeout = '15s'`));
    }
  } finally {
    await closeClient(admin);
  }
  log(`roles ready: ${MIGRATOR_ROLE} (migrations), ${APP_ROLE} (application, RLS enforced), ${PLATFORM_ROLE} (platform scope)`);
}

/** Apply pending SQL migrations as the migration role. Each file runs in its own transaction. */
export async function runMigrations(log: (m: string) => void = () => {}): Promise<string[]> {
  const env = dbEnv();
  const client = new pg.Client({ connectionString: env.migrationUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(
      'create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())',
    );
    const done = new Set((await client.query<{ name: string }>('select name from _migrations')).rows.map((r) => r.name));
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const body = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replaceAll('--> statement-breakpoint', '');
      await client.query('begin');
      try {
        await client.query(body);
        await client.query('insert into _migrations (name) values ($1)', [file]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err });
      }
      applied.push(file);
      log(`applied ${file}`);
    }
  } finally {
    await closeClient(client);
  }
  return applied;
}

/** node-pg `end()` can hang on Windows after a large multi-statement script. Don't block the CLI on it. */
function closeClient(client: pg.Client): Promise<void> {
  return Promise.race([
    client.end().then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 2000)),
  ]);
}

/** Superuser step. 0003 has already dropped public.sha256, so nothing should still depend on pgcrypto. */
export async function dropPgcrypto(log: (m: string) => void = () => {}): Promise<void> {
  const env = dbEnv();
  const admin = new pg.Client({ connectionString: env.adminUrl });
  await admin.connect();
  try {
    await admin.query('drop extension if exists pgcrypto');
    log('pgcrypto removed; audit hashes use pg_catalog.sha256');
  } finally {
    await closeClient(admin);
  }
}

export async function migrate(log: (m: string) => void = () => {}): Promise<void> {
  await bootstrapRoles(log);
  const applied = await runMigrations(log);
  if (applied.length === 0) log('database is up to date');
  await dropPgcrypto(log);
}
