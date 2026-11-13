-- OT Scheduling GKNM: masters, requests, bookings, post-op (additive; keeps ot_cases MVP intact).

CREATE TABLE ot_surgery_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  surgery_type text NOT NULL,
  department text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT ot_surgery_master_type_chk CHECK (surgery_type IN ('major', 'minor'))
);

CREATE INDEX ot_surgery_master_tenant_idx ON ot_surgery_master (tenant_id, surgery_type, active);

CREATE TABLE ot_special_remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  remark text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX ot_special_remarks_tenant_idx ON ot_special_remarks (tenant_id, active);

CREATE TABLE ot_doctor_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  doctor_id uuid NOT NULL,
  is_surgeon boolean NOT NULL DEFAULT false,
  is_anaesthetist boolean NOT NULL DEFAULT false,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, doctor_id),
  CONSTRAINT ot_doctor_roles_doctor_fk FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors (tenant_id, id)
);

CREATE TABLE ot_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  category_code text NOT NULL DEFAULT 'OT',
  category_name text NOT NULL DEFAULT 'General',
  main_code text NOT NULL DEFAULT '',
  resource_type text NOT NULL DEFAULT 'medical',
  default_charge_code text NOT NULL DEFAULT '',
  default_service_code text NOT NULL DEFAULT '',
  store_code text NOT NULL DEFAULT '',
  online_date date,
  max_calendar_days integer NOT NULL DEFAULT 365,
  max_history_days integer NOT NULL DEFAULT 90,
  overlap_allowed boolean NOT NULL DEFAULT false,
  max_overlap integer NOT NULL DEFAULT 0,
  max_overbook integer NOT NULL DEFAULT 0,
  print_slips boolean NOT NULL DEFAULT true,
  sessions integer NOT NULL DEFAULT 1,
  slot_minutes integer NOT NULL DEFAULT 15,
  session_start time NOT NULL DEFAULT '01:00',
  session_end time NOT NULL DEFAULT '23:30',
  booking_active boolean NOT NULL DEFAULT true,
  appointment_for text NOT NULL DEFAULT '',
  cutoff_time time,
  min_lead_days integer,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, location_id, code),
  CONSTRAINT ot_resources_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT ot_resources_type_chk CHECK (resource_type IN ('medical', 'non_medical'))
);

CREATE INDEX ot_resources_board_idx ON ot_resources (tenant_id, location_id, category_code);

CREATE TABLE ot_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  cutoff_time time NOT NULL DEFAULT '17:00',
  min_lead_days integer NOT NULL DEFAULT 1,
  emergency_bypass boolean NOT NULL DEFAULT true,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id)
);

CREATE TABLE ot_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  number text NOT NULL,
  patient_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  patient_type text NOT NULL,
  admission_id uuid,
  expected_date date NOT NULL,
  expected_time time,
  office_permission boolean NOT NULL DEFAULT false,
  office_permission_remark text NOT NULL DEFAULT '',
  diagnosis text NOT NULL DEFAULT '',
  surgery_type text NOT NULL,
  surgery_id uuid,
  frozen_section boolean NOT NULL DEFAULT false,
  tee_required boolean NOT NULL DEFAULT false,
  weight text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT '',
  sex text NOT NULL DEFAULT '',
  indication text NOT NULL DEFAULT '',
  surgeon_ids uuid[] NOT NULL DEFAULT '{}',
  anaesthetist_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'requested',
  cancel_reason text NOT NULL DEFAULT '',
  preferred_resource_id uuid,
  is_sample boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT ot_requests_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT ot_requests_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT ot_requests_doctor_fk FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors (tenant_id, id),
  CONSTRAINT ot_requests_surgery_fk FOREIGN KEY (tenant_id, surgery_id) REFERENCES ot_surgery_master (tenant_id, id),
  CONSTRAINT ot_requests_admission_fk FOREIGN KEY (tenant_id, admission_id) REFERENCES admissions (tenant_id, id),
  CONSTRAINT ot_requests_resource_fk FOREIGN KEY (tenant_id, preferred_resource_id) REFERENCES ot_resources (tenant_id, id),
  CONSTRAINT ot_requests_ptype_chk CHECK (patient_type IN ('ip', 'op')),
  CONSTRAINT ot_requests_stype_chk CHECK (surgery_type IN ('major', 'minor')),
  CONSTRAINT ot_requests_status_chk CHECK (status IN ('requested', 'booked', 'cancelled'))
);

CREATE INDEX ot_requests_board_idx ON ot_requests (tenant_id, location_id, expected_date, status);

CREATE TABLE ot_request_special_remarks (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  request_id uuid NOT NULL,
  remark_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, request_id, remark_id),
  CONSTRAINT ot_request_sr_request_fk FOREIGN KEY (tenant_id, request_id) REFERENCES ot_requests (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ot_request_sr_remark_fk FOREIGN KEY (tenant_id, remark_id) REFERENCES ot_special_remarks (tenant_id, id)
);

