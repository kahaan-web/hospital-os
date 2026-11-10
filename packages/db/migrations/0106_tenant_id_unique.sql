-- Composite foreign keys need UNIQUE (tenant_id, id). Phase A already has it on the tables that
-- other rows point at. Add the pair everywhere else a tenant table has both columns, so the
-- coverage test stays green as later tasks add tables.

CREATE UNIQUE INDEX IF NOT EXISTS user_location_roles_tenant_id_uq ON user_location_roles (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_tenant_id_uq ON invitations (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS otp_challenges_tenant_id_uq ON otp_challenges (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_items_tenant_id_uq ON subscription_items (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_lines_tenant_id_uq ON invoice_lines (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_entitlement_overrides_tenant_id_uq ON tenant_entitlement_overrides (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS consents_tenant_id_uq ON consents (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS data_principal_requests_tenant_id_uq ON data_principal_requests (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS outbox_messages_tenant_id_uq ON outbox_messages (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS roles_tenant_id_uq ON roles (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_tenant_id_uq ON sessions (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS audit_log_tenant_id_uq ON audit_log (tenant_id, id);
