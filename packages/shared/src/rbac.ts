// Tenant RBAC: system roles and permission keys. Platform roles (App Admin) are separate and never mix with these.

export const PERMISSIONS = {
  'tenant.manage': 'Edit facility profile, locations and go-live checklist',
  'billing.view': 'See the subscription, invoices and payments',
  'billing.manage': 'Change plan, buy add-on modules and pay',
  'users.view': 'See staff accounts',
  'users.manage': 'Invite staff and change roles',
  'audit.view': 'Read the audit trail',
  'privacy.manage': 'Handle DPDP data-principal requests',
  'patients.manage': 'Register and edit patients',
  'appointments.manage': 'Book, reschedule and cancel appointments',
  'opd.manage': 'Register OPD visits',
  'billing.op.post': 'Post OP vouchers, deposits and settlements',
  'billing.op.refund': 'Approve OP refunds and concessions',
  'adt.manage': 'Admit, transfer and discharge patients',
  'billing.ip.manage': 'Post IP charges and prepare bills',
  'pharmacy.manage': 'Pharmacy and stores transactions',
  'lab.manage': 'Lab samples and results',
  'nursing.manage': 'Nurse station orders and vitals',
  'clinical.order': 'Clinical orders and notes (CPOE)',
  'accounts.manage': 'Doctor accounting and finance reports',
  'reports.view': 'Run registers and MIS reports',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export type RoleKey =
  | 'tenant_admin'
  | 'location_admin'
  | 'front_desk'
  | 'doctor'
  | 'nurse'
  | 'cashier'
  | 'pharmacist'
  | 'lab_tech'
  | 'accounts';

export interface RoleDef {
  key: RoleKey;
  name: string;
  description: string;
  permissions: readonly PermissionKey[];
}

export const SYSTEM_ROLES: readonly RoleDef[] = [
  {
    key: 'tenant_admin',
    name: 'Tenant Admin',
    description: 'Owner or manager. Full control of the hospital account, billing and staff across all locations.',
    permissions: PERMISSION_KEYS,
  },
  {
    key: 'location_admin',
    name: 'Location Admin',
    description: 'Runs one or more locations: staff, masters and every module at those locations.',
    permissions: PERMISSION_KEYS.filter((p) => !['billing.manage', 'tenant.manage', 'privacy.manage'].includes(p)),
  },
  {
    key: 'front_desk',
    name: 'Front Desk',
    description: 'Registration, appointments and OPD visits at the counter.',
    permissions: ['patients.manage', 'appointments.manage', 'opd.manage', 'reports.view'],
  },
  {
    key: 'doctor',
    name: 'Doctor',
    description: 'Appointment diary, clinical orders and notes.',
    permissions: ['appointments.manage', 'clinical.order', 'reports.view'],
  },
  {
    key: 'nurse',
    name: 'Nurse',
    description: 'Nurse station: orders, vitals and medicine administration.',
    permissions: ['nursing.manage', 'adt.manage'],
  },
  {
    key: 'cashier',
    name: 'Cashier / Billing',
    description: 'OP and IP billing, deposits, refunds and settlements.',
    permissions: ['billing.op.post', 'billing.op.refund', 'billing.ip.manage', 'reports.view'],
  },
  {
    key: 'pharmacist',
    name: 'Pharmacist',
    description: 'Pharmacy and stores transactions and stock reports.',
    permissions: ['pharmacy.manage', 'reports.view'],
  },
  {
    key: 'lab_tech',
    name: 'Lab Tech',
    description: 'Sample collection and result entry.',
    permissions: ['lab.manage', 'reports.view'],
  },
  {
    key: 'accounts',
    name: 'Accounts',
    description: 'Doctor accounting, revenue reports and subscription invoices.',
    permissions: ['accounts.manage', 'billing.view', 'reports.view'],
  },
];

export interface RoleAssignment {
  roleKey: string;
  /** null = all locations. */
  locationId: string | null;
  permissions: readonly string[];
}

/** Permissions a user holds at a location (assignments with locationId null apply everywhere). */
export function permissionsAt(assignments: readonly RoleAssignment[], locationId: string | null): Set<string> {
  const out = new Set<string>();
  for (const a of assignments) {
    if (a.locationId === null || a.locationId === locationId) for (const p of a.permissions) out.add(p);
  }
  return out;
}

export function hasPermission(assignments: readonly RoleAssignment[], locationId: string | null, permission: string): boolean {
  return permissionsAt(assignments, locationId).has(permission);
}
