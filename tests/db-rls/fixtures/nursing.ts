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
  // The shared foundation order is a lab order. MAR needs a medicine order of its own.
  await owner.query(
    `insert into clinical_orders (
       tenant_id, location_id, encounter_id, patient_id, kind, number, source, priority, status,
       ordering_doctor_id, ordered_by_user_id, notes
     )
     select $1::uuid, e.location_id, e.id, e.patient_id, 'medicine', $2, 'opd', 'routine', 'placed',
            e.doctor_id, e.created_by, 'Sample medicine (Sample)'
       from encounters e
      where e.tenant_id = $1
        and not exists (select 1 from clinical_orders where tenant_id = $1 and kind = 'medicine')
      limit 1`,
    [tenantId, `${spec.tag}-mar-ord`],
  );
  await owner.query(
    `insert into clinical_order_items (tenant_id, order_id, line_no, drug_name, dose, frequency_code, status)
     select $1::uuid, o.id, 1, 'Paracetamol (Sample)', '500 mg', 'TDS', 'pending'
       from clinical_orders o
      where o.tenant_id = $1
        and o.kind = 'medicine'
        and not exists (
          select 1 from clinical_order_items i
           where i.tenant_id = o.tenant_id and i.order_id = o.id
        )
      limit 1`,
    [tenantId],
  );
  for (const fixture of FIXTURES) {
    await ensureRow(owner, fixture.table, tenantId, fixture.sql, fixture.params(tenantId, spec));
  }
}
