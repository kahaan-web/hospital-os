// Fictional Sunrise clinical masters and the Lotus Demo Clinic (Basic) used for isolation tests.
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { fyCode, type GstTreatment } from '@hos/shared';
import { hashPassword } from '../password';
import * as schema from '../schema';
import type { Db } from '../client';

const DEMO_PASSWORD = 'Demo@12345';
const SUNRISE = 'sunrise-care';
const LOTUS = 'lotus-demo';

const PATIENTS = [
  ['Aarav', 'Sample', 'male', '1992-01-15', 'Mumbai', '27', '400001', '9810000001'],
  ['Meera', 'Demo', 'female', '1988-04-02', 'Mumbai', '27', '400011', '9810000002'],
  ['Kabir', 'Fictional', 'male', '2018-03-01', 'Mumbai', '27', '400012', '9810000003'],
  ['Lata', 'Sample', 'female', '1955-11-20', 'Mumbai', '27', '400013', '9810000004'],
  ['Vikram', 'Demo', 'male', '1979-07-07', 'Indore', '23', '452001', '9810000005'],
  ['Ananya', 'Fictional', 'female', '2010-09-12', 'Jaipur', '08', '302001', '9810000006'],
  ['Rohan', 'Sample', 'male', '2000-02-29', 'Mumbai', '27', '400014', '9810000007'],
  ['Diya', 'Demo', 'female', '2026-05-20', 'Mumbai', '27', '400015', '9810000008'],
  ['Ishaan', 'Fictional', 'male', '1995-12-01', 'Mumbai', '27', '400016', '9810000009'],
  ['Sana', 'Sample', 'female', '1983-06-18', 'Mumbai', '27', '400017', '9810000010'],
  ['Neel', 'Demo', 'male', '1970-01-30', 'Mumbai', '27', '400018', '9810000011'],
  ['Tara', 'Fictional', 'female', '1999-08-08', 'Mumbai', '27', '400019', '9810000012'],
] as const;

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

async function ensureSeries(tx: Db, tenantId: string, locationId: string | null, key: string, period: string, lastNo: number) {
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

  const sunrise = (await db.select().from(schema.tenants).where(eq(schema.tenants.slug, SUNRISE)))[0];
  if (!sunrise) {
    log('sunrise tenant missing; clinical seed skipped');
  } else {
    await seedSunriseClinical(db, sunrise.id, log);
    await grantSunriseModules(db, sunrise.id, log);
  }
  await seedLotus(db, log);
}

