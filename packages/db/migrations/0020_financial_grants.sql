-- U2: hos_app cannot rewrite issued invoices or payment rows, and can only
-- update the columns of orders and consents that legitimately change.
-- Credit notes are the correction model for an issued invoice (no UI).

REVOKE UPDATE, DELETE ON invoices FROM hos_app;
REVOKE UPDATE, DELETE ON invoice_lines FROM hos_app;
REVOKE UPDATE, DELETE ON payments FROM hos_app;

REVOKE UPDATE, DELETE ON orders FROM hos_app;
GRANT UPDATE (status, paid_at, fulfilled_at) ON orders TO hos_app;

REVOKE UPDATE, DELETE ON consents FROM hos_app;
GRANT UPDATE (withdrawn_at) ON consents TO hos_app;

CREATE OR REPLACE FUNCTION hos_reject_issued_document() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'issued billing documents are immutable' USING ERRCODE = '42501';
END $$;

REVOKE ALL ON FUNCTION hos_reject_issued_document() FROM PUBLIC;

DROP TRIGGER IF EXISTS invoices_immutable ON invoices;
CREATE TRIGGER invoices_immutable BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION hos_reject_issued_document();

DROP TRIGGER IF EXISTS invoice_lines_immutable ON invoice_lines;
CREATE TRIGGER invoice_lines_immutable BEFORE UPDATE OR DELETE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION hos_reject_issued_document();

CREATE TABLE IF NOT EXISTS credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  invoice_id uuid NOT NULL,
  number text NOT NULL,
  reason text NOT NULL DEFAULT '',
  taxable_paise bigint NOT NULL,
  cgst_paise bigint NOT NULL DEFAULT 0,
  sgst_paise bigint NOT NULL DEFAULT 0,
  igst_paise bigint NOT NULL DEFAULT 0,
  total_paise bigint NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_notes_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT credit_notes_number_uq UNIQUE (number),
  CONSTRAINT credit_notes_invoice_fk FOREIGN KEY (tenant_id, invoice_id) REFERENCES invoices (tenant_id, id),
  CONSTRAINT credit_notes_number_len_chk CHECK (char_length(number) <= 16),
  CONSTRAINT credit_notes_total_chk CHECK (total_paise >= 0)
);

CREATE INDEX IF NOT EXISTS credit_notes_tenant_idx ON credit_notes (tenant_id);

ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_notes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON credit_notes FROM PUBLIC;
DROP POLICY IF EXISTS credit_notes_owner ON credit_notes;
CREATE POLICY credit_notes_owner ON credit_notes TO hos_migrator USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS credit_notes_tenant ON credit_notes;
CREATE POLICY credit_notes_tenant ON credit_notes TO hos_app
  USING (tenant_id = (SELECT hos_tenant_id()))
  WITH CHECK (tenant_id = (SELECT hos_tenant_id()));
GRANT SELECT, INSERT ON credit_notes TO hos_app;

DROP TRIGGER IF EXISTS credit_notes_immutable ON credit_notes;
CREATE TRIGGER credit_notes_immutable BEFORE UPDATE OR DELETE ON credit_notes
  FOR EACH ROW EXECUTE FUNCTION hos_reject_issued_document();
