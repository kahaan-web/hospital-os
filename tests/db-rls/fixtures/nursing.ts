import type pg from 'pg';
import { ensureRow } from './sql';
import type { ProbeSpec } from './types';

type Fixture = {
  table: string;
  sql: string;
  params: (id: string, spec: ProbeSpec) => unknown[];
};

const FIXTURES: Fixture[] = [
  {
    table: 'mar_schedules',
    sql: `insert into mar_schedules (tenant_id, order_item_id, encounter_id, scheduled_at)
          select $1::uuid, i.id, e.id, now() + interval '2 hours'
          from encounters e
          join clinical_orders o on o.tenant_id = e.tenant_id and o.encounter_id = e.id and o.kind = 'medicine'
          join clinical_order_items i on i.tenant_id = o.tenant_id and i.order_id = o.id
          where e.tenant_id = $1
            and not exists (select 1 from mar_schedules where tenant_id = $1)
          limit 1`,
    params: (id) => [id],
  },
  {
    table: 'medication_administrations',
    sql: `insert into medication_administrations (tenant_id, mar_schedule_id, status, dose_given, given_by)
          select $1::uuid, m.id, 'given', '1 tab', u.id
          from mar_schedules m
          join users u on u.tenant_id = m.tenant_id
          where m.tenant_id = $1
            and not exists (select 1 from medication_administrations where tenant_id = $1)
          limit 1`,
    params: (id) => [id],
  },
];

export async function seedNursing(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  for (const fixture of FIXTURES) {
    await ensureRow(owner, fixture.table, tenantId, fixture.sql, fixture.params(tenantId, spec));
  }
}
