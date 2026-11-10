// MOCK demo people: staff for every role at every Sunrise location, 40 sample patients, and a second tenant
// (Lotus Nursing Home) so tenant isolation can be shown and tested. Idempotent: re-running adds only what is missing,
// so it also tops up databases that were seeded before this file existed.
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DEFAULT_DEPARTMENTS, addCycle, parseDDMMYYYY } from '@hos/shared';
import type { Db, Tx } from './client';
import {
  LOCATION_ADDRESS,
  LOTUS_PATIENTS,
  LOTUS_STAFF,
  SUNRISE_DOCTORS,
  SUNRISE_PATIENTS,
  SUNRISE_STAFF,
  type DemoPatient,
  type DemoStaff,
} from './demo-data';
import { hashPassword } from './password';
import * as schema from './schema';

export const DEMO_PEOPLE_PASSWORD = 'Demo@12345';
const SUNRISE_SLUG = 'sunrise-care';
const LOTUS_SLUG = 'lotus-nursing';

/** Fake +91 mobile in the 90000 xxxxx block. `n` keeps every number in the dataset distinct. */
export function demoMobile(n: number): string {
  return `+9190000${String(n).padStart(5, '0')}`;
}

/** ABHA-style 14-digit number. Real ABHA numbers never start with 00, so these cannot collide with an issued one. */
export function demoAbhaNumber(n: number): string {
  const digits = `00${String(n).padStart(12, '0')}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10, 14)}`;
}

function iso(ddmmyyyy: string): string {
  const out = parseDDMMYYYY(ddmmyyyy);
  if (!out) throw new Error(`Bad DD/MM/YYYY date in demo data: ${ddmmyyyy}`);
  return out;
}

async function asPlatform(tx: Tx): Promise<void> {
  await tx.execute(sql`select set_config('app.scope', 'platform', true), set_config('app.tenant_id', '', true)`);
}

async function ensureLotusTenant(db: Db, log: (m: string) => void): Promise<void> {
  const existing = await db.select({ id: schema.tenants.id }).from(schema.tenants).where(eq(schema.tenants.slug, LOTUS_SLUG));
  if (existing.length > 0) return;
  const plan = (await db.select().from(schema.plans).where(eq(schema.plans.key, 'basic')))[0];
  if (!plan) throw new Error('Basic plan is missing. Run db:seed first.');
  const monthly = (
    await db
      .select()
      .from(schema.prices)
      .where(and(eq(schema.prices.targetType, 'plan'), eq(schema.prices.targetId, plan.id), eq(schema.prices.billingCycle, 'monthly')))
  )[0];
  if (!monthly) throw new Error('Basic plan has no monthly price.');
  const start = new Date();
  await db.transaction(async (tx) => {
    await asPlatform(tx);
    const [tenant] = await tx
      .insert(schema.tenants)
      .values({
        slug: LOTUS_SLUG,
        status: 'active',
        onboardingStep: 'done',
        onboardingDraft: { planId: plan.id, cycle: 'monthly', locationCount: 1, addonModuleIds: [] },
        onboardingCompletedAt: start,
        facilityType: 'nursing_home',
        legalName: 'Lotus Nursing Home (Demo)',
        displayName: 'Lotus Nursing Home (Demo)',
        gstin: '',
        registrationNo: 'DEMO-MH-PUN-2026-014',
        bedCount: 20,
        specialities: ['General Medicine', 'Obstetrics & Gynaecology'],
        sandbox: true,
      })
      .returning();
    const tenantId = tenant!.id;
    const [loc] = await tx
      .insert(schema.locations)
      .values({
        tenantId,
        name: 'Pune',
        code: 'PUN',
        city: 'Pune',
        stateCode: '27',
        pincode: '411038',
        addressLine1: '3 Sample Lane, Kothrud',
        phone: '02040000004',
        isPrimary: true,
        sortOrder: 0,
      })
      .returning();
    await tx.insert(schema.departments).values(DEFAULT_DEPARTMENTS.map((name, sortOrder) => ({ tenantId, locationId: loc!.id, name, sortOrder })));
    await tx.insert(schema.doctors).values([
      { tenantId, locationId: loc!.id, name: 'Dr. Madhuri Kale', qualification: 'MBBS, DGO', speciality: 'Obstetrics & Gynaecology', isSample: true },
      { tenantId, locationId: loc!.id, name: 'Dr. Prashant Gaikwad', qualification: 'MBBS, MD', speciality: 'General Medicine', isSample: true },
    ]);
    const [subscription] = await tx
      .insert(schema.subscriptions)
      .values({
        tenantId,
        planId: plan.id,
        billingCycle: 'monthly',
        locationCount: 1,
        status: 'active',
        currentPeriodStart: start,
        currentPeriodEnd: addCycle(start, 'monthly'),
      })
      .returning();
    await tx.insert(schema.subscriptionItems).values({
      tenantId,
      subscriptionId: subscription!.id,
      kind: 'plan',
      planId: plan.id,
      unitAmountPaise: monthly.amountPaise,
      quantity: 1,
      status: 'active',
    });
    await tx.insert(schema.auditLog).values({
      tenantId,
      actorType: 'system',
      actorLabel: 'Demo seed',
      action: 'demo.tenant.seed',
      entityType: 'tenant',
      entityId: tenantId,
      after: { slug: LOTUS_SLUG, plan: 'basic' },
    });
    log(`demo tenant ${LOTUS_SLUG} ${tenantId}`);
  });
}

