// Sample clinic hours, diary rows and a short OPD queue. Every person here is fictional.
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { istDateKey } from '@hos/shared';
import { createDb, type Db } from '../client';
import { demoMobile } from '../seed-demo-people';
import { dbEnv } from '../env';
import * as schema from '../schema';

function plusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function seedSunrise(db: Db, log: (m: string) => void): Promise<void> {
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.slug, 'sunrise-care'));
  if (!tenant) {
    log('appointments: sunrise tenant missing');
    return;
  }
  const locs = await db.select().from(schema.locations).where(eq(schema.locations.tenantId, tenant.id));
  const mumbai = locs.find((loc) => loc.code === 'MUM') ?? locs.find((loc) => loc.isPrimary) ?? locs[0];
  if (!mumbai) return;
  const doctors = await db.select().from(schema.doctors).where(and(eq(schema.doctors.tenantId, tenant.id), eq(schema.doctors.locationId, mumbai.id)));
  const doctor = doctors.find((row) => row.name === 'Dr. Asha Fictional') ?? doctors[0];
  if (!doctor) {
    log('appointments: sunrise has no doctor at Mumbai');
    return;
  }
  const today = istDateKey(new Date());
  await db.transaction(async (tx) => {
    const [marker] = await tx.select({ id: schema.doctorSchedules.id }).from(schema.doctorSchedules).where(eq(schema.doctorSchedules.tenantId, tenant.id)).limit(1);
    if (marker) {
      log('appointments: sunrise sample already present');
      return;
    }
    await tx.insert(schema.doctorSchedules).values(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        tenantId: tenant.id,
        doctorId: doctor.id,
        locationId: mumbai.id,
        weekday,
        startTime: '09:00',
        endTime: '13:00',
        slotMinutes: 15,
        maxPerSlot: 2,
        isSample: true,
      })),
    );
    await tx.insert(schema.scheduleExceptions).values({
      tenantId: tenant.id,
      doctorId: doctor.id,
      locationId: mumbai.id,
      onDate: '2026-12-25',
      kind: 'closed',
      reason: 'Sample: Christmas day, clinic closed',
      isSample: true,
    });
    const patients = await tx
      .select()
      .from(schema.patients)
      .where(and(eq(schema.patients.tenantId, tenant.id), eq(schema.patients.isSample, true)))
      .orderBy(asc(schema.patients.uhid))
      .limit(8);
    const openVisits = await tx
      .select()
      .from(schema.encounters)
      .where(and(eq(schema.encounters.tenantId, tenant.id), eq(schema.encounters.locationId, mumbai.id), eq(schema.encounters.kind, 'opd'), eq(schema.encounters.status, 'open'), isNull(schema.encounters.appointmentId)))
      .orderBy(asc(schema.encounters.number))
      .limit(3);
    const starts = ['09:00', '09:15', '09:30'];
    let queued = 0;
    for (const [index, encounter] of openVisits.entries()) {
      const start = starts[index] ?? '09:00';
      const [appt] = await tx
        .insert(schema.appointments)
        .values({
          tenantId: tenant.id,
          locationId: mumbai.id,
          patientId: encounter.patientId,
          doctorId: doctor.id,
          apptDate: today,
          slotStart: start,
          slotEnd: start === '09:00' ? '09:15' : start === '09:15' ? '09:30' : '09:45',
          seq: 1,
          channel: 'counter',
          status: 'checked_in',
          reason: 'Sample visit already at the counter',
          counterKind: 'repeat',
          encounterId: encounter.id,
          isSample: true,
        })
        .returning();
      await tx.update(schema.encounters).set({ appointmentId: appt!.id }).where(eq(schema.encounters.id, encounter.id));
      await tx.insert(schema.opdQueue).values({
        tenantId: tenant.id,
        locationId: mumbai.id,
        encounterId: encounter.id,
        appointmentId: appt!.id,
        patientId: encounter.patientId,
        doctorId: doctor.id,
        token: index + 1,
        status: index === 0 ? 'in_consultation' : 'waiting',
        visitDate: today,
        isSample: true,
      });
      queued += 1;
    }
    await tx.insert(schema.appointments).values({
      tenantId: tenant.id,
      locationId: mumbai.id,
      patientId: null,
      walkinName: 'Kiran Bhosale',
      walkinMobile: demoMobile(11101),
      doctorId: doctor.id,
      apptDate: today,
      slotStart: '09:45',
      slotEnd: '10:00',
      seq: 1,
      channel: 'phone',
      status: 'booked',
      reason: 'Cough for two days. Sample phone booking.',
      isSample: true,
    });
    const later = patients.find((patient) => !openVisits.some((visit) => visit.patientId === patient.id));
    if (later) {
      await tx.insert(schema.appointments).values({
        tenantId: tenant.id,
        locationId: mumbai.id,
        patientId: later.id,
        doctorId: doctor.id,
        apptDate: plusDays(today, 1),
        slotStart: '09:00',
        slotEnd: '09:15',
        seq: 1,
        channel: 'counter',
        status: 'booked',
        reason: 'Sample booking for tomorrow',
        counterKind: 'new',
        isSample: true,
      });
    }
    if (queued > 0) {
      await tx.execute(sql`
        insert into number_series (tenant_id, location_id, series_key, period, last_no)
        values (${tenant.id}::uuid, null, ${`opd_token:${doctor.id}`}, ${today}, ${queued})
        on conflict on constraint number_series_uq do update
          set last_no = greatest(number_series.last_no, excluded.last_no)
      `);
    }
    log(`appointments: sunrise hours for ${doctor.name}, ${queued} queue tokens, phone booking for Kiran Bhosale`);
  });
}

