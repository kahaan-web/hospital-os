// Read-only patient list and detail (Phase A). Exists so the demo has real rows to show and so the smoke test can
// prove one hospital cannot read another's patients. Phase B Patient Registration adds create / edit on top.
import { schema } from '@hos/db';
import { isoToDDMMYYYY, type PageDto } from '@hos/shared';
import { and, asc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { openTenant, type Deps } from '../guard';
import { ApiError } from '../http';

export interface PatientDto {
  id: string;
  uhid: string;
  name: string;
  sex: string;
  /** ISO date (YYYY-MM-DD). */
  dob: string | null;
  /** DD/MM/YYYY for display. */
  dobDisplay: string;
  ageYears: number | null;
  mobile: string;
  bloodGroup: string | null;
  city: string;
  locationId: string;
  abhaNumber: string | null;
  abhaAddress: string | null;
  isSample: boolean;
  registeredAt: string;
}

export interface PatientDetailDto extends PatientDto {
  addressLine1: string;
  stateCode: string;
  pincode: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactMobile: string;
}

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(80).optional(),
});

type Row = typeof schema.patients.$inferSelect;

function ageYears(dob: string | null, today = new Date()): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

function toDto(row: Row): PatientDto {
  return {
    id: row.id,
    uhid: row.uhid,
    name: [row.firstName, row.lastName].filter(Boolean).join(' '),
    sex: row.sex,
    dob: row.dob,
    dobDisplay: isoToDDMMYYYY(row.dob),
    ageYears: ageYears(row.dob),
    mobile: row.mobile,
    bloodGroup: row.bloodGroup,
    city: row.city,
    locationId: row.locationId,
    abhaNumber: row.abhaNumber,
    abhaAddress: row.abhaAddress,
    isSample: row.isSample,
    registeredAt: row.registeredAt.toISOString(),
  };
}

export function registerPatients(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Patients registered at the caller's current location (switch location to see another branch).
  r.get('/api/v1/tenant/patients', { schema: { querystring: listQuery } }, async (req, reply) =>
    openTenant(deps, req, reply, async (gate) => {
      gate.requirePermission('patients.manage');
      if (!gate.locationId) throw new ApiError(403, 'forbidden', 'Choose a location first');
      const filters: SQL[] = [eq(schema.patients.locationId, gate.locationId)];
      const q = req.query.q;
      if (q) {
        const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        filters.push(
          or(
            ilike(schema.patients.firstName, like),
            ilike(schema.patients.lastName, like),
            ilike(schema.patients.uhid, like),
            ilike(schema.patients.mobile, like),
          )!,
        );
      }
      const where = and(...filters);
      const offset = (req.query.page - 1) * req.query.pageSize;
      const rows = await gate.tx
        .select()
        .from(schema.patients)
        .where(where)
        .orderBy(asc(schema.patients.uhid))
        .limit(req.query.pageSize)
        .offset(offset);
      const [counted] = await gate.tx.select({ n: sql<number>`count(*)::int` }).from(schema.patients).where(where);
      return { items: rows.map(toDto), total: Number(counted?.n ?? 0), page: req.query.page, pageSize: req.query.pageSize } satisfies PageDto<PatientDto>;
    }),
  );

  // One patient. Opening a record is logged (DPDP accountability: who looked at whose data, and when).
  r.get('/api/v1/tenant/patients/:id', { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) =>
    openTenant(deps, req, reply, async (gate) => {
      gate.requirePermission('patients.manage');
      const [row] = await gate.tx.select().from(schema.patients).where(eq(schema.patients.id, req.params.id));
      // Another tenant's id is invisible under RLS, so it is a plain 404, never a 403 that confirms it exists.
      if (!row) throw new ApiError(404, 'not_found', 'Patient not found');
      // Inside one hospital, staff tied to specific locations only open patients of those locations.
      const everywhere = gate.assignments.some((a) => a.locationId === null);
      if (!everywhere && !gate.assignments.some((a) => a.locationId === row.locationId)) {
        throw new ApiError(404, 'not_found', 'Patient not found');
      }
      await gate.audit('patient.view', 'patient', row.id, null, { uhid: row.uhid });
      const detail: PatientDetailDto = {
        ...toDto(row),
        addressLine1: row.addressLine1,
        stateCode: row.stateCode,
        pincode: row.pincode,
        emergencyContactName: row.emergencyContactName,
        emergencyContactRelation: row.emergencyContactRelation,
        emergencyContactMobile: row.emergencyContactMobile,
      };
      return detail;
    }),
  );
}
