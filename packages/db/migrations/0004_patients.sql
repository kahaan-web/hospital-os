-- Patients (Phase A: sample records only, for the demo dataset and the tenant-isolation smoke test).
-- Phase B Patient Registration extends this table rather than replacing it.
--
-- Rules enforced in the database:
-- - tenant-owned, RLS enabled and forced, same policy shape as the other tenant tables (0001_rls.sql);
-- - the location must belong to the same tenant (composite FK);
-- - mobile is +91 E.164 or empty;
-- - ABHA number / address may only be stored on sample rows until field-level encryption exists
--   (docs/SECURITY_AND_COMPLIANCE.md, "Field level").

CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  uhid text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL DEFAULT '',
  sex text NOT NULL,
  dob date,
  mobile text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  blood_group text,
  address_line1 text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state_code text NOT NULL DEFAULT '',
  pincode text NOT NULL DEFAULT '',
  emergency_contact_name text NOT NULL DEFAULT '',
  emergency_contact_relation text NOT NULL DEFAULT '',
  emergency_contact_mobile text NOT NULL DEFAULT '',
  abha_number text,
  abha_address text,
  is_sample boolean NOT NULL DEFAULT false,
  registered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patients_tenant_uhid_uq UNIQUE (tenant_id, uhid),
  CONSTRAINT patients_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT patients_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations(tenant_id, id),
  CONSTRAINT patients_sex_chk CHECK (sex IN ('male', 'female', 'other')),
  CONSTRAINT patients_mobile_chk CHECK (mobile = '' OR mobile ~ '^\+91[6-9][0-9]{9}$'),
  CONSTRAINT patients_emergency_mobile_chk CHECK (emergency_contact_mobile = '' OR emergency_contact_mobile ~ '^\+91[6-9][0-9]{9}$'),
  CONSTRAINT patients_blood_chk CHECK (blood_group IS NULL OR blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  CONSTRAINT patients_dob_chk CHECK (dob IS NULL OR (dob >= DATE '1900-01-01' AND dob <= (registered_at AT TIME ZONE 'Asia/Kolkata')::date)),
  CONSTRAINT patients_abha_sample_only_chk CHECK ((abha_number IS NULL AND abha_address IS NULL) OR is_sample),
  CONSTRAINT patients_abha_number_chk CHECK (abha_number IS NULL OR abha_number ~ '^[0-9]{2}-[0-9]{4}-[0-9]{4}-[0-9]{4}$')
);

CREATE INDEX patients_tenant_location_idx ON patients (tenant_id, location_id);
CREATE INDEX patients_tenant_mobile_idx ON patients (tenant_id, mobile);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;
REVOKE ALL ON patients FROM PUBLIC;
CREATE POLICY patients_owner ON patients TO hos_migrator USING (true) WITH CHECK (true);
CREATE POLICY patients_tenant ON patients TO hos_app
  USING (tenant_id = (SELECT hos_tenant_id()))
  WITH CHECK (tenant_id = (SELECT hos_tenant_id()));
-- No DELETE: erasure requests are handled through the data-principal register and retention rules, not a row delete.
GRANT SELECT, INSERT, UPDATE ON patients TO hos_app;

CREATE TRIGGER patients_touch BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION hos_touch_updated_at();
