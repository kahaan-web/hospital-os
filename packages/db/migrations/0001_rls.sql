-- Hand-written: roles are created by the migrate runner (DATABASE_ADMIN_URL). This file runs as hos_migrator.
-- Least privilege, forced RLS, append-only hash-chained audit, and the few SECURITY DEFINER functions that
-- answer a cross-tenant question without a BYPASSRLS role.
--
-- Limit (also stated in docs/SECURITY_AND_COMPLIANCE.md): hos_app sets its own session GUCs, so RLS stops
-- application bugs. It does not stop a compromised API process that can set app.tenant_id itself.

-- ---------------------------------------------------------------------------------------------------------------------
-- sha256. Postgres 16 has no built-in sha256(); pgcrypto (created by the superuser during bootstrap) provides digest.
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sha256(data bytea) RETURNS bytea
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$ SELECT digest(data, 'sha256') $$;

REVOKE ALL ON FUNCTION sha256(bytea) FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------------------------------
-- Session helpers
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hos_tenant_id() RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION hos_scope() RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$ SELECT coalesce(nullif(current_setting('app.scope', true), ''), 'none') $$;

REVOKE ALL ON FUNCTION hos_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hos_tenant_id() TO hos_app;
GRANT EXECUTE ON FUNCTION hos_scope() TO hos_app;

-- ---------------------------------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------------------------------

-- G: global catalogue. Readable always; writes only in platform scope.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'plans', 'modules', 'module_features', 'plan_module_features', 'prices',
    'privacy_notices', 'permissions', 'platform_settings'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', t);
    EXECUTE format('CREATE POLICY %I ON %I TO hos_migrator USING (true) WITH CHECK (true)', t || '_owner', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO hos_app USING (true)', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO hos_app USING (hos_scope() = ''platform'') WITH CHECK (hos_scope() = ''platform'')',
      t || '_admin', t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO hos_app', t);
  END LOOP;
END $$;

-- PA: platform admins. Column-limited updates.
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins FORCE ROW LEVEL SECURITY;
REVOKE ALL ON platform_admins FROM PUBLIC;
CREATE POLICY platform_admins_owner ON platform_admins TO hos_migrator USING (true) WITH CHECK (true);
CREATE POLICY platform_admins_admin ON platform_admins FOR ALL TO hos_app
  USING (hos_scope() = 'platform') WITH CHECK (hos_scope() = 'platform');
GRANT SELECT ON platform_admins TO hos_app;
GRANT UPDATE (name, password_hash, totp_secret, totp_enabled, last_login_at, status) ON platform_admins TO hos_app;

-- PI: no grants. Definer functions only. RLS is still forced so a future grant cannot leak rows.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sessions', 'invoice_sequences']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', t);
    EXECUTE format('CREATE POLICY %I ON %I TO hos_migrator USING (true) WITH CHECK (true)', t || '_owner', t);
  END LOOP;
END $$;

-- T: tenant-owned, keyed by tenant_id. Full CRUD on own rows.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'locations', 'departments', 'doctors', 'users', 'user_location_roles', 'invitations', 'otp_challenges',
    'subscriptions', 'subscription_items', 'orders', 'payments', 'invoices', 'invoice_lines',
    'consents', 'data_principal_requests', 'checklist_items', 'outbox_messages', 'idempotency_keys'
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
  END LOOP;
END $$;

-- user_location_roles: a role assignment must reference a role the caller can see.
DROP POLICY user_location_roles_tenant ON user_location_roles;
CREATE POLICY user_location_roles_tenant ON user_location_roles TO hos_app
  USING (tenant_id = (SELECT hos_tenant_id()))
  WITH CHECK (
    tenant_id = (SELECT hos_tenant_id())
    AND EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id)
  );

-- tenants: the tenant key is id, not tenant_id. No DELETE.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
REVOKE ALL ON tenants FROM PUBLIC;
CREATE POLICY tenants_owner ON tenants TO hos_migrator USING (true) WITH CHECK (true);
CREATE POLICY tenants_tenant ON tenants TO hos_app
  USING (id = (SELECT hos_tenant_id()))
  WITH CHECK (id = (SELECT hos_tenant_id()));
GRANT SELECT, INSERT, UPDATE ON tenants TO hos_app;

-- G*: roles. System rows (tenant_id NULL) are readable by every tenant; only platform scope writes them.
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON roles FROM PUBLIC;
CREATE POLICY roles_owner ON roles TO hos_migrator USING (true) WITH CHECK (true);
CREATE POLICY roles_read ON roles FOR SELECT TO hos_app
  USING (tenant_id IS NULL OR tenant_id = (SELECT hos_tenant_id()));
