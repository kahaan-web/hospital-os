-- B0: document prefix and doctor links. Applies on a fresh database and on a Phase A database.
-- doc_prefix is derived from the location code when the caller does not send one, so existing inserts keep working.

ALTER TABLE locations ADD COLUMN IF NOT EXISTS doc_prefix text;

UPDATE locations
SET doc_prefix = upper(left(regexp_replace(code, '[^A-Za-z0-9]', '', 'g'), 3))
WHERE doc_prefix IS NULL OR doc_prefix = '' OR doc_prefix !~ '^[A-Z0-9]{2,3}$';

UPDATE locations
SET doc_prefix = 'LOC'
WHERE doc_prefix IS NULL OR doc_prefix !~ '^[A-Z0-9]{2,3}$';

ALTER TABLE locations ALTER COLUMN doc_prefix SET NOT NULL;

ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_doc_prefix_chk;
ALTER TABLE locations ADD CONSTRAINT locations_doc_prefix_chk CHECK (doc_prefix ~ '^[A-Z0-9]{2,3}$');

CREATE OR REPLACE FUNCTION locations_fill_doc_prefix() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  derived text;
BEGIN
  IF NEW.doc_prefix IS NULL OR NEW.doc_prefix !~ '^[A-Z0-9]{2,3}$' THEN
    derived := upper(left(regexp_replace(coalesce(NEW.code, ''), '[^A-Za-z0-9]', '', 'g'), 3));
    IF derived IS NULL OR derived !~ '^[A-Z0-9]{2,3}$' THEN
      derived := 'LOC';
    END IF;
    NEW.doc_prefix := derived;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS locations_doc_prefix ON locations;
CREATE TRIGGER locations_doc_prefix
  BEFORE INSERT OR UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION locations_fill_doc_prefix();

CREATE UNIQUE INDEX IF NOT EXISTS departments_tenant_id_uq ON departments (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS doctors_tenant_id_uq ON doctors (tenant_id, id);

ALTER TABLE doctors ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS department_id uuid;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS registration_no text;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS active boolean;

UPDATE doctors SET registration_no = '' WHERE registration_no IS NULL;
UPDATE doctors SET active = true WHERE active IS NULL;

ALTER TABLE doctors ALTER COLUMN registration_no SET DEFAULT '';
ALTER TABLE doctors ALTER COLUMN registration_no SET NOT NULL;
ALTER TABLE doctors ALTER COLUMN active SET DEFAULT true;
ALTER TABLE doctors ALTER COLUMN active SET NOT NULL;

ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_user_fk;
ALTER TABLE doctors
  ADD CONSTRAINT doctors_user_fk
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id);

ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_department_fk;
ALTER TABLE doctors
  ADD CONSTRAINT doctors_department_fk
  FOREIGN KEY (tenant_id, department_id) REFERENCES departments (tenant_id, id);

REVOKE ALL ON FUNCTION locations_fill_doc_prefix() FROM PUBLIC;
