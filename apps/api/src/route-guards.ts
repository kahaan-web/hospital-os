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
  /** Null only for session identity (`/auth/me`) and session teardown (`/auth/logout`). */
  permission: string | null;
  module?: GuardKeySpec;
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
