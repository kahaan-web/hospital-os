-- Platform scope is the login, not a GUC the app role can set.
-- hos_scope() returns 'platform' only when the session user is hos_platform or hos_migrator.
-- A hos_app session that claims platform is downgraded to 'none' (least privilege, not an error).
-- session_user is the authenticated login: it is unchanged by SET ROLE and inside SECURITY DEFINER.
-- hos_migrator stays allowed so seeds can satisfy tenants_guard; the owner already has _owner policies.

CREATE OR REPLACE FUNCTION hos_scope() RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN coalesce(nullif(current_setting('app.scope', true), ''), 'none') <> 'platform'
      THEN coalesce(nullif(current_setting('app.scope', true), ''), 'none')
    WHEN session_user IN ('hos_platform', 'hos_migrator') THEN 'platform'
    ELSE 'none'
  END
$$;
