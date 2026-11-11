-- P2-6: platform-on-tenant must not read clinical PHI.
-- Filename 0900 (not 0028): a 00xx file sorts before 0100, so on a fresh database
-- it would run before these tables exist. 0900 sorts after every module range (01xx).
-- Clinical tables added by later modules must be added to this list (or a later 09xx file).
-- There is no break-glass reader. App Admin tenant detail stays on non-clinical tables.
-- Tenant scope (hos_scope() = 'tenant') is unchanged. hos_migrator keeps the owner policy.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'patients', 'patient_alerts', 'encounters', 'clinical_orders', 'clinical_order_items',
    'vital_signs', 'clinical_notes', 'charges', 'cash_ledger',
    'patient_documents', 'mlc_cases',
    'appointments', 'opd_queue',
    'order_sets', 'prescription_templates',
    'admissions', 'bed_assignments', 'admission_requests', 'discharge_summaries',
    'pharmacy_sales', 'pharmacy_sale_lines', 'pharmacy_sale_returns', 'pharmacy_sale_return_lines',
    'pharmacy_ip_issues', 'pharmacy_ip_issue_lines'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I TO hos_app USING (tenant_id = (SELECT hos_tenant_id()) AND hos_scope() = %L) WITH CHECK (tenant_id = (SELECT hos_tenant_id()) AND hos_scope() = %L)',
      t || '_tenant', t, 'tenant', 'tenant'
    );
  END LOOP;
END $$;
