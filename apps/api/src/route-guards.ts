import type { FastifyRequest } from 'fastify';
import { ApiError } from './http';

/**
 * Baseline permission for shell routes any signed-in tenant user may call.
 * `requirePermission` treats this as already satisfied: `openTenant` has
 * rejected missing, pending and disabled users. Phase B module routes must
 * use a real permission from `PERMISSIONS` plus `module` / `feature`.
 */
export const AUTHENTICATED = 'authenticated';

/** A fixed key, or a route param such as `:moduleKey`. */
export type GuardKeySpec = string | { param: string };

/**
 * Declared on every tenant route. `openTenant` enforces the row and fails
 * closed when a tenant route has none, so a new handler cannot ship unguarded.
 * The route-inventory test compares this map to Fastify `printRoutes`.
 */
export interface TenantRouteGuard {
  /**
   * Null only for session identity (`/auth/me`) and session teardown (`/auth/logout`).
   * A string is one required permission (`authenticated` = any active tenant user).
   * An array means any one of those permissions is enough (`requireAnyPermission`).
   */
  permission: string | readonly string[] | null;
  /** One module, or any one of several (`requireAnyModule`). */
  module?: GuardKeySpec | readonly GuardKeySpec[];
  feature?: GuardKeySpec;
  /** Suspended hospitals may still read their own session and billing documents. */
  allowWhenSuspended?: boolean;
}

function entry(method: string, url: string, guard: TenantRouteGuard): [string, TenantRouteGuard] {
  return [`${method} ${url}`, guard];
}

const view = (method: string, url: string, permission: string, extra: Partial<TenantRouteGuard> = {}): [string, TenantRouteGuard] =>
  entry(method, url, { permission, ...extra });

