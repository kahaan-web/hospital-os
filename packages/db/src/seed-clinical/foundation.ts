// Fictional Sunrise clinical masters and the Lotus Demo Clinic (Basic) used for isolation tests.
// Patients come from seedDemoPeople (DEMO- UHIDs). This file does not insert people.
import { and, asc, eq, inArray, isNull, like, sql } from 'drizzle-orm';
import { fyCode, type GstTreatment } from '@hos/shared';
import type { Db, Tx } from '../client';
import { hashPassword } from '../password';
import * as schema from '../schema';
import { demoMobile, seedDemoPeople } from '../seed-demo-people';
import { seedSunriseIndentsLinen } from './indents-linen';

const DEMO_PASSWORD = 'Demo@12345';
const SUNRISE = 'sunrise-care';
const LOTUS = 'lotus-demo';
const LOTUS_OWNER_EMAIL = 'owner@lotus.demo';
/** Clear of Lotus patient mobiles (2001–2005) and their emergency numbers (2501–2505). */
const LOTUS_OWNER_MOBILE = demoMobile(2999);

type Svc = { code: string; name: string; category: string; gst: GstTreatment; rate: number; price: number };

const SERVICES: Svc[] = [
  { code: 'CON-NEW', name: 'General consultation, new', category: 'consultation', gst: 'exempt_healthcare', rate: 0, price: 50000 },
  { code: 'CON-FU', name: 'General consultation, follow-up', category: 'consultation', gst: 'exempt_healthcare', rate: 0, price: 30000 },
  { code: 'CON-EM', name: 'Emergency consultation', category: 'consultation', gst: 'exempt_healthcare', rate: 0, price: 80000 },
  { code: 'CON-SPEC', name: 'Specialist consultation', category: 'consultation', gst: 'exempt_healthcare', rate: 0, price: 70000 },
  { code: 'PROC-DRESS', name: 'Wound dressing', category: 'procedure', gst: 'exempt_healthcare', rate: 0, price: 20000 },
  { code: 'PROC-SUT', name: 'Suture removal', category: 'procedure', gst: 'exempt_healthcare', rate: 0, price: 15000 },
  { code: 'PROC-ECG', name: 'ECG', category: 'procedure', gst: 'exempt_healthcare', rate: 0, price: 30000 },
  { code: 'PROC-NEB', name: 'Nebulisation', category: 'procedure', gst: 'exempt_healthcare', rate: 0, price: 15000 },
  { code: 'LAB-CBC', name: 'Complete blood count', category: 'lab', gst: 'exempt_healthcare', rate: 0, price: 35000 },
  { code: 'LAB-GLU', name: 'Fasting glucose', category: 'lab', gst: 'exempt_healthcare', rate: 0, price: 12000 },
  { code: 'LAB-RFT', name: 'Renal function test', category: 'lab', gst: 'exempt_healthcare', rate: 0, price: 45000 },
  { code: 'LAB-LFT', name: 'Liver function test', category: 'lab', gst: 'exempt_healthcare', rate: 0, price: 45000 },
  { code: 'LAB-URINE', name: 'Urine routine', category: 'lab', gst: 'exempt_healthcare', rate: 0, price: 10000 },
  { code: 'LAB-HBA1C', name: 'HbA1c', category: 'lab', gst: 'exempt_healthcare', rate: 0, price: 40000 },
  { code: 'LAB-TSH', name: 'Thyroid stimulating hormone', category: 'lab', gst: 'exempt_healthcare', rate: 0, price: 35000 },
  { code: 'LAB-CRP', name: 'C-reactive protein', category: 'lab', gst: 'exempt_healthcare', rate: 0, price: 40000 },
  { code: 'LAB-ESR', name: 'ESR', category: 'lab', gst: 'exempt_healthcare', rate: 0, price: 8000 },
  { code: 'LAB-BG', name: 'Blood group', category: 'lab', gst: 'exempt_healthcare', rate: 0, price: 8000 },
  { code: 'LAB-MP', name: 'Malaria parasite', category: 'lab', gst: 'exempt_healthcare', rate: 0, price: 15000 },
  { code: 'RAD-CXR', name: 'Chest X-ray', category: 'radiology', gst: 'exempt_healthcare', rate: 0, price: 40000 },
  { code: 'BED-GEN', name: 'General ward bed day', category: 'bed', gst: 'room_rent_rule', rate: 0, price: 150000 },
  { code: 'BED-SEMI', name: 'Semi-private bed day', category: 'bed', gst: 'room_rent_rule', rate: 0, price: 300000 },
  { code: 'BED-PVT', name: 'Private room bed day', category: 'bed', gst: 'room_rent_rule', rate: 0, price: 600000 },
  { code: 'BED-ICU', name: 'ICU bed day', category: 'bed', gst: 'exempt_healthcare', rate: 0, price: 800000 },
  { code: 'NUR-CARE', name: 'Nursing care per day', category: 'nursing', gst: 'exempt_healthcare', rate: 0, price: 50000 },
  { code: 'OT-MINOR', name: 'Minor procedure room', category: 'ot', gst: 'exempt_healthcare', rate: 0, price: 250000 },
  { code: 'PKG-ANC', name: 'Antenatal package', category: 'package', gst: 'exempt_healthcare', rate: 0, price: 1500000 },
  { code: 'MISC-FILE', name: 'Case file', category: 'misc', gst: 'exempt_healthcare', rate: 0, price: 5000 },
  { code: 'MISC-FOOD', name: 'Attendant meal', category: 'misc', gst: 'taxable', rate: 500, price: 15000 },
  { code: 'MISC-COSM', name: 'Cosmetic procedure (sample)', category: 'misc', gst: 'taxable', rate: 1800, price: 200000 },
];

