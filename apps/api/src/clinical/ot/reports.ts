import { schema } from '@hos/db';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { PREFIX, locationOf, patientAgeYears, tenantOf } from './service';

const reportKinds = z.enum(['register', 'doctor', 'department', 'anaesthetist', 'cancellation', 'duplicates', 'frozen']);

export function registerOtReports(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  r.get(
    `${PREFIX}/reports/:kind`,
    {
      schema: {
        params: z.object({ kind: reportKinds }),
        querystring: z.object({
          from: z.string().optional(),
          to: z.string().optional(),
          doctorId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
          departmentId: z.string().optional(),
          anaesthetistId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
          surgeryIds: z.string().optional(),
        }),
      },
    },
    async (req, reply) =>
      run(req, reply, async (gate) => {
        const tenantId = tenantOf(gate);
        const locationId = locationOf(gate);
        const filters = [eq(schema.otBookings.tenantId, tenantId), eq(schema.otBookings.locationId, locationId)];
        if (req.query.from) filters.push(gte(schema.otBookings.bookingDate, req.query.from));
        if (req.query.to) filters.push(lte(schema.otBookings.bookingDate, req.query.to));
        if (req.query.doctorId) filters.push(eq(schema.otBookings.doctorId, req.query.doctorId));
        if (req.query.surgeryIds) {
          const ids = req.query.surgeryIds.split(',').filter(Boolean);
          if (ids.length) filters.push(inArray(schema.otBookings.surgeryId, ids));
        }

        if (req.params.kind === 'cancellation') {
          const rows = await gate.tx
            .select({
              booking: schema.otBookings,
              patientName: schema.patients.fullName,
              uhid: schema.patients.uhid,
              theatre: schema.otResources.code,
            })
            .from(schema.otBookings)
            .innerJoin(schema.patients, and(eq(schema.patients.tenantId, schema.otBookings.tenantId), eq(schema.patients.id, schema.otBookings.patientId)))
            .innerJoin(schema.otResources, and(eq(schema.otResources.tenantId, schema.otBookings.tenantId), eq(schema.otResources.id, schema.otBookings.resourceId)))
            .where(and(...filters, eq(schema.otBookings.status, 'cancelled')))
            .orderBy(desc(schema.otBookings.bookingDate));
          return rows.map((row, i) => ({
            sno: i + 1,
            type: row.booking.patientType.toUpperCase(),
            ot: row.theatre,
            number: row.uhid,
            name: row.patientName,
            date: row.booking.bookingDate,
            time: row.booking.scheduledStart,
            reason: row.booking.cancelRemarks,
          }));
        }

        if (req.params.kind === 'frozen') {
          const rows = await gate.tx
            .select({
              booking: schema.otBookings,
              patientName: schema.patients.fullName,
              uhid: schema.patients.uhid,
              dob: schema.patients.dob,
              gender: schema.patients.gender,
              theatre: schema.otResources.code,
              surgeryName: schema.otSurgeryMaster.name,
              doctorName: schema.doctors.name,
            })
            .from(schema.otBookings)
            .innerJoin(schema.patients, and(eq(schema.patients.tenantId, schema.otBookings.tenantId), eq(schema.patients.id, schema.otBookings.patientId)))
            .innerJoin(schema.doctors, and(eq(schema.doctors.tenantId, schema.otBookings.tenantId), eq(schema.doctors.id, schema.otBookings.doctorId)))
            .innerJoin(schema.otResources, and(eq(schema.otResources.tenantId, schema.otBookings.tenantId), eq(schema.otResources.id, schema.otBookings.resourceId)))
            .leftJoin(schema.otSurgeryMaster, and(eq(schema.otSurgeryMaster.tenantId, schema.otBookings.tenantId), eq(schema.otSurgeryMaster.id, schema.otBookings.surgeryId)))
            .where(and(...filters, eq(schema.otBookings.frozenSection, true)))
            .orderBy(asc(schema.otBookings.bookingDate));
          return rows.map((row, i) => ({
            sno: i + 1,
            patientNo: row.uhid,
            dateTime: row.booking.scheduledStart,
            name: row.patientName,
            sexAge: `${row.gender ?? ''}/${row.dob ? patientAgeYears(new Date(row.dob)) : ''}`,
            ot: row.theatre,
            diagnosis: row.booking.diagnosis,
            surgery: row.surgeryName ?? '',
            surgeon: row.doctorName,
            frozenIndication: row.booking.indication,
            cancelled: row.booking.status === 'cancelled',
          }));
        }

        if (req.params.kind === 'duplicates') {
          const dup = await gate.tx.execute<{ patient_id: string; n: number }>(sql`
            select patient_id, count(*)::int as n from ot_bookings
            where tenant_id = ${tenantId}::uuid and status in ('booked','completed')
            ${req.query.from ? sql`and booking_date >= ${req.query.from}::date` : sql``}
            ${req.query.to ? sql`and booking_date <= ${req.query.to}::date` : sql``}
            group by patient_id having count(*) > 1
          `);
          const patientIds = dup.rows.map((r) => r.patient_id);
          if (patientIds.length === 0) return [];
          const rows = await gate.tx
            .select({
              booking: schema.otBookings,
              patientName: schema.patients.fullName,
              uhid: schema.patients.uhid,
              gender: schema.patients.gender,
              surgeryName: schema.otSurgeryMaster.name,
            })
            .from(schema.otBookings)
            .innerJoin(schema.patients, and(eq(schema.patients.tenantId, schema.otBookings.tenantId), eq(schema.patients.id, schema.otBookings.patientId)))
            .leftJoin(schema.otSurgeryMaster, and(eq(schema.otSurgeryMaster.tenantId, schema.otBookings.tenantId), eq(schema.otSurgeryMaster.id, schema.otBookings.surgeryId)))
            .where(and(...filters, inArray(schema.otBookings.patientId, patientIds)))
            .orderBy(asc(schema.otBookings.bookingDate));
          return rows.map((row, i) => ({
            sno: i + 1,
            date: row.booking.bookingDate,
            time: row.booking.scheduledStart,
            opNo: row.uhid,
            name: row.patientName,
            sex: row.gender ?? '',
            diagnosis: row.booking.diagnosis,
            surgery: row.surgeryName ?? '',
          }));
        }

        if (req.params.kind === 'department') {
          const rows = await gate.tx.execute<{ department: string; ot_code: string; n: number }>(sql`
            select coalesce(s.department, 'Unknown') as department, r.code as ot_code, count(*)::int as n
            from ot_bookings b
            join ot_resources r on r.tenant_id = b.tenant_id and r.id = b.resource_id
            left join ot_surgery_master s on s.tenant_id = b.tenant_id and s.id = b.surgery_id
            where b.tenant_id = ${tenantId}::uuid and b.location_id = ${locationId}::uuid
            ${req.query.from ? sql`and b.booking_date >= ${req.query.from}::date` : sql``}
            ${req.query.to ? sql`and b.booking_date <= ${req.query.to}::date` : sql``}
            and b.status in ('booked','completed')
            group by 1, 2 order by 1, 2
          `);
          const departments = [...new Set(rows.rows.map((r) => r.department))];
          const ots = [...new Set(rows.rows.map((r) => r.ot_code))];
          const matrix = departments.map((dept) => {
            const cells: Record<string, number> = {};
            for (const ot of ots) {
              const hit = rows.rows.find((r) => r.department === dept && r.ot_code === ot);
              cells[ot] = hit?.n ?? 0;
            }
            const total = Object.values(cells).reduce((a, b) => a + b, 0);
            return { department: dept, cells, total };
          });
          return { columns: ots, rows: matrix };
        }

        const baseRows = await gate.tx
          .select({
            booking: schema.otBookings,
            patientName: schema.patients.fullName,
            uhid: schema.patients.uhid,
            dob: schema.patients.dob,
            gender: schema.patients.gender,
            doctorName: schema.doctors.name,
            theatre: schema.otResources.code,
            surgeryName: schema.otSurgeryMaster.name,
            surgeryDept: schema.otSurgeryMaster.department,
            admissionAt: schema.admissions.admittedAt,
            dischargedAt: schema.admissions.dischargedAt,
            admissionStatus: schema.admissions.status,
          })
          .from(schema.otBookings)
          .innerJoin(schema.patients, and(eq(schema.patients.tenantId, schema.otBookings.tenantId), eq(schema.patients.id, schema.otBookings.patientId)))
          .innerJoin(schema.doctors, and(eq(schema.doctors.tenantId, schema.otBookings.tenantId), eq(schema.doctors.id, schema.otBookings.doctorId)))
          .innerJoin(schema.otResources, and(eq(schema.otResources.tenantId, schema.otBookings.tenantId), eq(schema.otResources.id, schema.otBookings.resourceId)))
          .leftJoin(schema.otSurgeryMaster, and(eq(schema.otSurgeryMaster.tenantId, schema.otBookings.tenantId), eq(schema.otSurgeryMaster.id, schema.otBookings.surgeryId)))
          .leftJoin(schema.admissions, and(eq(schema.admissions.tenantId, schema.otBookings.tenantId), eq(schema.admissions.id, schema.otBookings.admissionId)))
          .where(and(...filters, inArray(schema.otBookings.status, ['booked', 'completed'])))
          .orderBy(asc(schema.otBookings.bookingDate));

        let filtered = baseRows;
        if (req.params.kind === 'anaesthetist' && req.query.anaesthetistId) {
          filtered = baseRows.filter((row) => row.booking.anaesthetistIds?.includes(req.query.anaesthetistId!));
        }
        if (req.query.departmentId) {
          filtered = filtered.filter((row) => row.surgeryDept); // departmentId not on surgery master FK — filter by name if needed
        }

        return filtered.map((row, i) => {
          const end = row.admissionStatus === 'discharged' && row.dischargedAt ? row.dischargedAt : new Date();
          const losDays =
            row.admissionAt != null ? Math.max(0, Math.ceil((end.getTime() - row.admissionAt.getTime()) / 86_400_000)) : null;
          return {
            sno: i + 1,
            ot: row.theatre,
            date: row.booking.bookingDate,
            opNo: row.uhid,
            ipNo: row.booking.patientType === 'ip' ? row.uhid : '',
            name: row.patientName,
            sex: row.gender ?? row.booking.sex,
            age: row.dob ? patientAgeYears(new Date(row.dob)) : '',
            diagnosis: row.booking.diagnosis,
            surgery: row.surgeryName ?? '',
            doctor: row.doctorName,
            losDays: req.params.kind === 'register' ? losDays : undefined,
          };
        });
      }),
  );
}
