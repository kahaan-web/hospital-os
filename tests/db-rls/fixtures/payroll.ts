import type pg from 'pg';
import { ensureRow } from './sql';
import type { ProbeSpec } from './types';

type Fixture = {
  table: string;
  sql: string;
  params: (id: string, spec: ProbeSpec) => unknown[];
};

// MVP demo slice (migration 1260). Parents first: attendance joins to the employee row.
const FIXTURES: Fixture[] = [
  {
    table: 'payroll_employees',
    sql: `insert into payroll_employees (tenant_id, employee_code, full_name, monthly_basic_paise)
          select $1::uuid, 'RLS-' || $2::text, 'Probe staff', 100000
          where not exists (select 1 from payroll_employees where tenant_id = $1)`,
    params: (id, spec) => [id, spec.tag],
  },
  {
    table: 'payroll_attendance',
    sql: `insert into payroll_attendance (tenant_id, employee_id, work_date, status)
          select $1::uuid, e.id, current_date, 'present'
            from payroll_employees e
           where e.tenant_id = $1
             and not exists (select 1 from payroll_attendance where tenant_id = $1)
           limit 1`,
    params: (id) => [id],
  },
];

export async function seedPayroll(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  for (const fixture of FIXTURES) {
    await ensureRow(owner, fixture.table, tenantId, fixture.sql, fixture.params(tenantId, spec));
  }
}
