// B2 clinic hours, appointments and the OPD queue. One sample row per probe tenant.
// Parents (doctor, location, patient, encounter, user) come from core and clinical-foundation.
// Sample flag is is_sample. People on those parents already use DEMO- UHIDs, 00- ABHA, @sbx and 90000 mobiles.
import type pg from 'pg';
import { ensureRow } from './sql';
import type { ProbeSpec } from './types';

type Fixture = {
  table: string;
  sql: string;
  params: (id: string, spec: ProbeSpec) => unknown[];
};

const idOnly = (id: string): unknown[] => [id];

const FIXTURES: Fixture[] = [
  {
    table: 'doctor_schedules',
    sql: `insert into doctor_schedules (
            tenant_id, doctor_id, location_id, weekday, start_time, end_time, slot_minutes, max_per_slot, is_sample
          )
          select $1::uuid, d.id, l.id, 1, '09:00', '12:00', 15, 2, true
          from doctors d
          join locations l on l.tenant_id = d.tenant_id and l.is_primary
          where d.tenant_id = $1
            and not exists (select 1 from doctor_schedules where tenant_id = $1)
          limit 1`,
    params: idOnly,
  },
  {
    table: 'schedule_exceptions',
    sql: `insert into schedule_exceptions (
            tenant_id, doctor_id, location_id, on_date, kind, reason, is_sample
          )
          select $1::uuid, d.id, l.id, date '2026-01-26', 'closed', 'Sample holiday (Sample)', true
          from doctors d
          join locations l on l.tenant_id = d.tenant_id and l.is_primary
          where d.tenant_id = $1
            and not exists (select 1 from schedule_exceptions where tenant_id = $1)
          limit 1`,
    params: idOnly,
  },
  {
    table: 'appointments',
    sql: `insert into appointments (
            tenant_id, location_id, patient_id, doctor_id, date, slot_start, slot_end, seq,
            channel, status, reason, is_sample, created_by
          )
          select $1::uuid, l.id, p.id, d.id, date '2026-06-01', '09:00', '09:15', 1,
                 'counter', 'booked', 'Sample booking (Sample)', true, u.id
          from locations l
          join patients p on p.tenant_id = l.tenant_id
          join doctors d on d.tenant_id = l.tenant_id
          join users u on u.tenant_id = l.tenant_id
          where l.tenant_id = $1 and l.is_primary
            and not exists (select 1 from appointments where tenant_id = $1)
          limit 1`,
    params: idOnly,
  },
  {
    table: 'opd_queue',
    sql: `insert into opd_queue (
            tenant_id, location_id, encounter_id, patient_id, doctor_id, token, status, visit_date, is_sample
          )
          select $1::uuid, e.location_id, e.id, e.patient_id, e.doctor_id, 1, 'waiting', current_date, true
          from encounters e
          where e.tenant_id = $1
            and e.doctor_id is not null
            and not exists (select 1 from opd_queue where tenant_id = $1)
          limit 1`,
    params: idOnly,
  },
];

export async function seedAppointments(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  for (const f of FIXTURES) await ensureRow(owner, f.table, tenantId, f.sql, f.params(tenantId, spec));
}
