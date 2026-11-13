import { schema } from '@hos/db';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError } from '../../http';
import { PREFIX, locationOf, tenantOf } from './service';

const idParams = z.object({ id: z.uuid() });
const doctorParams = z.object({ doctorId: z.uuid() });

export function registerOtMasters(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  // Departments list for OT Reports/Masters dropdowns (no departments table yet: derived from doctor specialities).
  r.get('/api/v1/tenant/clinical/departments', async (req, reply) =>
    run(req, reply, async (gate) => {
      const rows = await gate.tx.selectDistinct({ name: schema.doctors.speciality }).from(schema.doctors).orderBy(asc(schema.doctors.speciality));
      return rows.filter((x) => x.name && x.name.trim()).map((x) => ({ id: x.name as string, name: x.name as string }));
    }),
  );
  r.get(`${PREFIX}/masters/surgeries`, { schema: { querystring: z.object({ type: z.enum(['major', 'minor']).optional() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      return gate.tx
        .select()
        .from(schema.otSurgeryMaster)
        .where(and(eq(schema.otSurgeryMaster.tenantId, tenantId), req.query.type ? eq(schema.otSurgeryMaster.surgeryType, req.query.type) : undefined))
        .orderBy(asc(schema.otSurgeryMaster.name));
    }),
  );

  r.post(
    `${PREFIX}/masters/surgeries`,
    {
      schema: {
        body: z.object({
          name: z.string().trim().min(2).max(200),
          surgeryType: z.enum(['major', 'minor']),
          department: z.string().trim().max(120).default(''),
          active: z.boolean().default(true),
        }),
      },
    },
    async (req, reply) =>
      run(req, reply, async (gate) => {
        const tenantId = tenantOf(gate);
        const [row] = await gate.tx.insert(schema.otSurgeryMaster).values({ tenantId, ...req.body }).returning();
        if (!row) throw new ApiError(500, 'insert_failed', 'Could not save surgery');
        reply.code(201);
        return row;
      }),
  );

  r.patch(
    `${PREFIX}/masters/surgeries/:id`,
    { schema: { params: idParams, body: z.object({ name: z.string().optional(), department: z.string().optional(), active: z.boolean().optional() }) } },
    async (req, reply) =>
      run(req, reply, async (gate) => {
        const tenantId = tenantOf(gate);
        const [row] = await gate.tx
          .update(schema.otSurgeryMaster)
          .set(req.body)
          .where(and(eq(schema.otSurgeryMaster.tenantId, tenantId), eq(schema.otSurgeryMaster.id, req.params.id)))
          .returning();
        if (!row) throw new ApiError(404, 'not_found', 'Surgery not found');
        return row;
      }),
  );

  r.get(`${PREFIX}/masters/special-remarks`, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      return gate.tx.select().from(schema.otSpecialRemarks).where(eq(schema.otSpecialRemarks.tenantId, tenantId)).orderBy(asc(schema.otSpecialRemarks.remark));
    }),
  );

  r.post(`${PREFIX}/masters/special-remarks`, { schema: { body: z.object({ remark: z.string().trim().min(1).max(300), active: z.boolean().default(true) }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const [row] = await gate.tx.insert(schema.otSpecialRemarks).values({ tenantId, ...req.body }).returning();
      reply.code(201);
      return row;
    }),
  );

  r.get(`${PREFIX}/masters/doctors`, { schema: { querystring: z.object({ role: z.enum(['surgeon', 'anaesthetist']).optional() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const rows = await gate.tx
        .select({ doctor: schema.doctors, roles: schema.otDoctorRoles })
        .from(schema.doctors)
        .leftJoin(schema.otDoctorRoles, and(eq(schema.otDoctorRoles.tenantId, schema.doctors.tenantId), eq(schema.otDoctorRoles.doctorId, schema.doctors.id)))
        .where(eq(schema.doctors.tenantId, tenantId))
        .orderBy(asc(schema.doctors.name));
      const mapped = rows.map((row) => ({
        ...row.doctor,
        isSurgeon: row.roles?.isSurgeon ?? false,
        isAnaesthetist: row.roles?.isAnaesthetist ?? false,
      }));
      if (req.query.role === 'surgeon') return mapped.filter((d) => d.isSurgeon);
      if (req.query.role === 'anaesthetist') return mapped.filter((d) => d.isAnaesthetist);
      return mapped;
    }),
  );

  r.put(
    `${PREFIX}/masters/doctors/:doctorId/roles`,
    { schema: { params: doctorParams, body: z.object({ surgeon: z.boolean(), anaesthetist: z.boolean() }) } },
    async (req, reply) =>
      run(req, reply, async (gate) => {
        const tenantId = tenantOf(gate);
        const [doc] = await gate.tx.select().from(schema.doctors).where(and(eq(schema.doctors.tenantId, tenantId), eq(schema.doctors.id, req.params.doctorId)));
        if (!doc) throw new ApiError(404, 'not_found', 'Doctor not found');
        const [existing] = await gate.tx
          .select()
          .from(schema.otDoctorRoles)
          .where(and(eq(schema.otDoctorRoles.tenantId, tenantId), eq(schema.otDoctorRoles.doctorId, req.params.doctorId)));
        if (existing) {
          const [row] = await gate.tx
            .update(schema.otDoctorRoles)
            .set({ isSurgeon: req.body.surgeon, isAnaesthetist: req.body.anaesthetist })
            .where(eq(schema.otDoctorRoles.id, existing.id))
            .returning();
          return row;
        }
        const [row] = await gate.tx
          .insert(schema.otDoctorRoles)
          .values({ tenantId, doctorId: req.params.doctorId, isSurgeon: req.body.surgeon, isAnaesthetist: req.body.anaesthetist })
          .returning();
        return row;
      }),
  );

  r.get(`${PREFIX}/resources`, async (req, reply) =>
    run(req, reply, async (gate) => {
      const locationId = locationOf(gate);
      const tenantId = tenantOf(gate);
      return gate.tx
        .select()
        .from(schema.otResources)
        .where(and(eq(schema.otResources.tenantId, tenantId), eq(schema.otResources.locationId, locationId)))
        .orderBy(asc(schema.otResources.code));
    }),
  );

  r.post(`${PREFIX}/resources`, { schema: { body: z.record(z.string(), z.unknown()) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const locationId = locationOf(gate);
      const tenantId = tenantOf(gate);
      const body = req.body as Record<string, unknown>;
      const [row] = await gate.tx
        .insert(schema.otResources)
        .values({
          tenantId,
          locationId,
          code: String(body.code ?? ''),
          name: String(body.name ?? body.code ?? ''),
          categoryCode: String(body.categoryCode ?? 'OT'),
          categoryName: String(body.categoryName ?? 'General'),
          mainCode: String(body.mainCode ?? ''),
          resourceType: body.resourceType === 'non_medical' ? 'non_medical' : 'medical',
          defaultChargeCode: String(body.defaultChargeCode ?? ''),
          defaultServiceCode: String(body.defaultServiceCode ?? ''),
          storeCode: String(body.storeCode ?? ''),
          overlapAllowed: Boolean(body.overlapAllowed),
          maxOverlap: Number(body.maxOverlap ?? 0),
          maxOverbook: Number(body.maxOverbook ?? 0),
          slotMinutes: Number(body.slotMinutes ?? 15),
          sessions: Number(body.sessions ?? 1),
          bookingActive: body.bookingActive !== false,
          printSlips: body.printSlips !== false,
          appointmentFor: String(body.appointmentFor ?? ''),
        })
        .returning();
      reply.code(201);
      return row;
    }),
  );

  r.patch(`${PREFIX}/resources/:id`, { schema: { params: idParams, body: z.record(z.string(), z.unknown()) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const patch: Record<string, unknown> = { ...req.body };
      const [row] = await gate.tx
        .update(schema.otResources)
        .set(patch)
        .where(and(eq(schema.otResources.tenantId, tenantId), eq(schema.otResources.id, req.params.id)))
        .returning();
      if (!row) throw new ApiError(404, 'not_found', 'Resource not found');
      return row;
    }),
  );

  r.get(`${PREFIX}/settings`, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const [row] = await gate.tx.select().from(schema.otSettings).where(eq(schema.otSettings.tenantId, tenantId));
      if (!row) {
        return { cutoffTime: '17:00', minLeadDays: 1, emergencyBypass: true };
      }
      return {
        cutoffTime: String(row.cutoffTime).slice(0, 5),
        minLeadDays: row.minLeadDays,
        emergencyBypass: row.emergencyBypass,
      };
    }),
  );

  r.put(
    `${PREFIX}/settings`,
    { schema: { body: z.object({ cutoffTime: z.string(), minLeadDays: z.coerce.number().int().min(0).max(30), emergencyBypass: z.boolean() }) } },
    async (req, reply) =>
      run(req, reply, async (gate) => {
        const tenantId = tenantOf(gate);
        const [existing] = await gate.tx.select().from(schema.otSettings).where(eq(schema.otSettings.tenantId, tenantId));
        if (existing) {
          await gate.tx
            .update(schema.otSettings)
            .set({
              cutoffTime: sql`${req.body.cutoffTime}::time`,
              minLeadDays: req.body.minLeadDays,
              emergencyBypass: req.body.emergencyBypass,
            })
            .where(eq(schema.otSettings.id, existing.id));
        } else {
          await gate.tx.insert(schema.otSettings).values({
            tenantId,
            minLeadDays: req.body.minLeadDays,
            emergencyBypass: req.body.emergencyBypass,
            cutoffTime: sql`${req.body.cutoffTime}::time`,
          });
        }
        return req.body;
      }),
  );
}
