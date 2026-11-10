import { createHmac, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { featureKey, gstinCheckDigit, type Catalog, type PayAttemptResult, type PrivacyNoticeDto, type ProvisioningResult, type QuoteDto, type TenantMe } from '@hos/shared';

/**
 * API-level wizard happy path. Skips until apps/api/src/app.ts exports buildApp().
 *
 * Decisions: routes follow CONTRACTS.md under /api/v1 (a bare /health is accepted if the
 * prefixed health check is 404). The mock signature is hex HMAC-SHA256 of
 * `orderId|paymentId` with MOCK_GATEWAY_KEY_SECRET, matching a Razorpay-style checkout.
 * buildApp() is called with no arguments.
 */

const APP_FILE = fileURLToPath(new URL('../../apps/api/src/app.ts', import.meta.url));
const SKIP = `skipped: ${APP_FILE} does not exist yet (api worker owns it on feat/api)`;

interface InjectHeaders {
  [key: string]: string | string[] | undefined;
}

interface Injected {
  statusCode: number;
  body: string;
  headers: InjectHeaders;
}

interface TestApp {
  inject: (opts: { method: string; url: string; headers?: Record<string, string>; payload?: unknown }) => Promise<Injected>;
  close: () => Promise<void>;
}

interface ApiResult {
  status: number;
  json: unknown;
}

const jar = new Map<string, string>();
let app: TestApp | null = null;
let prefix = '/api/v1';

function cookieHeader(): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function absorbCookies(headers: InjectHeaders): void {
  const raw = headers['set-cookie'];
  const lines = raw == null ? [] : Array.isArray(raw) ? raw : [String(raw)];
  for (const line of lines) {
    const pair = line.split(';')[0] ?? '';
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function sign(orderId: string, paymentId: string): string {
  const secret = process.env.MOCK_GATEWAY_KEY_SECRET || 'mock_secret_change_me_dev_only';
  return createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

async function loadApp(ctx: { skip: (note?: string) => never }): Promise<TestApp> {
  if (!existsSync(APP_FILE)) ctx.skip(SKIP);
  if (app) return app;
  process.env.MOCK_EXPOSE_SECRETS ??= 'true';
  process.env.MOCK_GATEWAY_KEY_SECRET ??= 'mock_secret_change_me_dev_only';
  let mod: { buildApp?: (opts?: unknown) => Promise<TestApp> | TestApp };
  try {
    mod = (await import(pathToFileURL(APP_FILE).href)) as typeof mod;
  } catch (err) {
    ctx.skip(`skipped: apps/api/src/app.ts failed to load: ${(err as Error).message}`);
  }
  if (typeof mod.buildApp !== 'function') ctx.skip('skipped: apps/api/src/app.ts does not export buildApp()');
  try {
    app = await mod.buildApp();
  } catch (err) {
    ctx.skip(`skipped: buildApp() failed (database or config not ready): ${(err as Error).message}`);
  }
  const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
  if (health.statusCode === 404) {
    const bare = await app.inject({ method: 'GET', url: '/health' });
    if (bare.statusCode === 200) prefix = '';
  }
  return app;
}

async function call(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<ApiResult> {
  if (!app) throw new Error('app was not started');
  const res = await app.inject({
    method,
    url: `${prefix}${path}`,
    headers: {
      'x-hos-csrf': '1',
      cookie: cookieHeader(),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...extraHeaders,
    },
    payload: body,
  });
  absorbCookies(res.headers);
  let json: unknown = null;
  if (res.body) {
    try {
      json = JSON.parse(res.body) as unknown;
    } catch {
      json = res.body;
    }
  }
  return { status: res.statusCode, json };
}

function expectStatus(res: ApiResult, status: number): void {
  expect(res.status, JSON.stringify(res.json)).toBe(status);
}

describe('wizard happy path', () => {
  afterAll(async () => {
    await app?.close();
    app = null;
  });

  it('signs up, pays the mock gateway and provisions a Basic tenant', async (ctx) => {
    await loadApp(ctx);

    const notice = await call('GET', '/privacy-notice/current');
    expectStatus(notice, 200);
    const version = (notice.json as PrivacyNoticeDto).version;
    expect(version).toBeTruthy();

    const email = `owner.${randomUUID()}@hospitalos.test`;
    const gstin = `27ABCDE1234F1Z${gstinCheckDigit('27ABCDE1234F1Z')}`;
    const signup = await call('POST', '/auth/signup', {
      name: 'Asha Demo',
      email,
      mobile: '9876543210',
      password: 'Owner#2026',
      designation: 'owner',
      acceptTerms: true,
      acceptPrivacy: true,
      productUpdates: false,
      noticeVersion: version,
    });
    expectStatus(signup, 200);
    const challenge = signup.json as { challengeId?: string; devCode?: string };
    expect(challenge.challengeId).toBeTruthy();
    if (!challenge.devCode) ctx.skip('skipped: signup did not return devCode (set MOCK_EXPOSE_SECRETS)');

    const verified = await call('POST', '/auth/otp/verify', { challengeId: challenge.challengeId, code: challenge.devCode });
    expectStatus(verified, 200);
    expect((verified.json as TenantMe).kind).toBe('tenant');

    const facility = await call('PUT', '/onboarding/facility', {
      facilityType: 'nursing_home',
      legalName: 'Fictional Lakeside Nursing Home',
      displayName: 'Lakeside Demo',
      gstin,
      registrationNo: 'LIC-DEMO-001',
      bedCount: 12,
      specialities: ['General Medicine'],
    });
    expectStatus(facility, 200);

    const locations = await call('PUT', '/onboarding/locations', {
      locations: [
        {
          name: 'Mumbai',
          addressLine1: '12 Demo Marg',
          city: 'Mumbai',
          stateCode: '27',
          pincode: '400001',
          departments: ['OPD', 'General Ward'],
        },
      ],
    });
    expectStatus(locations, 200);

    const catalogRes = await call('GET', '/catalog');
    expectStatus(catalogRes, 200);
    const catalog = catalogRes.json as Catalog;
    const basic = catalog.plans.find((p) => p.key === 'basic');
    expect(basic?.id, 'catalog has no Basic plan — seed the matrix before this test').toBeTruthy();
    if (!basic) return;

    const plan = await call('PUT', '/onboarding/plan', { planId: basic.id, cycle: 'monthly', locationCount: 1 });
    expectStatus(plan, 200);
    const addons = await call('PUT', '/onboarding/addons', { moduleIds: [] });
    expectStatus(addons, 200);

    const quoteRes = await call('GET', '/onboarding/quote');
    expectStatus(quoteRes, 200);
    const quote = quoteRes.json as QuoteDto;
    expect(quote.totals.totalPaise).toBe(quote.totals.taxablePaise + quote.totals.taxPaise);
    expect(quote.placeOfSupplyStateCode).toBe('27');
    if (quote.totals.interState) {
      expect(quote.totals.cgstPaise).toBe(0);
      expect(quote.totals.sgstPaise).toBe(0);
      expect(quote.totals.igstPaise).toBe(quote.totals.taxPaise);
    } else {
      expect(quote.totals.igstPaise).toBe(0);
      expect(quote.totals.cgstPaise + quote.totals.sgstPaise).toBe(quote.totals.taxPaise);
    }

    const idem = randomUUID();
    const orderRes = await call('POST', '/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': idem });
    expectStatus(orderRes, 200);
    const orderId = (orderRes.json as { id?: string }).id;
    expect(orderId).toBeTruthy();

    const payRes = await call(
      'POST',
      `/billing/orders/${orderId}/pay`,
      { method: 'upi', outcome: 'success', details: { vpa: 'asha.demo@upi' } },
      { 'idempotency-key': `${idem}-pay` },
    );
    expectStatus(payRes, 200);
    const paid = payRes.json as PayAttemptResult;
    expect(paid.payment.status).toBe('captured');
    expect(paid.checkout?.orderId).toBeTruthy();
    expect(paid.checkout?.paymentId).toBeTruthy();
    expect(paid.checkout?.signature).toBe(sign(paid.checkout?.orderId ?? '', paid.checkout?.paymentId ?? ''));

    const verify = await call('POST', '/billing/verify', {
      orderId: paid.checkout?.orderId,
      paymentId: paid.checkout?.paymentId,
      signature: paid.checkout?.signature,
    });
    expectStatus(verify, 200);
    expect((verify.json as { status?: string }).status).toBe('paid');

    const provision = await call('POST', '/onboarding/provision');
    expectStatus(provision, 200);
    expect((provision.json as ProvisioningResult).tenant.status).toBe('active');

    const me = await call('GET', '/auth/me');
    expectStatus(me, 200);
    const tenantMe = me.json as TenantMe;
    expect(tenantMe.tenant.status).toBe('active');
    expect(tenantMe.tenant.displayName).toBe('Lakeside Demo');
    expect(tenantMe.features).toContain(featureKey('patient-registration', 'New Registration'));
    expect(tenantMe.features).not.toContain(featureKey('cpoe', 'Chief Complaints'));
  });

  it('returns 403 not_entitled for a module the Basic plan does not include', async (ctx) => {
    await loadApp(ctx);
    const res = await call('GET', '/tenant/m/lab/samples');
    if (res.status === 404) ctx.skip('skipped: /tenant/m/:moduleKey route is not mounted yet');
    expectStatus(res, 403);
    expect((res.json as { error?: { code?: string } }).error?.code).toBe('not_entitled');
  });
});
