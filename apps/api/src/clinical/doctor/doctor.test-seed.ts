import { createDb, dbEnv, schema } from '@hos/db';
import { eq, sql } from 'drizzle-orm';

export async function penicillinEncounterId(tenantId: string): Promise<string | null> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const rows = await handle.db.execute<{ id: string }>(sql`
      select e.id
        from encounters e
        join patient_alerts a on a.tenant_id = e.tenant_id and a.patient_id = e.patient_id
       where e.tenant_id = ${tenantId}::uuid
         and e.status = 'open'
         and a.kind = 'allergy'
         and a.inactive_at is null
         and a.text ilike '%penicillin%'
       order by e.started_at
       limit 1
    `);
    return rows.rows[0]?.id ?? null;
  } finally {
    await handle.close();
  }
}

export async function doctorIsolationIds(): Promise<{ lotusOrderSetId: string }> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const [lotus] = await handle.db.select().from(schema.tenants).where(eq(schema.tenants.slug, 'lotus-demo'));
    if (!lotus) throw new Error('lotus tenant missing');
    const [row] = await handle.db
      .select({ id: schema.orderSets.id })
      .from(schema.orderSets)
      .where(eq(schema.orderSets.tenantId, lotus.id))
      .limit(1);
    if (!row) {
      const [enc] = await handle.db.select({ patientId: schema.encounters.patientId }).from(schema.encounters).where(eq(schema.encounters.tenantId, lotus.id)).limit(1);
      const [ins] = await handle.db
        .insert(schema.orderSets)
        .values({
          tenantId: lotus.id,
          name: 'Lotus isolation set',
          kind: 'lab',
          items: [],
          ownerDoctorId: null,
        })
        .returning({ id: schema.orderSets.id });
      void enc;
      return { lotusOrderSetId: ins!.id };
    }
    return { lotusOrderSetId: row.id };
  } finally {
    await handle.close();
  }
}
