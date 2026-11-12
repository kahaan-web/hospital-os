import type pg from 'pg';
import { ensureRow } from './sql';
import type { ProbeSpec } from './types';

type Fixture = { table: string; sql: string; params: (id: string, spec: ProbeSpec) => unknown[] };

const FIXTURES: Fixture[] = [
  {
    table: 'ot_cases',
    sql: `insert into ot_cases (tenant_id, location_id, patient_id, number, procedure_name, surgeon_name, room_code,
                               scheduled_start, scheduled_end, is_sample)
          select $1::uuid, l.id, p.id, $2, 'Sample procedure', 'Dr. Sample', 'OT-1',
                 now() + interval '1 day', now() + interval '1 day 1 hour', true
          from patients p
          join locations l on l.tenant_id = p.tenant_id and l.is_primary
          where p.tenant_id = $1
            and not exists (select 1 from ot_cases where tenant_id = $1)
          limit 1`,
    params: (id, spec) => [id, `${spec.tag}-ot-1`],
  },
  {
    table: 'rad_orders',
    sql: `insert into rad_orders (tenant_id, location_id, patient_id, number, modality, study_name, is_sample)
          select $1::uuid, l.id, p.id, $2, 'xray', 'Chest PA (Sample)', true
          from patients p
          join locations l on l.tenant_id = p.tenant_id and l.is_primary
          where p.tenant_id = $1
            and not exists (select 1 from rad_orders where tenant_id = $1)
          limit 1`,
    params: (id, spec) => [id, `${spec.tag}-rad-1`],
  },
  {
    table: 'rad_reports',
    sql: `insert into rad_reports (tenant_id, order_id, findings, is_sample)
          select $1::uuid, o.id, 'Sample', true
          from rad_orders o
          where o.tenant_id = $1
            and not exists (select 1 from rad_reports where tenant_id = $1)
          limit 1`,
    params: (id) => [id],
  },
];

export async function seedOtRad(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  for (const fixture of FIXTURES) {
    await ensureRow(owner, fixture.table, tenantId, fixture.sql, fixture.params(tenantId, spec));
  }
}
