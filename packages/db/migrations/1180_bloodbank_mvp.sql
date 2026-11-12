-- MVP demo slice: blood bank, storage-centre mode only (docs/specs/09-blood-bank.md). Tables, then RLS.

CREATE TABLE bb_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  unit_no text NOT NULL,
  component text NOT NULL,
  abo text NOT NULL,
  rh text NOT NULL,
  volume_ml integer NOT NULL,
  collected_on date NOT NULL,
  expires_at date NOT NULL,
  source_centre text NOT NULL DEFAULT '',
  tti_cleared boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'available',
  is_sample boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, location_id, unit_no),
  CONSTRAINT bb_units_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT bb_units_component_chk CHECK (component IN ('wb', 'prbc', 'ffp', 'pc', 'cryo')),
  CONSTRAINT bb_units_abo_chk CHECK (abo IN ('A', 'B', 'AB', 'O')),
  CONSTRAINT bb_units_rh_chk CHECK (rh IN ('pos', 'neg')),
  CONSTRAINT bb_units_status_chk CHECK (status IN ('available', 'reserved', 'issued', 'discarded')),
  CONSTRAINT bb_units_volume_chk CHECK (volume_ml > 0 AND volume_ml <= 1000)
);

CREATE INDEX bb_units_stock_idx ON bb_units (tenant_id, location_id, status, expires_at);

CREATE TABLE bb_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  patient_abo text NOT NULL,
  patient_rh text NOT NULL,
  component text NOT NULL,
  urgency text NOT NULL DEFAULT 'routine',
  indication text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  unit_id uuid,
  issued_at timestamptz,
  issued_by uuid,
  received_by text NOT NULL DEFAULT '',
  is_sample boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT bb_requests_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT bb_requests_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT bb_requests_unit_fk FOREIGN KEY (tenant_id, unit_id) REFERENCES bb_units (tenant_id, id),
  CONSTRAINT bb_requests_component_chk CHECK (component IN ('wb', 'prbc', 'ffp', 'pc', 'cryo')),
  CONSTRAINT bb_requests_abo_chk CHECK (patient_abo IN ('A', 'B', 'AB', 'O')),
  CONSTRAINT bb_requests_rh_chk CHECK (patient_rh IN ('pos', 'neg')),
  CONSTRAINT bb_requests_urgency_chk CHECK (urgency IN ('routine', 'urgent', 'emergency')),
  CONSTRAINT bb_requests_status_chk CHECK (status IN ('open', 'issued', 'cancelled'))
);

CREATE INDEX bb_requests_queue_idx ON bb_requests (tenant_id, location_id, status, created_at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bb_units', 'bb_requests']
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
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION hos_touch_updated_at()',
      t || '_touch', t
    );
  END LOOP;
END $$;
