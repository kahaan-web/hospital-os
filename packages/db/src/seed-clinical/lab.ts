// Sample lab templates and one pending Sunrise order. Tokens are fictional demo secrets, stored only as hashes.
import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { fyCode, type LabRefBand } from '@hos/shared';
import { createDb, dbEnv, schema } from '../index';

/** Dev-only analyser tokens. The database stores the SHA-256 hex, never this string. */
export const DEMO_LAB_TOKEN = {
  sunrise: 'demo-sunrise-lab-token',
  lotus: 'demo-lotus-lab-token',
} as const;

const hbRanges: LabRefBand[] = [
  { sex: 'any', ageMinYears: 0, ageMaxYears: 11, low: 11, high: 14.5 },
  { sex: 'male', ageMinYears: 12, ageMaxYears: null, low: 13, high: 17 },
  { sex: 'female', ageMinYears: 12, ageMaxYears: null, low: 12, high: 15 },
];

const wbcRanges: LabRefBand[] = [{ sex: 'any', ageMinYears: 0, ageMaxYears: null, low: 4, high: 11 }];
const glucoseRanges: LabRefBand[] = [{ sex: 'any', ageMinYears: 0, ageMaxYears: null, low: 70, high: 99 }];

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

type ParamSeed = {
  code: string;
  name: string;
  unit: string;
  decimals: number;
  refRanges: LabRefBand[];
  criticalLow: number | null;
  criticalHigh: number | null;
  sortOrder: number;
};

async function ensureSettings(db: ReturnType<typeof createDb>['db'], tenantId: string): Promise<void> {
  const [row] = await db.select({ id: schema.labSettings.id }).from(schema.labSettings).where(eq(schema.labSettings.tenantId, tenantId));
  if (row) return;
  await db.insert(schema.labSettings).values({ tenantId, collectBeforePayment: false });
}

async function ensureInterface(
  db: ReturnType<typeof createDb>['db'],
  tenantId: string,
  locationId: string,
  name: string,
  token: string,
): Promise<void> {
  const [row] = await db.select({ id: schema.labInterfaces.id }).from(schema.labInterfaces).where(eq(schema.labInterfaces.tenantId, tenantId));
  if (row) return;
  await db.insert(schema.labInterfaces).values({
    tenantId,
    locationId,
    name,
    kind: 'mock_astm',
    tokenHash: tokenHash(token),
    active: true,
  });
}

async function ensureTemplate(
  db: ReturnType<typeof createDb>['db'],
  tenantId: string,
  serviceId: string,
  specimen: string,
  container: string,
  tatHours: number,
  params: ParamSeed[],
): Promise<string | null> {
  let [test] = await db.select().from(schema.labTests).where(and(eq(schema.labTests.tenantId, tenantId), eq(schema.labTests.serviceId, serviceId)));
  if (!test) {
    const [created] = await db
      .insert(schema.labTests)
      .values({ tenantId, serviceId, specimen, container, tatHours, active: true, isSample: true })
      .returning();
    test = created;
  }
  if (!test) return null;
  for (const param of params) {
    const [existing] = await db
      .select({ id: schema.labTestParams.id })
      .from(schema.labTestParams)
      .where(and(eq(schema.labTestParams.tenantId, tenantId), eq(schema.labTestParams.testId, test.id), eq(schema.labTestParams.code, param.code)));
    if (existing) continue;
    await db.insert(schema.labTestParams).values({
      tenantId,
      testId: test.id,
      code: param.code,
      name: param.name,
      unit: param.unit,
      valueType: 'numeric',
      decimals: param.decimals,
      refRanges: param.refRanges,
      criticalLow: param.criticalLow,
      criticalHigh: param.criticalHigh,
      options: [],
      sortOrder: param.sortOrder,
    });
  }
  return test.id;
}