const ENTRIES: [string, TenantRouteGuard][] = [
  entry('GET', '/api/v1/auth/me', { permission: null, allowWhenSuspended: true }),
  entry('POST', '/api/v1/auth/logout', { permission: null, allowWhenSuspended: true }),
  entry('POST', '/api/v1/auth/switch-location', { permission: AUTHENTICATED }),
  entry('POST', '/api/v1/auth/totp/setup', { permission: 'tenant.manage' }),
  entry('POST', '/api/v1/auth/totp/enable', { permission: 'tenant.manage' }),

  view('GET', '/api/v1/onboarding', 'tenant.manage'),
  view('GET', '/api/v1/onboarding/quote', 'tenant.manage'),
  view('PUT', '/api/v1/onboarding/facility', 'tenant.manage'),
  view('POST', '/api/v1/onboarding/logo', 'tenant.manage'),
  view('GET', '/api/v1/onboarding/logo', 'tenant.manage'),
  view('PUT', '/api/v1/onboarding/locations', 'tenant.manage'),
  view('PUT', '/api/v1/onboarding/plan', 'tenant.manage'),
  view('PUT', '/api/v1/onboarding/addons', 'tenant.manage'),
  view('POST', '/api/v1/onboarding/provision', 'tenant.manage'),

  view('POST', '/api/v1/billing/orders', 'billing.manage'),
  view('POST', '/api/v1/billing/orders/:orderId/pay', 'billing.manage'),
  view('POST', '/api/v1/billing/verify', 'billing.manage'),
  view('GET', '/api/v1/billing/subscription', 'billing.view', { allowWhenSuspended: true }),
  view('POST', '/api/v1/billing/change-quote', 'billing.manage'),
  view('POST', '/api/v1/billing/change-apply', 'billing.manage'),
  view('GET', '/api/v1/billing/invoices', 'billing.view', { allowWhenSuspended: true }),
  view('GET', '/api/v1/billing/invoices/:id', 'billing.view', { allowWhenSuspended: true }),
  view('GET', '/api/v1/billing/invoices/:id/pdf', 'billing.view', { allowWhenSuspended: true }),
  view('GET', '/api/v1/billing/invoices/:id/html', 'billing.view', { allowWhenSuspended: true }),

  view('GET', '/api/v1/tenant/dashboard', AUTHENTICATED),
  view('GET', '/api/v1/tenant/entitlements', AUTHENTICATED),
  view('GET', '/api/v1/tenant/locations', AUTHENTICATED),
  view('GET', '/api/v1/tenant/roles', 'users.view'),
  view('GET', '/api/v1/tenant/users', 'users.view'),
  view('POST', '/api/v1/tenant/users/invite', 'users.manage'),
  view('PATCH', '/api/v1/tenant/users/:id', 'users.manage'),
  view('PATCH', '/api/v1/tenant/checklist/:key', 'tenant.manage'),
  view('GET', '/api/v1/tenant/audit', 'audit.view'),
  view('GET', '/api/v1/tenant/audit/verify', 'audit.view'),
  view('GET', '/api/v1/tenant/privacy/requests', 'privacy.manage'),
  view('POST', '/api/v1/tenant/privacy/requests', 'privacy.manage'),
  view('PATCH', '/api/v1/tenant/privacy/requests/:id', 'privacy.manage'),
  view('GET', '/api/v1/tenant/consents', 'privacy.manage'),
  entry('GET', '/api/v1/tenant/m/:moduleKey', { permission: AUTHENTICATED, module: { param: 'moduleKey' } }),
  entry('GET', '/api/v1/tenant/m/:moduleKey/features/:featureKey', {
    permission: AUTHENTICATED,
    module: { param: 'moduleKey' },
    feature: { param: 'featureKey' },
  }),

  // B0 clinical routes. Arrays match the handler's requireAnyPermission / requireAnyModule.
  // Kind-specific order gates stay in the handler; the row is the union that can succeed.
  entry('GET', '/api/v1/tenant/clinical/patients', {
    permission: ['patients.view', 'patients.manage'],
    module: 'patient-registration',
  }),
  entry('GET', '/api/v1/tenant/clinical/patients/:id', {
    permission: ['patients.view', 'patients.manage'],
    module: 'patient-registration',
  }),
  entry('GET', '/api/v1/tenant/clinical/patients/:id/alerts', {
    permission: ['clinical.view', 'clinical.order', 'patients.manage', 'patients.view'],
    module: 'patient-registration',
  }),
  entry('POST', '/api/v1/tenant/clinical/patients/:id/alerts', {
    permission: ['clinical.order', 'patients.manage'],
    module: 'patient-registration',
  }),
  entry('GET', '/api/v1/tenant/clinical/encounters', {
    permission: ['clinical.view', 'opd.manage', 'adt.manage'],
    module: ['opd-visit', 'adt'],
  }),
  entry('GET', '/api/v1/tenant/clinical/encounters/:id', {
    permission: ['clinical.view', 'opd.manage', 'adt.manage'],
    module: ['opd-visit', 'adt'],
  }),
  entry('GET', '/api/v1/tenant/clinical/encounters/:id/orders', {
    permission: ['clinical.view', 'clinical.order', 'opd.manage', 'nursing.manage', 'adt.manage'],
    module: ['opd-visit', 'cpoe', 'lab', 'nurse-station', 'adt'],
  }),
  entry('POST', '/api/v1/tenant/clinical/encounters/:id/orders', {
    permission: ['clinical.order', 'opd.manage', 'nursing.manage'],
    module: ['lab', 'opd-visit', 'cpoe', 'nurse-station', 'adt'],
  }),
  entry('POST', '/api/v1/tenant/clinical/orders/:id/cancel', {
    permission: ['clinical.order', 'opd.manage', 'nursing.manage'],
    module: ['lab', 'opd-visit', 'cpoe', 'nurse-station', 'adt'],
  }),
  entry('GET', '/api/v1/tenant/clinical/encounters/:id/vitals', {
    permission: ['clinical.order', 'nursing.manage', 'opd.manage', 'clinical.view'],
    module: ['opd-visit', 'nurse-station', 'cpoe'],
  }),
  entry('POST', '/api/v1/tenant/clinical/encounters/:id/vitals', {
    permission: ['clinical.order', 'nursing.manage', 'opd.manage'],
    module: ['opd-visit', 'nurse-station', 'cpoe'],
  }),
  entry('POST', '/api/v1/tenant/clinical/vitals/:id/entered-in-error', {
    permission: ['clinical.order', 'nursing.manage', 'opd.manage'],
    module: ['opd-visit', 'nurse-station', 'cpoe'],
  }),
  entry('GET', '/api/v1/tenant/clinical/encounters/:id/notes', {
    permission: ['clinical.view', 'clinical.order', 'nursing.manage'],
    module: ['opd-visit', 'cpoe', 'nurse-station'],
  }),
  entry('POST', '/api/v1/tenant/clinical/encounters/:id/notes', {
    permission: ['clinical.order', 'nursing.manage'],
    module: ['opd-visit', 'cpoe', 'nurse-station'],
  }),
  entry('GET', '/api/v1/tenant/clinical/encounters/:id/charges', {
    permission: ['billing.op.post', 'billing.ip.manage'],
    module: 'op-billing',
  }),
  entry('GET', '/api/v1/tenant/clinical/codes', { permission: AUTHENTICATED }),
  entry('GET', '/api/v1/tenant/clinical/doctors', { permission: AUTHENTICATED }),
  entry('GET', '/api/v1/tenant/clinical/services', { permission: AUTHENTICATED }),

  // B1 registration. These routes were already mounted; the inventory test requires a guard row.
  entry('POST', '/api/v1/tenant/m/patient-registration/patients', { permission: 'patients.manage', module: 'patient-registration' }),
  entry('PATCH', '/api/v1/tenant/m/patient-registration/patients/:id', { permission: 'patients.manage', module: 'patient-registration' }),
  entry('POST', '/api/v1/tenant/m/patient-registration/patients/:id/photo', { permission: 'patients.manage', module: 'patient-registration' }),
  entry('GET', '/api/v1/tenant/m/patient-registration/patients/:id/documents', {
    permission: ['patients.view', 'patients.manage'],
    module: 'patient-registration',
  }),
  entry('POST', '/api/v1/tenant/m/patient-registration/patients/:id/documents', { permission: 'patients.manage', module: 'patient-registration' }),
  entry('DELETE', '/api/v1/tenant/m/patient-registration/patients/:id/documents/:docId', { permission: 'patients.manage', module: 'patient-registration' }),
  entry('GET', '/api/v1/tenant/m/patient-registration/patients/:id/documents/:docId/file', {
    permission: ['patients.view', 'patients.manage'],
    module: 'patient-registration',
  }),
  entry('GET', '/api/v1/tenant/m/patient-registration/patients/:id/print/:kind/:format', {
    permission: ['patients.view', 'patients.manage'],
    module: 'patient-registration',
  }),
  entry('GET', '/api/v1/tenant/m/patient-registration/reports/register', { permission: 'reports.view', module: 'patient-registration' }),
  entry('GET', '/api/v1/tenant/m/patient-registration/reports/register.csv', { permission: 'reports.view', module: 'patient-registration' }),
  entry('POST', '/api/v1/tenant/m/patient-registration/patients/:id/mailer', { permission: 'patients.manage', module: 'patient-registration' }),
  entry('GET', '/api/v1/tenant/m/patient-registration/mlc', { permission: 'patients.manage', module: 'patient-registration' }),
  entry('POST', '/api/v1/tenant/m/patient-registration/mlc', { permission: 'patients.manage', module: 'patient-registration' }),
  entry('GET', '/api/v1/tenant/m/patient-registration/reports/mlc', { permission: 'reports.view', module: 'patient-registration' }),

  // B7 pharmacy. Feature checks that depend on the body or the report key stay in the handler.
  entry('GET', '/api/v1/tenant/m/pharmacy/items', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/items', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('PATCH', '/api/v1/tenant/m/pharmacy/items/:id', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('GET', '/api/v1/tenant/m/pharmacy/suppliers', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/suppliers', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('PATCH', '/api/v1/tenant/m/pharmacy/suppliers/:id', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/grns', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.material-receipts' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/supplier-returns', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.material-returns' }),
  entry('GET', '/api/v1/tenant/m/pharmacy/stock', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.stock-register-summary-details' }),
  entry('GET', '/api/v1/tenant/m/pharmacy/prescriptions/open', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.issue-to-op-patients' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/sales', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('GET', '/api/v1/tenant/m/pharmacy/sales/:id', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/sales/:id/return', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('GET', '/api/v1/tenant/m/pharmacy/sales/:id/print', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('GET', '/api/v1/tenant/m/pharmacy/inpatients', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.issue-to-ip-patients-returns' }),
  entry('GET', '/api/v1/tenant/m/pharmacy/ip-issues', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.issue-to-ip-patients-returns' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/ip-issues', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.issue-to-ip-patients-returns' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/ip-issues/:id/return', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.issue-to-ip-patients-returns' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/adjustments', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.stock-adjustments' }),
  entry('GET', '/api/v1/tenant/m/pharmacy/reports/:report', {
    permission: ['pharmacy.manage', 'reports.view'],
    module: 'pharmacy',
  }),
];

const keys = ENTRIES.map(([key]) => key);
if (new Set(keys).size !== keys.length) {
  throw new Error('Duplicate tenant route guard');
}

export const TENANT_GUARDS: Readonly<Record<string, TenantRouteGuard>> = Object.fromEntries(ENTRIES);

const TENANT_AUTH = new Set([
  '/api/v1/auth/me',
  '/api/v1/auth/logout',
  '/api/v1/auth/switch-location',
  '/api/v1/auth/totp/setup',
  '/api/v1/auth/totp/enable',
]);

/** True for routes that serve a hospital session (not the public catalogue or App Admin). */
export function isTenantSurface(method: string, url: string): boolean {
  const verb = method.toUpperCase();
  if (verb === 'HEAD' || verb === 'OPTIONS') return false;
  if (url.startsWith('/api/v1/tenant/') || url === '/api/v1/tenant') return true;
  if (url.startsWith('/api/v1/billing/webhooks/')) return false;
  if (url.startsWith('/api/v1/billing/')) return true;
  if (url === '/api/v1/onboarding' || url.startsWith('/api/v1/onboarding/')) return true;
  return TENANT_AUTH.has(url);
}

export function lookupTenantGuard(method: string, url: string): TenantRouteGuard | undefined {
  const verb = method.toUpperCase();
  return TENANT_GUARDS[`${verb} ${url}`] ?? (verb === 'HEAD' ? TENANT_GUARDS[`GET ${url}`] : undefined);
}

export function resolveGuardKey(spec: GuardKeySpec, req: FastifyRequest): string {
  if (typeof spec === 'string') return spec;
  const params = req.params as Record<string, unknown>;
  const value = params[spec.param];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ApiError(400, 'validation', 'Missing route parameter');
  }
  return value;
}

export interface PrintedRoute {
  method: string;
  url: string;
}

/**
 * Split Fastify `printRoutes` output into method + full URL pairs.
 * The radix tree prints one fragment per line; a child continues its parent
 * (`/test` + `ing` → `/testing`, `/test` + `/hello` → `/test/hello`).
 */
export function parsePrintedRoutes(printed: string): PrintedRoute[] {
  const out: PrintedRoute[] = [];
  const stack: string[] = [];
  for (const raw of printed.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const marker = Math.max(raw.indexOf('├'), raw.indexOf('└'));
    if (marker < 0) continue;
    const depth = Math.floor(marker / 4);
    const content = raw.slice(marker).replace(/^[├└]──\s+/, '');
    const parsed = /^(\S+)(?:\s+\(([^)]+)\))?/.exec(content);
    if (!parsed?.[1]) continue;
    const segment = parsed[1].startsWith('(empty') ? '' : parsed[1];
    stack.length = depth;
    const parent = depth > 0 ? (stack[depth - 1] ?? '') : '';
    const url = `${parent}${segment}`;
    stack[depth] = url;
    if (!parsed[2] || !url.startsWith('/')) continue;
    for (const part of parsed[2].split(',')) {
      const method = part.trim().toUpperCase();
      if (!method) continue;
      out.push({ method, url });
    }
  }
  return out;
}
