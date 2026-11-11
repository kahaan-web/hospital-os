import type pg from 'pg';
import { ensureRow } from './sql';
import type { ProbeSpec } from './types';

function mark(spec: ProbeSpec): string {
  return spec.tag === 'alpha' ? 'A' : 'B';
}

export async function seedIpbilling(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  await ensureRow(
    owner,
    'payers',
    tenantId,
    `insert into payers (tenant_id, code, name, kind, gstin, state_code, is_sample)
     values ($1::uuid, $2, 'Sample Payer (Sample)', 'tpa', '', 'MH', true)
     on conflict do nothing`,
    [tenantId, `RLS${mark(spec)}-TPA`],
  );
  await ensureRow(
    owner,
    'encounter_payers',
    tenantId,
    `insert into encounter_payers (tenant_id, encounter_id, payer_id, policy_no)
     select $1::uuid, e.id, p.id, 'DEMO-POLICY'
       from encounters e
       join payers p on p.tenant_id = e.tenant_id
      where e.tenant_id = $1::uuid
        and not exists (select 1 from encounter_payers where tenant_id = $1::uuid)
      limit 1`,
    [tenantId],
  );
  await ensureRow(
    owner,
    'payer_receivables',
    tenantId,
    `insert into payer_receivables (tenant_id, bill_id, payer_id, amount_paise, status)
     select $1::uuid, b.id, p.id, 100, 'open'
       from bills b
       join payers p on p.tenant_id = b.tenant_id
      where b.tenant_id = $1::uuid
        and not exists (select 1 from payer_receivables where tenant_id = $1::uuid)
      limit 1`,
    [tenantId],
  );
}
