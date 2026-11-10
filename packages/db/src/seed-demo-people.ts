// MOCK demo people for the Sunrise Care demo tenant: staff for every role at every location, extra sample doctors,
// and 40 sample patients (plus 5 for the second demo tenant, Lotus, once the Phase B seed has created it).
//
// Idempotent: re-running adds only what is missing, so it also tops up databases seeded before this file existed.
//
// Patients: the `patients` table belongs to Phase B task B0 (migration 0100, docs/PHASE_B_PLAN.md §1.1). This seed
// does not create it. It reads the table's columns at run time, fills the ones it knows, and skips patients with a
// log line when the table is missing or has a required column it cannot fill. Run `npm run db:seed:demo` again after
// the Phase B migrations to load them.
import { eq, isNull, sql } from 'drizzle-orm';
import { parseDDMMYYYY } from '@hos/shared';
import type { Db, Tx } from './client';
import { SUNRISE_DOCTORS, SUNRISE_PATIENTS, LOTUS_PATIENTS, SUNRISE_STAFF, type DemoPatient, type DemoStaff } from './demo-data';
import { hashPassword } from './password';
import * as schema from './schema';

export const DEMO_PEOPLE_PASSWORD = 'Demo@12345';
const SUNRISE_SLUG = 'sunrise-care';
const LOTUS_OWNER_EMAIL = 'owner@lotus.demo';

/** Fake Indian mobile (10 digits, like users.mobile) in the 90000 xxxxx block. Shown to people as +91 90000 xxxxx. */
export function demoMobile(n: number): string {
  return `90000${String(n).padStart(5, '0')}`;
}

