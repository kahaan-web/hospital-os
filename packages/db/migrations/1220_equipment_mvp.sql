-- MVP demo slice, Equipment maintenance (docs/specs/11-equipment-maintenance.md, EQ-T1/EQ-T3 subset).
-- Asset register, PM schedules and a service log, with tenant RLS. Tables are tenant-wide (no location yet).

CREATE TABLE equipment_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  asset_tag text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  criticality text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'operational',
  purchase_cost_paise integer NOT NULL DEFAULT 0,
  installed_on date,
  warranty_until date,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, asset_tag),
  CONSTRAINT equipment_assets_criticality_chk CHECK (criticality IN ('high', 'medium', 'low')),
  CONSTRAINT equipment_assets_status_chk CHECK (status IN ('operational', 'non_operational', 'under_maintenance', 'condemned')),
  CONSTRAINT equipment_assets_cost_chk CHECK (purchase_cost_paise >= 0)
);

CREATE TABLE equipment_pm_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  equipment_id uuid NOT NULL,
  title text NOT NULL,
  frequency_days integer NOT NULL,
  next_due date NOT NULL,
  last_done_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT equipment_pm_frequency_chk CHECK (frequency_days > 0),
  CONSTRAINT equipment_pm_asset_fk FOREIGN KEY (tenant_id, equipment_id) REFERENCES equipment_assets (tenant_id, id)
);

CREATE INDEX equipment_pm_asset_idx ON equipment_pm_schedules (tenant_id, equipment_id);

CREATE TABLE equipment_service_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  equipment_id uuid NOT NULL,
  kind text NOT NULL,
  description text NOT NULL DEFAULT '',
  cost_paise integer NOT NULL DEFAULT 0,
  logged_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT equipment_log_kind_chk CHECK (kind IN ('pm', 'breakdown', 'restored')),
  CONSTRAINT equipment_log_asset_fk FOREIGN KEY (tenant_id, equipment_id) REFERENCES equipment_assets (tenant_id, id),
  CONSTRAINT equipment_log_user_fk FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id)
);

CREATE INDEX equipment_log_asset_idx ON equipment_service_logs (tenant_id, equipment_id, logged_at);

-- RLS, same pattern as 0191_nursing_rls.sql.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['equipment_assets', 'equipment_pm_schedules', 'equipment_service_logs']
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

-- Permission for the module. Tenant admins and location admins get it, as they get every other manage key.
INSERT INTO permissions (key, description) VALUES
  ('equipment.manage', 'Equipment register, breakdowns and preventive maintenance')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, 'equipment.manage'
FROM roles r
WHERE r.tenant_id IS NULL AND r.key IN ('tenant_admin', 'location_admin')
ON CONFLICT DO NOTHING;
