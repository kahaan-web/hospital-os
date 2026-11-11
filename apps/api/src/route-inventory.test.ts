import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from './app';
import { TENANT_GUARDS, isTenantSurface, lookupTenantGuard, parsePrintedRoutes } from './route-guards';

const app = await buildApp();

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

it('fails when a tenant route is missing requireTenant guards', () => {
  const printed = app.printRoutes({ commonPrefix: false });
  const routes = parsePrintedRoutes(printed);
  const tenantRoutes = routes.filter((route) => isTenantSurface(route.method, route.url));
  expect(tenantRoutes.length, printed).toBeGreaterThan(20);

  for (const route of tenantRoutes) {
    const guard = lookupTenantGuard(route.method, route.url);
    expect(guard, `${route.method} ${route.url} is not in TENANT_GUARDS\n${printed}`).toBeDefined();
    if (!guard) continue;
    const sessionOnly = route.url === '/api/v1/auth/me' || route.url === '/api/v1/auth/logout';
    if (sessionOnly) {
      expect(guard.permission).toBeNull();
      expect(guard.allowWhenSuspended).toBe(true);
    } else if (Array.isArray(guard.permission)) {
      expect(guard.permission.length, route.url).toBeGreaterThan(0);
    } else {
      expect(guard.permission, route.url).toBeTruthy();
    }
    if (Array.isArray(guard.module)) expect(guard.module.length, route.url).toBeGreaterThan(0);
    if (route.url.startsWith('/api/v1/tenant/m/')) expect(guard.module).toBeTruthy();
    if (route.url.includes('/features/')) expect(guard.feature).toBeTruthy();
    if (route.method === 'GET' && route.url.startsWith('/api/v1/billing/')) expect(guard.allowWhenSuspended).toBe(true);
  }

  for (const key of Object.keys(TENANT_GUARDS)) {
    const space = key.indexOf(' ');
    const method = key.slice(0, space);
    const url = key.slice(space + 1);
    expect(
      routes.some((route) => route.method === method && route.url === url),
      `${key} is guarded but not registered\n${printed}`,
    ).toBe(true);
  }
});