async function ensureSeries(tx: Db | Tx, tenantId: string, locationId: string | null, key: string, period: string, lastNo: number) {
  await tx.execute(sql`
    insert into number_series (tenant_id, location_id, series_key, period, last_no)
    values (${tenantId}::uuid, ${locationId}::uuid, ${key}, ${period}, ${lastNo})
    on conflict on constraint number_series_uq do nothing
  `);
}

export async function seedClinicalFoundation(db: Db, log: (m: string) => void): Promise<void> {
  const android = ['android-patient-portal', 'android-doctor-portal', 'android-nurses-workbench'];
  await db.update(schema.modules).set({ status: 'available' }).where(inArray(schema.modules.key, android));
  log(`android modules set available: ${android.join(', ')}`);
  // MVP demo slice (indents, linen): the Sunrise grant below only takes effect once the module is available.
  const demoSlice = ['indents-purchase', 'linen-laundry'];
  await db.update(schema.modules).set({ status: 'available' }).where(inArray(schema.modules.key, demoSlice));
  log(`demo slice modules set available: ${demoSlice.join(', ')}`);

  const sunrise = (await db.select().from(schema.tenants).where(eq(schema.tenants.slug, SUNRISE)))[0];
  if (!sunrise) {
    log('sunrise tenant missing; clinical seed skipped');
  } else {
    await seedSunriseClinical(db, sunrise.id, log);
    await grantSunriseModules(db, sunrise.id, log);
    await seedSunriseIndentsLinen(db, sunrise.id, log);
  }
  await ensureLotusTenant(db, log);
  // The first seedDemoPeople call (from seedDemo) runs before Lotus exists. Call it again so Lotus's
  // five DEMO- patients load in this same run, then attach the isolation encounter to one of them.
  if (sunrise) await seedDemoPeople(db, log);
  await seedLotusClinical(db, log);
}

async function grantSunriseModules(db: Db, tenantId: string, log: (m: string) => void) {
  const keys = [
    'nurse-station',
    'cpoe',
    'android-patient-portal',
    'android-doctor-portal',
    'android-nurses-workbench',
    'indents-purchase',
    'linen-laundry',
  ];
  const mods = await db.select().from(schema.modules).where(inArray(schema.modules.key, keys));
  for (const mod of mods) {
    const exists = await db
      .select({ id: schema.tenantEntitlementOverrides.id })
      .from(schema.tenantEntitlementOverrides)
      .where(and(eq(schema.tenantEntitlementOverrides.tenantId, tenantId), eq(schema.tenantEntitlementOverrides.moduleId, mod.id)));
    if (exists.length > 0) continue;
    await db.insert(schema.tenantEntitlementOverrides).values({
      tenantId,
      target: 'module',
      moduleId: mod.id,
      effect: 'grant',
      reason: 'Phase B demo: nurse station, CPOE and Android portals for Sunrise',
    });
  }
  log(`sunrise module overrides ensured (${keys.length})`);
}

