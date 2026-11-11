import { createDb, dbEnv, schema, withPlatform, withTenant } from '@hos/db';
import { SHEET_FEATURE_DEFS, featureKey } from '@hos/shared';
import { sql } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app';
import { webhookSignature } from '../../apps/api/src/crypto';
import { apiEnv } from '../../apps/api/src/env';

const PREMIUM_ONLY = featureKey('patient-registration', 'MLC Registration');
const SHEET_KEYS = new Set(SHEET_FEATURE_DEFS.map((feature) => feature.key));

const app = await buildApp();
const csrf = { 'x-hos-csrf': '1' };

let basicCookie = '';
let sunriseCookie = '';
let deskCookie = '';
let adminCookie = '';
let basicTenantId = '';
let sunriseTenantId = '';
let basicEmail = '';
let featureId = '';
let basicPlanId = '';
let mediumPlanId = '';

beforeAll(async () => {
  await app.ready();
  const catalog = await app.inject({ method: 'GET', url: '/api/v1/catalog' });
  expect(catalog.statusCode, catalog.body).toBe(200);
  const plans = catalog.json().plans as { id: string; key: string }[];
  basicPlanId = plans.find((plan) => plan.key === 'basic')!.id;
  mediumPlanId = plans.find((plan) => plan.key === 'medium')!.id;
  const modules = catalog.json().modules as { key: string; features: { id: string; key: string }[] }[];
  const registration = modules.find((mod) => mod.key === 'patient-registration');
  featureId = registration?.features.find((feature) => feature.key === PREMIUM_ONLY)?.id ?? '';
  expect(featureId).toBeTruthy();
  const definition = SHEET_FEATURE_DEFS.find((feature) => feature.key === PREMIUM_ONLY);
  expect(definition?.tiers).toEqual({ basic: false, medium: false, premium: true });

  const stamp = Date.now();
  basicEmail = `owner.${stamp}@sbx.hospitalos.test`;
  basicCookie = await provisionBasic(stamp, basicEmail, basicPlanId);
  const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: basicCookie } });
  expect(me.statusCode, me.body).toBe(200);
  basicTenantId = me.json().tenant.id as string;

  sunriseCookie = await login('owner@sunrise.demo', 'Demo@12345');
  const sunrise = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: sunriseCookie } });
  expect(sunrise.statusCode, sunrise.body).toBe(200);
  sunriseTenantId = sunrise.json().tenant.id as string;
  deskCookie = await login('frontdesk@sunrise.demo', 'Demo@12345');
  adminCookie = await login(process.env.SEED_ADMIN_EMAIL || 'admin@hospitalos.test', process.env.SEED_ADMIN_PASSWORD || 'Admin@12345');
}, 180_000);

afterAll(async () => {
  await app.close();
});

