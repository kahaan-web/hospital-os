// B3 doctor workspace: order_sets and prescription_templates.
import type pg from 'pg';
import type { ProbeSpec } from './types';

async function exists(owner: pg.Client, table: string): Promise<boolean> {
  const r = await owner.query<{ rel: string | null }>('select to_regclass($1)::text as rel', [`public.${table}`]);
  return Boolean(r.rows[0]?.rel);
}

export async function seedDoctor(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  if (await exists(owner, 'order_sets')) {
    await owner.query(
      `insert into order_sets (tenant_id, name, kind, items)
       select $1, 'RLS lab pack ' || $2, 'lab', '[]'::jsonb
        where not exists (select 1 from order_sets where tenant_id = $1)`,
      [tenantId, spec.tag],
    );
  }
  if (await exists(owner, 'prescription_templates')) {
    await owner.query(
      `insert into prescription_templates (tenant_id, name, items)
       select $1, 'RLS Rx tpl ' || $2, '[]'::jsonb
        where not exists (select 1 from prescription_templates where tenant_id = $1)`,
      [tenantId, spec.tag],
    );
  }
}