interface TenantCtx {
  tenantId: string;
  slug: string;
  locByCode: Map<string, string>;
  uhidPrefix: string;
  /** Offset so mobiles and ABHA numbers never repeat across tenants. */
  numberBase: number;
}

async function loadTenant(db: Db, slug: string, uhidPrefix: string, numberBase: number): Promise<TenantCtx | null> {
  const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants).where(eq(schema.tenants.slug, slug));
  if (!tenant) return null;
  const locs = await db.select().from(schema.locations).where(eq(schema.locations.tenantId, tenant.id));
  return { tenantId: tenant.id, slug, locByCode: new Map(locs.map((l) => [l.code, l.id])), uhidPrefix, numberBase };
}

function locationId(ctx: TenantCtx, code: string | null): string | null {
  if (code === null) return null;
  const id = ctx.locByCode.get(code);
  if (!id) throw new Error(`Tenant ${ctx.slug} has no location ${code}`);
  return id;
}

async function addStaff(tx: Tx, ctx: TenantCtx, staff: DemoStaff[], passwordHash: string): Promise<number> {
  const roles = await tx.select().from(schema.roles).where(isNull(schema.roles.tenantId));
  const roleByKey = new Map(roles.map((r) => [r.key, r.id]));
  const taken = new Set(
    (await tx.select({ email: schema.users.email }).from(schema.users)).map((u) => u.email.toLowerCase()),
  );
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
        mobile: demoMobile(ctx.numberBase + 900 + i).slice(3),
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
      locationId: locationId(ctx, person.loc),
    });
    added++;
  }
  return added;
}

