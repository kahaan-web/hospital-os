-- RLS, grants and guards for the B0 clinical tables. Template T from CONTRACTS §3.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'number_series', 'patients', 'patient_alerts', 'encounters', 'services', 'tariffs',
    'clinical_orders', 'clinical_order_items', 'vital_signs', 'clinical_notes', 'charges', 'cash_ledger'
  ]
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

-- Vitals are append-only except the entered-in-error mark.
CREATE OR REPLACE FUNCTION vital_signs_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'vital_signs is append-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.location_id IS DISTINCT FROM OLD.location_id
     OR NEW.encounter_id IS DISTINCT FROM OLD.encounter_id
     OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at
     OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
     OR NEW.bp_systolic IS DISTINCT FROM OLD.bp_systolic
     OR NEW.bp_diastolic IS DISTINCT FROM OLD.bp_diastolic
     OR NEW.pulse IS DISTINCT FROM OLD.pulse
     OR NEW.resp_rate IS DISTINCT FROM OLD.resp_rate
     OR NEW.temp_c_x10 IS DISTINCT FROM OLD.temp_c_x10
     OR NEW.spo2 IS DISTINCT FROM OLD.spo2
     OR NEW.weight_g IS DISTINCT FROM OLD.weight_g
     OR NEW.height_mm IS DISTINCT FROM OLD.height_mm
     OR NEW.pain_score IS DISTINCT FROM OLD.pain_score
     OR NEW.grbs_mg_dl IS DISTINCT FROM OLD.grbs_mg_dl
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'vital_signs can only be marked entered in error' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER vital_signs_guard
  BEFORE UPDATE OR DELETE ON vital_signs
  FOR EACH ROW EXECUTE FUNCTION vital_signs_guard();

-- Notes are amended by inserting a new row. Never update or delete.
CREATE OR REPLACE FUNCTION clinical_notes_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'clinical_notes are append-only' USING ERRCODE = '42501';
END $$;

CREATE TRIGGER clinical_notes_guard
  BEFORE UPDATE OR DELETE ON clinical_notes
  FOR EACH ROW EXECUTE FUNCTION clinical_notes_guard();

REVOKE ALL ON FUNCTION vital_signs_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical_notes_guard() FROM PUBLIC;
