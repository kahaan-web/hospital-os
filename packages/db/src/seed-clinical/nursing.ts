import { and, asc, eq } from 'drizzle-orm';
import { fyCode } from '@hos/shared';
import { createDb, dbEnv, schema } from '../index';

const SUNRISE = 'sunrise-care';

/** Sample IPD medicine order (TDS) for MAR demos. Fictional patient only. */
export async function seedNursing(log: (m: string) => void = () => {}): Promise<void> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const [tenant] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, SUNRISE));
    if (!tenant) {
      log('nursing seed skipped: sunrise tenant missing');
      return;
    }
    await seedSunrise(handle.db, tenant.id, log);
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

async function seedSunrise(db: ReturnType<typeof createDb>['db'], tenantId: string, log: (m: string) => void) {
  const [ipd] = await db
    .select()
    .from(schema.encounters)
    .where(and(eq(schema.encounters.tenantId, tenantId), eq(schema.encounters.kind, 'ipd'), eq(schema.encounters.status, 'open')))
    .orderBy(asc(schema.encounters.number))
    .limit(1);
  if (!ipd) {
    log('nursing seed skipped: no open IPD encounter');
    return;
  }

  const existing = await db
    .select({ id: schema.clinicalOrders.id })
    .from(schema.clinicalOrders)
    .where(and(eq(schema.clinicalOrders.tenantId, tenantId), eq(schema.clinicalOrders.encounterId, ipd.id), eq(schema.clinicalOrders.kind, 'medicine')));
  if (existing.length > 0) {
    log('nursing sample medicine order already present');
    return;
  }

  const users = await db.select().from(schema.users).where(eq(schema.users.tenantId, tenantId));
  const orderedBy = users.find((u) => u.email === 'nurse@sunrise.demo')?.id ?? users[0]?.id;
  if (!orderedBy) return;

  const fy = fyCode(new Date());
  await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(schema.clinicalOrders)
      .values({
        tenantId,
        locationId: ipd.locationId,
        encounterId: ipd.id,
        patientId: ipd.patientId,
        kind: 'medicine',
        number: `MUMOR/${fy}/00901`,
        source: 'cpoe',
        priority: 'routine',
        status: 'placed',
        orderingDoctorId: ipd.doctorId,
        orderedByUserId: orderedBy,
        notes: 'Sample ward prescription (fictional)',
      })
      .returning();
    await tx.insert(schema.clinicalOrderItems).values({
      tenantId,
      orderId: order!.id,
      lineNo: 1,
      drugName: 'Amoxicillin',
      genericCode: 'AMOXICILLIN',
      dose: '500 mg',
      frequencyCode: 'TDS',
      routeCode: 'PO',
      durationDays: 5,
      instructions: 'After food',
      status: 'pending',
    });
    await tx.insert(schema.clinicalOrderItems).values({
      tenantId,
      orderId: order!.id,
      lineNo: 2,
      drugName: 'Insulin regular',
      genericCode: 'INSULIN_REGULAR',
      dose: '6 units',
      frequencyCode: 'BD',
      routeCode: 'SC',
      durationDays: 5,
      instructions: 'Before meals — witness required',
      status: 'pending',
    });
    const [dietOrder] = await tx
      .insert(schema.clinicalOrders)
      .values({
        tenantId,
        locationId: ipd.locationId,
        encounterId: ipd.id,
        patientId: ipd.patientId,
        kind: 'diet',
        number: `MUMOR/${fy}/00902`,
        source: 'nurse',
        priority: 'routine',
        status: 'placed',
        orderedByUserId: orderedBy,
      })
      .returning();
    await tx.insert(schema.clinicalOrderItems).values({
      tenantId,
      orderId: dietOrder!.id,
      lineNo: 1,
      dietCode: 'diabetic',
      instructions: 'Low sugar, sample diet',
      status: 'pending',
    });
  });
  log('nursing seed: TDS amoxicillin + insulin MAR lines and sample diet for open IPD');
}
