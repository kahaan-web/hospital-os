-- MVP demo slice: OT scheduling. One case table (room, team names and times kept inline).

INSERT INTO permissions (key, description) VALUES
  ('ot.manage', 'Schedule and complete operation theatre cases')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, g.perm
FROM roles r
JOIN (VALUES
  ('tenant_admin', 'ot.manage'),
  ('location_admin', 'ot.manage')
) AS g(role_key, perm) ON g.role_key = r.key AND r.tenant_id IS NULL
ON CONFLICT DO NOTHING;

CREATE TABLE ot_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  number text NOT NULL,
  procedure_name text NOT NULL,
  surgeon_name text NOT NULL,
  anaesthetist_name text NOT NULL DEFAULT '',
  room_code text NOT NULL,
  priority text NOT NULL DEFAULT 'elective',
  anaesthesia_type text NOT NULL DEFAULT '',
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  in_room_at timestamptz,
  out_room_at timestamptz,
  notes text NOT NULL DEFAULT '',
  is_sample boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT ot_cases_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT ot_cases_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT ot_cases_status_chk CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  CONSTRAINT ot_cases_priority_chk CHECK (priority IN ('elective', 'emergency')),
  CONSTRAINT ot_cases_window_chk CHECK (scheduled_end > scheduled_start)
);

CREATE INDEX ot_cases_board_idx ON ot_cases (tenant_id, location_id, scheduled_start);
CREATE INDEX ot_cases_room_idx ON ot_cases (tenant_id, room_code, scheduled_start);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ot_cases']
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
