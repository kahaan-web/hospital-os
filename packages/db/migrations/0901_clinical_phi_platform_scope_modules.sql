-- Platform scope must not read clinical PHI on the module tables that 0900 does not own.
-- 0900 (when present) recreates <table>_tenant for the base clinical tables. This file
-- drops and recreates the same policy name, so it is safe before or after 0900.
-- Masters stay on the tenant-id policy: services, tariffs, wards, lab test templates,
-- lab interfaces and lab settings. Diet orders are clinical_orders (B0), not a B9 table.
-- There is no separate sample, result-version, nursing-note or vitals-chart table;
-- lab_accessions and lab_results (version column) and the MAR tables are the PHI rows.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bills', 'bill_lines', 'deposits', 'bill_settlements', 'concessions', 'refunds', 'bill_credit_notes',
    'cash_ledger',
    'lab_accessions', 'lab_results',
    'mar_schedules', 'medication_administrations'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I TO hos_app USING (tenant_id = (SELECT hos_tenant_id()) AND hos_scope() = ''tenant'') WITH CHECK (tenant_id = (SELECT hos_tenant_id()) AND hos_scope() = ''tenant'')',
      t || '_tenant', t
    );
  END LOOP;
END $$;
