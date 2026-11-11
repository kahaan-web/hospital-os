-- RLS for B8 lab tables. Verified result rows cannot be updated or deleted.
-- hos_lab_interface_open lets a mock analyser authenticate by token without a user session.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_tests', 'lab_test_params', 'lab_accessions', 'lab_results', 'lab_interfaces', 'lab_settings']
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

CREATE OR REPLACE FUNCTION lab_results_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.verified_by IS NOT NULL THEN
    RAISE EXCEPTION 'verified lab result is immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lab_results_immutable
  BEFORE UPDATE OR DELETE ON lab_results
  FOR EACH ROW EXECUTE FUNCTION lab_results_guard();

CREATE OR REPLACE FUNCTION hos_lab_interface_open(p_id uuid, p_token_hash text)
RETURNS TABLE (tenant_id uuid, location_id uuid, interface_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT i.tenant_id, i.location_id, i.id
    FROM lab_interfaces i
   WHERE i.id = p_id
     AND i.active
     AND i.token_hash = p_token_hash
$$;

REVOKE ALL ON FUNCTION hos_lab_interface_open(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hos_lab_interface_open(uuid, text) TO hos_app;
