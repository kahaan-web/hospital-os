-- MVP demo slice: linen stock and laundry batches (docs/specs/10-linen-laundry.md).
-- Tables, RLS and policies in one file, following 0191_nursing_rls.sql.

CREATE TABLE linen_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  name text NOT NULL,
  clean_qty integer NOT NULL DEFAULT 0,
  in_laundry_qty integer NOT NULL DEFAULT 0,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, location_id, name),
  CONSTRAINT linen_items_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT linen_items_clean_chk CHECK (clean_qty >= 0),
  CONSTRAINT linen_items_laundry_chk CHECK (in_laundry_qty >= 0)
);

CREATE TABLE laundry_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  number text NOT NULL,
  linen_item_id uuid NOT NULL,
  vendor text NOT NULL DEFAULT 'In-house laundry',
  qty_sent integer NOT NULL,
  qty_received integer,
  qty_missing integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT laundry_batches_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT laundry_batches_item_fk FOREIGN KEY (tenant_id, linen_item_id) REFERENCES linen_items (tenant_id, id),
  CONSTRAINT laundry_batches_sent_chk CHECK (qty_sent > 0),
  CONSTRAINT laundry_batches_status_chk CHECK (status IN ('sent', 'received')),
  CONSTRAINT laundry_batches_received_chk CHECK (
    qty_received IS NULL OR (qty_received >= 0 AND qty_received + qty_missing = qty_sent)
  )
);

CREATE INDEX linen_items_location_idx ON linen_items (tenant_id, location_id, name);
CREATE INDEX laundry_batches_location_idx ON laundry_batches (tenant_id, location_id, sent_at);

-- RLS, same policy pattern as 0191_nursing_rls.sql.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['linen_items', 'laundry_batches']
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