CREATE TABLE ot_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  request_id uuid,
  resource_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  patient_type text NOT NULL,
  admission_id uuid,
  booking_date date NOT NULL,
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  duration_min integer NOT NULL,
  appt_no text NOT NULL DEFAULT '',
  slots integer NOT NULL DEFAULT 1,
  booking_type text NOT NULL DEFAULT 'planned',
  case_type text NOT NULL DEFAULT 'elective',
  remarks text NOT NULL DEFAULT '',
  cancel_remarks text NOT NULL DEFAULT '',
  diagnosis text NOT NULL DEFAULT '',
  surgery_type text NOT NULL DEFAULT 'major',
  surgery_id uuid,
  frozen_section boolean NOT NULL DEFAULT false,
  tee_required boolean NOT NULL DEFAULT false,
  weight text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT '',
  sex text NOT NULL DEFAULT '',
  indication text NOT NULL DEFAULT '',
  surgeon_ids uuid[] NOT NULL DEFAULT '{}',
  anaesthetist_ids uuid[] NOT NULL DEFAULT '{}',
  service_names text[] NOT NULL DEFAULT '{}',
  employee_names text[] NOT NULL DEFAULT '{}',
  nurse_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'booked',
  shifted_from uuid,
  is_sample boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT ot_bookings_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT ot_bookings_request_fk FOREIGN KEY (tenant_id, request_id) REFERENCES ot_requests (tenant_id, id),
  CONSTRAINT ot_bookings_resource_fk FOREIGN KEY (tenant_id, resource_id) REFERENCES ot_resources (tenant_id, id),
  CONSTRAINT ot_bookings_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT ot_bookings_doctor_fk FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors (tenant_id, id),
  CONSTRAINT ot_bookings_surgery_fk FOREIGN KEY (tenant_id, surgery_id) REFERENCES ot_surgery_master (tenant_id, id),
  CONSTRAINT ot_bookings_admission_fk FOREIGN KEY (tenant_id, admission_id) REFERENCES admissions (tenant_id, id),
  CONSTRAINT ot_bookings_shifted_fk FOREIGN KEY (tenant_id, shifted_from) REFERENCES ot_bookings (tenant_id, id),
  CONSTRAINT ot_bookings_ptype_chk CHECK (patient_type IN ('ip', 'op')),
  CONSTRAINT ot_bookings_btype_chk CHECK (booking_type IN ('planned', 'emergency')),
  CONSTRAINT ot_bookings_ctype_chk CHECK (case_type IN ('elective', 'emergency')),
  CONSTRAINT ot_bookings_status_chk CHECK (status IN ('booked', 'completed', 'cancelled')),
  CONSTRAINT ot_bookings_window_chk CHECK (scheduled_end > scheduled_start)
);

CREATE INDEX ot_bookings_day_idx ON ot_bookings (tenant_id, resource_id, booking_date, status);
CREATE INDEX ot_bookings_overlap_idx ON ot_bookings (tenant_id, resource_id, scheduled_start, scheduled_end);

CREATE TABLE ot_post_op (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  booking_id uuid NOT NULL,
  pre_op_at timestamptz,
  wheeling_in_at timestamptz,
  anesthesia_start_at timestamptz,
  surgery_start_at timestamptz,
  surgery_end_at timestamptz,
  anesthesia_end_at timestamptz,
  wheeling_out_at timestamptz,
  executed_surgery text NOT NULL DEFAULT '',
  findings text NOT NULL DEFAULT '',
  assisted_doctors text NOT NULL DEFAULT '',
  scrub_nurse text NOT NULL DEFAULT '',
  floor_nurse text NOT NULL DEFAULT '',
  adverse_event text NOT NULL DEFAULT '',
  change_of_plan text NOT NULL DEFAULT '',
  anaesthesia_type text NOT NULL DEFAULT '',
  surgery_type text NOT NULL DEFAULT '',
  complication text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT '',
  antibiotic text NOT NULL DEFAULT '',
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, booking_id),
  CONSTRAINT ot_post_op_booking_fk FOREIGN KEY (tenant_id, booking_id) REFERENCES ot_bookings (tenant_id, id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ot_surgery_master', 'ot_special_remarks', 'ot_doctor_roles', 'ot_resources', 'ot_settings',
    'ot_requests', 'ot_request_special_remarks', 'ot_bookings', 'ot_post_op'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', t);
    EXECUTE format('CREATE POLICY %I ON %I TO hos_migrator USING (true) WITH CHECK (true)', t || '_owner', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I TO hos_app USING (tenant_id = (SELECT hos_tenant_id())) WITH CHECK (tenant_id = (SELECT hos_tenant_id()))',
      t || '_tenant', t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO hos_app', t);
    IF t NOT IN ('ot_request_special_remarks') THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION hos_touch_updated_at()',
        t || '_touch', t
      );
    END IF;
  END LOOP;
END $$;