it('returns only the caller’s rows from every tenant list', async () => {
  const basicUsers = await list(basicCookie, '/api/v1/tenant/users?pageSize=100');
  const sunriseUsers = await list(sunriseCookie, '/api/v1/tenant/users?pageSize=100');
  expect(disjoint(ids(basicUsers.json().items), ids(sunriseUsers.json().items))).toBe(true);
  expect(basicUsers.json().items.some((user: { email: string }) => user.email.endsWith('@sunrise.demo'))).toBe(false);
  expect(sunriseUsers.json().items.some((user: { email: string }) => user.email === basicEmail)).toBe(false);
  expect(basicUsers.json().items.length).toBeGreaterThan(0);
  expect(sunriseUsers.json().items.length).toBeGreaterThan(0);

  const basicLocations = await list(basicCookie, '/api/v1/tenant/locations');
  const sunriseLocations = await list(sunriseCookie, '/api/v1/tenant/locations');
  expect(disjoint(ids(basicLocations.json()), ids(sunriseLocations.json()))).toBe(true);
  expect(basicLocations.json().some((loc: { name: string }) => loc.name === 'Lotus Sample Ward')).toBe(true);
  expect(sunriseLocations.json().some((loc: { name: string }) => loc.name === 'Lotus Sample Ward')).toBe(false);

  const basicInvoices = await list(basicCookie, '/api/v1/billing/invoices');
  const sunriseInvoices = await list(sunriseCookie, '/api/v1/billing/invoices');
  expect(disjoint(ids(basicInvoices.json()), ids(sunriseInvoices.json()))).toBe(true);
  expect(basicInvoices.json().length).toBeGreaterThan(0);
  expect(sunriseInvoices.json().length).toBeGreaterThan(0);

  const basicDash = await list(basicCookie, '/api/v1/tenant/dashboard');
  const sunriseDash = await list(sunriseCookie, '/api/v1/tenant/dashboard');
  expect(disjoint(ids(basicDash.json().doctors), ids(sunriseDash.json().doctors))).toBe(true);

  const basicConsents = await list(basicCookie, '/api/v1/tenant/consents');
  const sunriseConsents = await list(sunriseCookie, '/api/v1/tenant/consents');
  expect(basicConsents.statusCode, basicConsents.body).toBe(200);
  expect(basicConsents.json().length).toBeGreaterThan(0);
  expect(disjoint(ids(basicConsents.json()), ids(sunriseConsents.json()))).toBe(true);

  const basicRequest = await send(basicCookie, 'POST', '/api/v1/tenant/privacy/requests', {
    type: 'access',
    principalName: 'Sample Principal Basic',
    principalContact: '9000011111',
    reference: 'BASIC-DPR',
    details: 'Sample access request for the basic tenant only.',
  });
  expect(basicRequest.statusCode, basicRequest.body).toBe(200);
  const sunriseRequest = await send(sunriseCookie, 'POST', '/api/v1/tenant/privacy/requests', {
    type: 'access',
    principalName: 'Sample Principal Sunrise',
    principalContact: '9000022222',
    reference: 'SUNRISE-DPR',
    details: 'Sample access request for the sunrise tenant only.',
  });
  expect(sunriseRequest.statusCode, sunriseRequest.body).toBe(200);
  const basicPrivacy = await list(basicCookie, '/api/v1/tenant/privacy/requests');
  const sunrisePrivacy = await list(sunriseCookie, '/api/v1/tenant/privacy/requests');
  expect(basicPrivacy.json().some((row: { id: string }) => row.id === sunriseRequest.json().id)).toBe(false);
  expect(sunrisePrivacy.json().some((row: { id: string }) => row.id === basicRequest.json().id)).toBe(false);

  const basicAudit = await list(basicCookie, '/api/v1/tenant/audit?pageSize=100');
  const sunriseAudit = await list(sunriseCookie, '/api/v1/tenant/audit?pageSize=100');
  expect(basicAudit.json().items.every((row: { tenantId: string }) => row.tenantId === basicTenantId)).toBe(true);
  expect(sunriseAudit.json().items.every((row: { tenantId: string }) => row.tenantId === sunriseTenantId)).toBe(true);
  expect(disjoint(ids(basicAudit.json().items), ids(sunriseAudit.json().items))).toBe(true);

  const deskHome = await list(deskCookie, '/api/v1/tenant/dashboard');
  expect(deskHome.statusCode, deskHome.body).toBe(200);
  const deskUsers = await list(deskCookie, '/api/v1/tenant/users');
  expect(deskUsers.statusCode).toBe(403);
  expect(deskUsers.json().error.code).toBe('forbidden');
});

