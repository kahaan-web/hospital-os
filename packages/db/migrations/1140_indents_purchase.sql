-- MVP demo slice: indents and purchase orders (docs/specs/07-indents-purchase.md).
-- Tables, RLS and policies in one file, following 0191_nursing_rls.sql.

CREATE TABLE indents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  number text NOT NULL,
  department text NOT NULL,
  priority text NOT NULL DEFAULT 'routine',
  required_by date,
  status text NOT NULL DEFAULT 'draft',
  approved_at timestamptz,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT indents_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT indents_priority_chk CHECK (priority IN ('routine', 'urgent')),
  CONSTRAINT indents_status_chk CHECK (status IN ('draft', 'approved', 'converted', 'cancelled'))
);

CREATE TABLE indent_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  indent_id uuid NOT NULL,
  line_no integer NOT NULL,
  item_name text NOT NULL,
  unit text NOT NULL DEFAULT 'nos',
  qty_requested integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, indent_id, line_no),
  CONSTRAINT indent_lines_indent_fk FOREIGN KEY (tenant_id, indent_id) REFERENCES indents (tenant_id, id),
  CONSTRAINT indent_lines_qty_chk CHECK (qty_requested > 0 AND qty_requested <= 100000)
);

CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  number text NOT NULL,
  indent_id uuid NOT NULL,
  supplier_name text NOT NULL,
  expected_by date,
  status text NOT NULL DEFAULT 'open',
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  UNIQUE (tenant_id, indent_id),
  CONSTRAINT purchase_orders_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT purchase_orders_indent_fk FOREIGN KEY (tenant_id, indent_id) REFERENCES indents (tenant_id, id),
  CONSTRAINT purchase_orders_status_chk CHECK (status IN ('open', 'received', 'cancelled'))
);

CREATE INDEX indents_location_idx ON indents (tenant_id, location_id, created_at);
CREATE INDEX indent_lines_indent_idx ON indent_lines (tenant_id, indent_id, line_no);
CREATE INDEX purchase_orders_location_idx ON purchase_orders (tenant_id, location_id, created_at);

-- RLS, same policy pattern as 0191_nursing_rls.sql.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['indents', 'indent_lines', 'purchase_orders']
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
