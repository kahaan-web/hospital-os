-- B4 ADT: wards, rooms, beds, admissions, bed assignments, requests, discharge summaries.
-- Extra columns beyond the plan list (name, location_id, active, patient_id, doctor_id) scope the bed
-- board to a location and keep composite tenant foreign keys. Noted in the task commit.

CREATE TABLE wards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  ward_type text NOT NULL,
  is_icu boolean NOT NULL DEFAULT false,
  bed_service_id uuid,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, location_id, code),
  CONSTRAINT wards_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT wards_service_fk FOREIGN KEY (tenant_id, bed_service_id) REFERENCES services (tenant_id, id),
  CONSTRAINT wards_type_chk CHECK (ward_type IN ('general', 'semi_private', 'private', 'icu', 'nicu', 'hdu', 'daycare'))
);

CREATE INDEX wards_location_idx ON wards (tenant_id, location_id);

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  ward_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, ward_id, code),
  CONSTRAINT rooms_ward_fk FOREIGN KEY (tenant_id, ward_id) REFERENCES wards (tenant_id, id)
);

CREATE INDEX rooms_ward_idx ON rooms (tenant_id, ward_id);

CREATE TABLE beds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  room_id uuid NOT NULL,
  label text NOT NULL,
  ward_class text NOT NULL,
  status text NOT NULL DEFAULT 'vacant',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, room_id, label),
  CONSTRAINT beds_room_fk FOREIGN KEY (tenant_id, room_id) REFERENCES rooms (tenant_id, id),
  CONSTRAINT beds_class_chk CHECK (ward_class IN ('general', 'semi_private', 'private', 'icu', 'nicu', 'hdu', 'daycare')),
  CONSTRAINT beds_status_chk CHECK (status IN ('vacant', 'occupied', 'housekeeping', 'maintenance', 'blocked'))
);

CREATE INDEX beds_room_idx ON beds (tenant_id, room_id);

CREATE TABLE admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  doctor_id uuid,
  number text NOT NULL CHECK (char_length(number) <= 16),
  admission_type text NOT NULL,
  attendant text NOT NULL DEFAULT '',
  provisional_diagnosis text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'admitted',
  discharge_type text,
  admitted_at timestamptz NOT NULL DEFAULT now(),
  discharged_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, encounter_id),
  UNIQUE (tenant_id, number),
  CONSTRAINT admissions_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT admissions_encounter_fk FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id),
  CONSTRAINT admissions_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT admissions_doctor_fk FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors (tenant_id, id),
  CONSTRAINT admissions_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id),
  CONSTRAINT admissions_type_chk CHECK (admission_type IN ('emergency', 'elective', 'day_care')),
  CONSTRAINT admissions_status_chk CHECK (status IN ('admitted', 'discharge_initiated', 'discharged', 'cancelled')),
  CONSTRAINT admissions_discharge_chk CHECK (discharge_type IS NULL OR discharge_type IN ('normal', 'lama', 'dama', 'referred', 'death', 'absconded'))
);

CREATE INDEX admissions_patient_idx ON admissions (tenant_id, patient_id);
CREATE INDEX admissions_admitted_idx ON admissions (tenant_id, admitted_at);

CREATE TABLE bed_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  admission_id uuid NOT NULL,
  bed_id uuid NOT NULL,
  from_at timestamptz NOT NULL DEFAULT now(),
  to_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT bed_assignments_admission_fk FOREIGN KEY (tenant_id, admission_id) REFERENCES admissions (tenant_id, id),
  CONSTRAINT bed_assignments_bed_fk FOREIGN KEY (tenant_id, bed_id) REFERENCES beds (tenant_id, id)
);

CREATE INDEX bed_assignments_admission_idx ON bed_assignments (tenant_id, admission_id);
CREATE INDEX bed_assignments_from_idx ON bed_assignments (tenant_id, from_at);
CREATE UNIQUE INDEX bed_assignments_open_bed_uq ON bed_assignments (tenant_id, bed_id) WHERE to_at IS NULL;
CREATE UNIQUE INDEX bed_assignments_open_admission_uq ON bed_assignments (tenant_id, admission_id) WHERE to_at IS NULL;

CREATE TABLE admission_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  from_encounter_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  admission_id uuid,
  reason text NOT NULL,
  planned_on date NOT NULL,
  ward_type text,
  status text NOT NULL DEFAULT 'requested',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT admission_requests_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT admission_requests_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT admission_requests_encounter_fk FOREIGN KEY (tenant_id, from_encounter_id) REFERENCES encounters (tenant_id, id),
  CONSTRAINT admission_requests_doctor_fk FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors (tenant_id, id),
  CONSTRAINT admission_requests_admission_fk FOREIGN KEY (tenant_id, admission_id) REFERENCES admissions (tenant_id, id),
  CONSTRAINT admission_requests_ward_chk CHECK (ward_type IS NULL OR ward_type IN ('general', 'semi_private', 'private', 'icu', 'nicu', 'hdu', 'daycare')),
  CONSTRAINT admission_requests_status_chk CHECK (status IN ('requested', 'admitted', 'cancelled'))
);

CREATE INDEX admission_requests_status_idx ON admission_requests (tenant_id, status);

CREATE TABLE discharge_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  admission_id uuid NOT NULL,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  finalised_at timestamptz,
  finalised_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, admission_id),
  CONSTRAINT discharge_summaries_admission_fk FOREIGN KEY (tenant_id, admission_id) REFERENCES admissions (tenant_id, id),
  CONSTRAINT discharge_summaries_user_fk FOREIGN KEY (tenant_id, finalised_by) REFERENCES users (tenant_id, id),
  CONSTRAINT discharge_summaries_status_chk CHECK (status IN ('draft', 'final'))
);
