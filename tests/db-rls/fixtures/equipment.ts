import type pg from 'pg';
import { ensureRow } from './sql';
import type { ProbeSpec } from './types';

type Fixture = {
  table: string;
  sql: string;
  params: (id: string, spec: ProbeSpec) => unknown[];
};

// MVP demo slice (migration 1220). Parents first: each row joins to the one before it.
const FIXTURES: Fixture[] = [
  {
    table: 'equipment_assets',
    sql: `insert into equipment_assets (tenant_id, asset_tag, name)
          select $1::uuid, 'RLS-' || $2::text, 'Probe asset'
          where not exists (select 1 from equipment_assets where tenant_id = $1)`,
    params: (id, spec) => [id, spec.tag],
  },
  {
    table: 'equipment_pm_schedules',
    sql: `insert into equipment_pm_schedules (tenant_id, equipment_id, title, frequency_days, next_due)
          select $1::uuid, a.id, 'Probe PM', 30, current_date
            from equipment_assets a
           where a.tenant_id = $1
             and not exists (select 1 from equipment_pm_schedules where tenant_id = $1)
           limit 1`,
    params: (id) => [id],
  },
  {
    table: 'equipment_service_logs',
    sql: `insert into equipment_service_logs (tenant_id, equipment_id, kind, description)
          select $1::uuid, a.id, 'pm', 'Probe log'
            from equipment_assets a
           where a.tenant_id = $1
             and not exists (select 1 from equipment_service_logs where tenant_id = $1)
           limit 1`,
    params: (id) => [id],
  },
];

export async function seedEquipment(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  for (const fixture of FIXTURES) {
    await ensureRow(owner, fixture.table, tenantId, fixture.sql, fixture.params(tenantId, spec));
  }
}
