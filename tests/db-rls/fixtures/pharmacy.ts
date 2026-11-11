// B7 pharmacy. One sample row per tenant table. Re-runs are no-ops when the tenant already has a row.
import type pg from 'pg';
import { ensureRow } from './sql';
import type { ProbeSpec } from './types';

export async function seedPharmacy(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  const tag = spec.tag;
  await ensureRow(
    owner,
    'pharmacy_suppliers',
    tenantId,
    `insert into pharmacy_suppliers (tenant_id, name, phone, city, is_sample)
     select $1::uuid, 'Malad Pharma (Sample)', '9000014101', 'Mumbai', true
      where not exists (select 1 from pharmacy_suppliers where tenant_id = $1)`,
    [tenantId],
  );
  await ensureRow(
    owner,
    'pharmacy_items',
    tenantId,
    `insert into pharmacy_items (tenant_id, generic_code, brand, form, strength, hsn, gst_rate_bp, reorder_level, schedule, is_sample)
     select $1::uuid, 'PARACETAMOL', 'Pyrin (Sample)', 'tablet', '500 mg', '30049099', 1200, 10, 'OTC', true
      where not exists (select 1 from pharmacy_items where tenant_id = $1)`,
    [tenantId],
  );
  await ensureRow(
    owner,
    'pharmacy_batches',
    tenantId,
    `insert into pharmacy_batches (tenant_id, item_id, supplier_id, batch_no, expiry, mrp_paise, purchase_rate_paise)
     select $1::uuid, i.id, s.id, 'PYRIN-RLS', date '2027-08-31', 11200, 8000
       from pharmacy_items i
       join pharmacy_suppliers s on s.tenant_id = i.tenant_id
      where i.tenant_id = $1
        and not exists (select 1 from pharmacy_batches where tenant_id = $1)
      limit 1`,
    [tenantId],
  );
  await ensureRow(
    owner,
    'pharmacy_stock',
    tenantId,
    `insert into pharmacy_stock (tenant_id, batch_id, location_id, qty)
     select $1::uuid, b.id, l.id, 1
       from pharmacy_batches b
       join locations l on l.tenant_id = b.tenant_id and l.is_primary
      where b.tenant_id = $1
        and not exists (select 1 from pharmacy_stock where tenant_id = $1)
      limit 1`,
    [tenantId],
  );
  await ensureRow(
    owner,
    'pharmacy_stock_moves',
    tenantId,
    `insert into pharmacy_stock_moves (tenant_id, batch_id, location_id, qty, move_type, ref_type, ref_id, reason)
     select $1::uuid, b.id, l.id, 1, 'adjustment', 'fixture', b.id, 'Sample opening (Sample)'
       from pharmacy_batches b
       join locations l on l.tenant_id = b.tenant_id and l.is_primary
      where b.tenant_id = $1
        and not exists (select 1 from pharmacy_stock_moves where tenant_id = $1)
      limit 1`,
    [tenantId],
  );
  await ensureRow(
    owner,
    'pharmacy_grns',
    tenantId,
    `insert into pharmacy_grns (tenant_id, location_id, supplier_id, number, notes, is_sample)
     select $1::uuid, l.id, s.id, $2, 'Sample goods receipt', true
       from locations l
       join pharmacy_suppliers s on s.tenant_id = l.tenant_id
      where l.tenant_id = $1 and l.is_primary
        and not exists (select 1 from pharmacy_grns where tenant_id = $1)
      limit 1`,
    [tenantId, `PH-${tag}-GR`],
  );
  await ensureRow(
    owner,
    'pharmacy_grn_lines',
    tenantId,
    `insert into pharmacy_grn_lines (tenant_id, grn_id, line_no, item_id, batch_id, qty, mrp_paise, purchase_rate_paise, gst_rate_bp)
     select $1::uuid, g.id, 1, i.id, b.id, 1, 11200, 8000, 1200
       from pharmacy_grns g
       join pharmacy_items i on i.tenant_id = g.tenant_id
       join pharmacy_batches b on b.tenant_id = g.tenant_id
      where g.tenant_id = $1
        and not exists (select 1 from pharmacy_grn_lines where tenant_id = $1)
      limit 1`,
    [tenantId],
  );
  await ensureRow(
    owner,
    'pharmacy_sales',
    tenantId,
    `insert into pharmacy_sales (
       tenant_id, location_id, walkin_name, kind, number, mode, doc_type,
       gross_paise, taxable_paise, cgst_paise, sgst_paise, total_paise, is_sample
     )
     select $1::uuid, l.id, 'Sample counter (Sample)', 'outside', $2, 'cash', 'tax_invoice', 11200, 10000, 600, 600, 11200, true
       from locations l
      where l.tenant_id = $1 and l.is_primary
        and not exists (select 1 from pharmacy_sales where tenant_id = $1)
      limit 1`,
    [tenantId, `PH-${tag}-PS`],
  );
  await ensureRow(
    owner,
    'pharmacy_sale_lines',
    tenantId,
    `insert into pharmacy_sale_lines (
       tenant_id, sale_id, line_no, item_id, batch_id, qty, mrp_paise, gst_rate_bp, gross_paise, taxable_paise, tax_paise
     )
     select $1::uuid, s.id, 1, i.id, b.id, 1, 11200, 1200, 11200, 10000, 1200
       from pharmacy_sales s
       join pharmacy_items i on i.tenant_id = s.tenant_id
       join pharmacy_batches b on b.tenant_id = s.tenant_id
      where s.tenant_id = $1
        and not exists (select 1 from pharmacy_sale_lines where tenant_id = $1)
      limit 1`,
    [tenantId],
  );
  await ensureRow(
    owner,
    'pharmacy_sale_returns',
    tenantId,
    `insert into pharmacy_sale_returns (tenant_id, location_id, sale_id, number, reason, gross_paise, taxable_paise, tax_paise, is_sample)
     select $1::uuid, s.location_id, s.id, $2, 'Sample return', 0, 0, 0, true
       from pharmacy_sales s
      where s.tenant_id = $1
        and not exists (select 1 from pharmacy_sale_returns where tenant_id = $1)
      limit 1`,
    [tenantId, `PH-${tag}-PR`],
  );
  await ensureRow(
    owner,
    'pharmacy_sale_return_lines',
    tenantId,
    `insert into pharmacy_sale_return_lines (tenant_id, return_id, line_no, sale_line_id, batch_id, qty, gross_paise, taxable_paise, tax_paise)
     select $1::uuid, r.id, 1, sl.id, sl.batch_id, 1, 0, 0, 0
       from pharmacy_sale_returns r
       join pharmacy_sale_lines sl on sl.tenant_id = r.tenant_id
      where r.tenant_id = $1
        and not exists (select 1 from pharmacy_sale_return_lines where tenant_id = $1)
      limit 1`,
    [tenantId],
  );
  await ensureRow(
    owner,
    'pharmacy_ip_issues',
    tenantId,
    `insert into pharmacy_ip_issues (tenant_id, location_id, encounter_id, patient_id, number, notes, is_sample)
     select $1::uuid, e.location_id, e.id, e.patient_id, $2, 'Sample IP issue', true
       from encounters e
      where e.tenant_id = $1
        and not exists (select 1 from pharmacy_ip_issues where tenant_id = $1)
      limit 1`,
    [tenantId, `PH-${tag}-PI`],
  );
  await ensureRow(
    owner,
    'pharmacy_ip_issue_lines',
    tenantId,
    `insert into pharmacy_ip_issue_lines (tenant_id, issue_id, line_no, item_id, batch_id, qty, mrp_paise)
     select $1::uuid, iss.id, 1, i.id, b.id, 1, 11200
       from pharmacy_ip_issues iss
       join pharmacy_items i on i.tenant_id = iss.tenant_id
       join pharmacy_batches b on b.tenant_id = iss.tenant_id
      where iss.tenant_id = $1
        and not exists (select 1 from pharmacy_ip_issue_lines where tenant_id = $1)
      limit 1`,
    [tenantId],
  );
  await ensureRow(
    owner,
    'pharmacy_adjustments',
    tenantId,
    `insert into pharmacy_adjustments (tenant_id, location_id, number, reason, is_sample)
     select $1::uuid, l.id, $2, 'Broken strip (Sample)', true
       from locations l
      where l.tenant_id = $1 and l.is_primary
        and not exists (select 1 from pharmacy_adjustments where tenant_id = $1)
      limit 1`,
    [tenantId, `PH-${tag}-AJ`],
  );
  await ensureRow(
    owner,
    'pharmacy_adjustment_lines',
    tenantId,
    `insert into pharmacy_adjustment_lines (tenant_id, adjustment_id, line_no, batch_id, qty_delta, reason)
     select $1::uuid, a.id, 1, b.id, -1, 'Broken strip (Sample)'
       from pharmacy_adjustments a
       join pharmacy_batches b on b.tenant_id = a.tenant_id
      where a.tenant_id = $1
        and not exists (select 1 from pharmacy_adjustment_lines where tenant_id = $1)
      limit 1`,
    [tenantId],
  );
  await ensureRow(
    owner,
    'pharmacy_supplier_returns',
    tenantId,
    `insert into pharmacy_supplier_returns (tenant_id, location_id, supplier_id, number, reason, is_sample)
     select $1::uuid, l.id, s.id, $2, 'Damaged carton (Sample)', true
       from locations l
       join pharmacy_suppliers s on s.tenant_id = l.tenant_id
      where l.tenant_id = $1 and l.is_primary
        and not exists (select 1 from pharmacy_supplier_returns where tenant_id = $1)
      limit 1`,
    [tenantId, `PH-${tag}-SR`],
  );
  await ensureRow(
    owner,
    'pharmacy_supplier_return_lines',
    tenantId,
    `insert into pharmacy_supplier_return_lines (tenant_id, return_id, line_no, batch_id, qty)
     select $1::uuid, r.id, 1, b.id, 1
       from pharmacy_supplier_returns r
       join pharmacy_batches b on b.tenant_id = r.tenant_id
      where r.tenant_id = $1
        and not exists (select 1 from pharmacy_supplier_return_lines where tenant_id = $1)
      limit 1`,
    [tenantId],
  );
}
