import { schema } from '@hos/db';
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { PREFIX, locationOf, tenantOf } from './service';

export function registerOtBoards(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  r.get(`${PREFIX}/schedule`, { schema: { querystring: z.object({ date: z.string(), category: z.string().optional() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const tenantId = tenantOf(gate);
      const locationId = locationOf(gate);
      const resources = await gate.tx
        .select()
        .from(schema.otResources)
        .where(
          and(
            eq(schema.otResources.tenantId, tenantId),
            eq(schema.otResources.locationId, locationId),
            req.query.category ? eq(schema.otResources.categoryName, req.query.category) : undefined,
          ),
        )
        .orderBy(asc(schema.otResources.code));
      const bookings = await gate.tx
        .select({
          booking: schema.otBookings,
          patientName: schema.patients.fullName,
          uhid: schema.patients.uhid,
          doctorName: schema.doctors.name,
        })
        .from(schema.otBookings)
        .innerJoin(schema.patients, and(eq(schema.patients.tenantId, schema.otBookings.tenantId), eq(schema.patients.id, schema.otBookings.patientId)))
        .innerJoin(schema.doctors, and(eq(schema.doctors.tenantId, schema.otBookings.tenantId), eq(schema.doctors.id, schema.otBookings.doctorId)))
        .where(
          and(eq(schema.otBookings.tenantId, tenantId), eq(schema.otBookings.bookingDate, req.query.date), inArray(schema.otBookings.status, ['booked', 'completed'])),
        )
        .orderBy(asc(schema.otBookings.scheduledStart));
      const byResource = new Map<string, typeof bookings>();
      for (const row of bookings) {
        const list = byResource.get(row.booking.resourceId) ?? [];
        list.push(row);
        byResource.set(row.booking.resourceId, list);
      }
      return {
        date: req.query.date,
        rows: resources.map((res) => ({
          resource: res,
          blocks: (byResource.get(res.id) ?? []).map((b) => ({
            apptNo: b.booking.apptNo,
            from: b.booking.scheduledStart,
            to: b.booking.scheduledEnd,
            patientName: b.patientName,
            uhid: b.uhid,
            doctors: b.doctorName,
          })),
        })),
      };
    }),
  );

  r.get(
    `${PREFIX}/list-status`,
    {
      schema: {
        querystring: z.object({
          from: z.string().optional(),
          to: z.string().optional(),
          criteria: z.preprocess((v) => (v === 'surgery' ? 'surgery_date' : v === 'booking' ? 'booking_date' : v), z.enum(['surgery_date', 'booking_date']).optional()),
          status: z.enum(['active', 'cancelled', 'all']).optional(),
          otId: z.uuid().optional(),
          patientType: z.string().optional(),
        }),
      },
    },
    async (req, reply) =>
      run(req, reply, async (gate) => {
        const tenantId = tenantOf(gate);
        const filters = [eq(schema.otBookings.tenantId, tenantId)];
        const dateCol = req.query.criteria === 'booking_date' ? schema.otBookings.createdAt : schema.otBookings.bookingDate;
        if (req.query.from) filters.push(gte(dateCol, req.query.from));
        if (req.query.to) filters.push(lte(dateCol, req.query.to));
        if (req.query.otId) filters.push(eq(schema.otBookings.resourceId, req.query.otId));
        if (req.query.status === 'active') filters.push(eq(schema.otBookings.status, 'booked'));
        else if (req.query.status === 'cancelled') filters.push(eq(schema.otBookings.status, 'cancelled'));
        else filters.push(inArray(schema.otBookings.status, ['booked', 'completed', 'cancelled']));
        if (req.query.patientType) filters.push(eq(schema.otBookings.patientType, req.query.patientType));
        const rows = await gate.tx
          .select({
            booking: schema.otBookings,
            patientName: schema.patients.fullName,
            uhid: schema.patients.uhid,
            doctorName: schema.doctors.name,
            theatre: schema.otResources.code,
            surgeryName: schema.otSurgeryMaster.name,
          })
          .from(schema.otBookings)
          .innerJoin(schema.patients, and(eq(schema.patients.tenantId, schema.otBookings.tenantId), eq(schema.patients.id, schema.otBookings.patientId)))
          .innerJoin(schema.doctors, and(eq(schema.doctors.tenantId, schema.otBookings.tenantId), eq(schema.doctors.id, schema.otBookings.doctorId)))
          .innerJoin(schema.otResources, and(eq(schema.otResources.tenantId, schema.otBookings.tenantId), eq(schema.otResources.id, schema.otBookings.resourceId)))
          .leftJoin(schema.otSurgeryMaster, and(eq(schema.otSurgeryMaster.tenantId, schema.otBookings.tenantId), eq(schema.otSurgeryMaster.id, schema.otBookings.surgeryId)))
          .where(and(...filters))
          .orderBy(desc(schema.otBookings.bookingDate))
          .limit(500);
        return rows.map((row) => ({
          surgeryDate: row.booking.bookingDate,
          bookingDate: row.booking.createdAt,
          bookingTime: row.booking.scheduledStart,
          theatre: row.theatre,
          fromTime: row.booking.scheduledStart,
          toTime: row.booking.scheduledEnd,
          doctorName: row.doctorName,
          surgery: row.surgeryName ?? '',
          remark: row.booking.remarks,
          patientNo: row.uhid,
          patientName: row.patientName,
          status: row.booking.status,
        }));
      }),
  );
}
