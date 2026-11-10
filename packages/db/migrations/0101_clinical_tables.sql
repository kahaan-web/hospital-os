-- B0 clinical tables. Class T: tenant_id, UNIQUE (tenant_id, id), composite parent FKs. Money is paise.

CREATE TABLE number_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  location_id uuid,
  series_key text NOT NULL,
  period text NOT NULL DEFAULT '',
  last_no integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT number_series_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT number_series_uq UNIQUE NULLS NOT DISTINCT (tenant_id, location_id, series_key, period),
  CONSTRAINT number_series_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT number_series_last_chk CHECK (last_no >= 0)
);

CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  uhid text NOT NULL,
  registered_location_id uuid,
  title text NOT NULL DEFAULT '',
  first_name text NOT NULL,
  middle_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  full_name text GENERATED ALWAYS AS (
    btrim(
      (case when title <> '' then title || ' ' else '' end)
      || first_name
      || (case when middle_name <> '' then ' ' || middle_name else '' end)
      || (case when last_name <> '' then ' ' || last_name else '' end)
    )
  ) STORED,
  gender text NOT NULL,
  dob date,
  age_years_at_reg integer,
  dob_estimated boolean NOT NULL DEFAULT false,
  mobile text NOT NULL DEFAULT '',
  alt_mobile text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address_line1 text NOT NULL DEFAULT '',
  address_line2 text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  district text NOT NULL DEFAULT '',
  state_code text NOT NULL DEFAULT '',
  pincode text NOT NULL DEFAULT '',
  blood_group text,
  marital_status text NOT NULL DEFAULT '',
  guardian_name text NOT NULL DEFAULT '',
  guardian_relation text,
  emergency_name text NOT NULL DEFAULT '',
  emergency_mobile text NOT NULL DEFAULT '',
  id_type text NOT NULL DEFAULT 'none',
  id_last4 text,
  abha_number text,
  abha_address text,
  photo_path text,
  status text NOT NULL DEFAULT 'active',
  merged_into_id uuid,
  is_sample boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patients_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT patients_uhid_uq UNIQUE (tenant_id, uhid),
  CONSTRAINT patients_location_fk FOREIGN KEY (tenant_id, registered_location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT patients_merged_fk FOREIGN KEY (tenant_id, merged_into_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT patients_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id),
  CONSTRAINT patients_gender_chk CHECK (gender IN ('male', 'female', 'other')),
  CONSTRAINT patients_status_chk CHECK (status IN ('active', 'merged', 'inactive')),
  CONSTRAINT patients_id_type_chk CHECK (id_type IN ('aadhaar_last4', 'pan', 'voter', 'passport', 'dl', 'none')),
  CONSTRAINT patients_id_last4_chk CHECK (id_last4 IS NULL OR id_last4 ~ '^[0-9]{4}$'),
  CONSTRAINT patients_blood_chk CHECK (blood_group IS NULL OR blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown')),
  CONSTRAINT patients_relation_chk CHECK (guardian_relation IS NULL OR guardian_relation IN ('spouse', 'parent', 'child', 'sibling', 'guardian', 'friend', 'other')),
  CONSTRAINT patients_age_chk CHECK (age_years_at_reg IS NULL OR (age_years_at_reg >= 0 AND age_years_at_reg <= 130))
);

CREATE INDEX patients_mobile_idx ON patients (tenant_id, mobile);
CREATE INDEX patients_name_lower_idx ON patients (tenant_id, lower(full_name));

CREATE TABLE patient_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  patient_id uuid NOT NULL,
  kind text NOT NULL,
  text text NOT NULL,
  severity text NOT NULL DEFAULT 'low',
  recorded_by uuid,
  inactive_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_alerts_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT patient_alerts_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT patient_alerts_user_fk FOREIGN KEY (tenant_id, recorded_by) REFERENCES users (tenant_id, id),
  CONSTRAINT patient_alerts_kind_chk CHECK (kind IN ('allergy', 'condition', 'alert')),
  CONSTRAINT patient_alerts_severity_chk CHECK (severity IN ('low', 'high'))
);

CREATE INDEX patient_alerts_patient_idx ON patient_alerts (tenant_id, patient_id);

CREATE TABLE encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  location_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  kind text NOT NULL,
  number text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  doctor_id uuid,
  department_id uuid,
  visit_type text,
  appointment_id uuid,
  payer_type text NOT NULL DEFAULT 'self',
  is_mlc boolean NOT NULL DEFAULT false,
  current_ward_code text,
  current_bed_label text,
  referred_by text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT encounters_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT encounters_number_uq UNIQUE (tenant_id, kind, number),
  CONSTRAINT encounters_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT encounters_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT encounters_doctor_fk FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors (tenant_id, id),
  CONSTRAINT encounters_department_fk FOREIGN KEY (tenant_id, department_id) REFERENCES departments (tenant_id, id),
  CONSTRAINT encounters_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id),
  CONSTRAINT encounters_kind_chk CHECK (kind IN ('opd', 'ipd', 'daycare', 'emergency')),
  CONSTRAINT encounters_status_chk CHECK (status IN ('open', 'closed', 'cancelled')),
  CONSTRAINT encounters_visit_chk CHECK (visit_type IS NULL OR visit_type IN ('new', 'follow_up')),
  CONSTRAINT encounters_payer_chk CHECK (payer_type IN ('self', 'corporate', 'tpa', 'scheme', 'free'))
);

