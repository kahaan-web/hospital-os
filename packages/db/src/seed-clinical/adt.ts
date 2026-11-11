import { and, eq, sql } from 'drizzle-orm';
import { fyCode } from '@hos/shared';
import { createDb, dbEnv, schema } from '../index';

const SUNRISE = 'sunrise-care';
const LOTUS = 'lotus-demo';

/** Sample wards, one occupied Sunrise bed, and Lotus rows for isolation tests. */
export async function seedAdt(log: (m: string) => void = () => {}): Promise<void> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const [sunrise] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, SUNRISE));
    const [lotus] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, LOTUS));
    if (sunrise) await seedSunrise(handle.db, sunrise.id, log);
    if (lotus) await seedLotus(handle.db, lotus.id, log);
    if (!sunrise && !lotus) log('adt seed skipped (tenants missing)');
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

async function seedSunrise(db: ReturnType<typeof createDb>['db'], tenantId: string, log: (m: string) => void) {
  const [existing] = await db.select({ id: schema.wards.id }).from(schema.wards).where(and(eq(schema.wards.tenantId, tenantId), eq(schema.wards.code, 'GW')));
  if (existing) {
    log('sunrise wards already present');
    return;
  }
  const [loc] = await db.select().from(schema.locations).where(and(eq(schema.locations.tenantId, tenantId), eq(schema.locations.code, 'MUM')));
  const [doctor] = await db.select().from(schema.doctors).where(and(eq(schema.doctors.tenantId, tenantId), eq(schema.doctors.name, 'Dr. Asha Fictional')));
  if (!loc) {
    log('adt sunrise seed skipped (Mumbai location missing)');
    return;
  }
  const services = await db.select().from(schema.services).where(eq(schema.services.tenantId, tenantId));
  const byCode = (code: string) => services.find((row) => row.code === code)?.id ?? null;
  const [ipd] = await db
    .select()
    .from(schema.encounters)
    .where(and(eq(schema.encounters.tenantId, tenantId), eq(schema.encounters.kind, 'ipd'), eq(schema.encounters.status, 'open')));
  const [opd] = await db
    .select()
    .from(schema.encounters)
    .where(and(eq(schema.encounters.tenantId, tenantId), eq(schema.encounters.kind, 'opd')));

  await db.transaction(async (tx) => {
    const ward = async (code: string, name: string, wardType: string, isIcu: boolean, serviceCode: string) => {
      const [row] = await tx
        .insert(schema.wards)
        .values({
          tenantId,
          locationId: loc.id,
          code,
          name,
          wardType,
          isIcu,
          bedServiceId: byCode(serviceCode),
          active: true,
        })
        .returning();
      return row!;
    };
    const general = await ward('GW', 'General ward', 'general', false, 'BED-GEN');
    const semi = await ward('SP', 'Semi-private', 'semi_private', false, 'BED-SEMI');
    const priv = await ward('PVT', 'Private rooms', 'private', false, 'BED-PVT');
    const icu = await ward('ICU', 'Intensive care', 'icu', true, 'BED-ICU');

    const room = async (wardId: string, code: string, name: string) => {
      const [row] = await tx.insert(schema.rooms).values({ tenantId, wardId, code, name }).returning();
      return row!;
    };
    const g1 = await room(general.id, 'G1', 'General bay');
    const s1 = await room(semi.id, 'S1', 'Semi-private 1');
    const p1 = await room(priv.id, 'P1', 'Private 1');
    const i1 = await room(icu.id, 'I1', 'ICU bay');

    const bed = async (roomId: string, label: string, wardClass: string, status: string) => {
      const [row] = await tx.insert(schema.beds).values({ tenantId, roomId, label, wardClass, status }).returning();
      return row!;
    };
    const gw1 = await bed(g1.id, 'GW-1', 'general', ipd ? 'occupied' : 'vacant');
    await bed(g1.id, 'GW-2', 'general', 'vacant');
    await bed(s1.id, 'SP-1', 'semi_private', 'vacant');
    await bed(p1.id, 'PVT-1', 'private', 'vacant');
    await bed(i1.id, 'ICU-1', 'icu', 'vacant');

    if (ipd) {
      const [admission] = await tx
        .insert(schema.admissions)
        .values({
          tenantId,
          locationId: loc.id,
          encounterId: ipd.id,
          patientId: ipd.patientId,
          doctorId: ipd.doctorId ?? doctor?.id ?? null,
          number: ipd.number,
          admissionType: 'elective',
          attendant: 'Lakshmi Nair',
          provisionalDiagnosis: 'Viral fever — sample',
          status: 'admitted',
          admittedAt: ipd.startedAt,
          createdBy: ipd.createdBy,
        })
        .returning();
      await tx.insert(schema.bedAssignments).values({
        tenantId,
        admissionId: admission!.id,
        bedId: gw1.id,
        fromAt: ipd.startedAt,
      });
      await tx.insert(schema.dischargeSummaries).values({
        tenantId,
        admissionId: admission!.id,
        status: 'draft',
        sections: {
          diagnosis: 'Viral fever (sample)',
          course: 'Admitted for observation. Fictional record.',
          treatment: 'Fluids and antipyretics.',
          condition: 'Stable',
          advice: 'Review if fever returns.',
          followUp: 'OPD in 5 days',
        },
      });
    }
    if (opd && doctor) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const planned = tomorrow.toISOString().slice(0, 10);
      await tx.insert(schema.admissionRequests).values({
        tenantId,
        locationId: loc.id,
        patientId: opd.patientId,
        fromEncounterId: opd.id,
        doctorId: doctor.id,
        reason: 'Needs overnight observation — sample',
        plannedOn: planned,
        wardType: 'general',
        status: 'requested',
      });
    }
  });
  log('sunrise wards, beds and sample admission');
}

