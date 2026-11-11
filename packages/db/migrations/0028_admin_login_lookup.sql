-- P2-3: tenant and anonymous logins must not take a platform-pool connection.
-- hos_app reads one platform admin by email through this definer. Password checks and
-- session writes for a confirmed platform admin still run on the platform login.

CREATE OR REPLACE FUNCTION hos_admin_login_lookup(p_email text)
RETURNS TABLE (
  id uuid,
  email text,
  name text,
  password_hash text,
  totp_secret text,
  totp_enabled boolean,
  status text
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT a.id, a.email, a.name, a.password_hash, a.totp_secret, a.totp_enabled, a.status
  FROM platform_admins a
  WHERE lower(a.email) = lower(p_email)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION hos_admin_login_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hos_admin_login_lookup(text) TO hos_app;