CREATE INDEX encounters_patient_idx ON encounters (tenant_id, patient_id);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  doctor_id uuid,
  hsn_sac text NOT NULL DEFAULT '9993',
  gst_treatment text NOT NULL DEFAULT 'exempt_healthcare',
  gst_rate_bp integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT services_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT services_code_uq UNIQUE (tenant_id, code),
  CONSTRAINT services_doctor_fk FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors (tenant_id, id),
  CONSTRAINT services_category_chk CHECK (category IN ('consultation', 'procedure', 'lab', 'radiology', 'bed', 'nursing', 'ot', 'package', 'misc')),
  CONSTRAINT services_gst_chk CHECK (gst_treatment IN ('exempt_healthcare', 'taxable', 'room_rent_rule')),
  CONSTRAINT services_rate_chk CHECK (gst_rate_bp >= 0 AND gst_rate_bp <= 10000)
);

CREATE TABLE tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  service_id uuid NOT NULL,
  location_id uuid,
  ward_class text,
  payer_class text NOT NULL DEFAULT 'general',
  price_paise bigint NOT NULL,
  effective_from date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tariffs_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT tariffs_service_fk FOREIGN KEY (tenant_id, service_id) REFERENCES services (tenant_id, id),
  CONSTRAINT tariffs_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT tariffs_payer_chk CHECK (payer_class IN ('general', 'corporate', 'tpa')),
  CONSTRAINT tariffs_price_chk CHECK (price_paise >= 0)
);

CREATE INDEX tariffs_service_idx ON tariffs (tenant_id, service_id, effective_from);

CREATE TABLE clinical_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  location_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  kind text NOT NULL,
  number text NOT NULL,
  source text NOT NULL,
  priority text NOT NULL DEFAULT 'routine',
  status text NOT NULL DEFAULT 'placed',
  ordering_doctor_id uuid,
  ordered_by_user_id uuid,
  notes text,
  placed_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinical_orders_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT clinical_orders_number_uq UNIQUE (tenant_id, number),
  CONSTRAINT clinical_orders_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT clinical_orders_encounter_fk FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id),
  CONSTRAINT clinical_orders_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT clinical_orders_doctor_fk FOREIGN KEY (tenant_id, ordering_doctor_id) REFERENCES doctors (tenant_id, id),
  CONSTRAINT clinical_orders_user_fk FOREIGN KEY (tenant_id, ordered_by_user_id) REFERENCES users (tenant_id, id),
  CONSTRAINT clinical_orders_kind_chk CHECK (kind IN ('lab', 'medicine', 'procedure', 'diet', 'radiology')),
  CONSTRAINT clinical_orders_source_chk CHECK (source IN ('opd', 'ipd', 'cpoe', 'nurse', 'mobile')),
  CONSTRAINT clinical_orders_priority_chk CHECK (priority IN ('routine', 'urgent', 'stat')),
  CONSTRAINT clinical_orders_status_chk CHECK (status IN ('placed', 'in_progress', 'completed', 'cancelled'))
);

CREATE INDEX clinical_orders_encounter_idx ON clinical_orders (tenant_id, encounter_id);

CREATE TABLE clinical_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  order_id uuid NOT NULL,
  line_no integer NOT NULL,
  service_id uuid,
  drug_name text,
  generic_code text,
  strength text,
  dose_form text,
  dose text,
  frequency_code text,
  route_code text,
  duration_days integer,
  quantity numeric(12, 3),
  diet_code text,
  instructions text,
  status text NOT NULL DEFAULT 'pending',
  fulfilled_qty numeric(12, 3) NOT NULL DEFAULT 0,
  fulfilled_ref_type text,
  fulfilled_ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinical_order_items_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT clinical_order_items_line_uq UNIQUE (tenant_id, order_id, line_no),
  CONSTRAINT clinical_order_items_order_fk FOREIGN KEY (tenant_id, order_id) REFERENCES clinical_orders (tenant_id, id),
  CONSTRAINT clinical_order_items_service_fk FOREIGN KEY (tenant_id, service_id) REFERENCES services (tenant_id, id),
  CONSTRAINT clinical_order_items_status_chk CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
  CONSTRAINT clinical_order_items_line_chk CHECK (line_no > 0)
);

CREATE TABLE vital_signs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  location_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid,
  bp_systolic integer,
  bp_diastolic integer,
  pulse integer,
  resp_rate integer,
  temp_c_x10 integer,
  spo2 integer,
  weight_g integer,
  height_mm integer,
  pain_score integer,
  grbs_mg_dl integer,
  notes text,
  entered_in_error_at timestamptz,
  error_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vital_signs_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT vital_signs_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT vital_signs_encounter_fk FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id),
  CONSTRAINT vital_signs_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT vital_signs_user_fk FOREIGN KEY (tenant_id, recorded_by) REFERENCES users (tenant_id, id)
);

