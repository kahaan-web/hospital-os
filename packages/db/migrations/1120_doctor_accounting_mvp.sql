-- MVP demo slice: Doctors Accounting share rules and payout statements.
-- The sharing basis (gross vs net, billing vs collection) is OPEN with the client; rows carry the share type only.

CREATE TABLE doctor_share_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  doctor_id uuid NOT NULL,
  service_category text NOT NULL DEFAULT 'all',
  encounter_type text NOT NULL DEFAULT 'any',
  share_type text NOT NULL DEFAULT 'pct_net',
  share_value integer NOT NULL,
  effective_from date NOT NULL DEFAULT current_date,
  active boolean NOT NULL DEFAULT true,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT doctor_share_rules_doctor_fk FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors (tenant_id, id),
  CONSTRAINT doctor_share_rules_enc_chk CHECK (encounter_type IN ('op', 'ip', 'any')),
  CONSTRAINT doctor_share_rules_type_chk CHECK (share_type IN ('pct_net', 'pct_gross', 'fixed_per_unit')),
  CONSTRAINT doctor_share_rules_value_chk CHECK (share_value >= 0 AND (share_type = 'fixed_per_unit' OR share_value <= 100))
);

CREATE INDEX doctor_share_rules_doctor_idx ON doctor_share_rules (tenant_id, doctor_id);

CREATE TABLE doctor_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  doctor_id uuid NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  gross_paise bigint NOT NULL DEFAULT 0,
  share_paise bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  paid_on date,
  pay_mode text NOT NULL DEFAULT '',
  pay_ref text NOT NULL DEFAULT '',
  paid_by uuid,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT doctor_payouts_doctor_fk FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors (tenant_id, id),
  CONSTRAINT doctor_payouts_status_chk CHECK (status IN ('pending', 'paid')),
  CONSTRAINT doctor_payouts_period_chk CHECK (period_to >= period_from),
  CONSTRAINT doctor_payouts_amount_chk CHECK (gross_paise >= 0 AND share_paise >= 0)
);

CREATE INDEX doctor_payouts_doctor_idx ON doctor_payouts (tenant_id, doctor_id, period_from DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['doctor_share_rules', 'doctor_payouts']
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
