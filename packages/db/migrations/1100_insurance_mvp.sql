-- MVP demo slice: Insurance / TPA payers and pre-auth / claim requests.

CREATE TABLE insurance_payers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  payer_type text NOT NULL DEFAULT 'insurer',
  copay_pct integer NOT NULL DEFAULT 0,
  credit_days integer NOT NULL DEFAULT 30,
  active boolean NOT NULL DEFAULT true,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name),
  CONSTRAINT insurance_payers_type_chk CHECK (payer_type IN ('insurer', 'tpa', 'corporate', 'government')),
  CONSTRAINT insurance_payers_copay_chk CHECK (copay_pct BETWEEN 0 AND 100),
  CONSTRAINT insurance_payers_credit_chk CHECK (credit_days >= 0)
);

CREATE TABLE insurance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  payer_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'preauth',
  patient_name text NOT NULL,
  uhid text NOT NULL DEFAULT '',
  policy_no text NOT NULL DEFAULT '',
  diagnosis text NOT NULL DEFAULT '',
  estimated_paise bigint NOT NULL DEFAULT 0,
  approved_paise bigint,
  status text NOT NULL DEFAULT 'submitted',
  decided_at timestamptz,
  decided_by uuid,
  reject_reason text NOT NULL DEFAULT '',
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT insurance_requests_payer_fk FOREIGN KEY (tenant_id, payer_id) REFERENCES insurance_payers (tenant_id, id),
  CONSTRAINT insurance_requests_kind_chk CHECK (kind IN ('preauth', 'claim')),
  CONSTRAINT insurance_requests_status_chk CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  CONSTRAINT insurance_requests_amount_chk CHECK (estimated_paise >= 0 AND (approved_paise IS NULL OR approved_paise >= 0))
);

CREATE INDEX insurance_requests_status_idx ON insurance_requests (tenant_id, status, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['insurance_payers', 'insurance_requests']
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
