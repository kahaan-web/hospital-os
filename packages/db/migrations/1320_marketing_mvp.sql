-- MVP demo slice: marketing campaigns (docs/specs/16-marketing.md). Mock send only: no SMS, email or WhatsApp provider.

CREATE TABLE mkt_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  channel text NOT NULL,
  segment_note text NOT NULL DEFAULT '',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  audience_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  suppressed_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  sent_by uuid,
  is_sample boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT mkt_campaigns_channel_chk CHECK (channel IN ('sms', 'email', 'whatsapp')),
  CONSTRAINT mkt_campaigns_status_chk CHECK (status IN ('draft', 'sent', 'cancelled')),
  CONSTRAINT mkt_campaigns_counts_chk CHECK (audience_count >= 0 AND sent_count >= 0 AND suppressed_count >= 0)
);

CREATE INDEX mkt_campaigns_list_idx ON mkt_campaigns (tenant_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mkt_campaigns']
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