/** Seed hook called from seedDemo. Opens its own migration connection, matching the registration seed. */
export async function seedLab(log: (m: string) => void = () => {}): Promise<void> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const [sunrise] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, 'sunrise-care'));
    const [lotus] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, 'lotus-demo'));
    if (sunrise) await seedSunrise(handle.db, sunrise.id, log);
    if (lotus) await seedLotus(handle.db, lotus.id, log);
    if (!sunrise && !lotus) log('lab seed skipped (tenants missing)');
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

async function seedSunrise(db: ReturnType<typeof createDb>['db'], tenantId: string, log: (m: string) => void): Promise<void> {
  const locs = await db.select().from(schema.locations).where(eq(schema.locations.tenantId, tenantId));
  const mumbai = locs.find((loc) => loc.code === 'MUM') ?? locs.find((loc) => loc.isPrimary) ?? locs[0];
  if (!mumbai) return;
  await ensureSettings(db, tenantId);
  await ensureInterface(db, tenantId, mumbai.id, 'Sunrise mock analyser', DEMO_LAB_TOKEN.sunrise);
  const services = await db.select().from(schema.services).where(eq(schema.services.tenantId, tenantId));
  const cbc = services.find((service) => service.code === 'LAB-CBC');
  const glu = services.find((service) => service.code === 'LAB-GLU');
  if (cbc) {
    await ensureTemplate(db, tenantId, cbc.id, 'blood', 'EDTA', 4, [
      { code: 'HB', name: 'Haemoglobin', unit: 'g/dL', decimals: 1, refRanges: hbRanges, criticalLow: 7, criticalHigh: 20, sortOrder: 1 },
      { code: 'WBC', name: 'Total leucocyte count', unit: '10^9/L', decimals: 1, refRanges: wbcRanges, criticalLow: 2, criticalHigh: 30, sortOrder: 2 },
    ]);
  }
  if (glu) {
    await ensureTemplate(db, tenantId, glu.id, 'plasma', 'Fluoride', 2, [
      { code: 'GLU', name: 'Fasting glucose', unit: 'mg/dL', decimals: 0, refRanges: glucoseRanges, criticalLow: 54, criticalHigh: 400, sortOrder: 1 },
    ]);
  }
  const [existingOrder] = await db
    .select({ id: schema.clinicalOrders.id })
    .from(schema.clinicalOrders)
    .where(and(eq(schema.clinicalOrders.tenantId, tenantId), eq(schema.clinicalOrders.kind, 'lab')));
  if (!existingOrder && cbc) {
    const [encounter] = await db
      .select()
      .from(schema.encounters)
      .where(and(eq(schema.encounters.tenantId, tenantId), eq(schema.encounters.kind, 'opd'), eq(schema.encounters.status, 'open')));
    const [owner] = await db.select().from(schema.users).where(eq(schema.users.email, 'owner@sunrise.demo'));
    if (encounter && owner) {
      const fy = fyCode(new Date());
      const prefix = mumbai.docPrefix || 'MUM';
      await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.scope', 'tenant', true), set_config('app.tenant_id', ${tenantId}::text, true)`);
        const taken = await tx.execute<{ n: number }>(sql`select hos_next_number('clinical_order', ${encounter.locationId}::uuid, ${fy}) as n`);
        const seq = Number(taken.rows[0]?.n ?? 1);
        const number = `${prefix}OR/${fy}/${String(seq).padStart(5, '0')}`;
        const [order] = await tx
          .insert(schema.clinicalOrders)
          .values({
            tenantId,
            locationId: encounter.locationId,
            encounterId: encounter.id,
            patientId: encounter.patientId,
            kind: 'lab',
            number,
            source: 'opd',
            priority: 'routine',
            status: 'placed',
            orderingDoctorId: encounter.doctorId,
            orderedByUserId: owner.id,
            notes: 'Sample CBC for the lab worklist',
          })
          .returning();
        await tx.insert(schema.clinicalOrderItems).values({
          tenantId,
          orderId: order!.id,
          lineNo: 1,
          serviceId: cbc.id,
          status: 'pending',
        });
      });
    }
  }
  log('lab seed: Sunrise templates and worklist order');
}

