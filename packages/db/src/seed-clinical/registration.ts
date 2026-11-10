import { createDb, dbEnv, schema } from '../index';
import { eq, sql } from 'drizzle-orm';

const LOTUS_SLUG = 'lotus-demo';
const SUNRISE_SLUG = 'sunrise-care';

/** Sample registration artefacts for demos and isolation tests. */
export async function seedRegistration(log: (m: string) => void = () => {}): Promise<void> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const [lotus] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, LOTUS_SLUG));
    const [sunrise] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, SUNRISE_SLUG));
    if (!lotus || !sunrise) {
      log('registration seed skipped (tenants missing)');
      return;
    }
    const lotusPatient = await handle.db
      .select({ id: schema.patients.id })
      .from(schema.patients)
      .where(eq(schema.patients.tenantId, lotus.id))
      .limit(1);
    const lotusEncounter = await handle.db
      .select({ id: schema.encounters.id })
      .from(schema.encounters)
      .where(eq(schema.encounters.tenantId, lotus.id))
      .limit(1);
    const sunriseEncounter = await handle.db
      .select({ id: schema.encounters.id, patientId: schema.encounters.patientId })
      .from(schema.encounters)
      .where(eq(schema.encounters.tenantId, sunrise.id))
      .limit(1);
    if (!lotusPatient[0] || !lotusEncounter[0]) {
      log('registration seed skipped (lotus clinical rows missing)');
      return;
    }
    const existingDoc = await handle.db.execute<{ n: number }>(
      sql`select count(*)::int as n from patient_documents where tenant_id = ${lotus.id} and kind = 'Seed consent'`,
    );
    if (Number(existingDoc.rows[0]?.n ?? 0) === 0) {
      await handle.db.insert(schema.patientDocuments).values({
        tenantId: lotus.id,
        patientId: lotusPatient[0].id,
        kind: 'Seed consent',
        filePath: 'patients/seed/consent.pdf',
        mime: 'application/pdf',
        size: 1024,
        uploadedBy: null,
      });
      log('lotus sample patient document');
    }
    const existingMlc = await handle.db.execute<{ n: number }>(
      sql`select count(*)::int as n from mlc_cases where tenant_id = ${lotus.id}`,
    );
    if (Number(existingMlc.rows[0]?.n ?? 0) === 0 && lotusEncounter[0]) {
      await handle.db.insert(schema.mlcCases).values({
        tenantId: lotus.id,
        patientId: lotusPatient[0].id,
        encounterId: lotusEncounter[0].id,
        number: 'LOTML/2627/00001',
        policeStation: 'Kothrud PS',
        broughtBy: 'Constable Patil',
        injurySummary: 'Sample MLC entry for isolation tests (fictional).',
      });
      log('lotus sample MLC row');
    }
    if (sunriseEncounter[0]) {
      const mlcSun = await handle.db.execute<{ n: number }>(
        sql`select count(*)::int as n from mlc_cases where tenant_id = ${sunrise.id}`,
      );
      if (Number(mlcSun.rows[0]?.n ?? 0) === 0) {
        await handle.db.insert(schema.mlcCases).values({
          tenantId: sunrise.id,
          patientId: sunriseEncounter[0].patientId,
          encounterId: sunriseEncounter[0].id,
          number: 'MUMML/2627/00001',
          policeStation: 'Bandra PS',
          broughtBy: 'PSI Khan',
          injurySummary: 'Road traffic injury — sample only.',
        });
        log('sunrise sample MLC row');
      }
    }
  } finally {
    await handle.close();
  }
}
