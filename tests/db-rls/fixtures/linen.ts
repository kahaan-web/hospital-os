import type pg from 'pg';
import { ensureRow } from './sql';
import type { ProbeSpec } from './types';

// Linen & Laundry (migration 1200). The item is the parent of the laundry batch.
const FIXTURES = [
  {
    table: 'linen_items',
    sql: `insert into linen_items (tenant_id, location_id, name, clean_qty, is_sample)
          select $1::uuid, l.id, $2, 10, true
            from locations l
           where l.tenant_id = $1
           limit 1`,
    params: (id: string, spec: ProbeSpec) => [id, `Sample sheet ${spec.tag}`],
  },
  {
    table: 'laundry_batches',
    sql: `insert into laundry_batches (tenant_id, location_id, number, linen_item_id, qty_sent, is_sample)
          select $1::uuid, i.location_id, $2, i.id, 2, true
            from linen_items i
           where i.tenant_id = $1
             and not exists (select 1 from laundry_batches where tenant_id = $1)
           limit 1`,
    params: (id: string, spec: ProbeSpec) => [id, `DEMO-RLS-LB-${spec.tag}`],
  },
];

export async function seedLinen(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  for (const fixture of FIXTURES) {
    await ensureRow(owner, fixture.table, tenantId, fixture.sql, fixture.params(tenantId, spec));
  }
}
