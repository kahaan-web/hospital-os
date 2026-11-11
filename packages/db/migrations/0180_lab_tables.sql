-- B8 laboratory (LIS): test master, accessions, results, mock analyser, collect-before-payment switch.

CREATE TABLE lab_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  service_id uuid NOT NULL,
  specimen text NOT NULL,
  container text NOT NULL,
  tat_hours integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, service_id),
  CONSTRAINT lab_tests_service_fk FOREIGN KEY (tenant_id, service_id) REFERENCES services (tenant_id, id),
  CONSTRAINT lab_tests_specimen_chk CHECK (specimen IN ('blood', 'serum', 'plasma', 'urine', 'stool', 'swab', 'sputum', 'csf', 'other')),
  CONSTRAINT lab_tests_tat_chk CHECK (tat_hours >= 1 AND tat_hours <= 720)
);

CREATE TABLE lab_test_params (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  test_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  unit text NOT NULL DEFAULT '',
  value_type text NOT NULL,
  decimals integer NOT NULL DEFAULT 0,
  ref_ranges jsonb NOT NULL DEFAULT '[]'::jsonb,
  critical_low numeric(14, 4),
  critical_high numeric(14, 4),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, test_id, code),
  CONSTRAINT lab_test_params_test_fk FOREIGN KEY (tenant_id, test_id) REFERENCES lab_tests (tenant_id, id),
  CONSTRAINT lab_test_params_type_chk CHECK (value_type IN ('numeric', 'text', 'coded')),
  CONSTRAINT lab_test_params_decimals_chk CHECK (decimals >= 0 AND decimals <= 4)
);

CREATE INDEX lab_test_params_test_idx ON lab_test_params (tenant_id, test_id, sort_order);

CREATE TABLE lab_accessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  number text NOT NULL,
  barcode text NOT NULL,
  status text NOT NULL DEFAULT 'ordered',
  specimen text NOT NULL,
  collected_at timestamptz,
  collected_by uuid,
  received_at timestamptz,
  received_by uuid,
  verified_at timestamptz,
  reported_at timestamptz,
  rejected_at timestamptz,
  reject_reason text,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  UNIQUE (tenant_id, barcode),
  UNIQUE (tenant_id, order_item_id),
  CONSTRAINT lab_accessions_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT lab_accessions_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT lab_accessions_encounter_fk FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id),
  CONSTRAINT lab_accessions_item_fk FOREIGN KEY (tenant_id, order_item_id) REFERENCES clinical_order_items (tenant_id, id),
  CONSTRAINT lab_accessions_collected_by_fk FOREIGN KEY (tenant_id, collected_by) REFERENCES users (tenant_id, id),
  CONSTRAINT lab_accessions_received_by_fk FOREIGN KEY (tenant_id, received_by) REFERENCES users (tenant_id, id),
  CONSTRAINT lab_accessions_status_chk CHECK (status IN ('ordered', 'collected', 'received', 'resulted', 'verified', 'reported', 'rejected')),
  CONSTRAINT lab_accessions_specimen_chk CHECK (specimen IN ('blood', 'serum', 'plasma', 'urine', 'stool', 'swab', 'sputum', 'csf', 'other')),
  CONSTRAINT lab_accessions_number_len_chk CHECK (char_length(number) BETWEEN 4 AND 16)
);

CREATE INDEX lab_accessions_patient_idx ON lab_accessions (tenant_id, patient_id);
CREATE INDEX lab_accessions_status_idx ON lab_accessions (tenant_id, status);

CREATE TABLE lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  accession_id uuid NOT NULL,
  param_id uuid NOT NULL,
  value_num numeric(14, 4),
  value_text text,
  flag text,
  entered_by uuid,
  verified_by uuid,
  verified_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, accession_id, param_id, version),
  CONSTRAINT lab_results_accession_fk FOREIGN KEY (tenant_id, accession_id) REFERENCES lab_accessions (tenant_id, id),
  CONSTRAINT lab_results_param_fk FOREIGN KEY (tenant_id, param_id) REFERENCES lab_test_params (tenant_id, id),
  CONSTRAINT lab_results_entered_by_fk FOREIGN KEY (tenant_id, entered_by) REFERENCES users (tenant_id, id),
  CONSTRAINT lab_results_verified_by_fk FOREIGN KEY (tenant_id, verified_by) REFERENCES users (tenant_id, id),
  CONSTRAINT lab_results_flag_chk CHECK (flag IS NULL OR flag IN ('N', 'L', 'H', 'LL', 'HH')),
  CONSTRAINT lab_results_version_chk CHECK (version >= 1)
);

CREATE INDEX lab_results_accession_idx ON lab_results (tenant_id, accession_id, version);

CREATE TABLE lab_interfaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'mock_astm',
  token_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT lab_interfaces_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT lab_interfaces_kind_chk CHECK (kind = 'mock_astm')
);

CREATE TABLE lab_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  collect_before_payment boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id)
);
