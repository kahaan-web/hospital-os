// MVP demo slice tables (migrations 1100 and 1120). One sample row per probe tenant.
import type pg from 'pg';
import { ensureRow } from './sql';
import type { ProbeSpec } from './types';

export async function seedInsuranceDa(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  await ensureRow(
    owner,
    'insurance_payers',
    tenantId,
    `insert into insurance_payers (tenant_id, name, payer_type, is_sample)
     select $1::uuid, 'RLS Payer ' || $2::text, 'insurer', true
      where not exists (select 1 from insurance_payers where tenant_id = $1)`,
    [tenantId, spec.tag],
  );
  await ensureRow(
    owner,
    'insurance_requests',
    tenantId,
    `insert into insurance_requests (tenant_id, payer_id, patient_name, estimated_paise, is_sample)
     select $1::uuid, p.id, 'Sample Patient', 100000, true
       from insurance_payers p
      where p.tenant_id = $1
        and not exists (select 1 from insurance_requests where tenant_id = $1)
      limit 1`,
    [tenantId],
  );
  await ensureRow(
    owner,
    'doctor_share_rules',
    tenantId,
    `insert into doctor_share_rules (tenant_id, doctor_id, share_type, share_value, is_sample)
     select $1::uuid, d.id, 'pct_net', 50, true
       from doctors d
      where d.tenant_id = $1
        and not exists (select 1 from doctor_share_rules where tenant_id = $1)
      limit 1`,
    [tenantId],
  );
  await ensureRow(
    owner,
    'doctor_payouts',
    tenantId,
    `insert into doctor_payouts (tenant_id, doctor_id, period_from, period_to, gross_paise, share_paise, is_sample)
     select $1::uuid, d.id, current_date - 30, current_date, 100000, 50000, true
       from doctors d
      where d.tenant_id = $1
        and not exists (select 1 from doctor_payouts where tenant_id = $1)
      limit 1`,
    [tenantId],
  );
}
