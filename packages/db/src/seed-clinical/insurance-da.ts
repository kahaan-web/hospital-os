import { and, eq, inArray } from 'drizzle-orm';
import { createDb, dbEnv, schema } from '../index';

const SUNRISE = 'sunrise-care';
const MODULES = ['insurance', 'doctor-accounting'];

/** MVP demo slice: sample insurance payers/requests and doctor share rules/payouts for Sunrise. Fictional, flagged is_sample. */
export async function seedInsuranceDa(log: (m: string) => void = () => {}): Promise<void> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const db = handle.db;
    const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.slug, SUNRISE));
    if (!tenant) {
      log('insurance/doctor-accounting seed skipped: sunrise tenant missing');
      return;
    }
    const tenantId = tenant.id;

    await db.update(schema.modules).set({ status: 'available' }).where(inArray(schema.modules.key, MODULES));
    const mods = await db.select().from(schema.modules).where(inArray(schema.modules.key, MODULES));
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
        reason: 'MVP demo: Insurance and Doctors Accounting for Sunrise',
      });
    }

    const have = await db.select({ id: schema.insurancePayers.id }).from(schema.insurancePayers).where(eq(schema.insurancePayers.tenantId, tenantId));
    if (have.length === 0) {
      const payers = await db
        .insert(schema.insurancePayers)
        .values([
          { tenantId, name: 'Sample Shield Health Insurance', payerType: 'insurer', copayPct: 10, creditDays: 30, isSample: true },
          { tenantId, name: 'Sample CarePlus TPA', payerType: 'tpa', copayPct: 0, creditDays: 45, isSample: true },
          { tenantId, name: 'Sample State Health Scheme', payerType: 'government', copayPct: 0, creditDays: 60, isSample: true },
        ])
        .returning();
      const [shield, tpa, scheme] = payers;
      await db.insert(schema.insuranceRequests).values([
        { tenantId, payerId: shield!.id, kind: 'preauth', patientName: 'Meera Joshi (Sample)', uhid: 'DEMO-INS-0001', policyNo: 'SHD-90000-01', diagnosis: 'Acute appendicitis, planned appendectomy', estimatedPaise: 8500000, status: 'submitted', isSample: true },
        { tenantId, payerId: tpa!.id, kind: 'preauth', patientName: 'Rohan Deshmukh (Sample)', uhid: 'DEMO-INS-0002', policyNo: 'CPT-90000-02', diagnosis: 'Community acquired pneumonia, 4 day stay', estimatedPaise: 4200000, approvedPaise: 3800000, status: 'approved', decidedAt: new Date(), isSample: true },
        { tenantId, payerId: scheme!.id, kind: 'claim', patientName: 'Sunita Pawar (Sample)', uhid: 'DEMO-INS-0003', policyNo: 'SHS-90000-03', diagnosis: 'Cataract surgery, left eye', estimatedPaise: 2500000, status: 'rejected', rejectReason: 'Policy not active on the date of admission (sample)', decidedAt: new Date(), isSample: true },
      ]);
      log('insurance sample payers and requests added');
    }

    const doctors = await db.select().from(schema.doctors).where(eq(schema.doctors.tenantId, tenantId));
    const doctor = doctors.find((d) => d.name === 'Dr. Asha Fictional') ?? doctors[0];
    if (!doctor) {
      log('doctor accounting seed skipped: no sunrise doctor');
      return;
    }
    const rules = await db.select({ id: schema.doctorShareRules.id }).from(schema.doctorShareRules).where(eq(schema.doctorShareRules.tenantId, tenantId));
    if (rules.length === 0) {
      await db.insert(schema.doctorShareRules).values([
        { tenantId, doctorId: doctor.id, serviceCategory: 'consultation', encounterType: 'op', shareType: 'pct_net', shareValue: 60, isSample: true },
        { tenantId, doctorId: doctor.id, serviceCategory: 'all', encounterType: 'ip', shareType: 'pct_net', shareValue: 40, isSample: true },
        { tenantId, doctorId: doctor.id, serviceCategory: 'procedure', encounterType: 'any', shareType: 'fixed_per_unit', shareValue: 150000, isSample: true },
      ]);
      log('doctor share sample rules added');
    }
    const payouts = await db.select({ id: schema.doctorPayouts.id }).from(schema.doctorPayouts).where(eq(schema.doctorPayouts.tenantId, tenantId));
    if (payouts.length === 0) {
      await db.insert(schema.doctorPayouts).values([
        { tenantId, doctorId: doctor.id, periodFrom: '2026-09-01', periodTo: '2026-09-30', grossPaise: 18500000, sharePaise: 9900000, status: 'paid', paidOn: '2026-10-05', payMode: 'bank_transfer', payRef: 'SAMPLE-UTR-0001', isSample: true },
        { tenantId, doctorId: doctor.id, periodFrom: '2026-10-01', periodTo: '2026-10-31', grossPaise: 21200000, sharePaise: 11400000, status: 'pending', isSample: true },
      ]);
      log('doctor payout sample statements added');
    }
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}
