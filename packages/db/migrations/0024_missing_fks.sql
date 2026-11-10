-- U4 / P1-8. Composite FKs so a row cannot point at another tenant's user or location.
-- FK checks ignore RLS. MATCH SIMPLE: if any referencing column is NULL the check is skipped,
-- so platform sessions (tenant_id NULL) stay valid and a tenant session may omit location_id.
--
-- Postgres 15+ can SET NULL a column list. That keeps tenant_id when a user or location is
-- deleted. A bare ON DELETE SET NULL would also null tenant_id and then fail NOT NULL or
-- sessions_kind_chk. Below Postgres 15 those FKs are ON DELETE RESTRICT.
--
-- sessions.user_id cannot be nulled on a tenant session (sessions_kind_chk). Cross-tenant
-- session users are deleted. Nullable actor and location values are set to NULL.

UPDATE data_principal_requests AS d
   SET created_by = NULL
 WHERE created_by IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM users AS u WHERE u.tenant_id = d.tenant_id AND u.id = d.created_by
   );

UPDATE checklist_items AS c
   SET done_by = NULL
 WHERE done_by IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM users AS u WHERE u.tenant_id = c.tenant_id AND u.id = c.done_by
   );

UPDATE invitations AS i
   SET invited_by = NULL
 WHERE invited_by IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM users AS u WHERE u.tenant_id = i.tenant_id AND u.id = i.invited_by
   );

UPDATE sessions AS s
   SET location_id = NULL
 WHERE location_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM locations AS l WHERE l.tenant_id = s.tenant_id AND l.id = s.location_id
   );

DELETE FROM sessions AS s
 WHERE user_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM users AS u WHERE u.tenant_id = s.tenant_id AND u.id = s.user_id
   );

DO $$
DECLARE
  col_set_null boolean := current_setting('server_version_num')::int >= 150000;
  location_delete text;
  created_by_delete text;
  done_by_delete text;
  invited_by_delete text;
BEGIN
  IF col_set_null THEN
    location_delete := 'ON DELETE SET NULL (location_id)';
    created_by_delete := 'ON DELETE SET NULL (created_by)';
    done_by_delete := 'ON DELETE SET NULL (done_by)';
    invited_by_delete := 'ON DELETE SET NULL (invited_by)';
  ELSE
    location_delete := 'ON DELETE RESTRICT';
    created_by_delete := 'ON DELETE RESTRICT';
    done_by_delete := 'ON DELETE RESTRICT';
    invited_by_delete := 'ON DELETE RESTRICT';
  END IF;

  EXECUTE 'ALTER TABLE sessions DROP CONSTRAINT sessions_user_id_users_id_fk';
  EXECUTE 'ALTER TABLE sessions DROP CONSTRAINT sessions_location_id_locations_id_fk';

  EXECUTE 'ALTER TABLE sessions ADD CONSTRAINT sessions_user_fk '
    || 'FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) '
    || 'MATCH SIMPLE ON DELETE NO ACTION ON UPDATE NO ACTION';

  EXECUTE 'ALTER TABLE sessions ADD CONSTRAINT sessions_location_fk '
    || 'FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id) '
    || 'MATCH SIMPLE ' || location_delete || ' ON UPDATE NO ACTION';

  EXECUTE 'ALTER TABLE data_principal_requests ADD CONSTRAINT data_principal_requests_created_by_fk '
    || 'FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id) '
    || 'MATCH SIMPLE ' || created_by_delete || ' ON UPDATE NO ACTION';

  EXECUTE 'ALTER TABLE checklist_items ADD CONSTRAINT checklist_items_done_by_fk '
    || 'FOREIGN KEY (tenant_id, done_by) REFERENCES users (tenant_id, id) '
    || 'MATCH SIMPLE ' || done_by_delete || ' ON UPDATE NO ACTION';

  EXECUTE 'ALTER TABLE invitations ADD CONSTRAINT invitations_invited_by_fk '
    || 'FOREIGN KEY (tenant_id, invited_by) REFERENCES users (tenant_id, id) '
    || 'MATCH SIMPLE ' || invited_by_delete || ' ON UPDATE NO ACTION';
END $$;
