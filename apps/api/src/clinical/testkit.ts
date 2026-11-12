import { randomUUID } from 'node:crypto';
import { createDb, dbEnv, migrate, schema, seedDemo, withTenant, type Db, type Tx } from '@hos/db';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { expect } from 'vitest';

export interface PartyFixture {
  tenantId: string;
  locationId: string;
  patientId: string;
  encounterId: string;
  ownerEmail: string;
  userId: string;
}

export interface ClinicalFixture {
  password: string;
  sunrise: PartyFixture & { labServiceIds: [string, string]; doctorId: string };
  lotus: PartyFixture;
}

let pending: Promise<ClinicalFixture> | null = null;
let appHandle: { db: Db; close: () => Promise<void> } | null = null;

export function clinicalFixture(): Promise<ClinicalFixture> {
  if (!pending) pending = loadFixture();
  return pending;
}

async function loadFixture(): Promise<ClinicalFixture> {
  await migrate(() => {});
  try {
    await seedDemo(() => {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('duplicate') && !message.includes('23505')) throw error;
    await seedDemo(() => {});
  }
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const party = async (slug: string, email: string): Promise<PartyFixture> => {
      const [tenant] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, slug));
      if (!tenant) throw new Error(`missing tenant ${slug}`);
      const locs = await handle.db.select().from(schema.locations).where(eq(schema.locations.tenantId, tenant.id));
      const location = locs.find((l) => l.isPrimary) ?? locs[0];
      if (!location) throw new Error(`missing location for ${slug}`);
      const [patient] = await handle.db.select().from(schema.patients).where(eq(schema.patients.tenantId, tenant.id));
      const [encounter] = await handle.db.select().from(schema.encounters).where(eq(schema.encounters.tenantId, tenant.id));
      const [user] = await handle.db.select().from(schema.users).where(eq(schema.users.email, email));
      if (!patient || !encounter || !user) throw new Error(`missing clinical seed for ${slug}`);
      return { tenantId: tenant.id, locationId: location.id, patientId: patient.id, encounterId: encounter.id, ownerEmail: email, userId: user.id };
    };
    const sunrise = await party('sunrise-care', 'owner@sunrise.demo');
    const lotus = await party('lotus-demo', 'owner@lotus.demo');
    const labs = await handle.db.select().from(schema.services).where(eq(schema.services.tenantId, sunrise.tenantId));
    const cbc = labs.find((s) => s.code === 'LAB-CBC');
    const glu = labs.find((s) => s.code === 'LAB-GLU');
    const [doctor] = await handle.db.select().from(schema.doctors).where(eq(schema.doctors.tenantId, sunrise.tenantId));
    if (!cbc || !glu || !doctor) throw new Error('sunrise lab services or doctor missing');
    return {
      password: 'Demo@12345',
      sunrise: { ...sunrise, labServiceIds: [cbc.id, glu.id], doctorId: doctor.id },
      lotus,
    };
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

function app(): Db {
  if (!appHandle) appHandle = createDb(dbEnv().appUrl, { max: 8 });
  return appHandle.db;
}

/** Closes the hos_app pool opened by expectIsolation so the test process can exit. */
export async function closeClinicalPools(): Promise<void> {
  if (!appHandle) return;
  const handle = appHandle;
  appHandle = null;
  await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof (error as { code: unknown }).code === 'string') return (error as { code: string }).code;
  if ('cause' in error) return errorCode((error as { cause: unknown }).cause);
  return undefined;
}

const IDENT = /^[a-z_]+$/;

/**
 * CONTRACTS §10 for one class-T table. Connects as hos_app in tenant A:
 * B's row is invisible, UPDATE/DELETE by that id touch nothing (0 rows or 42501 when the
 * grant was revoked), and moving a row onto B is rejected (42501).
 */
export async function expectIsolation(table: string, idOfB: string): Promise<void> {
  if (!IDENT.test(table)) throw new Error(`unsafe table name ${table}`);
  const fx = await clinicalFixture();
  const admin = new pg.Client({ connectionString: dbEnv().adminUrl });
  await admin.connect();
  try {
    const before = await admin.query(`select * from ${table} where id = $1`, [idOfB]);
    expect(before.rowCount).toBe(1);
    const generated = await admin.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 and is_generated = 'ALWAYS'`,
      [table],
    );
    const skip = new Set(generated.rows.map((r) => r.column_name));
    await withTenant(app(), fx.sunrise.tenantId, async (tx) => {
      const seen = await tx.execute<{ n: number }>(sqlCount(table, idOfB));
      expect(Number(seen.rows[0]?.n ?? 0)).toBe(0);
      await expectHiddenOrDenied(tx, sqlTouch(table, idOfB));
      await expectHiddenOrDenied(tx, sqlDelete(table, idOfB));
      const mine = await tx.execute<{ n: number }>(sqlAll(table));
      if (Number(mine.rows[0]?.n ?? 0) > 0) {
        await expect(tx.execute(sqlRetarget(table, fx.lotus.tenantId))).rejects.toSatisfy((error: unknown) => errorCode(error) === '42501');
        return;
      }
      const row = { ...(before.rows[0] as Record<string, unknown>) };
      row.id = randomUUID();
      row.tenant_id = fx.lotus.tenantId;
      if (typeof row.uhid === 'string') row.uhid = `UH${String(Date.now()).slice(-9)}`;
      if (typeof row.code === 'string') row.code = `X${randomUUID().slice(0, 8)}`;
      if (typeof row.number === 'string') row.number = `X${randomUUID().slice(0, 8)}`;
      if (typeof row.series_key === 'string') row.series_key = `iso_${randomUUID().slice(0, 8)}`;
      const cols = Object.keys(row).filter((c) => !skip.has(c));
      const values = cols.map((c) => row[c]);
      await expect(tx.execute(sqlInsert(table, cols, values))).rejects.toSatisfy((error: unknown) => errorCode(error) === '42501');
    });
    const after = await admin.query(`select count(*)::int as n from ${table} where id = $1`, [idOfB]);
    expect(Number(after.rows[0]?.n)).toBe(1);
  } finally {
    await Promise.race([admin.end(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

async function expectHiddenOrDenied(tx: Tx, query: ReturnType<typeof sql>): Promise<void> {
  const mark = `iso_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  await tx.execute(sql.raw(`SAVEPOINT ${mark}`));
  try {
    const result = await tx.execute(query);
    expect(result.rowCount ?? 0).toBe(0);
  } catch (error) {
    await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${mark}`));
    if (errorCode(error) === '42501') return;
    throw error;
  }
  await tx.execute(sql.raw(`RELEASE SAVEPOINT ${mark}`));
}

function sqlCount(table: string, id: string) {
  return sql`select count(*)::int as n from ${sql.raw(table)} where id = ${id}::uuid`;
}
function sqlAll(table: string) {
  return sql`select count(*)::int as n from ${sql.raw(table)}`;
}
function sqlTouch(table: string, id: string) {
  return sql`update ${sql.raw(table)} set updated_at = updated_at where id = ${id}::uuid`;
}
function sqlDelete(table: string, id: string) {
  return sql`delete from ${sql.raw(table)} where id = ${id}::uuid`;
}
function sqlRetarget(table: string, tenantId: string) {
  return sql`update ${sql.raw(table)} set tenant_id = ${tenantId}::uuid`;
}
function sqlInsert(table: string, cols: string[], values: unknown[]) {
  const colSql = sql.raw(cols.map((c) => `"${c}"`).join(', '));
  const valSql = sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );
  return sql`insert into ${sql.raw(table)} (${colSql}) values (${valSql})`;
}
