import { describe, expect, it } from 'vitest';
import { PERMISSION_KEYS, SYSTEM_ROLES, hasPermission, permissionsAt, type PermissionKey, type RoleKey } from './rbac';

const ALL_EXCEPT = (...excluded: PermissionKey[]): PermissionKey[] => PERMISSION_KEYS.filter((p) => !excluded.includes(p));

const EXPECTED: Record<RoleKey, readonly PermissionKey[]> = {
  tenant_admin: PERMISSION_KEYS,
  location_admin: ALL_EXCEPT('billing.manage', 'tenant.manage', 'privacy.manage'),
  front_desk: ['patients.manage', 'appointments.manage', 'opd.manage', 'reports.view'],
  doctor: ['appointments.manage', 'clinical.order', 'reports.view'],
  nurse: ['nursing.manage', 'adt.manage'],
  cashier: ['billing.op.post', 'billing.op.refund', 'billing.ip.manage', 'reports.view'],
  pharmacist: ['pharmacy.manage', 'reports.view'],
  lab_tech: ['lab.manage', 'reports.view'],
  accounts: ['accounts.manage', 'billing.view', 'reports.view'],
};

describe('permissionsAt', () => {
  const mum = 'loc-mumbai';
  const indore = 'loc-indore';
  const assignments = [
    { roleKey: 'cashier', locationId: mum, permissions: ['billing.op.post', 'reports.view'] },
    { roleKey: 'doctor', locationId: null, permissions: ['clinical.order'] },
    { roleKey: 'nurse', locationId: indore, permissions: ['nursing.manage'] },
  ] as const;

  it('unions the location role with roles granted at every location', () => {
    expect(permissionsAt(assignments, mum)).toEqual(new Set(['billing.op.post', 'reports.view', 'clinical.order']));
    expect(permissionsAt(assignments, indore)).toEqual(new Set(['nursing.manage', 'clinical.order']));
    expect(hasPermission(assignments, mum, 'billing.op.post')).toBe(true);
    expect(hasPermission(assignments, mum, 'nursing.manage')).toBe(false);
  });

  it('gives an unknown location, and a session with no location, only the all-location roles', () => {
    expect(permissionsAt(assignments, 'loc-jaipur')).toEqual(new Set(['clinical.order']));
    expect(permissionsAt(assignments, null)).toEqual(new Set(['clinical.order']));
    expect(permissionsAt([], mum).size).toBe(0);
  });
});

describe('system roles', () => {
  it('defines the nine tenant roles and no others', () => {
    expect(SYSTEM_ROLES.map((r) => r.key)).toEqual([
      'tenant_admin',
      'location_admin',
      'front_desk',
      'doctor',
      'nurse',
      'cashier',
      'pharmacist',
      'lab_tech',
      'accounts',
    ]);
    expect(new Set(SYSTEM_ROLES.map((r) => r.key)).size).toBe(SYSTEM_ROLES.length);
  });

  it('grants each role exactly its permission set, per location when assigned', () => {
    for (const role of SYSTEM_ROLES) {
      expect([...role.permissions]).toEqual(EXPECTED[role.key]);
      const atMumbai = permissionsAt([{ roleKey: role.key, locationId: 'loc-mumbai', permissions: role.permissions }], 'loc-mumbai');
      expect(atMumbai).toEqual(new Set(role.permissions));
      const elsewhere = permissionsAt([{ roleKey: role.key, locationId: 'loc-mumbai', permissions: role.permissions }], 'loc-indore');
      expect(elsewhere.size).toBe(0);
    }
    expect(EXPECTED.tenant_admin).toEqual(PERMISSION_KEYS);
    expect(EXPECTED.location_admin).not.toContain('billing.manage');
    expect(EXPECTED.location_admin).toContain('users.manage');
  });
});