async function seedLotus(db: ReturnType<typeof createDb>['db'], tenantId: string, log: (m: string) => void): Promise<void> {
  const [loc] = await db.select().from(schema.locations).where(and(eq(schema.locations.tenantId, tenantId), eq(schema.locations.isPrimary, true)));
  const [owner] = await db.select().from(schema.users).where(eq(schema.users.email, 'owner@lotus.demo'));
  const [encounter] = await db.select().from(schema.encounters).where(eq(schema.encounters.tenantId, tenantId));
  if (!loc || !owner || !encounter) {
    log('lab seed skipped for Lotus (clinical rows missing)');
    return;
  }
  await ensureSettings(db, tenantId);
  await ensureInterface(db, tenantId, loc.id, 'Lotus mock analyser', DEMO_LAB_TOKEN.lotus);
  let [service] = await db.select().from(schema.services).where(and(eq(schema.services.tenantId, tenantId), eq(schema.services.code, 'LAB-CBC')));
  if (!service) {
    const [created] = await db
      .insert(schema.services)
      .values({
        tenantId,
        code: 'LAB-CBC',
        name: 'Complete blood count',
        category: 'lab',
        hsnSac: '9993',
        gstTreatment: 'exempt_healthcare',
        gstRateBp: 0,
        active: true,
      })
      .returning();
    service = created;
  }
  if (!service) return;
  const testId = await ensureTemplate(db, tenantId, service.id, 'blood', 'EDTA', 4, [
    { code: 'HB', name: 'Haemoglobin', unit: 'g/dL', decimals: 1, refRanges: hbRanges, criticalLow: 7, criticalHigh: 20, sortOrder: 1 },
  ]);
  const [param] = testId
    ? await db.select().from(schema.labTestParams).where(and(eq(schema.labTestParams.testId, testId), eq(schema.labTestParams.code, 'HB')))
    : [];
  const [existing] = await db.select({ id: schema.labAccessions.id }).from(schema.labAccessions).where(eq(schema.labAccessions.tenantId, tenantId));
  if (!existing && param) {
    const fy = fyCode(new Date());
    const prefix = loc.docPrefix || 'PUN';
    const orderNumber = `${prefix}OR/${fy}/90001`.slice(0, 16);
    const accessionNumber = `${prefix}LA/${fy}/90001`.slice(0, 16);
    const [order] = await db
      .insert(schema.clinicalOrders)
      .values({
        tenantId,
        locationId: loc.id,
        encounterId: encounter.id,
        patientId: encounter.patientId,
        kind: 'lab',
        number: orderNumber,
        source: 'opd',
        priority: 'routine',
        status: 'placed',
        orderedByUserId: owner.id,
        notes: 'Sample lab order for isolation',
      })
      .returning();
    const [item] = await db
      .insert(schema.clinicalOrderItems)
      .values({ tenantId, orderId: order!.id, lineNo: 1, serviceId: service.id, status: 'pending' })
      .returning();
    const [accession] = await db
      .insert(schema.labAccessions)
      .values({
        tenantId,
        locationId: loc.id,
        patientId: encounter.patientId,
        encounterId: encounter.id,
        orderItemId: item!.id,
        number: accessionNumber,
        barcode: accessionNumber,
        status: 'received',
        specimen: 'blood',
        collectedAt: new Date(),
        collectedBy: owner.id,
        receivedAt: new Date(),
        receivedBy: owner.id,
        isSample: true,
      })
      .returning();
    await db.insert(schema.labResults).values({
      tenantId,
      accessionId: accession!.id,
      paramId: param.id,
      valueNum: 13.2,
      flag: 'N',
      enteredBy: owner.id,
      version: 1,
    });
  }
  log('lab seed: Lotus isolation rows');
}