async function seedSunriseClinical(db: Db, tenantId: string, log: (m: string) => void) {
  const locs = await db.select().from(schema.locations).where(eq(schema.locations.tenantId, tenantId));
  const mumbai = locs.find((l) => l.code === 'MUM') ?? locs[0];
  if (!mumbai) return;
  const [doctorUser] = await db.select().from(schema.users).where(eq(schema.users.email, 'doctor@sunrise.demo'));
  const [dept] = await db.select().from(schema.departments).where(and(eq(schema.departments.tenantId, tenantId), eq(schema.departments.locationId, mumbai.id)));
  const [doctor] = await db
    .select()
    .from(schema.doctors)
    .where(and(eq(schema.doctors.tenantId, tenantId), eq(schema.doctors.locationId, mumbai.id), eq(schema.doctors.name, 'Dr. Asha Fictional')));
  if (doctor && doctorUser && !doctor.userId) {
    await db
      .update(schema.doctors)
      .set({ userId: doctorUser.id, departmentId: dept?.id ?? null, registrationNo: 'MH-DEMO-1001', active: true })
      .where(eq(schema.doctors.id, doctor.id));
    log('linked doctor@sunrise.demo to Dr. Asha Fictional');
  }

  const [marker] = await db
    .select({ id: schema.services.id })
    .from(schema.services)
    .where(and(eq(schema.services.tenantId, tenantId), eq(schema.services.code, 'CON-NEW')));
  if (marker) {
    log('sunrise clinical sample already present');
    return;
  }

  const samplePatients = await db
    .select({ id: schema.patients.id })
    .from(schema.patients)
    .where(
      and(
        eq(schema.patients.tenantId, tenantId),
        eq(schema.patients.registeredLocationId, mumbai.id),
        eq(schema.patients.isSample, true),
        like(schema.patients.uhid, 'DEMO-%'),
      ),
    )
    .orderBy(asc(schema.patients.uhid))
    .limit(4);
  if (samplePatients.length < 4) {
    log('sunrise sample patients missing; clinical encounters skipped until seedDemoPeople has loaded them');
    return;
  }

  const fy = fyCode(new Date());
  const today = new Date().toISOString().slice(0, 10);
  const patientIds = samplePatients.map((p) => p.id);

  await db.transaction(async (tx) => {
    await tx.insert(schema.patientAlerts).values({
      tenantId,
      patientId: patientIds[0]!,
      kind: 'allergy',
      text: 'Penicillin — sample alert',
      severity: 'high',
      recordedBy: doctorUser?.id ?? null,
    });

    for (const svc of SERVICES) {
      const [row] = await tx
        .insert(schema.services)
        .values({
          tenantId,
          code: svc.code,
          name: svc.name,
          category: svc.category,
          hsnSac: svc.gst === 'taxable' ? '999799' : '9993',
          gstTreatment: svc.gst,
          gstRateBp: svc.rate,
          active: true,
        })
        .returning({ id: schema.services.id });
      await tx.insert(schema.tariffs).values({
        tenantId,
        serviceId: row!.id,
        locationId: mumbai.id,
        payerClass: 'general',
        pricePaise: svc.price,
        effectiveFrom: '2026-04-01',
      });
    }

    const open = async (kind: 'opd' | 'ipd', n: number, patientIndex: number, extra: Partial<typeof schema.encounters.$inferInsert> = {}) => {
      const code = kind === 'opd' ? 'OV' : 'IP';
      await tx.insert(schema.encounters).values({
        tenantId,
        locationId: mumbai.id,
        patientId: patientIds[patientIndex]!,
        kind,
        number: `MUM${code}/${fy}/${String(n).padStart(5, '0')}`,
        status: 'open',
        doctorId: doctor?.id ?? null,
        departmentId: dept?.id ?? null,
        visitType: kind === 'opd' ? 'new' : null,
        payerType: 'self',
        startedAt: new Date(),
        createdBy: doctorUser?.id ?? null,
        ...extra,
      });
    };
    await open('opd', 1, 0);
    await open('opd', 2, 1);
    await open('opd', 3, 2);
    await open('ipd', 1, 3, { currentWardCode: 'GW', currentBedLabel: 'GW-1', visitType: null });

    // Sample UHIDs are DEMO-… and are not drawn from the UH series, so last_no stays 0.
    await ensureSeries(tx, tenantId, mumbai.id, 'opd_visit', fy, 3);
    await ensureSeries(tx, tenantId, mumbai.id, 'ip_admission', fy, 1);
  });
  log(`sunrise clinical sample: linked 4 existing DEMO patients, ${SERVICES.length} services, 4 encounters (${today})`);
}

