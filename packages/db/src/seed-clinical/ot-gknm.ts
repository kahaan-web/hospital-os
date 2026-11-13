import { and, asc, eq, like, sql } from 'drizzle-orm';
import { createDb, dbEnv, schema } from '../index';

const SUNRISE = 'sunrise-care';
type Db = ReturnType<typeof createDb>['db'];

const SURGERIES: { name: string; surgeryType: 'major' | 'minor'; department: string }[] = [
  { name: 'Laparoscopic Cholecystectomy', surgeryType: 'major', department: 'General Surgery' },
  { name: 'Modified Radical Mastectomy (MRM)', surgeryType: 'major', department: 'Surgical Oncology' },
  { name: 'Total Knee Replacement (TKR)', surgeryType: 'major', department: 'Orthopaedics' },
  { name: 'Appendicectomy', surgeryType: 'major', department: 'General Surgery' },
  { name: 'Inguinal Hernioplasty', surgeryType: 'major', department: 'General Surgery' },
  { name: 'CABG', surgeryType: 'major', department: 'Cardiothoracic' },
  { name: 'Craniotomy', surgeryType: 'major', department: 'Neurosurgery' },
  { name: 'Laparoscopic Hysterectomy', surgeryType: 'major', department: 'OBGYN' },
  { name: 'Thyroidectomy', surgeryType: 'major', department: 'General Surgery' },
  { name: 'Laparoscopic Appendicectomy', surgeryType: 'major', department: 'General Surgery' },
  { name: 'Exploratory Laparotomy', surgeryType: 'major', department: 'General Surgery' },
  { name: 'PCNL', surgeryType: 'major', department: 'Urology' },
  { name: 'TURP', surgeryType: 'major', department: 'Urology' },
  { name: 'ORIF Femur', surgeryType: 'major', department: 'Orthopaedics' },
  { name: 'Excision of Lipoma', surgeryType: 'minor', department: 'General Surgery' },
  { name: 'Circumcision', surgeryType: 'minor', department: 'General Surgery' },
  { name: 'Sebaceous Cyst Excision', surgeryType: 'minor', department: 'General Surgery' },
  { name: 'Ingrown Toenail Surgery', surgeryType: 'minor', department: 'General Surgery' },
  { name: 'D&C', surgeryType: 'minor', department: 'OBGYN' },
  { name: 'Cataract Surgery (Sample)', surgeryType: 'minor', department: 'Ophthalmology' },
];

const REMARKS = [
  'Blood to be reserved',
  'Implant required',
  'C-arm required',
  'ICU bed post-op',
  'Frozen section',
  'Laser required',
  'Microscope required',
  'High-risk consent',
];

const OT_RESOURCES = [
  { code: 'OT1-3FLR-NB', name: 'OT 1 Third Floor', categoryName: 'General' },
  { code: 'OT2-3FLR-NB', name: 'OT 2 Third Floor', categoryName: 'General' },
  { code: 'OT3-3FLR-NB', name: 'OT 3 Third Floor', categoryName: 'General' },
  { code: 'CVTSOT1', name: 'Cardiac OT 1', categoryName: 'Cardiac', categoryCode: 'CVTS' },
  { code: 'CVTSOT2', name: 'Cardiac OT 2', categoryName: 'Cardiac', categoryCode: 'CVTS' },
];

export async function seedOtGknm(log: (m: string) => void = () => {}): Promise<void> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const [tenant] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, SUNRISE));
    if (!tenant) {
      log('ot-gknm seed skipped: sunrise tenant missing');
      return;
    }
    const exists = await handle.db.select({ id: schema.otResources.id }).from(schema.otResources).where(eq(schema.otResources.tenantId, tenant.id)).limit(1);
    if (exists.length > 0) {
      log('ot-gknm sample rows already present');
      return;
    }
    await seedSunrise(handle.db, tenant.id, log);
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

