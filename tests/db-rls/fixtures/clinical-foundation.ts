// B0 clinical tables (migration 0101). Insert-only: vital_signs and clinical_notes reject UPDATE/DELETE,
// so a re-run must not touch an existing row. Composite FKs are satisfied by joining this tenant's parents.
// Sample naming: DEMO- UHIDs, 00- ABHA, @sbx mail, 90000 mobiles, is_sample, "(Sample)" in the name.
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
    table: 'number_series',
    sql: `insert into number_series (tenant_id, location_id, series_key, period, last_no)
          select $1::uuid, l.id, 'rls_probe', '', 1 from locations l
          where l.tenant_id = $1 and l.is_primary
            and not exists (select 1 from number_series where tenant_id = $1)
          limit 1`,
    params: idOnly,
  },
  {
    table: 'patients',
    sql: `insert into patients (
            tenant_id, uhid, registered_location_id, title, first_name, last_name, gender, dob, age_years_at_reg,
            mobile, email, city, state_code, pincode, blood_group, emergency_name, emergency_mobile,
            id_type, abha_number, abha_address, status, is_sample, created_by
          )
          select $1::uuid, $2, l.id, $3, $4, $5, $6, $7::date, $8,
                 $9, $10, 'Pune', '27', '411001', 'O+', $11, $12,
                 'none', $13, $14, 'active', true, u.id
          from locations l
          join users u on u.tenant_id = l.tenant_id
          where l.tenant_id = $1 and l.is_primary
            and not exists (select 1 from patients where tenant_id = $1)
          limit 1`,
    params: (id, spec) => [
      id,
      spec.uhid,
      spec.patientTitle,
      spec.patientFirst,
      spec.patientLast,
      spec.patientGender,
      spec.patientDob,
      spec.patientAge,
      spec.patientMobile,
      spec.patientEmail,
      spec.contactName,
      spec.patientEmergencyMobile,
      spec.patientAbha,
      spec.patientAbhaAddress,
    ],
  },
  {
    table: 'patient_alerts',
    sql: `insert into patient_alerts (tenant_id, patient_id, kind, text, severity, recorded_by)
          select $1::uuid, p.id, 'allergy', 'Penicillin (Sample)', 'low', u.id
          from patients p
          join users u on u.tenant_id = p.tenant_id
          where p.tenant_id = $1 and not exists (select 1 from patient_alerts where tenant_id = $1)
          limit 1`,
    params: idOnly,
  },
  {
    table: 'services',
    sql: `insert into services (tenant_id, code, name, category, hsn_sac, gst_treatment, gst_rate_bp, active)
          select $1::uuid, 'RLS-CON', 'General consultation (Sample)', 'consultation', '9993', 'exempt_healthcare', 0, true
          where not exists (select 1 from services where tenant_id = $1)`,
    params: idOnly,
  },
  {
    table: 'tariffs',
    sql: `insert into tariffs (tenant_id, service_id, location_id, payer_class, price_paise, effective_from)
          select $1::uuid, s.id, l.id, 'general', 50000, date '2026-04-01'
          from services s
          join locations l on l.tenant_id = s.tenant_id and l.is_primary
          where s.tenant_id = $1 and not exists (select 1 from tariffs where tenant_id = $1)
          limit 1`,
    params: idOnly,
  },
  {
    table: 'encounters',
    sql: `insert into encounters (
            tenant_id, location_id, patient_id, kind, number, status, doctor_id, department_id, visit_type, payer_type, created_by
          )
          select $1::uuid, l.id, p.id, 'opd', $2, 'open', d.id, dept.id, 'new', 'self', u.id
          from locations l
          join patients p on p.tenant_id = l.tenant_id
          join doctors d on d.tenant_id = l.tenant_id
          join departments dept on dept.tenant_id = l.tenant_id
          join users u on u.tenant_id = l.tenant_id
          where l.tenant_id = $1 and l.is_primary
            and not exists (select 1 from encounters where tenant_id = $1)
          limit 1`,
    params: (id, spec) => [id, spec.encounterNumber],
  },
  {
    table: 'clinical_orders',
    sql: `insert into clinical_orders (
            tenant_id, location_id, encounter_id, patient_id, kind, number, source, priority, status,
            ordering_doctor_id, ordered_by_user_id, notes
          )
          select $1::uuid, e.location_id, e.id, e.patient_id, 'lab', $2, 'opd', 'routine', 'placed',
                 e.doctor_id, e.created_by, 'Sample order (Sample)'
          from encounters e
          where e.tenant_id = $1 and not exists (select 1 from clinical_orders where tenant_id = $1)
          limit 1`,
    params: (id, spec) => [id, spec.orderNumber],
  },
  {
    table: 'clinical_order_items',
    sql: `insert into clinical_order_items (tenant_id, order_id, line_no, service_id, status)
          select $1::uuid, o.id, 1, s.id, 'pending'
          from clinical_orders o
          join services s on s.tenant_id = o.tenant_id
          where o.tenant_id = $1 and not exists (select 1 from clinical_order_items where tenant_id = $1)
          limit 1`,
    params: idOnly,
  },
  {
    table: 'vital_signs',
    sql: `insert into vital_signs (
            tenant_id, location_id, encounter_id, patient_id, recorded_by,
            bp_systolic, bp_diastolic, pulse, resp_rate, temp_c_x10, spo2, weight_g, height_mm, pain_score, grbs_mg_dl, notes
          )
          select $1::uuid, e.location_id, e.id, e.patient_id, e.created_by,
                 118, 76, 72, 16, 368, 98, 62000, 1650, 1, 96, 'Sample vitals'
          from encounters e
          where e.tenant_id = $1 and not exists (select 1 from vital_signs where tenant_id = $1)
          limit 1`,
    params: idOnly,
  },
  {
    table: 'clinical_notes',
    sql: `insert into clinical_notes (tenant_id, encounter_id, patient_id, kind, body, author_user_id)
          select $1::uuid, e.id, e.patient_id, 'chief_complaint', 'Headache for two days (Sample)', e.created_by
          from encounters e
          where e.tenant_id = $1 and not exists (select 1 from clinical_notes where tenant_id = $1)
          limit 1`,
    params: idOnly,
  },
  {
    table: 'charges',
    sql: `insert into charges (
            tenant_id, location_id, encounter_id, patient_id, service_id, description,
            qty, unit_price_paise, amount_paise, discount_paise, gst_treatment, gst_rate_bp, hsn_sac,
            service_date, performing_doctor_id, source_module, source_type, source_id, source_line, status, posted_by
          )
          select $1::uuid, e.location_id, e.id, e.patient_id, s.id, 'General consultation (Sample)',
                 1, 50000, 50000, 0, 'exempt_healthcare', 0, '9993',
                 current_date, e.doctor_id, 'opd', 'rls_probe', e.id, '1', 'unbilled', e.created_by
          from encounters e
          join services s on s.tenant_id = e.tenant_id
          where e.tenant_id = $1 and not exists (select 1 from charges where tenant_id = $1)
          limit 1`,
    params: idOnly,
  },
  {
    table: 'cash_ledger',
    sql: `insert into cash_ledger (
            tenant_id, location_id, counter_code, entry_type, direction, mode, amount_paise, number,
            patient_id, encounter_id, ref_type, ref_id, received_by
          )
          select $1::uuid, e.location_id, 'C1', 'receipt', 'in', 'cash', 50000, $2,
                 e.patient_id, e.id, 'bill', e.id, e.created_by
          from encounters e
          where e.tenant_id = $1 and not exists (select 1 from cash_ledger where tenant_id = $1)
          limit 1`,
    params: (id, spec) => [id, spec.cashNumber],
  },
];

export async function seedClinicalFoundation(owner: pg.Client, tenantId: string, spec: ProbeSpec): Promise<void> {
  for (const f of FIXTURES) await ensureRow(owner, f.table, tenantId, f.sql, f.params(tenantId, spec));
}
