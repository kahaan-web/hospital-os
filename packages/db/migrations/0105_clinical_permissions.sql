-- Permissions and role grants from Phase B §1.3. Idempotent: a fresh database has no roles yet
-- (the seed inserts them); a Phase A database already has the system roles.

INSERT INTO permissions (key, description) VALUES
  ('patients.view', 'Look up patients and read the registration'),
  ('clinical.view', 'Read encounters, notes and orders'),
  ('lab.verify', 'Verify laboratory results'),
  ('portal.self', 'Use the patient portal for the linked patient')
ON CONFLICT (key) DO NOTHING;

INSERT INTO roles (tenant_id, key, name, description, is_system, sort_order)
SELECT NULL, 'patient', 'Patient',
  'Signs in to the patient portal for their own record. Hidden from the staff invite list.',
  true, 9
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE tenant_id IS NULL AND key = 'patient');

INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, g.perm
FROM roles r
JOIN (VALUES
  ('tenant_admin', 'patients.view'),
  ('tenant_admin', 'clinical.view'),
  ('tenant_admin', 'lab.verify'),
  ('tenant_admin', 'portal.self'),
  ('location_admin', 'patients.view'),
  ('location_admin', 'clinical.view'),
  ('location_admin', 'lab.verify'),
  ('front_desk', 'patients.view'),
  ('doctor', 'patients.view'),
  ('doctor', 'clinical.view'),
  ('nurse', 'patients.view'),
  ('nurse', 'clinical.view'),
  ('cashier', 'patients.view'),
  ('pharmacist', 'patients.view'),
  ('lab_tech', 'patients.view'),
  ('lab_tech', 'lab.verify'),
  ('patient', 'portal.self')
) AS g(role_key, perm) ON g.role_key = r.key AND r.tenant_id IS NULL
ON CONFLICT DO NOTHING;
