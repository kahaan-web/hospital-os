-- MVP demo slice: radiology orders worklist and report entry/sign. PC-PNDT Form F is out of this slice.

INSERT INTO permissions (key, description) VALUES
  ('radiology.manage', 'Radiology worklist, reporting and signing')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, g.perm
FROM roles r
JOIN (VALUES
  ('tenant_admin', 'radiology.manage'),
  ('location_admin', 'radiology.manage')
) AS g(role_key, perm) ON g.role_key = r.key AND r.tenant_id IS NULL
ON CONFLICT DO NOTHING;

CREATE TABLE rad_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  number text NOT NULL,
  modality text NOT NULL,
  study_name text NOT NULL,
  priority text NOT NULL DEFAULT 'routine',
  clinical_notes text NOT NULL DEFAULT '',
  ordering_doctor_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ordered',
  performed_at timestamptz,
  is_sample boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT rad_orders_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT rad_orders_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT rad_orders_modality_chk CHECK (modality IN ('xray', 'usg', 'ct', 'mri', 'mammo', 'other')),
  CONSTRAINT rad_orders_priority_chk CHECK (priority IN ('routine', 'urgent', 'stat')),
  CONSTRAINT rad_orders_status_chk CHECK (status IN ('ordered', 'in_progress', 'done', 'reported', 'cancelled'))
);

CREATE INDEX rad_orders_worklist_idx ON rad_orders (tenant_id, location_id, status, created_at);

CREATE TABLE rad_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  order_id uuid NOT NULL,
  version int NOT NULL DEFAULT 1,
  findings text NOT NULL DEFAULT '',
  impression text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  radiologist_id uuid,
  signed_at timestamptz,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, order_id, version),
  CONSTRAINT rad_reports_order_fk FOREIGN KEY (tenant_id, order_id) REFERENCES rad_orders (tenant_id, id),
  CONSTRAINT rad_reports_status_chk CHECK (status IN ('draft', 'final'))
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rad_orders', 'rad_reports']
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