/** ABHA-style 14-digit number. Issued ABHA numbers never start with 00, so these cannot collide with a real one. */
export function demoAbhaNumber(n: number): string {
  const d = `00${String(n).padStart(12, '0')}`;
  return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}-${d.slice(10, 14)}`;
}

function iso(ddmmyyyy: string): string {
  const out = parseDDMMYYYY(ddmmyyyy);
  if (!out) throw new Error(`Bad DD/MM/YYYY date in demo data: ${ddmmyyyy}`);
  return out;
}

function ageOn(dobIso: string, onIso: string): number {
  const [y, m, d] = dobIso.split('-').map(Number) as [number, number, number];
  const [oy, om, od] = onIso.split('-').map(Number) as [number, number, number];
  return oy - y - (om < m || (om === m && od < d) ? 1 : 0);
}

interface Loc {
  id: string;
  code: string;
  city: string;
  stateCode: string;
  pincode: string;
  isPrimary: boolean;
}

interface TenantCtx {
  tenantId: string;
  label: string;
  uhidPrefix: string;
  locs: Loc[];
  /** Offset so mobiles and ABHA numbers never repeat across tenants. */
  numberBase: number;
}

async function asPlatformOn(tx: Tx, tenantId: string): Promise<void> {
  await tx.execute(sql`select set_config('app.scope', 'platform', true), set_config('app.tenant_id', ${tenantId}, true)`);
}

async function tenantCtx(db: Db, tenantId: string, label: string, uhidPrefix: string, numberBase: number): Promise<TenantCtx> {
  const locs = await db.select().from(schema.locations).where(eq(schema.locations.tenantId, tenantId));
  return { tenantId, label, uhidPrefix, numberBase, locs };
}

function loc(ctx: TenantCtx, code: string): Loc {
  const found = code === 'PRIMARY' ? (ctx.locs.find((l) => l.isPrimary) ?? ctx.locs[0]) : ctx.locs.find((l) => l.code === code);
  if (!found) throw new Error(`${ctx.label} has no location ${code}`);
  return found;
}

async function addStaff(tx: Tx, ctx: TenantCtx, staff: DemoStaff[], passwordHash: string): Promise<number> {
  const roles = await tx.select().from(schema.roles).where(isNull(schema.roles.tenantId));
  const roleByKey = new Map(roles.map((r) => [r.key, r.id]));
  const taken = new Set((await tx.select({ email: schema.users.email }).from(schema.users)).map((u) => u.email.toLowerCase()));
  let added = 0;
  for (const [i, person] of staff.entries()) {
    if (taken.has(person.email)) continue;
    const roleId = roleByKey.get(person.role);
    if (!roleId) throw new Error(`System role ${person.role} is missing. Run db:seed first.`);
    const [user] = await tx
      .insert(schema.users)
      .values({
        tenantId: ctx.tenantId,
        email: person.email,
        mobile: demoMobile(ctx.numberBase + 900 + i),
        name: person.name,
        passwordHash,
        status: 'active',
        designation: person.designation ?? null,
        mobileVerifiedAt: new Date(),
      })
      .returning();
    await tx.insert(schema.userLocationRoles).values({
      tenantId: ctx.tenantId,
      userId: user!.id,
      roleId,
      locationId: person.loc === null ? null : loc(ctx, person.loc).id,
    });
    added++;
  }
  return added;
}

async function addDoctors(tx: Tx, ctx: TenantCtx): Promise<number> {
  const have = new Set((await tx.select({ name: schema.doctors.name, loc: schema.doctors.locationId }).from(schema.doctors)).map((d) => `${d.loc}|${d.name}`));
  const rows = SUNRISE_DOCTORS.map((d) => ({ ...d, locationId: loc(ctx, d.loc).id })).filter((d) => !have.has(`${d.locationId}|${d.name}`));
  if (rows.length === 0) return 0;
  await tx.insert(schema.doctors).values(
    rows.map((d) => ({ tenantId: ctx.tenantId, locationId: d.locationId, name: d.name, qualification: d.qualification, speciality: d.speciality, isSample: true })),
  );
  return rows.length;
}

interface ColumnInfo {
  name: string;
  required: boolean;
}

/** Columns of the Phase B `patients` table, or null when it does not exist yet. */
async function patientColumns(tx: Tx): Promise<ColumnInfo[] | null> {
  const res = await tx.execute<{ column_name: string; is_nullable: string; column_default: string | null; is_generated: string; identity: string }>(sql`
    select column_name, is_nullable, column_default, is_generated, is_identity as identity
    from information_schema.columns
    where table_schema = 'public' and table_name = 'patients'
  `);
  if (res.rows.length === 0) return null;
  return res.rows
    .filter((c) => c.is_generated !== 'ALWAYS')
    .map((c) => ({ name: c.column_name, required: c.is_nullable === 'NO' && c.column_default === null && c.identity !== 'YES' }));
}

function title(p: DemoPatient, age: number): string {
  if (p.sex === 'male') return age < 18 ? 'Master' : 'Mr';
  if (p.sex === 'female') return age < 18 ? 'Miss' : 'Ms';
  return 'Mx';
}

/** Demo sheets say "Spouse" / "Father". The patients check only allows the coded relations. */
function guardianRelation(label: string): string {
  const key = label.trim().toLowerCase();
  if (key === 'spouse' || key === 'wife' || key === 'husband') return 'spouse';
  if (key === 'father' || key === 'mother' || key === 'parent') return 'parent';
  if (key === 'son' || key === 'daughter' || key === 'child') return 'child';
  if (key === 'brother' || key === 'sister' || key === 'sibling') return 'sibling';
  if (key === 'guardian') return 'guardian';
  if (key === 'friend') return 'friend';
  return 'other';
}

function patientRow(ctx: TenantCtx, p: DemoPatient, i: number, seq: number): Record<string, unknown> {
  const n = ctx.numberBase + i + 1;
  const site = loc(ctx, p.loc);
  const dob = iso(p.dob);
  const registered = iso(p.registered);
  const age = ageOn(dob, registered);
  const minor = age < 18;
  const handle = `${p.first}.${p.last}`.toLowerCase().replace(/[^a-z.]/g, '');
  return {
    tenant_id: ctx.tenantId,
    uhid: `DEMO-${ctx.uhidPrefix}-${site.code}-${String(seq).padStart(5, '0')}`,
    registered_location_id: site.id,
    location_id: site.id,
    title: title(p, age),
    first_name: p.first,
    middle_name: '',
    last_name: p.last,
    gender: p.sex,
    sex: p.sex,
    dob,
    dob_estimated: false,
    age_years_at_reg: age,
    mobile: demoMobile(n),
    alt_mobile: '',
    email: '',
    address_line1: `${10 + i} Sample Street, ${p.area}`,
    address_line2: '',
    city: site.city,
    district: site.city,
    state_code: site.stateCode,
    pincode: site.pincode,
    blood_group: p.blood,
    marital_status: '',
    guardian_name: minor ? p.emergencyName : '',
    guardian_relation: minor ? guardianRelation(p.emergencyRelation) : null,
    emergency_name: p.emergencyName,
    emergency_relation: p.emergencyRelation,
    emergency_mobile: demoMobile(n + 500),
    id_type: 'none',
    id_last4: null,
    abha_number: p.abha ? demoAbhaNumber(n) : null,
    abha_address: p.abha ? `${handle}.${String(n).padStart(3, '0')}@sbx` : null,
    status: 'active',
    is_sample: true,
    registered_at: new Date(`${registered}T10:00:00+05:30`),
  };
}

/** Returns the number of patients inserted, or a reason they were skipped. */
async function addPatients(tx: Tx, ctx: TenantCtx, patients: DemoPatient[]): Promise<number | string> {
  const columns = await patientColumns(tx);
  if (!columns) return 'skipped: patients table not present yet (Phase B migration 0100)';
  const perLocation = new Map<string, number>();
  const rows = patients.map((p, i) => {
    const code = loc(ctx, p.loc).code;
    const seq = (perLocation.get(code) ?? 0) + 1;
    perLocation.set(code, seq);
    return patientRow(ctx, p, i, seq);
  });
  const known = new Set(Object.keys(rows[0]!));
  const missing = columns.filter((c) => c.required && !known.has(c.name)).map((c) => c.name);
  if (missing.length > 0) return `skipped: patients has required columns this seed cannot fill (${missing.join(', ')})`;
  const cols = columns.map((c) => c.name).filter((name) => known.has(name));
  const values = rows.map((row) => sql`(${sql.join(cols.map((c) => sql`${row[c] ?? null}`), sql`, `)})`);
  try {
    // Savepoint: a schema mismatch must not roll back the staff and doctors added in this transaction.
    const inserted = await tx.transaction(async (sp) =>
      sp.execute(sql`insert into patients (${sql.join(cols.map((c) => sql.identifier(c)), sql`, `)}) values ${sql.join(values, sql`, `)} on conflict do nothing returning id`),
    );
    return inserted.rows.length;
  } catch (err) {
    return `skipped: insert failed (${(err as Error).message})`;
  }
}

async function seedTenant(
  db: Db,
  ctx: TenantCtx,
  staff: DemoStaff[],
  patients: DemoPatient[],
  passwordHash: string,
  withDoctors: boolean,
  log: (m: string) => void,
): Promise<void> {
  await db.transaction(async (tx) => {
    await asPlatformOn(tx, ctx.tenantId);
    const staffAdded = await addStaff(tx, ctx, staff, passwordHash);
    const doctorsAdded = withDoctors ? await addDoctors(tx, ctx) : 0;
    const patientsResult = await addPatients(tx, ctx, patients);
    const patientsAdded = typeof patientsResult === 'number' ? patientsResult : 0;
    if (staffAdded + doctorsAdded + patientsAdded > 0) {
      await tx.insert(schema.auditLog).values({
        tenantId: ctx.tenantId,
        actorType: 'system',
        actorLabel: 'Demo seed',
        action: 'demo.people.seed',
        entityType: 'tenant',
        entityId: ctx.tenantId,
        after: { staffAdded, doctorsAdded, patientsAdded, sample: true },
      });
    }
    const p = typeof patientsResult === 'number' ? `+${patientsResult} sample patients` : `patients ${patientsResult}`;
    log(`${ctx.label}: +${staffAdded} staff, +${doctorsAdded} doctors, ${p}`);
  });
}

export async function seedDemoPeople(db: Db, log: (m: string) => void = console.log): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PEOPLE_PASSWORD);
  const [sunrise] = await db.select({ id: schema.tenants.id }).from(schema.tenants).where(eq(schema.tenants.slug, SUNRISE_SLUG));
  if (!sunrise) throw new Error(`Demo tenant ${SUNRISE_SLUG} is missing. Run db:seed:demo.`);
  await seedTenant(db, await tenantCtx(db, sunrise.id, 'Sunrise Care', 'SUN', 0), SUNRISE_STAFF, SUNRISE_PATIENTS, passwordHash, true, log);

  // Lotus is created by the Phase B seed. Add its sample patients only when it exists; never create the tenant here.
  // seedClinicalFoundation calls this again after creating Lotus, so one `db:seed:demo` still loads them.
  const lotus = await db.execute<{ tenant_id: string }>(sql`select tenant_id from users where lower(email) = ${LOTUS_OWNER_EMAIL} limit 1`);
  const lotusId = lotus.rows[0]?.tenant_id;
  if (lotusId) await seedTenant(db, await tenantCtx(db, lotusId, 'Lotus', 'LOT', 2000), [], LOTUS_PATIENTS, passwordHash, false, log);
  else log('Lotus: not present yet (created by the Phase B seed); its 5 sample patients load once that tenant exists');
  printPeopleLogins(log);
}

export function printPeopleLogins(log: (m: string) => void): void {
  log(`More Sunrise demo logins (password ${DEMO_PEOPLE_PASSWORD})`);
  log('  All locations    accounts@sunrise.demo');
  log('  Mumbai           pharmacist@sunrise.demo, labtech@sunrise.demo');
  log('  Indore / Jaipur  <role>.indore@sunrise.demo, <role>.jaipur@sunrise.demo');
  log('                   role = location.admin, frontdesk, doctor, nurse, cashier, pharmacist, labtech');
}
