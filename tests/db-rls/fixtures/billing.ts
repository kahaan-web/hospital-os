// B5 OP billing tables. One sample row per probe tenant. Insert-only.
import type pg from 'pg';
import type { ProbeSpec } from './types';

function mark(spec: ProbeSpec): string {
  return spec.tag === 'alpha' ? 'A' : 'B';
}

async function exists(owner: pg.Client, table: string): Promise<boolean> {
  const found = await owner.query<{ rel: string | null }>('select to_regclass($1)::text as rel', [`public.${table}`]);
  return Boolean(found.rows[0]?.rel);
}

export async function seedBilling(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  if (!(await exists(owner, 'bills'))) return;
  const code = mark(spec);
  await owner.query(
    `insert into bills (
       tenant_id, location_id, patient_id, encounter_id, kind, number, doc_type, status, pay_class,
       subtotal_paise, discount_paise, cgst_paise, sgst_paise, igst_paise, round_off_paise, total_paise, paid_paise
     )
     select $1::uuid, e.location_id, e.patient_id, e.id, 'op', $2, 'bill_of_supply', 'final', 'cash',
            100, 0, 0, 0, 0, 0, 100, 100
       from encounters e
      where e.tenant_id = $1::uuid
        and not exists (select 1 from bills where tenant_id = $1::uuid)
      limit 1`,
    [tenantId, `RLS${code}-OB-00001`],
  );
  await owner.query(
    `insert into bill_lines (
       tenant_id, bill_id, charge_id, line_no, description, qty, unit_price_paise, amount_paise,
       discount_paise, bill_discount_paise, taxable_paise, gst_treatment, service_date
     )
     select $1::uuid, b.id, c.id, 1, 'General consultation (Sample)', 1, 100, 100,
            0, 0, 100, 'exempt_healthcare', current_date
       from bills b
       join charges c on c.tenant_id = b.tenant_id
      where b.tenant_id = $1::uuid
        and not exists (select 1 from bill_lines where tenant_id = $1::uuid)
      limit 1`,
    [tenantId],
  );
  await owner.query(
    `insert into deposits (tenant_id, location_id, patient_id, number, amount_paise, balance_paise, mode, status)
     select $1::uuid, l.id, p.id, $2, 100, 100, 'cash', 'open'
       from locations l
       join patients p on p.tenant_id = l.tenant_id
      where l.tenant_id = $1::uuid and l.is_primary
        and not exists (select 1 from deposits where tenant_id = $1::uuid)
      limit 1`,
    [tenantId, `RLS${code}-DP-00001`],
  );
  await owner.query(
    `insert into bill_settlements (tenant_id, bill_id, mode, amount_paise, instrument_ref)
     select $1::uuid, b.id, 'cash', 100, 'Sample'
       from bills b
      where b.tenant_id = $1::uuid
        and not exists (select 1 from bill_settlements where tenant_id = $1::uuid)
      limit 1`,
    [tenantId],
  );
  await owner.query(
    `insert into concessions (tenant_id, bill_id, amount_paise, reason, status)
     select $1::uuid, b.id, 100, 'Sample concession (Sample)', 'requested'
       from bills b
      where b.tenant_id = $1::uuid
        and not exists (select 1 from concessions where tenant_id = $1::uuid)
      limit 1`,
    [tenantId],
  );
  await owner.query(
    `insert into refunds (tenant_id, bill_id, number, amount_paise, reason, mode)
     select $1::uuid, b.id, $2, 100, 'Sample refund (Sample)', 'cash'
       from bills b
      where b.tenant_id = $1::uuid
        and not exists (select 1 from refunds where tenant_id = $1::uuid)
      limit 1`,
    [tenantId, `RLS${code}-RF-00001`],
  );
  await owner.query(
    `insert into bill_credit_notes (tenant_id, bill_id, number, amount_paise, reason, status)
     select $1::uuid, b.id, $2, 100, 'Sample credit note (Sample)', 'issued'
       from bills b
      where b.tenant_id = $1::uuid
        and not exists (select 1 from bill_credit_notes where tenant_id = $1::uuid)
      limit 1`,
    [tenantId, `RLS${code}-CN-00001`],
  );
}