async function seedSunrise(db: Db, tenantId: string, log: (m: string) => void) {
  const locations = await db.select().from(schema.locations).where(eq(schema.locations.tenantId, tenantId));
  const location = locations.find((l) => l.isPrimary) ?? locations[0];
  if (!location) return;

  const surgeryRows = await db.insert(schema.otSurgeryMaster).values(SURGERIES.map((s) => ({ tenantId, ...s, isSample: true }))).returning();
  await db.insert(schema.otSpecialRemarks).values(REMARKS.map((remark) => ({ tenantId, remark, isSample: true })));

  const doctors = await db.select().from(schema.doctors).where(eq(schema.doctors.tenantId, tenantId)).orderBy(asc(schema.doctors.name));
  const anaesthetists: string[] = [];
  for (const [i, d] of doctors.entries()) {
    await db.insert(schema.otDoctorRoles).values({ tenantId, doctorId: d.id, isSurgeon: i < 4, isAnaesthetist: i >= 4 && i < 7, isSample: true });
    if (i >= 4 && i < 7) anaesthetists.push(d.id);
  }
  if (anaesthetists.length < 3) {
    for (let i = 0; i < 3 - anaesthetists.length; i++) {
      const [doc] = await db
        .insert(schema.doctors)
        .values({
          tenantId,
          locationId: location.id,
          name: `Dr. Ana Sample ${i + 1}`,
          speciality: 'Anaesthesiology',
          isSample: true,
        })
        .returning();
      if (doc) {
        await db.insert(schema.otDoctorRoles).values({ tenantId, doctorId: doc.id, isAnaesthetist: true, isSample: true });
        anaesthetists.push(doc.id);
      }
    }
  }

  const resources = await db
    .insert(schema.otResources)
    .values(
      OT_RESOURCES.map((r) => ({
        tenantId,
        locationId: location.id,
        code: r.code,
        name: r.name,
        categoryName: r.categoryName,
        categoryCode: r.categoryCode ?? 'OT',
        overlapAllowed: false,
        maxOverlap: 1,
        slotMinutes: 15,
        sessionStart: sql`'01:00'::time`,
        sessionEnd: sql`'23:30'::time`,
        isSample: true,
      })),
    )
    .returning();

  await db.insert(schema.otSettings).values({ tenantId, cutoffTime: sql`'17:00'::time`, minLeadDays: 1, emergencyBypass: true, isSample: true });

  const patients = await db
    .select()
    .from(schema.patients)
    .where(and(eq(schema.patients.tenantId, tenantId), eq(schema.patients.isSample, true), like(schema.patients.uhid, 'DEMO-%')))
    .orderBy(asc(schema.patients.uhid))
    .limit(6);
  const surgeon = doctors[0];
  if (!surgeon || patients.length < 6) {
    log('ot-gknm seed skipped: need sample patients and doctors');
    return;
  }

  const surgeryByName = new Map(surgeryRows.map((s) => [s.name, s.id]));
  const chole = surgeryByName.get('Laparoscopic Cholecystectomy')!;
  const hernia = surgeryByName.get('Inguinal Hernioplasty')!;
  const lipoma = surgeryByName.get('Excision of Lipoma')!;

  const baseDay = new Date();
  baseDay.setUTCHours(0, 0, 0, 0);

  const requests = await db
    .insert(schema.otRequests)
    .values(
      patients.map((p, i) => {
        const day = new Date(baseDay.getTime() + (i % 4) * 86_400_000);
        const ymd = day.toISOString().slice(0, 10);
        return {
          tenantId,
          locationId: location.id,
          number: `REQ-${String(100001 + i).padStart(6, '0')}`,
          patientId: p.id,
          doctorId: surgeon.id,
          patientType: i % 2 === 0 ? 'ip' : 'op',
          expectedDate: ymd,
          diagnosis: 'Sample indication for demo',
          surgeryType: i < 4 ? 'major' : 'minor',
          surgeryId: i === 0 ? chole : i === 1 ? hernia : lipoma,
          surgeonIds: [surgeon.id],
          anaesthetistIds: anaesthetists.slice(0, 1),
          status: i < 4 ? 'requested' : 'booked',
          preferredResourceId: resources[i % resources.length]!.id,
          isSample: true,
        };
      }),
    )
    .returning();

  for (let i = 4; i < 6; i++) {
    const req = requests[i]!;
    const res = resources[i % resources.length]!;
    const day = new Date(baseDay.getTime() + (i % 4) * 86_400_000);
    const ymd = day.toISOString().slice(0, 10);
    const start = new Date(day.getTime());
    start.setUTCHours(3, 30, 0, 0); // 09:00 IST
    const end = new Date(start.getTime() + 90 * 60_000);
    await db.insert(schema.otBookings).values({
      tenantId,
      locationId: location.id,
      requestId: req.id,
      resourceId: res.id,
      patientId: req.patientId,
      doctorId: req.doctorId,
      patientType: req.patientType as 'ip' | 'op',
      bookingDate: ymd,
      scheduledStart: start,
      scheduledEnd: end,
      durationMin: 90,
      apptNo: String(901 + i),
      slots: 6,
      bookingType: 'planned',
      caseType: 'elective',
      surgeryId: req.surgeryId,
      surgeryType: req.surgeryType as 'major' | 'minor',
      diagnosis: req.diagnosis,
      surgeonIds: req.surgeonIds,
      anaesthetistIds: req.anaesthetistIds,
      isSample: true,
    });
  }

  log(`ot-gknm: ${surgeryRows.length} surgeries, ${REMARKS.length} remarks, ${resources.length} OTs, ${requests.length} requests for sunrise`);
}