async function ensureLotusTenant(db: Db, log: (m: string) => void): Promise<void> {
  const existing = (await db.select().from(schema.tenants).where(eq(schema.tenants.slug, LOTUS)))[0];
  if (existing) {
    log('lotus tenant already present');
    return;
  }
  const plan = (await db.select().from(schema.plans).where(eq(schema.plans.key, 'basic')))[0];
  if (!plan) throw new Error('Basic plan is missing. Run db:seed first.');
  const monthly = (
    await db
      .select()
      .from(schema.prices)
      .where(and(eq(schema.prices.targetType, 'plan'), eq(schema.prices.targetId, plan.id), eq(schema.prices.billingCycle, 'monthly')))
  )[0];
  if (!monthly) throw new Error('Basic plan has no monthly price.');
  const [role] = await db.select().from(schema.roles).where(and(isNull(schema.roles.tenantId), eq(schema.roles.key, 'tenant_admin')));
  if (!role) throw new Error('tenant_admin role is missing.');
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(schema.tenants)
      .values({
        slug: LOTUS,
        status: 'active',
        onboardingStep: 'done',
        onboardingDraft: { planId: plan.id, cycle: 'monthly', locationCount: 1, addonModuleIds: [] },
        onboardingCompletedAt: start,
        facilityType: 'clinic',
        legalName: 'Lotus Demo Clinic',
        displayName: 'Lotus Demo Clinic',
        gstin: '',
        registrationNo: 'DEMO-MH-LOTUS-1',
        bedCount: 10,
        specialities: ['General Medicine'],
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
        docPrefix: 'PUN',
        addressLine1: '3 Sample FC Road',
        city: 'Pune',
        stateCode: '27',
        pincode: '411001',
        phone: '02040000009',
        isPrimary: true,
      })
      .returning();
    await tx.insert(schema.departments).values({ tenantId, locationId: loc!.id, name: 'OPD', sortOrder: 0 });
    // Login stays owner@lotus.demo (PHASE_B_PLAN decision 10 and the isolation tests). Mobile is in the 90000 block.
    const [owner] = await tx
      .insert(schema.users)
      .values({
        tenantId,
        email: LOTUS_OWNER_EMAIL,
        mobile: LOTUS_OWNER_MOBILE,
        name: 'Omkar Demo Owner',
        passwordHash,
        status: 'active',
        designation: 'owner',
        mobileVerifiedAt: start,
      })
      .returning();
    await tx.insert(schema.userLocationRoles).values({ tenantId, userId: owner!.id, roleId: role.id, locationId: null });
    const [sub] = await tx
      .insert(schema.subscriptions)
      .values({
        tenantId,
        planId: plan.id,
        billingCycle: 'monthly',
        locationCount: 1,
        status: 'active',
        currentPeriodStart: start,
        currentPeriodEnd: end,
        creditPaise: 0,
      })
      .returning();
    await tx.insert(schema.subscriptionItems).values({
      tenantId,
      subscriptionId: sub!.id,
      kind: 'plan',
      planId: plan.id,
      unitAmountPaise: monthly.amountPaise,
      quantity: 1,
      status: 'active',
    });
    log(`lotus tenant ${tenantId} ${LOTUS_OWNER_EMAIL}`);
  });
}