async function seedLotus(db: ReturnType<typeof createDb>['db'], tenantId: string, log: (m: string) => void) {
  const [existing] = await db.select({ id: schema.wards.id }).from(schema.wards).where(and(eq(schema.wards.tenantId, tenantId), eq(schema.wards.code, 'ISO')));
  if (existing) {
    log('lotus adt rows already present');
    return;
  }
  const [loc] = await db.select().from(schema.locations).where(and(eq(schema.locations.tenantId, tenantId), eq(schema.locations.isPrimary, true)));
  const [patient] = await db.select().from(schema.patients).where(eq(schema.patients.tenantId, tenantId));
  const [owner] = await db.select().from(schema.users).where(eq(schema.users.email, 'owner@lotus.demo'));
  if (!loc || !patient || !owner) {
    log('adt lotus seed skipped (location or patient missing)');
    return;
  }
  const fy = fyCode(new Date());
  await db.transaction(async (tx) => {
    const [doctor] = await tx
      .insert(schema.doctors)
      .values({
        tenantId,
        locationId: loc.id,
        name: 'Dr. Kavita Menon',
        qualification: 'MBBS',
        speciality: 'General medicine',
        isSample: true,
        registrationNo: 'MH-DEMO-2001',
        active: true,
      })
      .returning();
    const [svc] = await tx
      .insert(schema.services)
      .values({
        tenantId,
        code: 'BED-GEN',
        name: 'General ward bed day',
        category: 'bed',
        gstTreatment: 'room_rent_rule',
        gstRateBp: 0,
        hsnSac: '9993',
      })
      .returning();
    await tx.insert(schema.tariffs).values({
      tenantId,
      serviceId: svc!.id,
      locationId: loc.id,
      payerClass: 'general',
      pricePaise: 150000,
      effectiveFrom: '2026-04-01',
    });
    const [ward] = await tx
      .insert(schema.wards)
      .values({
        tenantId,
        locationId: loc.id,
        code: 'ISO',
        name: 'Isolation sample ward',
        wardType: 'general',
        isIcu: false,
        bedServiceId: svc!.id,
        active: true,
      })
      .returning();
    const [room] = await tx.insert(schema.rooms).values({ tenantId, wardId: ward!.id, code: 'R1', name: 'Room 1' }).returning();
    const [bed] = await tx
      .insert(schema.beds)
      .values({ tenantId, roomId: room!.id, label: 'ISO-1', wardClass: 'general', status: 'occupied' })
      .returning();
    const [encounter] = await tx
      .insert(schema.encounters)
      .values({
        tenantId,
        locationId: loc.id,
        patientId: patient.id,
        kind: 'ipd',
        number: `PUNIP/${fy}/00001`,
        status: 'open',
        doctorId: doctor!.id,
        payerType: 'self',
        isMlc: false,
        currentWardCode: 'ISO',
        currentBedLabel: 'ISO-1',
        createdBy: owner.id,
      })
      .returning();
    const [admission] = await tx
      .insert(schema.admissions)
      .values({
        tenantId,
        locationId: loc.id,
        encounterId: encounter!.id,
        patientId: patient.id,
        doctorId: doctor!.id,
        number: encounter!.number,
        admissionType: 'elective',
        attendant: 'Ramesh Kulkarni',
        provisionalDiagnosis: 'Sample admission for isolation',
        status: 'admitted',
        createdBy: owner.id,
      })
      .returning();
    await tx.insert(schema.bedAssignments).values({ tenantId, admissionId: admission!.id, bedId: bed!.id });
    await tx.insert(schema.admissionRequests).values({
      tenantId,
      locationId: loc.id,
      patientId: patient.id,
      fromEncounterId: encounter!.id,
      doctorId: doctor!.id,
      reason: 'Sample request for isolation',
      plannedOn: '2026-11-11',
      wardType: 'general',
      status: 'requested',
    });
    await tx.insert(schema.dischargeSummaries).values({
      tenantId,
      admissionId: admission!.id,
      status: 'draft',
      sections: { diagnosis: 'Sample', course: '', treatment: '', condition: '', advice: '', followUp: '' },
    });
    await tx.execute(sql`
      insert into number_series (tenant_id, location_id, series_key, period, last_no)
      values (${tenantId}::uuid, ${loc.id}::uuid, 'ip_admission', ${fy}, 1)
      on conflict on constraint number_series_uq do nothing
    `);
  });
  log('lotus sample ward and admission for isolation');
}
