-- Review fixes. Applied migrations 0000–0002 stay frozen.
-- 1. Remember the status to restore when a suspension is lifted.
-- 2. Deleting a location clears sessions.location_id (hos_app cannot update sessions).
-- 3. Hash the audit chain with built-in pg_catalog.sha256 (Postgres 11+). Drop the pgcrypto wrapper
--    that 0001 created. The migrator drops the extension afterwards.

ALTER TABLE tenants ADD COLUMN status_before_suspend text;

ALTER TABLE tenants ADD CONSTRAINT tenants_status_before_chk
  CHECK (status_before_suspend IS NULL OR status_before_suspend IN ('onboarding', 'active'));

CREATE OR REPLACE FUNCTION tenants_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND (NEW.status = 'suspended' OR OLD.status = 'suspended')
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
     OR NEW.sandbox IS DISTINCT FROM OLD.sandbox
     OR NEW.status_before_suspend IS DISTINCT FROM OLD.status_before_suspend
  THEN
    IF hos_scope() IS DISTINCT FROM 'platform' THEN
      RAISE EXCEPTION 'changing tenant suspension or sandbox requires platform scope' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION tenants_guard() FROM PUBLIC;

ALTER TABLE sessions DROP CONSTRAINT sessions_location_id_locations_id_fk;
ALTER TABLE sessions ADD CONSTRAINT sessions_location_id_locations_id_fk
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE OR REPLACE FUNCTION audit_log_chain() RETURNS trigger
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  p_seq bigint;
  p_hash text;
BEGIN
  NEW.chain_key := coalesce(NEW.tenant_id::text, 'platform');
  NEW.created_at := now();
  PERFORM pg_advisory_xact_lock(hashtext('hos_audit'), hashtext(NEW.chain_key));
  SELECT seq, hash INTO p_seq, p_hash FROM audit_log WHERE chain_key = NEW.chain_key ORDER BY seq DESC LIMIT 1;
  NEW.seq := coalesce(p_seq, 0) + 1;
  NEW.prev_hash := coalesce(p_hash, repeat('0', 64));
  NEW.hash := encode(pg_catalog.sha256(convert_to(hos_audit_canonical(NEW), 'UTF8')), 'hex');
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION audit_log_chain() FROM PUBLIC;

DROP FUNCTION IF EXISTS public.sha256(bytea);
