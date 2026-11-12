// MVP demo slice seed for Sunrise: blood units, two blood requests, marketing campaigns.
// Fictional, flagged is_sample. Patients are the existing DEMO- UHID rows. No tier is assigned:
// the three modules are made visible and granted to Sunrise by tenant override only.
import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDb, dbEnv, schema } from '../index';

const SUNRISE = 'sunrise-care';
const MODULES = ['blood-bank', 'marketing', 'mis-dashboards'];

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

export async function seedMvpBbMktMis(log: (m: string) => void = () => {}): Promise<void> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const db = handle.db;
    const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.slug, SUNRISE));
    if (!tenant) {
      log('mvp bb/mkt/mis seed skipped: sunrise tenant missing');
      return;
    }
    await db.update(schema.modules).set({ status: 'available' }).where(inArray(schema.modules.key, MODULES));
    const mods = await db.select().from(schema.modules).where(inArray(schema.modules.key, MODULES));
    for (const mod of mods) {
      const [exists] = await db
        .select({ id: schema.tenantEntitlementOverrides.id })
        .from(schema.tenantEntitlementOverrides)
        .where(and(eq(schema.tenantEntitlementOverrides.tenantId, tenant.id), eq(schema.tenantEntitlementOverrides.moduleId, mod.id)));
      if (exists) continue;
      await db.insert(schema.tenantEntitlementOverrides).values({
        tenantId: tenant.id,
        target: 'module',
        moduleId: mod.id,
        effect: 'grant',
        reason: 'MVP demo slice: blood bank, marketing and MIS for Sunrise',
      });
    }

    const [loc] = await db
      .select()
      .from(schema.locations)
      .where(eq(schema.locations.tenantId, tenant.id))
      .orderBy(asc(schema.locations.sortOrder))
      .limit(1);
    const primary = (await db.select().from(schema.locations).where(and(eq(schema.locations.tenantId, tenant.id), eq(schema.locations.code, 'MUM'))))[0] ?? loc;
    if (!primary) return;

    const [haveUnit] = await db.select({ id: schema.bbUnits.id }).from(schema.bbUnits).where(eq(schema.bbUnits.tenantId, tenant.id)).limit(1);
    if (!haveUnit) {
      const centre = 'Sample Regional Blood Centre (Sample)';
      const unit = (n: string, component: string, abo: string, rh: string, ml: number, expiresIn: number, tti = true) => ({
        tenantId: tenant.id,
        locationId: primary.id,
        unitNo: `DEMO-BB-${n}`,
        component,
        abo,
        rh,
        volumeMl: ml,
        collectedOn: day(expiresIn - 35),
        expiresAt: day(expiresIn),
        sourceCentre: centre,
        ttiCleared: tti,
        isSample: true,
      });
      await db.insert(schema.bbUnits).values([
        unit('0001', 'prbc', 'O', 'pos', 280, 21),
        unit('0002', 'prbc', 'O', 'neg', 270, 9),
        unit('0003', 'prbc', 'A', 'pos', 285, 28),
        unit('0004', 'prbc', 'B', 'pos', 275, 4),
        unit('0005', 'prbc', 'AB', 'pos', 280, 30),
        unit('0006', 'ffp', 'A', 'pos', 200, 300),
        unit('0007', 'prbc', 'O', 'pos', 280, -2),
        unit('0008', 'prbc', 'B', 'neg', 280, 14, false),
      ]);
      log('blood bank sample units seeded (8)');
    }

    const [haveReq] = await db.select({ id: schema.bbRequests.id }).from(schema.bbRequests).where(eq(schema.bbRequests.tenantId, tenant.id)).limit(1);
    if (!haveReq) {
      const patients = await db
        .select({ id: schema.patients.id })
        .from(schema.patients)
        .where(and(eq(schema.patients.tenantId, tenant.id), eq(schema.patients.isSample, true)))
        .orderBy(asc(schema.patients.uhid))
        .limit(2);
      const reqs = [
        { abo: 'A', rh: 'pos', component: 'prbc', urgency: 'routine', indication: 'Anaemia, Hb 6.8 g/dL (Sample)' },
        { abo: 'O', rh: 'pos', component: 'prbc', urgency: 'urgent', indication: 'Post-operative blood loss (Sample)' },
      ];
      for (const [i, p] of patients.entries()) {
        const q = reqs[i]!;
        await db.insert(schema.bbRequests).values({
          tenantId: tenant.id,
          locationId: primary.id,
          patientId: p.id,
          patientAbo: q.abo,
          patientRh: q.rh,
          component: q.component,
          urgency: q.urgency,
          indication: q.indication,
          isSample: true,
        });
      }
      log(`blood bank sample requests seeded (${patients.length})`);
    }

    const [haveCampaign] = await db.select({ id: schema.mktCampaigns.id }).from(schema.mktCampaigns).where(eq(schema.mktCampaigns.tenantId, tenant.id)).limit(1);
    if (!haveCampaign) {
      await db.insert(schema.mktCampaigns).values([
        {
          tenantId: tenant.id,
          name: 'World Diabetes Day screening camp (Sample)',
          channel: 'sms',
          segmentNote: 'Patients aged 35+ who visited in the last 12 months and opted in to marketing',
          message: 'Free blood sugar screening on 14/11/2026, 9 am to 1 pm. Reply STOP to opt out.',
          audienceCount: 120,
          isSample: true,
        },
        {
          tenantId: tenant.id,
          name: 'Winter flu vaccination reminder (Sample)',
          channel: 'whatsapp',
          segmentNote: 'Paediatric and senior-citizen patients with marketing consent',
          message: 'Flu vaccines are available at Sunrise Care from 01/12/2026. Reply STOP to opt out.',
          audienceCount: 80,
          status: 'sent',
          sentAt: new Date(Date.now() - 3 * 86_400_000),
          sentCount: 68,
          suppressedCount: 12,
          isSample: true,
        },
      ]);
      log('marketing sample campaigns seeded (2)');
    }
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}
