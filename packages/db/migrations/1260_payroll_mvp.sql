-- MVP demo slice, Payroll & attendance (docs/specs/13-payroll-attendance.md, PAY-T2/PAY-T4 subset).
-- Employee list, daily attendance marks, and a payslip preview computed in the API. No payroll runs or locks yet.

CREATE TABLE payroll_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  employee_code text NOT NULL,
  full_name text NOT NULL,
  department text NOT NULL DEFAULT '',
  designation text NOT NULL DEFAULT '',
  monthly_basic_paise integer NOT NULL DEFAULT 0,
  joined_on date,
  is_active boolean NOT NULL DEFAULT true,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, employee_code),
  CONSTRAINT payroll_employees_basic_chk CHECK (monthly_basic_paise >= 0)
);

CREATE TABLE payroll_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  employee_id uuid NOT NULL,
  work_date date NOT NULL,
  status text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, employee_id, work_date),
  CONSTRAINT payroll_attendance_status_chk CHECK (status IN ('present', 'absent', 'half_day', 'leave', 'week_off', 'holiday')),
  CONSTRAINT payroll_attendance_employee_fk FOREIGN KEY (tenant_id, employee_id) REFERENCES payroll_employees (tenant_id, id)
);

CREATE INDEX payroll_attendance_month_idx ON payroll_attendance (tenant_id, employee_id, work_date);

-- RLS, same pattern as 0191_nursing_rls.sql.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payroll_employees', 'payroll_attendance']
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

-- Permission for the module. Tenant admins and location admins get it.
INSERT INTO permissions (key, description) VALUES
  ('payroll.manage', 'Staff master, attendance marks and payslip preview')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, 'payroll.manage'
FROM roles r
WHERE r.tenant_id IS NULL AND r.key IN ('tenant_admin', 'location_admin')
ON CONFLICT DO NOTHING;
