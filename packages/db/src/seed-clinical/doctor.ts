import { and, eq } from 'drizzle-orm';
import { createDb, dbEnv, schema } from '../index';

const SUNRISE_SLUG = 'sunrise-care';

/** Sample order set and prescription template for the linked Sunrise doctor. */
export async function seedDoctor(log: (m: string) => void = () => {}): Promise<void> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const [sunrise] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, SUNRISE_SLUG));
    if (!sunrise) {
      log('doctor seed skipped (sunrise missing)');
      return;
    }
    const existing = await handle.db.select({ id: schema.orderSets.id }).from(schema.orderSets).where(eq(schema.orderSets.tenantId, sunrise.id)).limit(1);
    if (existing.length > 0) {
      log('doctor seed already present');
      return;
    }
    const [doctor] = await handle.db
      .select()
      .from(schema.doctors)
      .where(and(eq(schema.doctors.tenantId, sunrise.id), eq(schema.doctors.name, 'Dr. Asha Fictional')));
    const [cbc] = await handle.db
      .select({ id: schema.services.id })
      .from(schema.services)
      .where(and(eq(schema.services.tenantId, sunrise.id), eq(schema.services.code, 'LAB-CBC')));
    if (!doctor || !cbc) {
      log('doctor seed skipped (doctor or LAB-CBC missing)');
      return;
    }
    await handle.db.insert(schema.orderSets).values({
      tenantId: sunrise.id,
      name: 'Fever workup (sample)',
      kind: 'lab',
      ownerDoctorId: doctor.id,
      items: [{ kind: 'lab', serviceId: cbc.id, instructions: 'Fasting preferred' }],
    });
    await handle.db.insert(schema.prescriptionTemplates).values({
      tenantId: sunrise.id,
      name: 'URI sample pack',
      ownerDoctorId: doctor.id,
      items: [
        {
          drugName: 'Paracetamol',
          genericCode: 'PARACETAMOL',
          strength: '500 mg',
          doseForm: 'tablet',
          dose: '1 tab',
          frequencyCode: 'TDS',
          routeCode: 'oral',
          durationDays: 3,
          quantity: 9,
          instructions: 'After food',
        },
      ],
    });
    log('sunrise doctor sample: order set and prescription template');
  } finally {
    await handle.close();
  }
}
