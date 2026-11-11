// B8 laboratory tables. No-op until migrations 0180–0181 exist. One sample row per probe tenant.
import type pg from 'pg';
import type { ProbeSpec } from './types';

async function exists(owner: pg.Client, table: string): Promise<boolean> {
  const found = await owner.query<{ rel: string | null }>('select to_regclass($1)::text as rel', [`public.${table}`]);
  return Boolean(found.rows[0]?.rel);
}

export async function seedLab(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  if (!(await exists(owner, 'lab_tests'))) return;
  await owner.query(
    `insert into lab_settings (tenant_id, collect_before_payment)
     select $1, false
      where not exists (select 1 from lab_settings where tenant_id = $1)`,
    [tenantId],
  );
  await owner.query(
    `insert into lab_tests (tenant_id, service_id, specimen, container, tat_hours, is_sample)
     select $1, s.id, 'blood', 'EDTA', 4, true
       from services s
      where s.tenant_id = $1
        and not exists (select 1 from lab_tests where tenant_id = $1)
      limit 1`,
    [tenantId],
  );
  await owner.query(
    `insert into lab_test_params (tenant_id, test_id, code, name, unit, value_type, decimals, ref_ranges, critical_low, critical_high, sort_order)
     select $1, t.id, 'HB', 'Haemoglobin (Sample)', 'g/dL', 'numeric', 1,
            '[{"sex":"any","ageMinYears":0,"ageMaxYears":null,"low":12,"high":16}]'::jsonb,
            7, 20, 1
       from lab_tests t
      where t.tenant_id = $1
        and not exists (select 1 from lab_test_params where tenant_id = $1)
      limit 1`,
    [tenantId],
  );
  await owner.query(
    `insert into lab_accessions (
       tenant_id, location_id, patient_id, encounter_id, order_item_id, number, barcode, status, specimen, is_sample
     )
     select $1, e.location_id, e.patient_id, e.id, i.id, 'RLS' || upper($2), 'RLS' || upper($2), 'collected', 'blood', true
       from clinical_order_items i
       join clinical_orders o on o.id = i.order_id and o.tenant_id = i.tenant_id
       join encounters e on e.id = o.encounter_id and e.tenant_id = o.tenant_id
      where i.tenant_id = $1
        and not exists (select 1 from lab_accessions where tenant_id = $1)
      limit 1`,
    [tenantId, spec.tag],
  );
  await owner.query(
    `insert into lab_results (tenant_id, accession_id, param_id, value_num, flag, entered_by, version)
     select $1, a.id, p.id, 13.5, 'N', u.id, 1
       from lab_accessions a
       join lab_test_params p on p.tenant_id = a.tenant_id
       join users u on u.tenant_id = a.tenant_id
      where a.tenant_id = $1
        and not exists (select 1 from lab_results where tenant_id = $1)
      limit 1`,
    [tenantId],
  );
  await owner.query(
    `insert into lab_interfaces (tenant_id, location_id, name, kind, token_hash, active)
     select $1, l.id, 'Mock analyser (Sample)', 'mock_astm', 'rls-' || $2, true
       from locations l
      where l.tenant_id = $1 and l.is_primary
        and not exists (select 1 from lab_interfaces where tenant_id = $1)
      limit 1`,
    [tenantId, spec.tag],
  );
}