CREATE INDEX vital_signs_encounter_idx ON vital_signs (tenant_id, encounter_id, recorded_at);

CREATE TABLE clinical_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  encounter_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  kind text NOT NULL,
  body text NOT NULL,
  code text,
  code_display text,
  author_user_id uuid,
  supersedes_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinical_notes_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT clinical_notes_encounter_fk FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id),
  CONSTRAINT clinical_notes_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT clinical_notes_author_fk FOREIGN KEY (tenant_id, author_user_id) REFERENCES users (tenant_id, id),
  CONSTRAINT clinical_notes_supersedes_fk FOREIGN KEY (tenant_id, supersedes_id) REFERENCES clinical_notes (tenant_id, id),
  CONSTRAINT clinical_notes_kind_chk CHECK (kind IN ('chief_complaint', 'history', 'examination', 'diagnosis', 'plan', 'advice', 'progress', 'nursing', 'procedure'))
);

CREATE INDEX clinical_notes_encounter_idx ON clinical_notes (tenant_id, encounter_id);

CREATE TABLE charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  location_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  service_id uuid,
  description text NOT NULL,
  qty numeric(12, 3) NOT NULL,
  unit_price_paise bigint NOT NULL,
  amount_paise bigint NOT NULL,
  discount_paise bigint NOT NULL DEFAULT 0,
  gst_treatment text NOT NULL,
  gst_rate_bp integer NOT NULL DEFAULT 0,
  hsn_sac text NOT NULL DEFAULT '9993',
  service_date date NOT NULL,
  performing_doctor_id uuid,
  referring_doctor_id uuid,
  source_module text NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  source_line text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'unbilled',
  bill_id uuid,
  reversal_of_id uuid,
  posted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT charges_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT charges_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT charges_encounter_fk FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id),
  CONSTRAINT charges_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT charges_service_fk FOREIGN KEY (tenant_id, service_id) REFERENCES services (tenant_id, id),
  CONSTRAINT charges_performer_fk FOREIGN KEY (tenant_id, performing_doctor_id) REFERENCES doctors (tenant_id, id),
  CONSTRAINT charges_referrer_fk FOREIGN KEY (tenant_id, referring_doctor_id) REFERENCES doctors (tenant_id, id),
  CONSTRAINT charges_reversal_fk FOREIGN KEY (tenant_id, reversal_of_id) REFERENCES charges (tenant_id, id),
  CONSTRAINT charges_posted_by_fk FOREIGN KEY (tenant_id, posted_by) REFERENCES users (tenant_id, id),
  CONSTRAINT charges_gst_chk CHECK (gst_treatment IN ('exempt_healthcare', 'taxable', 'room_rent_rule')),
  CONSTRAINT charges_status_chk CHECK (status IN ('unbilled', 'billed', 'reversed')),
  CONSTRAINT charges_module_chk CHECK (source_module IN ('opd', 'adt', 'lab', 'pharmacy', 'billing', 'cpoe', 'nursing')),
  CONSTRAINT charges_qty_chk CHECK (qty > 0),
  CONSTRAINT charges_money_chk CHECK (unit_price_paise >= 0 AND amount_paise >= 0 AND discount_paise >= 0)
);

CREATE UNIQUE INDEX charges_source_active_uq ON charges (tenant_id, source_type, source_id, source_line) WHERE reversal_of_id IS NULL;
CREATE INDEX charges_encounter_idx ON charges (tenant_id, encounter_id);

CREATE TABLE cash_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  location_id uuid NOT NULL,
  counter_code text NOT NULL DEFAULT '',
  entry_type text NOT NULL,
  direction text NOT NULL,
  mode text NOT NULL,
  amount_paise bigint NOT NULL,
  number text NOT NULL,
  patient_id uuid,
  encounter_id uuid,
  ref_type text NOT NULL,
  ref_id uuid NOT NULL,
  instrument_ref text,
  received_by uuid,
  received_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_ledger_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT cash_ledger_number_uq UNIQUE (tenant_id, number),
  CONSTRAINT cash_ledger_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT cash_ledger_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT cash_ledger_encounter_fk FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id),
  CONSTRAINT cash_ledger_user_fk FOREIGN KEY (tenant_id, received_by) REFERENCES users (tenant_id, id),
  CONSTRAINT cash_ledger_type_chk CHECK (entry_type IN ('receipt', 'refund', 'deposit', 'deposit_refund', 'deposit_adjust')),
  CONSTRAINT cash_ledger_direction_chk CHECK (direction IN ('in', 'out')),
  CONSTRAINT cash_ledger_mode_chk CHECK (mode IN ('cash', 'upi', 'card', 'cheque', 'neft')),
  CONSTRAINT cash_ledger_ref_chk CHECK (ref_type IN ('bill', 'deposit', 'pharmacy_sale', 'pharmacy_return')),
  CONSTRAINT cash_ledger_amount_chk CHECK (amount_paise > 0)
);

CREATE INDEX cash_ledger_location_idx ON cash_ledger (tenant_id, location_id, received_at);
