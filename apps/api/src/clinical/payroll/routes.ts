import { schema } from '@hos/db';
import { istDateKey } from '@hos/shared';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError } from '../../http';

// MVP demo slice (migration 1260). Permission and module are enforced by TENANT_GUARDS (route-guards.ts).
const MODULE = 'payroll-attendance';
const PREFIX = `/api/v1/tenant/m/${MODULE}`;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monthQuery = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() });
const idParams = z.object({ id: z.uuid() });

const employeeBody = z.object({
  employeeCode: z.string().trim().min(1).max(20),
  fullName: z.string().trim().min(1).max(120),
  department: z.string().trim().max(60).default(''),
  designation: z.string().trim().max(60).default(''),
  monthlyBasicPaise: z.number().int().min(0),
  joinedOn: isoDate.optional(),
});

const attendanceBody = z.object({
  workDate: isoDate,
  status: z.enum(['present', 'absent', 'half_day', 'leave', 'week_off', 'holiday']),
  note: z.string().trim().max(200).default(''),
});

// Preview constants. Placeholders until the payroll research batch is confirmed (docs/specs/13). Not statutory logic.
const PF_EE_BP = 1200; // 12% employee share, verified rate
const PF_CEILING_PAISE = 2_500_000; // ₹25,000 wage ceiling from 17 Sep 2026, verified
const ESI_EE_BP = 75; // 0.75% employee share, verified rate
const ESI_CEILING_PAISE = 2_100_000; // ₹21,000 coverage ceiling, verified

/** Calendar bounds of a YYYY-MM month: `from` inclusive, `to` exclusive (first day of the next month). */
function monthBounds(month: string): { from: string; to: string; days: number } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of the next month = last day of this one
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { from, to, days };
}

/**
 * Preview only. Basic pay is prorated on calendar days. Days with no mark count as paid.
 * Absent days and half days are loss of pay. No allowances, no professional tax, no labour-code wage step yet.
 */
export function payslipPreview(basicPaise: number, month: string, statuses: string[]) {
  const { days } = monthBounds(month);
  const absent = statuses.filter((s) => s === 'absent').length;
  const half = statuses.filter((s) => s === 'half_day').length;
  const lopDays = absent + half * 0.5;
  const paidDays = Math.max(0, days - lopDays);
  const gross = Math.round((basicPaise * paidDays) / days);
  const pfEe = Math.round((Math.min(gross, PF_CEILING_PAISE) * PF_EE_BP) / 10_000);
  const esiEe = gross <= ESI_CEILING_PAISE ? Math.round((gross * ESI_EE_BP) / 10_000) : 0;
  return {
    month,
    daysInMonth: days,
    paidDays,
    lopDays,
    basicPaise,
    grossPaise: gross,
    pfEmployeePaise: pfEe,
    esiEmployeePaise: esiEe,
    professionalTaxPaise: 0,
    netPaise: gross - pfEe - esiEe,
    placeholderRates: true,
    notes: [
      'Preview only. Statutory rates are placeholders until the payroll research batch is confirmed.',
      'Basic pay only. Allowances, professional tax and the labour-code wage rule are not modelled yet.',
    ],
  };
}

export function registerPayroll(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  r.get(`${PREFIX}/employees`, {}, async (req, reply) =>
    run(req, reply, async (gate) => {
      return gate.tx.select().from(schema.payrollEmployees).orderBy(asc(schema.payrollEmployees.employeeCode));
    }),
  );

  r.post(`${PREFIX}/employees`, { schema: { body: employeeBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const body = req.body;
      const [dup] = await gate.tx
        .select({ id: schema.payrollEmployees.id })
        .from(schema.payrollEmployees)
        .where(eq(schema.payrollEmployees.employeeCode, body.employeeCode));
      if (dup) throw new ApiError(409, 'employee_code_taken', 'An employee with this code already exists');
      const [row] = await gate.tx
        .insert(schema.payrollEmployees)
        .values({
          tenantId: gate.actor.tenantId!,
          employeeCode: body.employeeCode,
          fullName: body.fullName,
          department: body.department,
          designation: body.designation,
          monthlyBasicPaise: body.monthlyBasicPaise,
          joinedOn: body.joinedOn ?? null,
        })
        .returning();
      if (!row) throw new ApiError(500, 'insert_failed', 'Employee was not saved');
      // Audit holds ids only. No salary figures in the audit log.
      await gate.audit('payroll.employee.create', 'payroll_employee', row.id, null, { employeeCode: row.employeeCode });
      return row;
    }),
  );

  r.get(`${PREFIX}/employees/:id`, { schema: { params: idParams, querystring: monthQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const [employee] = await gate.tx.select().from(schema.payrollEmployees).where(eq(schema.payrollEmployees.id, req.params.id));
      if (!employee) throw new ApiError(404, 'not_found', 'Employee not found');
      const month = req.query.month ?? istDateKey(new Date()).slice(0, 7);
      const { from, to } = monthBounds(month);
      const attendance = await gate.tx
        .select()
        .from(schema.payrollAttendance)
        .where(and(eq(schema.payrollAttendance.employeeId, employee.id), gte(schema.payrollAttendance.workDate, from), lt(schema.payrollAttendance.workDate, to)))
        .orderBy(asc(schema.payrollAttendance.workDate));
      return { employee, month, attendance };
    }),
  );

  // Key action 1: mark (or change) the attendance status for one day. One row per employee per day.
  r.put(`${PREFIX}/employees/:id/attendance`, { schema: { params: idParams, body: attendanceBody } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const [employee] = await gate.tx.select({ id: schema.payrollEmployees.id }).from(schema.payrollEmployees).where(eq(schema.payrollEmployees.id, req.params.id));
      if (!employee) throw new ApiError(404, 'not_found', 'Employee not found');
      const [row] = await gate.tx
        .insert(schema.payrollAttendance)
        .values({
          tenantId: gate.actor.tenantId!,
          employeeId: employee.id,
          workDate: req.body.workDate,
          status: req.body.status,
          note: req.body.note,
        })
        .onConflictDoUpdate({
          target: [schema.payrollAttendance.tenantId, schema.payrollAttendance.employeeId, schema.payrollAttendance.workDate],
          set: { status: req.body.status, note: req.body.note },
        })
        .returning();
      if (!row) throw new ApiError(500, 'insert_failed', 'Attendance was not saved');
      await gate.audit('payroll.attendance.mark', 'payroll_attendance', row.id, null, { status: row.status, workDate: row.workDate });
      return row;
    }),
  );

  // Key action 2 (read-only preview): monthly payslip preview, computed on the fly from basic and marks.
  r.get(`${PREFIX}/employees/:id/payslip`, { schema: { params: idParams, querystring: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      const [employee] = await gate.tx.select().from(schema.payrollEmployees).where(eq(schema.payrollEmployees.id, req.params.id));
      if (!employee) throw new ApiError(404, 'not_found', 'Employee not found');
      const { from, to } = monthBounds(req.query.month);
      const marks = await gate.tx
        .select({ status: schema.payrollAttendance.status })
        .from(schema.payrollAttendance)
        .where(and(eq(schema.payrollAttendance.employeeId, employee.id), gte(schema.payrollAttendance.workDate, from), lt(schema.payrollAttendance.workDate, to)));
      return {
        employee: { id: employee.id, employeeCode: employee.employeeCode, fullName: employee.fullName },
        ...payslipPreview(employee.monthlyBasicPaise, req.query.month, marks.map((m) => m.status)),
      };
    }),
  );
}
