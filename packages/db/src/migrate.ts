import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { dbEnv } from './env';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export const MIGRATOR_ROLE = 'hos_migrator';
export const APP_ROLE = 'hos_app';

function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function credentials(url: string, expectedRole: string): { password: string } {
  const u = new URL(url);
  const user = decodeURIComponent(u.username);
  if (user !== expectedRole) throw new Error(`Expected the connection user to be "${expectedRole}" but got "${user}"`);
  return { password: decodeURIComponent(u.password) };
}

/**
 * Bootstrap (superuser, once per database): create the database if missing and the two least-privilege roles.
 *  - hos_migrator owns the schema and runs migrations. NOSUPERUSER, NOBYPASSRLS.
 *  - hos_app is what the API connects as. NOSUPERUSER, NOBYPASSRLS → always subject to row-level security.
 * In production this step is done by infrastructure (Terraform / DBA) and the superuser URL is never given to the app.
 */
export async function bootstrapRoles(log: (m: string) => void = () => {}): Promise<void> {
  const env = dbEnv();
  const migrator = credentials(env.migrationUrl, MIGRATOR_ROLE);
  const app = credentials(env.appUrl, APP_ROLE);
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
    for (const [role, password] of [
      [MIGRATOR_ROLE, migrator.password],
      [APP_ROLE, app.password],
    ] as const) {
      const found = await maint.query('select 1 from pg_roles where rolname = $1', [role]);
      const attrs = `login password ${literal(password)} nosuperuser nobypassrls nocreatedb nocreaterole noinherit`;
      await maint.query(found.rowCount === 0 ? `create role ${role} ${attrs}` : `alter role ${role} ${attrs}`);
    }
  } finally {
    await closeClient(maint);
  }

  const admin = new pg.Client({ connectionString: env.adminUrl });
  await admin.connect();
  try {
    await admin.query(`grant connect on database ${env.database} to ${MIGRATOR_ROLE}, ${APP_ROLE}`);
    await admin.query(`grant usage, create on schema public to ${MIGRATOR_ROLE}`);
    await admin.query(`grant usage on schema public to ${APP_ROLE}`);
    // sha256() is not built into Postgres 16. pgcrypto supplies digest(); 0001_rls.sql wraps it as sha256(bytea).
    // Only the superuser can create an extension. The migration role is NOSUPERUSER.
    await admin.query('create extension if not exists pgcrypto');
    await admin.query(`alter role ${APP_ROLE} set statement_timeout = '10s'`);
    await admin.query(`alter role ${APP_ROLE} set idle_in_transaction_session_timeout = '15s'`);
  } finally {
    await closeClient(admin);
  }
  log(`roles ready: ${MIGRATOR_ROLE} (migrations), ${APP_ROLE} (application, RLS enforced)`);
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

export async function migrate(log: (m: string) => void = () => {}): Promise<void> {
  await bootstrapRoles(log);
  const applied = await runMigrations(log);
  if (applied.length === 0) log('database is up to date');
}
