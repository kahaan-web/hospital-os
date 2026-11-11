-- RLS for B7 pharmacy tables. Stock moves are append-only.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pharmacy_items', 'pharmacy_suppliers', 'pharmacy_batches', 'pharmacy_stock', 'pharmacy_stock_moves',
    'pharmacy_grns', 'pharmacy_grn_lines', 'pharmacy_sales', 'pharmacy_sale_lines',
    'pharmacy_sale_returns', 'pharmacy_sale_return_lines', 'pharmacy_ip_issues', 'pharmacy_ip_issue_lines',
    'pharmacy_adjustments', 'pharmacy_adjustment_lines', 'pharmacy_supplier_returns', 'pharmacy_supplier_return_lines'
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

CREATE OR REPLACE FUNCTION pharmacy_stock_moves_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'pharmacy_stock_moves is append-only' USING ERRCODE = '42501';
END $$;

CREATE TRIGGER pharmacy_stock_moves_guard
  BEFORE UPDATE OR DELETE ON pharmacy_stock_moves
  FOR EACH ROW EXECUTE FUNCTION pharmacy_stock_moves_guard();

REVOKE ALL ON FUNCTION pharmacy_stock_moves_guard() FROM PUBLIC;
