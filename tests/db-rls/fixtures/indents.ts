import type pg from 'pg';
import { ensureRow } from './sql';
import type { ProbeSpec } from './types';

// Indents & Purchase (migration 1140). Parents first: indents, then lines and the purchase order.
const FIXTURES = [
  {
    table: 'indents',
    sql: `insert into indents (tenant_id, location_id, number, department, is_sample)
          select $1::uuid, l.id, $2, 'Sample ward', true
            from locations l
           where l.tenant_id = $1
           limit 1`,
    params: (id: string, spec: ProbeSpec) => [id, `DEMO-RLS-IND-${spec.tag}`],
  },
  {
    table: 'indent_lines',
    sql: `insert into indent_lines (tenant_id, indent_id, line_no, item_name, qty_requested)
          select $1::uuid, i.id, 1, 'Sample gloves (Sample)', 5
            from indents i
           where i.tenant_id = $1
             and not exists (select 1 from indent_lines where tenant_id = $1)
           limit 1`,
    params: (id: string) => [id],
  },
  {
    table: 'purchase_orders',
    sql: `insert into purchase_orders (tenant_id, location_id, number, indent_id, supplier_name, is_sample)
          select $1::uuid, i.location_id, $2, i.id, 'Sample supplier (Sample)', true
            from indents i
           where i.tenant_id = $1
             and not exists (select 1 from purchase_orders where tenant_id = $1)
           limit 1`,
    params: (id: string, spec: ProbeSpec) => [id, `DEMO-RLS-PO-${spec.tag}`],
  },
];

export async function seedIndents(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  for (const fixture of FIXTURES) {
    await ensureRow(owner, fixture.table, tenantId, fixture.sql, fixture.params(tenantId, spec));
  }
}
