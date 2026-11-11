// B1 patient registration: patient_documents and mlc_cases. One sample row per probe tenant.
// No-op until the B1 migrations (0110-0111) exist on the branch under test.
import type pg from 'pg';
import type { ProbeSpec } from './types';

async function exists(owner: pg.Client, table: string): Promise<boolean> {
  const r = await owner.query<{ rel: string | null }>('select to_regclass($1)::text as rel', [`public.${table}`]);
  return Boolean(r.rows[0]?.rel);
}

export async function seedRegistration(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  if (await exists(owner, 'patient_documents')) {
    await owner.query(
      `insert into patient_documents (tenant_id, patient_id, kind, file_path, mime, size)
       select $1, p.id, 'Document', 'patients/rls-' || $2 || '/sample.pdf', 'application/pdf', 1024
         from patients p
        where p.tenant_id = $1
          and not exists (select 1 from patient_documents where tenant_id = $1)
        limit 1`,
      [tenantId, spec.tag],
    );
  }
  if (await exists(owner, 'mlc_cases')) {
    await owner.query(
      `insert into mlc_cases (tenant_id, patient_id, encounter_id, number, police_station, brought_by, injury_summary)
       select $1, e.patient_id, e.id, 'MLC-RLS-' || upper($2), 'Sample police station', 'Sample relative',
              'Sample injury note (Sample)'
         from encounters e
        where e.tenant_id = $1
          and not exists (select 1 from mlc_cases where tenant_id = $1)
        limit 1`,
      [tenantId, spec.tag],
    );
  }
}