CREATE POLICY roles_write ON roles FOR ALL TO hos_app
  USING (
    (tenant_id IS NULL AND hos_scope() = 'platform')
    OR (tenant_id = (SELECT hos_tenant_id()) AND NOT is_system)
  )
  WITH CHECK (
    (tenant_id IS NULL AND hos_scope() = 'platform')
    OR (tenant_id = (SELECT hos_tenant_id()) AND NOT is_system)
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON roles TO hos_app;

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON role_permissions FROM PUBLIC;
CREATE POLICY role_permissions_owner ON role_permissions TO hos_migrator USING (true) WITH CHECK (true);
CREATE POLICY role_permissions_read ON role_permissions FOR SELECT TO hos_app
  USING (EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id));
CREATE POLICY role_permissions_write ON role_permissions FOR ALL TO hos_app
  USING (
    EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id = role_id
        AND (
          (r.tenant_id IS NULL AND hos_scope() = 'platform')
          OR (r.tenant_id = (SELECT hos_tenant_id()) AND NOT r.is_system)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id = role_id
        AND (
          (r.tenant_id IS NULL AND hos_scope() = 'platform')
          OR (r.tenant_id = (SELECT hos_tenant_id()) AND NOT r.is_system)
        )
    )
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON role_permissions TO hos_app;

-- T-ro: tenants read their overrides; only platform scope (on that tenant) writes them.
ALTER TABLE tenant_entitlement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_entitlement_overrides FORCE ROW LEVEL SECURITY;
REVOKE ALL ON tenant_entitlement_overrides FROM PUBLIC;
CREATE POLICY tenant_entitlement_overrides_owner ON tenant_entitlement_overrides TO hos_migrator
  USING (true) WITH CHECK (true);
CREATE POLICY tenant_entitlement_overrides_read ON tenant_entitlement_overrides FOR SELECT TO hos_app
  USING (tenant_id = (SELECT hos_tenant_id()));
CREATE POLICY tenant_entitlement_overrides_admin ON tenant_entitlement_overrides FOR ALL TO hos_app
  USING (tenant_id = (SELECT hos_tenant_id()) AND hos_scope() = 'platform')
  WITH CHECK (tenant_id = (SELECT hos_tenant_id()) AND hos_scope() = 'platform');
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_entitlement_overrides TO hos_app;

-- A: audit. SELECT + INSERT only. Platform chain has tenant_id NULL.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
REVOKE ALL ON audit_log FROM PUBLIC;
CREATE POLICY audit_log_owner ON audit_log TO hos_migrator USING (true) WITH CHECK (true);
CREATE POLICY audit_log_select ON audit_log FOR SELECT TO hos_app
  USING (tenant_id = (SELECT hos_tenant_id()) OR (tenant_id IS NULL AND hos_scope() = 'platform'));
CREATE POLICY audit_log_insert ON audit_log FOR INSERT TO hos_app
  WITH CHECK (tenant_id = (SELECT hos_tenant_id()) OR (tenant_id IS NULL AND hos_scope() = 'platform'));
GRANT SELECT, INSERT ON audit_log TO hos_app;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO hos_app;

-- ---------------------------------------------------------------------------------------------------------------------
-- updated_at, tenant guard, audit chain
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hos_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_settings', 'plans', 'modules', 'prices', 'tenants', 'subscriptions', 'payments', 'data_principal_requests'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION hos_touch_updated_at()',
      t || '_touch', t
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION tenants_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND (NEW.status = 'suspended' OR OLD.status = 'suspended')
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
     OR NEW.sandbox IS DISTINCT FROM OLD.sandbox
  THEN
    IF hos_scope() IS DISTINCT FROM 'platform' THEN
      RAISE EXCEPTION 'changing tenant suspension or sandbox requires platform scope' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tenants_guard BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION tenants_guard();

CREATE OR REPLACE FUNCTION audit_log_reject() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = '42501';
END $$;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_reject();

-- Canonical JSON for the hash chain. jsonb text is key-sorted; id is excluded. Deterministic.
CREATE OR REPLACE FUNCTION hos_audit_canonical(a audit_log) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_array(
    a.chain_key, a.seq, a.prev_hash, a.tenant_id, a.location_id,
    a.actor_type, a.actor_id, a.actor_label, a.ip, a.user_agent,
    a.action, a.entity_type, a.entity_id, a.before, a.after,
    to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text
$$;

REVOKE ALL ON FUNCTION hos_audit_canonical(audit_log) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hos_audit_canonical(audit_log) TO hos_app;

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
  NEW.hash := encode(sha256(convert_to(hos_audit_canonical(NEW), 'UTF8')), 'hex');
  RETURN NEW;
END $$;

CREATE TRIGGER audit_log_chain BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_chain();

REVOKE ALL ON FUNCTION audit_log_chain() FROM PUBLIC;
REVOKE ALL ON FUNCTION audit_log_reject() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenants_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_touch_updated_at() FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------------------------------
-- Definer functions. Owner is hos_migrator (FORCE RLS still applies, and the owner policy is USING (true)).
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hos_session_resolve(p_token_hash text)
RETURNS TABLE (
  id uuid,
  kind text,
  user_id uuid,
  platform_admin_id uuid,
  tenant_id uuid,
  location_id uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  s sessions%ROWTYPE;
  idle interval;
BEGIN
  SELECT * INTO s FROM sessions WHERE token_hash = p_token_hash;
  IF NOT FOUND OR s.revoked_at IS NOT NULL OR s.expires_at <= now() THEN
    RETURN;
  END IF;
  idle := CASE WHEN s.kind = 'platform' THEN interval '30 minutes' ELSE interval '2 hours' END;
  IF s.last_seen_at < now() - idle THEN
    RETURN;
  END IF;
  IF s.last_seen_at < now() - interval '60 seconds' THEN
    UPDATE sessions SET last_seen_at = now() WHERE sessions.id = s.id;
  END IF;
  id := s.id;
  kind := s.kind;
  user_id := s.user_id;
  platform_admin_id := s.platform_admin_id;
  tenant_id := s.tenant_id;
  location_id := s.location_id;
  expires_at := s.expires_at;
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION hos_session_create(
  p_token_hash text,
  p_kind text,
  p_user_id uuid,
  p_admin_id uuid,
  p_location_id uuid,
  p_ip text,
  p_ua text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
  v_tenant uuid;
  v_exp timestamptz;
BEGIN
  IF p_kind = 'tenant' THEN
    IF hos_scope() IS DISTINCT FROM 'tenant' THEN
      RAISE EXCEPTION 'tenant session requires tenant scope' USING ERRCODE = '42501';
    END IF;
    v_tenant := hos_tenant_id();
    IF v_tenant IS NULL THEN
      RAISE EXCEPTION 'tenant session requires app.tenant_id' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM users u WHERE u.id = p_user_id AND u.tenant_id = v_tenant AND u.status = 'active'
    ) THEN
      RAISE EXCEPTION 'user is not active in this tenant' USING ERRCODE = '42501';
    END IF;
    v_exp := now() + interval '12 hours';
    INSERT INTO sessions (token_hash, kind, user_id, platform_admin_id, tenant_id, location_id, ip, user_agent, expires_at)
    VALUES (p_token_hash, 'tenant', p_user_id, NULL, v_tenant, p_location_id, p_ip, p_ua, v_exp)
    RETURNING sessions.id INTO v_id;
  ELSIF p_kind = 'platform' THEN
    IF hos_scope() IS DISTINCT FROM 'platform' THEN
      RAISE EXCEPTION 'platform session requires platform scope' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM platform_admins a WHERE a.id = p_admin_id AND a.status = 'active') THEN
      RAISE EXCEPTION 'platform admin is not active' USING ERRCODE = '42501';
    END IF;
    v_exp := now() + interval '8 hours';
    INSERT INTO sessions (token_hash, kind, user_id, platform_admin_id, tenant_id, location_id, ip, user_agent, expires_at)
    VALUES (p_token_hash, 'platform', NULL, p_admin_id, NULL, NULL, p_ip, p_ua, v_exp)
    RETURNING sessions.id INTO v_id;
  ELSE
    RAISE EXCEPTION 'unknown session kind' USING ERRCODE = '22023';
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION hos_session_set_location(p_token_hash text, p_location_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF hos_scope() IS DISTINCT FROM 'tenant' OR hos_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'location switch requires tenant scope' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM locations l WHERE l.id = p_location_id AND l.tenant_id = hos_tenant_id()) THEN
    RAISE EXCEPTION 'location is not in this tenant' USING ERRCODE = '42501';
  END IF;
  UPDATE sessions
  SET location_id = p_location_id
  WHERE token_hash = p_token_hash AND kind = 'tenant' AND tenant_id = hos_tenant_id() AND revoked_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION hos_session_revoke(p_token_hash text) RETURNS void
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE sessions SET revoked_at = now() WHERE token_hash = p_token_hash AND revoked_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION hos_session_revoke_user(p_user_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF hos_scope() IS DISTINCT FROM 'tenant' OR hos_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'revoking a user requires tenant scope' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id AND u.tenant_id = hos_tenant_id()) THEN
    RAISE EXCEPTION 'user is not in this tenant' USING ERRCODE = '42501';
  END IF;
  UPDATE sessions SET revoked_at = now()
  WHERE user_id = p_user_id AND tenant_id = hos_tenant_id() AND revoked_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION hos_login_lookup(p_email text)
RETURNS TABLE (tenant_id uuid, user_id uuid)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.tenant_id, u.id FROM users u WHERE lower(u.email) = lower(p_email) LIMIT 1
$$;

CREATE OR REPLACE FUNCTION hos_otp_tenant(p_challenge_id uuid) RETURNS uuid
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT c.tenant_id FROM otp_challenges c
  WHERE c.id = p_challenge_id AND c.consumed_at IS NULL AND c.expires_at > now()
$$;

CREATE OR REPLACE FUNCTION hos_invite_tenant(p_token_hash text) RETURNS uuid
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT i.tenant_id FROM invitations i
  WHERE i.token_hash = p_token_hash AND i.status = 'pending' AND i.expires_at > now()
$$;

CREATE OR REPLACE FUNCTION hos_admin_tenant_list(p_q text, p_status text, p_lim int, p_off int)
RETURNS TABLE (
  id uuid,
  display_name text,
  legal_name text,
  status text,
  facility_type text,
  plan_name text,
  cycle text,
  location_count int,
  user_count int,
  created_at timestamptz,
  owner_email text,
  total_count bigint
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_q text;
  v_lim int := least(coalesce(p_lim, 25), 100);
  v_off int := greatest(coalesce(p_off, 0), 0);
BEGIN
  IF hos_scope() IS DISTINCT FROM 'platform' OR hos_tenant_id() IS NOT NULL THEN
    RAISE EXCEPTION 'tenant list requires platform scope' USING ERRCODE = '42501';
  END IF;
  v_q := replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_');
  RETURN QUERY
  SELECT t.id, t.display_name, t.legal_name, t.status, t.facility_type,
    p.name, s.billing_cycle,
    (SELECT count(*)::int FROM locations l WHERE l.tenant_id = t.id),
    (SELECT count(*)::int FROM users u WHERE u.tenant_id = t.id),
    t.created_at,
    (
      SELECT u.email FROM users u
      WHERE u.tenant_id = t.id
      ORDER BY (u.designation = 'owner') DESC, u.created_at
      LIMIT 1
    ),
    count(*) OVER ()
  FROM tenants t
  LEFT JOIN subscriptions s ON s.tenant_id = t.id
  LEFT JOIN plans p ON p.id = s.plan_id
  WHERE (
    v_q = ''
    OR t.display_name ILIKE '%' || v_q || '%' ESCAPE '\'
    OR t.legal_name ILIKE '%' || v_q || '%' ESCAPE '\'
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.tenant_id = t.id AND u.email ILIKE '%' || v_q || '%' ESCAPE '\'
    )
  )
  AND (p_status IS NULL OR p_status = '' OR t.status = p_status)
  ORDER BY t.created_at DESC
  LIMIT v_lim OFFSET v_off;
END $$;

CREATE OR REPLACE FUNCTION hos_admin_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mrr bigint;
  v_recent jsonb;
  v_mix jsonb;
BEGIN
  IF hos_scope() IS DISTINCT FROM 'platform' OR hos_tenant_id() IS NOT NULL THEN
    RAISE EXCEPTION 'admin overview requires platform scope' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(sum(
    CASE s.billing_cycle
      WHEN 'annual' THEN (si.unit_amount_paise * si.quantity) / 12
      ELSE si.unit_amount_paise * si.quantity
    END
  ), 0)::bigint INTO v_mrr
  FROM subscriptions s
  JOIN tenants t ON t.id = s.tenant_id AND t.status = 'active'
  JOIN subscription_items si ON si.subscription_id = s.id AND si.status = 'active'
  WHERE s.status = 'active';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'planId', p.id,
    'planName', p.name,
    'tenants', coalesce(c.n, 0)
  ) ORDER BY p.sort_order), '[]'::jsonb) INTO v_mix
  FROM plans p
  LEFT JOIN (
    SELECT s.plan_id, count(*)::int AS n
    FROM subscriptions s
    JOIN tenants t ON t.id = s.tenant_id AND t.status = 'active'
    WHERE s.status = 'active'
    GROUP BY s.plan_id
  ) c ON c.plan_id = p.id
  WHERE p.status <> 'archived';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'displayName', r.display_name,
    'legalName', r.legal_name,
    'status', r.status,
    'facilityType', r.facility_type,
    'planName', r.plan_name,
    'cycle', r.cycle,
    'locationCount', r.location_count,
    'userCount', r.user_count,
    'createdAt', r.created_at,
    'ownerEmail', r.owner_email
  )), '[]'::jsonb) INTO v_recent
  FROM hos_admin_tenant_list(NULL, NULL, 5, 0) r;

  RETURN jsonb_build_object(
    'tenants', jsonb_build_object(
      'total', (SELECT count(*) FROM tenants),
      'active', (SELECT count(*) FROM tenants WHERE status = 'active'),
      'onboarding', (SELECT count(*) FROM tenants WHERE status = 'onboarding'),
      'suspended', (SELECT count(*) FROM tenants WHERE status = 'suspended')
    ),
    'mrrPaise', v_mrr,
    'invoicedPaise', (SELECT coalesce(sum(total_paise), 0) FROM invoices),
    'planMix', v_mix,
    'recentTenants', v_recent,
    'catalogue', jsonb_build_object(
      'modules', (SELECT count(*) FROM modules),
      'available', (SELECT count(*) FROM modules WHERE status = 'available'),
      'comingSoon', (SELECT count(*) FROM modules WHERE status = 'coming_soon'),
      'hidden', (SELECT count(*) FROM modules WHERE status = 'hidden'),
      'features', (SELECT count(*) FROM module_features)
    )
  );
