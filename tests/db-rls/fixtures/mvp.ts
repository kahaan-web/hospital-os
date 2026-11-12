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
    table: 'bb_units',
    sql: `insert into bb_units (tenant_id, location_id, unit_no, component, abo, rh, volume_ml, collected_on, expires_at, tti_cleared, is_sample)
          select $1::uuid, l.id, $2, 'prbc', 'O', 'pos', 280, current_date - 1, current_date + 30, true, true
          from locations l
          where l.tenant_id = $1 and l.is_primary
            and not exists (select 1 from bb_units where tenant_id = $1)
          limit 1`,
    params: (id, spec) => [id, `DEMO-${spec.tag}-BB1`],
  },
  {
    table: 'bb_requests',
    sql: `insert into bb_requests (tenant_id, location_id, patient_id, patient_abo, patient_rh, component, is_sample)
          select $1::uuid, e.location_id, e.patient_id, 'O', 'pos', 'prbc', true
          from encounters e
          where e.tenant_id = $1
            and not exists (select 1 from bb_requests where tenant_id = $1)
          limit 1`,
    params: (id) => [id],
  },
  {
    table: 'mkt_campaigns',
    sql: `insert into mkt_campaigns (tenant_id, name, channel, message, is_sample)
          select $1::uuid, 'Probe campaign (Sample)', 'sms', 'Probe message. Reply STOP to opt out.', true
          where not exists (select 1 from mkt_campaigns where tenant_id = $1)`,
    params: (id) => [id],
  },
];

export async function seedMvp(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  for (const fixture of FIXTURES) {
    await ensureRow(owner, fixture.table, tenantId, fixture.sql, fixture.params(tenantId, spec));
  }
}