it('enforces premium features, plan changes, suspension and renewal', async () => {
  expect(await sheetFeatureCount(basicCookie)).toBe(66);
  const locked = await feature(basicCookie);
  expect(locked.statusCode).toBe(403);
  expect(locked.json().error.code).toBe('not_entitled');

  const invoicesBefore = await list(basicCookie, '/api/v1/billing/invoices');
  const subBefore = await list(basicCookie, '/api/v1/billing/subscription');
  const creditBefore = subBefore.json().creditPaise as number;
  await payChange(basicCookie, mediumPlanId);
  expect(await sheetFeatureCount(basicCookie)).toBe(82);
  const upgraded = await list(basicCookie, '/api/v1/billing/subscription');
  expect(upgraded.json().planKey).toBe('medium');
  const invoicesAfterUpgrade = await list(basicCookie, '/api/v1/billing/invoices');
  const changeInvoice = (invoicesAfterUpgrade.json() as { id: string; description: string }[]).find((row) => row.description.includes('change'));
  expect(changeInvoice).toBeTruthy();
  const detail = await list(basicCookie, `/api/v1/billing/invoices/${changeInvoice!.id}`);
  expect(detail.json().lines.some((line: { description: string }) => /prorated/i.test(line.description))).toBe(true);
  expect((await feature(basicCookie)).json().error.code).toBe('not_entitled');

  const downgrade = await send(
    basicCookie,
    'POST',
    '/api/v1/billing/change-apply',
    {
      planId: basicPlanId,
      locationCount: 1,
      addonModuleIds: [],
    },
    { 'idempotency-key': `apply-${Date.now()}` },
  );
  expect(downgrade.statusCode, downgrade.body).toBe(200);
  expect(downgrade.json().change.noPayment).toBe(true);
  expect(await sheetFeatureCount(basicCookie)).toBe(66);
  const downgraded = await list(basicCookie, '/api/v1/billing/subscription');
  expect(downgraded.json().planKey).toBe('basic');
  expect(downgraded.json().creditPaise).toBeGreaterThanOrEqual(creditBefore);
  const invoicesAfterDowngrade = await list(basicCookie, '/api/v1/billing/invoices');
  expect(invoicesAfterDowngrade.json()).toHaveLength(invoicesAfterUpgrade.json().length);
  expect((invoicesAfterDowngrade.json() as { description: string }[]).some((row) => /credit note/i.test(row.description))).toBe(false);
  expect(invoicesBefore.json().length).toBeGreaterThan(0);

  const grant = await send(adminCookie, 'POST', `/api/v1/admin/tenants/${basicTenantId}/overrides`, {
    target: 'feature',
    featureId,
    effect: 'grant',
    reason: 'Sample grant for a premium-only feature',
  });
  expect(grant.statusCode, grant.body).toBe(200);
  expect((await feature(basicCookie)).statusCode).toBe(200);

  const removed = await app.inject({
    method: 'DELETE',
    url: `/api/v1/admin/tenants/${basicTenantId}/overrides/${grant.json().id}`,
    headers: { ...csrf, cookie: adminCookie },
  });
  expect(removed.statusCode, removed.body).toBe(204);
  expect((await feature(basicCookie)).json().error.code).toBe('not_entitled');

  const grantAgain = await send(adminCookie, 'POST', `/api/v1/admin/tenants/${basicTenantId}/overrides`, {
    target: 'feature',
    featureId,
    effect: 'grant',
    reason: 'Sample grant restored before suspension',
  });
  expect(grantAgain.statusCode, grantAgain.body).toBe(200);

  const suspended = await send(adminCookie, 'POST', `/api/v1/admin/tenants/${basicTenantId}/suspend`, {
    reason: 'Sample suspension for the entitlement test',
  });
  expect(suspended.statusCode, suspended.body).toBe(204);
  expect((await feature(basicCookie)).json().error.code).toBe('tenant_suspended');
  const billingRead = await list(basicCookie, '/api/v1/billing/invoices');
  expect(billingRead.statusCode, billingRead.body).toBe(200);
  const me = await list(basicCookie, '/api/v1/auth/me');
  expect(me.statusCode, me.body).toBe(200);
  const quoted = await send(basicCookie, 'POST', '/api/v1/billing/change-quote', {
    planId: mediumPlanId,
    locationCount: 1,
    addonModuleIds: [],
  });
  expect(quoted.statusCode).toBe(403);
  expect(quoted.json().error.code).toBe('tenant_suspended');
  const logout = await send(basicCookie, 'POST', '/api/v1/auth/logout', {});
  expect(logout.statusCode).toBe(204);
  basicCookie = await login(basicEmail, 'Demo@12345');
  expect((await feature(basicCookie)).json().error.code).toBe('tenant_suspended');

  const reactivated = await send(adminCookie, 'POST', `/api/v1/admin/tenants/${basicTenantId}/reactivate`, {});
  expect(reactivated.statusCode, reactivated.body).toBe(204);
  expect((await feature(basicCookie)).statusCode).toBe(200);

  const clock = await send(adminCookie, 'POST', `/api/v1/admin/tenants/${basicTenantId}/dev/advance-clock`, { days: 40 });
  expect(clock.statusCode, clock.body).toBe(200);
  expect(clock.json().renewals.length).toBeGreaterThan(0);
  const renewed = await list(basicCookie, '/api/v1/billing/invoices');
  expect((renewed.json() as { description: string }[]).some((row) => row.description.includes('renewal'))).toBe(true);
});