END $$;

-- One supplier-wide series per Indian financial year. fy is "2026-27"; the printed number is HOS/2627/000001 (≤ 16).
CREATE OR REPLACE FUNCTION hos_next_invoice_number(issue_date timestamptz)
RETURNS TABLE (fy text, number text)
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  v_local timestamp;
  v_y int;
  v_m int;
  v_start int;
  v_fy text;
  v_prefix text;
  v_seq int;
  v_compact text;
  v_number text;
BEGIN
  IF hos_scope() NOT IN ('tenant', 'platform') THEN
    RAISE EXCEPTION 'invoice numbering requires tenant or platform scope' USING ERRCODE = '42501';
  END IF;
  v_local := timezone('Asia/Kolkata', issue_date);
  v_y := extract(year FROM v_local)::int;
  v_m := extract(month FROM v_local)::int;
  IF v_m >= 4 THEN v_start := v_y; ELSE v_start := v_y - 1; END IF;
  v_fy := v_start::text || '-' || lpad(((v_start + 1) % 100)::text, 2, '0');
  v_compact := lpad((v_start % 100)::text, 2, '0') || lpad(((v_start + 1) % 100)::text, 2, '0');
  SELECT s.invoice_prefix INTO v_prefix FROM platform_settings s WHERE s.id = 1;
  IF v_prefix IS NULL OR v_prefix = '' THEN v_prefix := 'HOS'; END IF;
  INSERT INTO invoice_sequences AS seq (fy, last_no) VALUES (v_fy, 1)
  ON CONFLICT (fy) DO UPDATE SET last_no = seq.last_no + 1
  RETURNING seq.last_no INTO v_seq;
  v_number := v_prefix || '/' || v_compact || '/' || lpad(v_seq::text, 6, '0');
  IF char_length(v_number) > 16 THEN
    RAISE EXCEPTION 'invoice number % exceeds 16 characters', v_number USING ERRCODE = '22023';
  END IF;
  fy := v_fy;
  number := v_number;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION hos_session_resolve(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_session_create(text, text, uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_session_set_location(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_session_revoke(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_session_revoke_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_login_lookup(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_otp_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_invite_tenant(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_admin_tenant_list(text, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_admin_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_next_invoice_number(timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION hos_session_resolve(text) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_session_create(text, text, uuid, uuid, uuid, text, text) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_session_set_location(text, uuid) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_session_revoke(text) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_session_revoke_user(uuid) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_login_lookup(text) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_otp_tenant(uuid) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_invite_tenant(text) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_admin_tenant_list(text, text, int, int) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_admin_overview() TO hos_app;
GRANT EXECUTE ON FUNCTION hos_next_invoice_number(timestamptz) TO hos_app;
