-- B1 patient registration: documents and MLC cases.

CREATE TABLE patient_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid NOT NULL,
  kind text NOT NULL,
  file_path text NOT NULL,
  mime text NOT NULL,
  size integer NOT NULL CHECK (size > 0 AND size <= 5242880),
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT patient_documents_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT patient_documents_uploader_fk FOREIGN KEY (tenant_id, uploaded_by) REFERENCES users (tenant_id, id)
);

CREATE INDEX patient_documents_patient_idx ON patient_documents (tenant_id, patient_id);

CREATE TABLE mlc_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  number text NOT NULL,
  police_station text NOT NULL DEFAULT '',
  brought_by text NOT NULL DEFAULT '',
  injury_summary text NOT NULL DEFAULT '',
  reported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT mlc_cases_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT mlc_cases_encounter_fk FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id)
);

CREATE INDEX mlc_cases_patient_idx ON mlc_cases (tenant_id, patient_id);
CREATE INDEX mlc_cases_reported_idx ON mlc_cases (tenant_id, reported_at);
