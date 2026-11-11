import { createDb, dbEnv, schema } from '@hos/db';
import { eq } from 'drizzle-orm';
import { clinicalFixture } from '../testkit';

export async function adtIsolationIds(): Promise<{
  wardId: string;
  roomId: string;
  bedId: string;
  admissionId: string;
  assignmentId: string;
  requestId: string;
  summaryId: string;
}> {
  const fx = await clinicalFixture();
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const [ward] = await handle.db.select({ id: schema.wards.id }).from(schema.wards).where(eq(schema.wards.tenantId, fx.lotus.tenantId));
    const [room] = await handle.db.select({ id: schema.rooms.id }).from(schema.rooms).where(eq(schema.rooms.tenantId, fx.lotus.tenantId));
    const [bed] = await handle.db.select({ id: schema.beds.id }).from(schema.beds).where(eq(schema.beds.tenantId, fx.lotus.tenantId));
    const [admission] = await handle.db.select({ id: schema.admissions.id }).from(schema.admissions).where(eq(schema.admissions.tenantId, fx.lotus.tenantId));
    const [assignment] = await handle.db
      .select({ id: schema.bedAssignments.id })
      .from(schema.bedAssignments)
      .where(eq(schema.bedAssignments.tenantId, fx.lotus.tenantId));
    const [request] = await handle.db
      .select({ id: schema.admissionRequests.id })
      .from(schema.admissionRequests)
      .where(eq(schema.admissionRequests.tenantId, fx.lotus.tenantId));
    const [summary] = await handle.db
      .select({ id: schema.dischargeSummaries.id })
      .from(schema.dischargeSummaries)
      .where(eq(schema.dischargeSummaries.tenantId, fx.lotus.tenantId));
    if (!ward || !room || !bed || !admission || !assignment || !request || !summary) {
      throw new Error('adt seed rows missing');
    }
    return {
      wardId: ward.id,
      roomId: room.id,
      bedId: bed.id,
      admissionId: admission.id,
      assignmentId: assignment.id,
      requestId: request.id,
      summaryId: summary.id,
    };
  } finally {
    await handle.close();
  }
}
