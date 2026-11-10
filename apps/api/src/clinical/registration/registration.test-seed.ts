import { createDb, dbEnv, schema } from '@hos/db';
import { and, eq } from 'drizzle-orm';
import { clinicalFixture } from '../testkit';

export async function registrationIsolationIds(): Promise<{ lotusDocumentId: string; lotusMlcId: string }> {
  const fx = await clinicalFixture();
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const [doc] = await handle.db
      .select({ id: schema.patientDocuments.id })
      .from(schema.patientDocuments)
      .where(and(eq(schema.patientDocuments.tenantId, fx.lotus.tenantId), eq(schema.patientDocuments.kind, 'Seed consent')));
    const [mlc] = await handle.db
      .select({ id: schema.mlcCases.id })
      .from(schema.mlcCases)
      .where(eq(schema.mlcCases.tenantId, fx.lotus.tenantId));
    if (!doc || !mlc) throw new Error('registration seed rows missing; run db:seed:demo after migrations');
    return { lotusDocumentId: doc.id, lotusMlcId: mlc.id };
  } finally {
    await handle.close();
  }
}