async function seedLotusClinical(db: Db, log: (m: string) => void): Promise<void> {
  const tenant = (await db.select().from(schema.tenants).where(eq(schema.tenants.slug, LOTUS)))[0];
  if (!tenant) {
    log('lotus tenant missing; clinical sample skipped');
    return;
  }
  const [marker] = await db
    .select({ id: schema.services.id })
    .from(schema.services)
    .where(and(eq(schema.services.tenantId, tenant.id), eq(schema.services.code, 'CON-NEW')));
  if (marker) {
    log('lotus clinical sample already present');
    return;
  }
  const [loc] = await db
    .select()
    .from(schema.locations)
    .where(and(eq(schema.locations.tenantId, tenant.id), eq(schema.locations.isPrimary, true)));
  const [owner] = await db.select().from(schema.users).where(eq(schema.users.email, LOTUS_OWNER_EMAIL));
  const [patient] = await db
    .select({ id: schema.patients.id })
    .from(schema.patients)
    .where(and(eq(schema.patients.tenantId, tenant.id), eq(schema.patients.isSample, true), like(schema.patients.uhid, 'DEMO-%')))
    .orderBy(asc(schema.patients.uhid))
    .limit(1);
  if (!loc || !owner || !patient) {
    log('lotus sample patient missing; clinical encounter skipped');
    return;
  }

  const start = new Date();
  const fy = fyCode(start);
  await db.transaction(async (tx) => {
    const [svc] = await tx
      .insert(schema.services)
      .values({ tenantId: tenant.id, code: 'CON-NEW', name: 'General consultation, new', category: 'consultation', gstTreatment: 'exempt_healthcare', gstRateBp: 0 })
      .returning();
    await tx.insert(schema.tariffs).values({ tenantId: tenant.id, serviceId: svc!.id, locationId: loc.id, payerClass: 'general', pricePaise: 40000, effectiveFrom: '2026-04-01' });
    const [enc] = await tx
      .insert(schema.encounters)
      .values({
        tenantId: tenant.id,
        locationId: loc.id,
        patientId: patient.id,
        kind: 'opd',
        number: `PUNOV/${fy}/00001`,
        status: 'open',
        visitType: 'new',
        payerType: 'self',
        createdBy: owner.id,
      })
      .returning();
    await tx.insert(schema.patientAlerts).values({ tenantId: tenant.id, patientId: patient.id, kind: 'alert', text: 'Sample alert for isolation', severity: 'low', recordedBy: owner.id });
    const [order] = await tx
      .insert(schema.clinicalOrders)
      .values({
        tenantId: tenant.id,
        locationId: loc.id,
        encounterId: enc!.id,
        patientId: patient.id,
        kind: 'medicine',
        number: `PUNOR/${fy}/00001`,
        source: 'opd',
        priority: 'routine',
        status: 'placed',
        orderedByUserId: owner.id,
      })
      .returning();
    await tx.insert(schema.clinicalOrderItems).values({
      tenantId: tenant.id,
      orderId: order!.id,
      lineNo: 1,
      drugName: 'Paracetamol',
      genericCode: 'PARACETAMOL',
      frequencyCode: 'TDS',
      status: 'pending',
    });
    await tx.insert(schema.vitalSigns).values({ tenantId: tenant.id, locationId: loc.id, encounterId: enc!.id, patientId: patient.id, recordedBy: owner.id, pulse: 76, spo2: 98 });
    await tx.insert(schema.clinicalNotes).values({ tenantId: tenant.id, encounterId: enc!.id, patientId: patient.id, kind: 'chief_complaint', body: 'Sample headache. Fictional.', authorUserId: owner.id });
    await tx.insert(schema.charges).values({
      tenantId: tenant.id,
      locationId: loc.id,
      encounterId: enc!.id,
      patientId: patient.id,
      serviceId: svc!.id,
      description: 'General consultation, new',
      qty: 1,
      unitPricePaise: 40000,
      amountPaise: 40000,
      gstTreatment: 'exempt_healthcare',
      gstRateBp: 0,
      serviceDate: '2026-11-11',
      sourceModule: 'opd',
      sourceType: 'seed',
      sourceId: enc!.id,
      sourceLine: '1',
      postedBy: owner.id,
    });
    await tx.insert(schema.cashLedger).values({
      tenantId: tenant.id,
      locationId: loc.id,
      entryType: 'receipt',
      direction: 'in',
      mode: 'cash',
      amountPaise: 40000,
      number: `PUNRC/${fy}/00001`,
      patientId: patient.id,
      encounterId: enc!.id,
      refType: 'bill',
      refId: enc!.id,
      receivedBy: owner.id,
    });
    await ensureSeries(tx, tenant.id, loc.id, 'opd_visit', fy, 1);
    await ensureSeries(tx, tenant.id, loc.id, 'clinical_order', fy, 1);
    await ensureSeries(tx, tenant.id, loc.id, 'receipt', fy, 1);
  });
  log('lotus clinical sample linked to an existing DEMO patient');
}