async function seedLotus(db: Db, log: (m: string) => void): Promise<void> {
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.slug, 'lotus-demo'));
  if (!tenant) {
    log('appointments: lotus tenant missing');
    return;
  }
  const [loc] = await db.select().from(schema.locations).where(and(eq(schema.locations.tenantId, tenant.id), eq(schema.locations.isPrimary, true)));
  const [patient] = await db
    .select()
    .from(schema.patients)
    .where(and(eq(schema.patients.tenantId, tenant.id), eq(schema.patients.isSample, true)))
    .orderBy(asc(schema.patients.uhid))
    .limit(1);
  const [encounter] = await db.select().from(schema.encounters).where(eq(schema.encounters.tenantId, tenant.id)).limit(1);
  if (!loc || !patient) {
    log('appointments: lotus location or patient missing');
    return;
  }
  await db.transaction(async (tx) => {
    const [marker] = await tx.select({ id: schema.doctorSchedules.id }).from(schema.doctorSchedules).where(eq(schema.doctorSchedules.tenantId, tenant.id)).limit(1);
    if (marker) {
      log('appointments: lotus sample already present');
      return;
    }
    // Lotus has no doctor master. This row is sample data only — no staff login.
    let [doctor] = await tx
      .select()
      .from(schema.doctors)
      .where(and(eq(schema.doctors.tenantId, tenant.id), eq(schema.doctors.name, 'Dr. Nalini Kulkarni')));
    if (!doctor) {
      [doctor] = await tx
        .insert(schema.doctors)
        .values({
          tenantId: tenant.id,
          locationId: loc.id,
          name: 'Dr. Nalini Kulkarni',
          qualification: 'MBBS',
          speciality: 'General Medicine',
          registrationNo: 'MH-DEMO-LOTUS-1',
          isSample: true,
          active: true,
        })
        .returning();
    }
    await tx.insert(schema.doctorSchedules).values(
      [1, 2, 3, 4, 5].map((weekday) => ({
        tenantId: tenant.id,
        doctorId: doctor!.id,
        locationId: loc.id,
        weekday,
        startTime: '10:00',
        endTime: '12:00',
        slotMinutes: 20,
        maxPerSlot: 1,
        isSample: true,
      })),
    );
    await tx.insert(schema.scheduleExceptions).values({
      tenantId: tenant.id,
      doctorId: doctor!.id,
      locationId: loc.id,
      onDate: '2026-01-26',
      kind: 'closed',
      reason: 'Sample: Republic Day',
      isSample: true,
    });
    await tx.insert(schema.appointments).values({
      tenantId: tenant.id,
      locationId: loc.id,
      patientId: patient.id,
      doctorId: doctor!.id,
      apptDate: plusDays(istDateKey(new Date()), 1),
      slotStart: '10:00',
      slotEnd: '10:20',
      seq: 1,
      channel: 'counter',
      status: 'booked',
      reason: 'Sample fever',
      counterKind: 'new',
      isSample: true,
    });
    if (encounter) {
      await tx.insert(schema.opdQueue).values({
        tenantId: tenant.id,
        locationId: loc.id,
        encounterId: encounter.id,
        patientId: encounter.patientId,
        doctorId: doctor!.id,
        token: 1,
        status: 'waiting',
        visitDate: istDateKey(new Date()),
        isSample: true,
      });
    }
    log('appointments: lotus sample doctor Dr. Nalini Kulkarni (no login), one booking');
  });
}

/** Seed hook called from seedDemo. Opens its own connection because the hook receives only a logger. */
export async function seedAppointments(log: (m: string) => void = () => {}): Promise<void> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    await seedSunrise(handle.db, log);
    await seedLotus(handle.db, log);
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}