async function addPatients(tx: Tx, ctx: TenantCtx, patients: DemoPatient[]): Promise<number> {
  const perLocation = new Map<string, number>();
  const rows = patients.map((p, i) => {
    const seq = (perLocation.get(p.loc) ?? 0) + 1;
    perLocation.set(p.loc, seq);
    const n = ctx.numberBase + i + 1;
    const address = LOCATION_ADDRESS[p.loc];
    if (!address) throw new Error(`No sample address for location ${p.loc}`);
    const handle = `${p.first}.${p.last}`.toLowerCase().replace(/[^a-z.]/g, '');
    return {
      tenantId: ctx.tenantId,
      locationId: locationId(ctx, p.loc)!,
      uhid: `DEMO-${ctx.uhidPrefix}-${p.loc}-${String(seq).padStart(5, '0')}`,
      firstName: p.first,
      lastName: p.last,
      sex: p.sex,
      dob: iso(p.dob),
      mobile: demoMobile(n),
      email: '',
      bloodGroup: p.blood,
      addressLine1: `${10 + i} Sample Street, ${p.area}`,
      city: address.city,
      stateCode: address.stateCode,
      pincode: address.pincode,
      emergencyContactName: p.emergencyName,
      emergencyContactRelation: p.emergencyRelation,
      emergencyContactMobile: demoMobile(n + 500),
      abhaNumber: p.abha ? demoAbhaNumber(n) : null,
      abhaAddress: p.abha ? `${handle}.${String(n).padStart(3, '0')}@sbx` : null,
      isSample: true,
      registeredAt: new Date(`${iso(p.registered)}T10:00:00+05:30`),
    };
  });
  const inserted = await tx.insert(schema.patients).values(rows).onConflictDoNothing().returning({ id: schema.patients.id });
  return inserted.length;
}

async function addDoctors(tx: Tx, ctx: TenantCtx): Promise<number> {
  const have = new Set((await tx.select({ name: schema.doctors.name, loc: schema.doctors.locationId }).from(schema.doctors)).map((d) => `${d.loc}|${d.name}`));
  const rows = SUNRISE_DOCTORS.map((d) => ({ ...d, locationId: locationId(ctx, d.loc)! })).filter((d) => !have.has(`${d.locationId}|${d.name}`));
  if (rows.length === 0) return 0;
  await tx.insert(schema.doctors).values(
    rows.map((d) => ({ tenantId: ctx.tenantId, locationId: d.locationId, name: d.name, qualification: d.qualification, speciality: d.speciality, isSample: true })),
  );
  return rows.length;
}

export async function seedDemoPeople(db: Db, log: (m: string) => void = console.log): Promise<void> {
  await ensureLotusTenant(db, log);
  const passwordHash = await hashPassword(DEMO_PEOPLE_PASSWORD);
  const plan: [string, string, number, DemoStaff[], DemoPatient[]][] = [
    [SUNRISE_SLUG, 'SUN', 0, SUNRISE_STAFF, SUNRISE_PATIENTS],
    [LOTUS_SLUG, 'LOT', 2000, LOTUS_STAFF, LOTUS_PATIENTS],
  ];
  for (const [slug, prefix, base, staff, patients] of plan) {
    const ctx = await loadTenant(db, slug, prefix, base);
    if (!ctx) throw new Error(`Demo tenant ${slug} is missing. Run db:seed:demo.`);
    await db.transaction(async (tx) => {
      await asPlatform(tx);
      const staffAdded = await addStaff(tx, ctx, staff, passwordHash);
      const doctorsAdded = slug === SUNRISE_SLUG ? await addDoctors(tx, ctx) : 0;
      const patientsAdded = await addPatients(tx, ctx, patients);
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
      log(`${slug}: +${staffAdded} staff, +${doctorsAdded} doctors, +${patientsAdded} sample patients`);
    });
  }
  printPeopleLogins(log);
}

export function printPeopleLogins(log: (m: string) => void): void {
  log(`More demo logins (password ${DEMO_PEOPLE_PASSWORD})`);
  log('  Sunrise, all locations   accounts@sunrise.demo');
  log('  Sunrise Mumbai           pharmacist@sunrise.demo, labtech@sunrise.demo');
  log('  Sunrise Indore / Jaipur  <role>.indore@sunrise.demo, <role>.jaipur@sunrise.demo');
  log('                           role = location.admin, frontdesk, doctor, nurse, cashier, pharmacist, labtech');
  log('  Lotus (second tenant)    owner@lotus.demo, frontdesk@lotus.demo, nurse@lotus.demo');
}
