import { and, asc, eq, inArray, like } from 'drizzle-orm';
import { createDb, dbEnv, schema } from '../index';

const SUNRISE = 'sunrise-care';
type Db = ReturnType<typeof createDb>['db'];

/** MVP demo slice: a few OT cases and radiology orders for Sunrise. Fictional patients only, all flagged is_sample. */
export async function seedOtRad(log: (m: string) => void = () => {}): Promise<void> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const [tenant] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, SUNRISE));
    if (!tenant) {
      log('ot/radiology seed skipped: sunrise tenant missing');
      return;
    }
    await grantModules(handle.db, tenant.id);
    await seedSunrise(handle.db, tenant.id, log);
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

async function grantModules(db: Db, tenantId: string) {
  const mods = await db.select().from(schema.modules).where(inArray(schema.modules.key, ['ot-scheduling', 'radiology']));
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
      reason: 'MVP demo: OT scheduling and radiology for Sunrise',
    });
  }
}

async function seedSunrise(db: Db, tenantId: string, log: (m: string) => void) {
  const existing = await db.select({ id: schema.otCases.id }).from(schema.otCases).where(eq(schema.otCases.tenantId, tenantId)).limit(1);
  if (existing.length > 0) {
    log('ot/radiology sample rows already present');
    return;
  }
  const locations = await db.select().from(schema.locations).where(eq(schema.locations.tenantId, tenantId));
  const location = locations.find((l) => l.code === 'MUM') ?? locations[0];
  const patients = await db
    .select({ id: schema.patients.id })
    .from(schema.patients)
    .where(and(eq(schema.patients.tenantId, tenantId), eq(schema.patients.isSample, true), like(schema.patients.uhid, 'DEMO-%')))
    .orderBy(asc(schema.patients.uhid))
    .limit(3);
  if (!location || patients.length < 3) {
    log('ot/radiology seed skipped: sample patients or location missing');
    return;
  }
  const [p1, p2, p3] = patients.map((p) => p.id) as [string, string, string];
  const day = new Date();
  day.setUTCHours(4, 0, 0, 0); // 09:30 IST
  const at = (hours: number) => new Date(day.getTime() + hours * 3_600_000);
  const stamp = day.toISOString().slice(0, 10).replaceAll('-', '');

  await db.insert(schema.otCases).values([
    {
      tenantId, locationId: location.id, patientId: p1, number: `OT-${stamp}-1001`, procedureName: 'Laparoscopic cholecystectomy',
      surgeonName: 'Dr. Asha Fictional', anaesthetistName: 'Dr. Rohan Sample', roomCode: 'OT-1', anaesthesiaType: 'General',
      scheduledStart: at(0), scheduledEnd: at(1.5), isSample: true,
    },
    {
      tenantId, locationId: location.id, patientId: p2, number: `OT-${stamp}-1002`, procedureName: 'Inguinal hernia repair',
      surgeonName: 'Dr. Asha Fictional', anaesthetistName: 'Dr. Rohan Sample', roomCode: 'OT-2', anaesthesiaType: 'Spinal',
      scheduledStart: at(3), scheduledEnd: at(4), status: 'scheduled', isSample: true,
    },
    {
      tenantId, locationId: location.id, patientId: p3, number: `OT-${stamp}-1003`, procedureName: 'Wound debridement',
      surgeonName: 'Dr. Meera Demo', roomCode: 'OT-MINOR', priority: 'emergency', anaesthesiaType: 'Local',
      scheduledStart: at(-2), scheduledEnd: at(-1.25), status: 'completed', inRoomAt: at(-2), outRoomAt: at(-1.25), isSample: true,
    },
  ]);

  const orders = await db
    .insert(schema.radOrders)
    .values([
      { tenantId, locationId: location.id, patientId: p1, number: `RAD-${stamp}-2001`, modality: 'xray', studyName: 'Chest PA view', orderingDoctorName: 'Dr. Asha Fictional', clinicalNotes: 'Cough for two weeks (sample)', isSample: true },
      { tenantId, locationId: location.id, patientId: p2, number: `RAD-${stamp}-2002`, modality: 'usg', studyName: 'Abdomen and pelvis ultrasound', priority: 'urgent', orderingDoctorName: 'Dr. Asha Fictional', status: 'done', performedAt: new Date(), isSample: true },
      { tenantId, locationId: location.id, patientId: p3, number: `RAD-${stamp}-2003`, modality: 'ct', studyName: 'CT head plain', priority: 'stat', orderingDoctorName: 'Dr. Meera Demo', status: 'in_progress', isSample: true },
    ])
    .returning({ id: schema.radOrders.id, number: schema.radOrders.number });
  const done = orders.find((o) => o.number.endsWith('2002'));
  if (done) {
    await db.insert(schema.radReports).values({
      tenantId, orderId: done.id, findings: 'Sample draft: liver, spleen and kidneys appear normal in size and echotexture.', impression: '', isSample: true,
    });
  }
  log('ot/radiology: 3 OT cases and 3 radiology orders seeded for sunrise');
}