it('enforces seat limits and resolves a pending payment only through the mock webhook', async () => {
  const locations = await list(basicCookie, '/api/v1/tenant/locations');
  const locationId = locations.json()[0].id as string;
  const handle = createDb(dbEnv().appUrl, { max: 1 });
  // hos_app cannot hold platform scope (migration 0026), so the simulator flag is written as hos_platform.
  const platform = createDb(dbEnv().platformUrl, { max: 1 });
  try {
    await withTenant(handle.db, basicTenantId, async (tx) => {
      for (let i = 0; i < 6; i++) {
        await tx.insert(schema.users).values({
          tenantId: basicTenantId,
          email: `seat.${i}.${basicTenantId.slice(0, 8)}@sbx.hospitalos.test`,
          name: `Seat Sample ${i}`,
          status: 'active',
        });
      }
    });
    const invited = await send(basicCookie, 'POST', '/api/v1/tenant/users/invite', {
      name: 'Seat Sample Invite',
      email: `seat.invite.${Date.now()}@sbx.hospitalos.test`,
      roleKey: 'front_desk',
      locationIds: [locationId],
    });
    expect(invited.statusCode, invited.body).toBe(200);
    const over = await send(basicCookie, 'POST', '/api/v1/tenant/users/invite', {
      name: 'Seat Sample Extra',
      email: `seat.extra.${Date.now()}@sbx.hospitalos.test`,
      roleKey: 'front_desk',
      locationIds: [locationId],
    });
    expect(over.statusCode).toBe(403);
    expect(over.json().error.code).toBe('seat_limit');

    await withPlatform(platform.db, (tx) => tx.execute(sql`update platform_settings set mock_payment_simulator = true where id = 1`));
    const stamp = `${Date.now()}-sim`;
    const order = await send(
      basicCookie,
      'POST',
      '/api/v1/billing/orders',
      { purpose: 'change', config: { planId: mediumPlanId, locationCount: 1, addonModuleIds: [] } },
      { 'idempotency-key': `sim-ord-${stamp}` },
    );
    expect(order.statusCode, order.body).toBe(200);
    const pending = await send(
      basicCookie,
      'POST',
      `/api/v1/billing/orders/${order.json().id}/pay`,
      { method: 'upi', outcome: 'pending', details: {} },
      { 'idempotency-key': `sim-pay-${stamp}` },
    );
    expect(pending.statusCode, pending.body).toBe(200);
    expect(pending.json().payment.status).toBe('pending');
    const paymentId = pending.json().payment.id as string;
    const tenantResolve = await send(basicCookie, 'POST', `/api/v1/billing/payments/${paymentId}/resolve`, { outcome: 'success' });
    expect(tenantResolve.statusCode).toBe(404);

    const body = { paymentId, outcome: 'success' as const };
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/webhooks/mock',
      payload: body,
      headers: { 'idempotency-key': `sim-bad-${stamp}`, 'x-hos-signature': '00'.repeat(32) },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error.code).toBe('signature_invalid');
    const good = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/webhooks/mock',
      payload: body,
      headers: {
        'idempotency-key': `sim-ok-${stamp}`,
        'x-hos-signature': webhookSignature(apiEnv().gatewaySecret, body),
      },
    });
    expect(good.statusCode, good.body).toBe(200);
    expect(good.json().status).toBe('captured');
    const upgraded = await list(basicCookie, '/api/v1/billing/subscription');
    expect(upgraded.json().planKey).toBe('medium');
  } finally {
    await withPlatform(platform.db, (tx) => tx.execute(sql`update platform_settings set mock_payment_simulator = false where id = 1`));
    await platform.close();
    await handle.close();
  }
});

async function sheetFeatureCount(cookie: string): Promise<number> {
  const res = await list(cookie, '/api/v1/tenant/entitlements');
  expect(res.statusCode, res.body).toBe(200);
  const features = res.json().features as string[];
  const sheet = features.filter((key) => SHEET_KEYS.has(key)).length;
  expect(features.length).toBe(sheet);
  return sheet;
}

function feature(cookie: string): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'GET',
    url: `/api/v1/tenant/m/patient-registration/features/${PREMIUM_ONLY}`,
    headers: { cookie },
  });
}

async function payChange(cookie: string, planId: string): Promise<void> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const config = { planId, locationCount: 1, addonModuleIds: [] as string[] };
  const order = await send(cookie, 'POST', '/api/v1/billing/orders', { purpose: 'change', config }, { 'idempotency-key': `chg-${stamp}` });
  expect(order.statusCode, order.body).toBe(200);
  const paid = await send(
    cookie,
    'POST',
    `/api/v1/billing/orders/${order.json().id}/pay`,
    { method: 'upi', outcome: 'failure', details: {} },
    { 'idempotency-key': `pay-${stamp}` },
  );
  expect(paid.statusCode, paid.body).toBe(200);
  expect(paid.json().payment.status).toBe('captured');
  const checkout = paid.json().checkout as { orderId: string; paymentId: string; signature: string };
  const verified = await send(cookie, 'POST', '/api/v1/billing/verify', checkout, { 'idempotency-key': `ver-${stamp}` });
  expect(verified.statusCode, verified.body).toBe(200);
}

