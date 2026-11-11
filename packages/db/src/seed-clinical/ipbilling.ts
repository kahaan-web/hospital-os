import { and, eq } from 'drizzle-orm';
import { createDb, dbEnv, schema } from '../index';

const SUNRISE = 'sunrise-care';

/** Sample TPA payer linked to the open Sunrise IPD visit. */
export async function seedIpbilling(log: (m: string) => void = () => {}): Promise<void> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const [sunrise] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, SUNRISE));
    if (!sunrise) {
      log('ip billing seed skipped (sunrise missing)');
      return;
    }
    const [existing] = await handle.db.select({ id: schema.payers.id }).from(schema.payers).where(eq(schema.payers.tenantId, sunrise.id)).limit(1);
    if (existing) return;

    const [payer] = await handle.db
      .insert(schema.payers)
      .values({
        tenantId: sunrise.id,
        code: 'STAR-TPO',
        name: 'Star Health TPA (Sample)',
        kind: 'tpa',
        gstin: '29AABCS1429B1Z5',
        stateCode: 'KA',
        creditDays: 30,
        isSample: true,
      })
      .returning();

    const [ipd] = await handle.db
      .select({ id: schema.encounters.id })
      .from(schema.encounters)
      .where(and(eq(schema.encounters.tenantId, sunrise.id), eq(schema.encounters.kind, 'ipd'), eq(schema.encounters.status, 'open')))
      .limit(1);

    if (payer && ipd) {
      await handle.db.insert(schema.encounterPayers).values({
        tenantId: sunrise.id,
        encounterId: ipd.id,
        payerId: payer.id,
        policyNo: 'SH-DEMO-884211',
        preauthAmountPaise: 250_000,
        approvedAmountPaise: 200_000,
        status: 'active',
      });
    }
    log('ip billing sample payer');
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}