async function grantSunriseModules(db: Db, tenantId: string, log: (m: string) => void) {
  const keys = ['nurse-station', 'cpoe', 'android-patient-portal', 'android-doctor-portal', 'android-nurses-workbench'];
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

  const already = await db.select({ id: schema.patients.id }).from(schema.patients).where(and(eq(schema.patients.tenantId, tenantId), eq(schema.patients.uhid, 'UH000000001')));
  if (already.length > 0) {
    log('sunrise clinical sample already present');
    return;
  }

  const fy = fyCode(new Date());
  const today = new Date().toISOString().slice(0, 10);
  const patientIds: string[] = [];
  for (const [i, row] of PATIENTS.entries()) {
    const [first, last, gender, dob, city, state, pin, mobile] = row;
    const [created] = await db
      .insert(schema.patients)
      .values({
        tenantId,
        uhid: `UH${String(i + 1).padStart(9, '0')}`,
        registeredLocationId: mumbai.id,
        firstName: first,
        lastName: last,
        gender,
        dob,
        mobile,
        city,
        stateCode: state,
        pincode: pin,
        addressLine1: `${i + 1} Fictional Lane`,
        isSample: true,
        createdBy: doctorUser?.id ?? null,
      })
      .returning({ id: schema.patients.id });
    patientIds.push(created!.id);
  }
  await db.insert(schema.patientAlerts).values({
    tenantId,
    patientId: patientIds[0]!,
    kind: 'allergy',
    text: 'Penicillin — sample alert',
    severity: 'high',
    recordedBy: doctorUser?.id ?? null,
  });

  const serviceIds = new Map<string, string>();
  for (const svc of SERVICES) {
    const [row] = await db
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
    serviceIds.set(svc.code, row!.id);
    await db.insert(schema.tariffs).values({
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
    const [row] = await db
      .insert(schema.encounters)
      .values({
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
      })
      .returning({ id: schema.encounters.id });
    return row!.id;
  };
  await open('opd', 1, 0);
  await open('opd', 2, 1);
  await open('opd', 3, 2);
  await open('ipd', 1, 3, { currentWardCode: 'GW', currentBedLabel: 'GW-1', visitType: null });

  await ensureSeries(db, tenantId, null, 'uhid', '', PATIENTS.length);
  await ensureSeries(db, tenantId, mumbai.id, 'opd_visit', fy, 3);
  await ensureSeries(db, tenantId, mumbai.id, 'ip_admission', fy, 1);
  log(`sunrise clinical sample: ${PATIENTS.length} patients, ${SERVICES.length} services, 4 encounters (${today})`);
}

async function seedLotus(db: Db, log: (m: string) => void) {
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
    const [owner] = await tx
      .insert(schema.users)
      .values({
        tenantId,
        email: 'owner@lotus.demo',
        mobile: '9890000001',
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
    const [patient] = await tx
      .insert(schema.patients)
      .values({
        tenantId,
        uhid: 'UH000000001',
        registeredLocationId: loc!.id,
        firstName: 'Omkar',
        lastName: 'Sample',
        gender: 'male',
        dob: '1980-02-02',
        mobile: '9890000002',
        city: 'Pune',
        stateCode: '27',
        pincode: '411001',
        isSample: true,
        createdBy: owner!.id,
      })
      .returning();
    const [svc] = await tx
      .insert(schema.services)
      .values({ tenantId, code: 'CON-NEW', name: 'General consultation, new', category: 'consultation', gstTreatment: 'exempt_healthcare', gstRateBp: 0 })
      .returning();
    await tx.insert(schema.tariffs).values({ tenantId, serviceId: svc!.id, locationId: loc!.id, payerClass: 'general', pricePaise: 40000, effectiveFrom: '2026-04-01' });
    const [enc] = await tx
      .insert(schema.encounters)
      .values({
        tenantId,
        locationId: loc!.id,
        patientId: patient!.id,
        kind: 'opd',
        number: `PUNOV/${fyCode(start)}/00001`,
        status: 'open',
        visitType: 'new',
        payerType: 'self',
        createdBy: owner!.id,
      })
      .returning();
    await tx.insert(schema.patientAlerts).values({ tenantId, patientId: patient!.id, kind: 'alert', text: 'Sample alert for isolation', severity: 'low', recordedBy: owner!.id });
    const [order] = await tx
      .insert(schema.clinicalOrders)
      .values({
        tenantId,
        locationId: loc!.id,
        encounterId: enc!.id,
        patientId: patient!.id,
        kind: 'medicine',
        number: `PUNOR/${fyCode(start)}/00001`,
        source: 'opd',
        priority: 'routine',
        status: 'placed',
        orderedByUserId: owner!.id,
      })
      .returning();
    await tx.insert(schema.clinicalOrderItems).values({
      tenantId,
      orderId: order!.id,
      lineNo: 1,
      drugName: 'Paracetamol',
      genericCode: 'PARACETAMOL',
      frequencyCode: 'TDS',
      status: 'pending',
    });
    await tx.insert(schema.vitalSigns).values({ tenantId, locationId: loc!.id, encounterId: enc!.id, patientId: patient!.id, recordedBy: owner!.id, pulse: 76, spo2: 98 });
    await tx.insert(schema.clinicalNotes).values({ tenantId, encounterId: enc!.id, patientId: patient!.id, kind: 'chief_complaint', body: 'Sample headache. Fictional.', authorUserId: owner!.id });
    await tx.insert(schema.charges).values({
      tenantId,
      locationId: loc!.id,
      encounterId: enc!.id,
      patientId: patient!.id,
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
      postedBy: owner!.id,
    });
    await tx.insert(schema.cashLedger).values({
      tenantId,
      locationId: loc!.id,
      entryType: 'receipt',
      direction: 'in',
      mode: 'cash',
      amountPaise: 40000,
      number: `PUNRC/${fyCode(start)}/00001`,
      patientId: patient!.id,
      encounterId: enc!.id,
      refType: 'bill',
      refId: enc!.id,
      receivedBy: owner!.id,
    });
    await ensureSeries(tx as unknown as Db, tenantId, null, 'uhid', '', 1);
    log(`lotus tenant ${tenantId} owner@lotus.demo`);
  });
}
