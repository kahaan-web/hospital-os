import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants } from '../schema';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// MVP demo slice (migration 1260). Employee master and daily attendance marks only.
export const payrollEmployees = pgTable(
  'payroll_employees',
  {
    id: id(),
    tenantId: tenantId(),
    employeeCode: text('employee_code').notNull(),
    fullName: text('full_name').notNull(),
    department: text('department').notNull().default(''),
    designation: text('designation').notNull().default(''),
    monthlyBasicPaise: integer('monthly_basic_paise').notNull().default(0),
    joinedOn: date('joined_on'),
    isActive: boolean('is_active').notNull().default(true),
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('payroll_employees_tenant_id_uq').on(t.tenantId, t.id),
    unique('payroll_employees_code_uq').on(t.tenantId, t.employeeCode),
    check('payroll_employees_basic_chk', sql`monthly_basic_paise >= 0`),
  ],
);

export const payrollAttendance = pgTable(
  'payroll_attendance',
  {
    id: id(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    workDate: date('work_date').notNull(),
    status: text('status').notNull(),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('payroll_attendance_tenant_id_uq').on(t.tenantId, t.id),
    unique('payroll_attendance_day_uq').on(t.tenantId, t.employeeId, t.workDate),
    index('payroll_attendance_month_idx').on(t.tenantId, t.employeeId, t.workDate),
    check(
      'payroll_attendance_status_chk',
      sql`status in ('present', 'absent', 'half_day', 'leave', 'week_off', 'holiday')`,
    ),
    foreignKey({ columns: [t.tenantId, t.employeeId], foreignColumns: [payrollEmployees.tenantId, payrollEmployees.id], name: 'payroll_attendance_employee_fk' }),
  ],
);
