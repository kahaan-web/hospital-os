import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Walk up from `start` to the monorepo root (the folder holding docker-compose.yml). */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'docker-compose.yml')) && existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

let loaded = false;

/** Load the root `.env` (if present) into process.env without overriding variables that are already set. */
export function loadEnvFile(): void {
  if (loaded) return;
  loaded = true;
  const file = join(findRepoRoot(), '.env');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export interface DbEnv {
  /** Superuser connection — bootstrap only (creates the two roles below). */
  adminUrl: string;
  /** Owns the schema; runs migrations and seeds. NOSUPERUSER, NOBYPASSRLS. */
  migrationUrl: string;
  /** What the API connects as. NOSUPERUSER, NOBYPASSRLS; subject to RLS. */
  appUrl: string;
  database: string;
}

// Development defaults mirror .env.example so a clean clone works before `.env` exists. Production must set real values.
const DEV_DEFAULTS = {
  DATABASE_ADMIN_URL: 'postgres://postgres:hos_dev_superuser@127.0.0.1:55432/hospital_os',
  DATABASE_MIGRATION_URL: 'postgres://hos_migrator:hos_dev_migrator@127.0.0.1:55432/hospital_os',
  DATABASE_URL: 'postgres://hos_app:hos_dev_app@127.0.0.1:55432/hospital_os',
} as const;

function withDatabase(url: string, database: string | undefined): string {
  if (!database) return url;
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

export function envValue(key: string, devDefault?: string): string {
  loadEnvFile();
  const v = process.env[key];
  if (v !== undefined && v !== '') return v;
  if (devDefault !== undefined && process.env.NODE_ENV !== 'production') return devDefault;
  throw new Error(`Missing required environment variable ${key}`);
}

/** Database URLs. `HOS_DB_NAME` swaps the database name in all three (used by the test suite). */
export function dbEnv(): DbEnv {
  const override = process.env.HOS_DB_NAME || undefined;
  const adminUrl = withDatabase(envValue('DATABASE_ADMIN_URL', DEV_DEFAULTS.DATABASE_ADMIN_URL), override);
  return {
    adminUrl,
    migrationUrl: withDatabase(envValue('DATABASE_MIGRATION_URL', DEV_DEFAULTS.DATABASE_MIGRATION_URL), override),
    appUrl: withDatabase(envValue('DATABASE_URL', DEV_DEFAULTS.DATABASE_URL), override),
    database: new URL(adminUrl).pathname.replace(/^\//, ''),
  };
}
