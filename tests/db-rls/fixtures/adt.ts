// B4 ADT: wards, rooms, beds, admissions, bed assignments, requests, discharge summaries.
// One sample row per probe tenant. Parents come from core + clinical-foundation.
// Sample naming: DEMO- admission numbers, "(Sample)" labels. These tables have no is_sample column.
import type pg from 'pg';
import { ensureRow } from './sql';
import type { ProbeSpec } from './types';

type Fixture = {
  table: string;
  sql: string;
  params: (id: string, spec: ProbeSpec) => unknown[];
};

const idOnly = (id: string): unknown[] => [id];

/** Admission numbers are capped at 16 characters. DEMO-ALPH-0001 / DEMO-BETA-0001 fit. */
function admissionNumber(spec: ProbeSpec): string {
  return `DEMO-${spec.tag.toUpperCase().slice(0, 4)}-0001`;
}

const FIXTURES: Fixture[] = [
  {
    table: 'wards',
    sql: `insert into wards (tenant_id, location_id, code, name, ward_type, is_icu)
          select $1::uuid, l.id, 'W' || upper($2), 'General ward (Sample)', 'general', false
          from locations l
          where l.tenant_id = $1 and l.is_primary
            and not exists (select 1 from wards where tenant_id = $1)
          limit 1`,
    params: (id, spec) => [id, spec.tag],
  },
  {
    table: 'rooms',
    sql: `insert into rooms (tenant_id, ward_id, code, name)
          select $1::uuid, w.id, 'R' || upper($2), 'Room 1 (Sample)'
          from wards w
          where w.tenant_id = $1
            and not exists (select 1 from rooms where tenant_id = $1)
          limit 1`,
    params: (id, spec) => [id, spec.tag],
  },
  {
    table: 'beds',
    sql: `insert into beds (tenant_id, room_id, label, ward_class, status)
          select $1::uuid, r.id, 'B-1', 'general', 'occupied'
          from rooms r
          where r.tenant_id = $1
            and not exists (select 1 from beds where tenant_id = $1)
          limit 1`,
    params: idOnly,
  },
  {
    table: 'admissions',
    sql: `insert into admissions (
            tenant_id, location_id, encounter_id, patient_id, doctor_id, number,
            admission_type, attendant, provisional_diagnosis, status, created_by
          )
          select $1::uuid, e.location_id, e.id, e.patient_id, d.id, $2,
                 'elective', $3, 'Observation (Sample)', 'admitted', u.id
          from encounters e
          join doctors d on d.tenant_id = e.tenant_id
          join users u on u.tenant_id = e.tenant_id
          where e.tenant_id = $1
            and not exists (select 1 from admissions where tenant_id = $1)
          limit 1`,
    params: (id, spec) => [id, admissionNumber(spec), spec.contactName],
  },
  {
    table: 'bed_assignments',
    sql: `insert into bed_assignments (tenant_id, admission_id, bed_id)
          select $1::uuid, a.id, b.id
          from admissions a
          join beds b on b.tenant_id = a.tenant_id
          where a.tenant_id = $1
            and not exists (select 1 from bed_assignments where tenant_id = $1)
          limit 1`,
    params: idOnly,
  },
  {
    table: 'admission_requests',
    sql: `insert into admission_requests (
            tenant_id, location_id, patient_id, from_encounter_id, doctor_id, reason, planned_on, ward_type, status
          )
          select $1::uuid, a.location_id, a.patient_id, a.encounter_id, a.doctor_id,
                 'Sample request (Sample)', current_date, 'general', 'requested'
          from admissions a
          where a.tenant_id = $1
            and a.doctor_id is not null
            and not exists (select 1 from admission_requests where tenant_id = $1)
          limit 1`,
    params: idOnly,
  },
  {
    table: 'discharge_summaries',
    sql: `insert into discharge_summaries (tenant_id, admission_id, sections, status)
          select $1::uuid, a.id, '{"diagnosis":"Observation (Sample)"}'::jsonb, 'draft'
          from admissions a
          where a.tenant_id = $1
            and not exists (select 1 from discharge_summaries where tenant_id = $1)
          limit 1`,
    params: idOnly,
  },
];

export async function seedAdt(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  for (const f of FIXTURES) await ensureRow(owner, f.table, tenantId, f.sql, f.params(tenantId, spec));
}