async function provisionBasic(stamp: number, email: string, planId: string): Promise<string> {
  const notice = await app.inject({ method: 'GET', url: '/api/v1/privacy-notice/current' });
  expect(notice.statusCode, notice.body).toBe(200);
  const signup = await send('', 'POST', '/api/v1/auth/signup', {
    name: 'Lotus Sample Owner',
    email,
    mobile: `9${String(stamp).slice(-9)}`,
    password: 'Demo@12345',
    designation: 'owner',
    acceptTerms: true,
    acceptPrivacy: true,
    productUpdates: false,
    noticeVersion: notice.json().version,
  });
  expect(signup.statusCode, signup.body).toBe(200);
  const verified = await send('', 'POST', '/api/v1/auth/otp/verify', { challengeId: signup.json().challengeId, code: signup.json().devCode });
  expect(verified.statusCode, verified.body).toBe(200);
  const cookie = cookieOf(verified);
  const facility = await send(cookie, 'PUT', '/api/v1/onboarding/facility', {
    facilityType: 'clinic',
    legalName: 'Lotus Demo Clinic',
    displayName: 'Lotus Demo Clinic',
    gstin: '',
    registrationNo: 'DEMO-MH-LOTUS',
    bedCount: 8,
    specialities: ['General Medicine'],
  });
  expect(facility.statusCode, facility.body).toBe(200);
  const locations = await send(cookie, 'PUT', '/api/v1/onboarding/locations', {
    locations: [{ name: 'Lotus Sample Ward', addressLine1: '1 Sample Road', city: 'Mumbai', stateCode: '27', pincode: '400001', departments: ['OPD'] }],
  });
  expect(locations.statusCode, locations.body).toBe(200);
  const plan = await send(cookie, 'PUT', '/api/v1/onboarding/plan', { planId, cycle: 'monthly', locationCount: 1 });
  expect(plan.statusCode, plan.body).toBe(200);
  const addons = await send(cookie, 'PUT', '/api/v1/onboarding/addons', { moduleIds: [] });
  expect(addons.statusCode, addons.body).toBe(200);
  const order = await send(cookie, 'POST', '/api/v1/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': `onb-${stamp}` });
  expect(order.statusCode, order.body).toBe(200);
  const paid = await send(
    cookie,
    'POST',
    `/api/v1/billing/orders/${order.json().id}/pay`,
    { method: 'upi', outcome: 'success', details: {} },
    { 'idempotency-key': `onbpay-${stamp}` },
  );
  expect(paid.statusCode, paid.body).toBe(200);
  const verifiedPay = await send(cookie, 'POST', '/api/v1/billing/verify', paid.json().checkout, { 'idempotency-key': `onbver-${stamp}` });
  expect(verifiedPay.statusCode, verifiedPay.body).toBe(200);
  const provision = await send(cookie, 'POST', '/api/v1/onboarding/provision', {});
  expect(provision.statusCode, provision.body).toBe(200);
  return cookie;
}

async function login(email: string, password: string): Promise<string> {
  const res = await send('', 'POST', '/api/v1/auth/login', { email, password });
  expect(res.statusCode, res.body).toBe(200);
  return cookieOf(res);
}

function list(cookie: string, url: string): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'GET', url, headers: { cookie } });
}

function send(
  cookie: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload: Record<string, unknown>,
  extra: Record<string, string> = {},
): Promise<LightMyRequestResponse> {
  return app.inject({
    method,
    url,
    payload,
    headers: { ...csrf, ...(cookie ? { cookie } : {}), ...extra },
  });
}

function cookieOf(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie'];
  const line = Array.isArray(raw) ? raw.join(';') : (raw ?? '');
  const match = /hos_session=([^;]+)/.exec(line);
  if (!match?.[1]) throw new Error('session cookie missing');
  return `hos_session=${match[1]}`;
}

function ids(rows: { id: string }[]): string[] {
  return rows.map((row) => row.id);
}

function disjoint(left: string[], right: string[]): boolean {
  const other = new Set(right);
  return left.every((id) => !other.has(id));
}
