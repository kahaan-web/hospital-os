import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { featureKey, gstinCheckDigit, type InvoiceDto, type QuoteDto, type TenantMe } from '@hos/shared';
import { webhookSignature } from '../../apps/api/src/crypto';
import { dbEnv } from '../../packages/db/src/env';

/**
 * Wizard, GST invoices, mock payment and idempotency against buildApp().inject.
 * Decision: two hospitals (Maharashtra and Madhya Pradesh) so a real invoice shows
 * CGST+SGST inside the supplier state and IGST across it. The demo tenant is not required.
 * Same-key concurrent order creates must collapse to one order (CONTRACTS.md §10).
 */

interface Injected {
  statusCode: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
  json: () => unknown;
}

interface TestApp {
  inject: (opts: { method: string; url: string; headers?: Record<string, string>; payload?: unknown }) => Promise<Injected>;
  ready: () => Promise<unknown>;
  close: () => Promise<void>;
}

interface ApiResult {
  status: number;
  json: unknown;
  body: string;
  headers: Injected['headers'];
}

const csrf = { 'x-hos-csrf': '1' };
let app: TestApp | null = null;

describe.sequential('wizard, GST and mock payments', () => {
  let admin: pg.Client | null = null;
  let stamp = 0;

  beforeAll(async () => {
    process.env.MOCK_EXPOSE_SECRETS ??= 'true';
    process.env.MOCK_GATEWAY_KEY_SECRET ??= 'mock_secret_change_me_dev_only';
    const href = pathToFileURL(fileURLToPath(new URL('../../apps/api/src/app.ts', import.meta.url))).href;
    const mod = (await import(href)) as { buildApp: () => Promise<TestApp> };
    app = await mod.buildApp();
    await app.ready();
    admin = new pg.Client({ connectionString: dbEnv().adminUrl, connectionTimeoutMillis: 4_000 });
    await admin.connect();
    // Non-production only. The failure/pending examples need the dev simulator.
    await setSimulator(true);
  }, 300_000);

  afterAll(async () => {
    // A dropped admin client used to swallow this reset and leave the simulator on.
    // The next file then treats a requested payment failure as a real failure.
    const reset = new pg.Client({ connectionString: dbEnv().adminUrl, connectionTimeoutMillis: 4_000 });
    try {
      await reset.connect();
      await reset.query('update platform_settings set mock_payment_simulator = false where id = 1');
    } finally {
      await reset.end().catch(() => undefined);
    }
    await admin?.end().catch(() => undefined);
    await app?.close();
  });

  it('pays, fails, resolves and provisions an intra-state hospital with a PDF invoice', async () => {
    const cookie = await signUp('Fictional Lakeside Nursing Home', 'Lakeside Demo', '27', 'Mumbai', '400001');
    const basicId = await basicPlan();
    const plan = await call(cookie, 'PUT', '/api/v1/onboarding/plan', { planId: basicId, cycle: 'monthly', locationCount: 1 });
    expectStatus(plan, 200);
    const addons = await call(cookie, 'PUT', '/api/v1/onboarding/addons', { moduleIds: [] });
    expectStatus(addons, 200);

    const quote = await call(cookie, 'GET', '/api/v1/onboarding/quote');
    expectStatus(quote, 200);
    assertGst(quote.json as QuoteDto, false, '27');

    const raceKey = idem();
    const [raceA, raceB] = await Promise.all([
      call(cookie, 'POST', '/api/v1/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': raceKey }),
      call(cookie, 'POST', '/api/v1/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': raceKey }),
    ]);
    expectStatus(raceA, 200);
    expectStatus(raceB, 200);
    const raceOrderA = (raceA.json as { id: string }).id;
    const raceOrderB = (raceB.json as { id: string }).id;
    expect(raceOrderA).toBe(raceOrderB);
    expect(
      header(raceA, 'idempotent-replayed') === 'true' || header(raceB, 'idempotent-replayed') === 'true',
    ).toBe(true);

    const followed = await call(cookie, 'POST', '/api/v1/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': idem() });
    expectStatus(followed, 200);
    expect(await countOpenOrders((followed.json as { id: string }).id)).toBe(1);

    const replayKey = idem();
    const created = await call(cookie, 'POST', '/api/v1/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': replayKey });
    expectStatus(created, 200);
    const createdId = (created.json as { id: string }).id;
    const again = await call(cookie, 'POST', '/api/v1/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': replayKey });
    expectStatus(again, 200);
    expect(header(again, 'idempotent-replayed')).toBe('true');
    expect((again.json as { id: string }).id).toBe(createdId);
    const mismatch = await call(
      cookie,
      'POST',
      '/api/v1/billing/orders',
      { purpose: 'change', config: { planId: basicId, locationCount: 2, addonModuleIds: [] } },
      { 'idempotency-key': replayKey },
    );
    expectStatus(mismatch, 409);
    expect((mismatch.json as { error?: { code?: string } }).error?.code).toBe('idempotency_mismatch');

    const orderId = createdId;
    const failed = await call(
      cookie,
      'POST',
      `/api/v1/billing/orders/${orderId}/pay`,
      { method: 'upi', outcome: 'failure', details: { vpa: 'asha.demo@upi' } },
      { 'idempotency-key': idem() },
    );
    expectStatus(failed, 200);
    const failedBody = failed.json as { order: { status: string }; payment: { status: string; id: string }; checkout: unknown };
    expect(failedBody.payment.status).toBe('failed');
    expect(failedBody.order.status).toBe('attempted');
    expect(failedBody.checkout).toBeNull();

    const pendingKey = idem();
    const pending = await call(
      cookie,
      'POST',
      `/api/v1/billing/orders/${orderId}/pay`,
      { method: 'upi', outcome: 'pending', details: {} },
      { 'idempotency-key': pendingKey },
    );
    expectStatus(pending, 200);
    const pendingBody = pending.json as { order: { status: string }; payment: { status: string; id: string } };
    expect(pendingBody.payment.status).toBe('pending');
    expect(pendingBody.order.status).toBe('attempted');
    const pendingReplay = await call(
      cookie,
      'POST',
      `/api/v1/billing/orders/${orderId}/pay`,
      { method: 'upi', outcome: 'pending', details: {} },
      { 'idempotency-key': pendingKey },
    );
    expectStatus(pendingReplay, 200);
    expect(header(pendingReplay, 'idempotent-replayed')).toBe('true');
    expect((pendingReplay.json as { payment: { id: string } }).payment.id).toBe(pendingBody.payment.id);

    const replacement = await call(cookie, 'POST', '/api/v1/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': idem() });
    expectStatus(replacement, 200);
    const replacementId = (replacement.json as { id: string }).id;
    const closed = await resolvePayment(pendingBody.payment.id, 'success');
    expectStatus(closed, 200);
    expect((closed.json as { status: string }).status).toBe('failed');
    const failure = await admin!.query<{ failure_code: string | null }>(
      `select failure_code from payments where public_id = $1`,
      [pendingBody.payment.id],
    );
    expect(failure.rows[0]?.failure_code).toBe('order_closed');

    const paid = await call(
      cookie,
      'POST',
      `/api/v1/billing/orders/${replacementId}/pay`,
      { method: 'upi', outcome: 'success', details: { vpa: 'asha.demo@upi' } },
      { 'idempotency-key': idem() },
    );
    expectStatus(paid, 200);
    const captured = paid.json as { payment: { status: string }; checkout: { orderId: string; paymentId: string; signature: string } };
    expect(captured.payment.status).toBe('captured');
    expect(captured.checkout.signature).toBe(sign(captured.checkout.orderId, captured.checkout.paymentId));

    const tampered = await call(
      cookie,
      'POST',
      '/api/v1/billing/verify',
      {
        orderId: captured.checkout.orderId,
        paymentId: captured.checkout.paymentId,
        signature: 'ab'.repeat(32),
      },
      { 'idempotency-key': idem() },
    );
    expectStatus(tampered, 400);
    expect((tampered.json as { error?: { code?: string } }).error?.code).toBe('signature_invalid');
    const shortSig = await call(
      cookie,
      'POST',
      '/api/v1/billing/verify',
      {
        orderId: captured.checkout.orderId,
        paymentId: captured.checkout.paymentId,
        signature: 'abc',
      },
      { 'idempotency-key': idem() },
    );
    expectStatus(shortSig, 400);
    expect((shortSig.json as { error?: { code?: string } }).error?.code).toBe('signature_invalid');

    const verifyKey = idem();
    const verified = await call(cookie, 'POST', '/api/v1/billing/verify', captured.checkout, { 'idempotency-key': verifyKey });
    expectStatus(verified, 200);
    expect((verified.json as { status: string }).status).toBe('paid');
    const verifiedAgain = await call(cookie, 'POST', '/api/v1/billing/verify', captured.checkout, { 'idempotency-key': verifyKey });
    expectStatus(verifiedAgain, 200);
    expect(header(verifiedAgain, 'idempotent-replayed')).toBe('true');

    const provision = await call(cookie, 'POST', '/api/v1/onboarding/provision');
    expectStatus(provision, 200);
    expect((provision.json as { tenant: { status: string } }).tenant.status).toBe('active');
    const invoices = await call(cookie, 'GET', '/api/v1/billing/invoices');
    expectStatus(invoices, 200);
    const list = invoices.json as { id: string; number: string }[];
    expect(list).toHaveLength(1);
    const invoiceId = list[0]!.id;
    expect(list[0]!.number.length).toBeLessThanOrEqual(16);

    const invoice = await call(cookie, 'GET', `/api/v1/billing/invoices/${invoiceId}`);
    expectStatus(invoice, 200);
    assertGst(invoice.json as InvoiceDto, false, '27');
    const pdf = await call(cookie, 'GET', `/api/v1/billing/invoices/${invoiceId}/pdf`);
    expect(pdf.status, pdf.body.slice(0, 120)).toBe(200);
    expect(header(pdf, 'content-type')).toContain('application/pdf');
    expect(pdf.body.startsWith('%PDF')).toBe(true);

    const me = await call(cookie, 'GET', '/api/v1/auth/me');
    expectStatus(me, 200);
    const tenantMe = me.json as TenantMe;
    expect(tenantMe.tenant.status).toBe('active');
    expect(tenantMe.tenant.displayName).toBe('zz-test Lakeside Demo');
    expect(tenantMe.features).toContain(featureKey('patient-registration', 'New Registration'));
    expect(tenantMe.features).not.toContain(featureKey('cpoe', 'Chief Complaints'));

    const verifyAudit = await call(cookie, 'GET', '/api/v1/tenant/audit/verify');
    expectStatus(verifyAudit, 200);
    expect((verifyAudit.json as { ok: boolean; entries: number }).ok).toBe(true);
    expect((verifyAudit.json as { entries: number }).entries).toBeGreaterThan(0);

    const before = await auditTotal(cookie);
    const invalid = await call(cookie, 'POST', '/api/v1/tenant/privacy/requests', {});
    expect(invalid.status).toBeGreaterThanOrEqual(400);
    expect(await auditTotal(cookie)).toBe(before);
    const recorded = await call(cookie, 'POST', '/api/v1/tenant/privacy/requests', {
      type: 'access',
      principalName: 'Fictional Patient',
      principalContact: 'patient@hospitalos.test',
      details: 'Please send a copy of my sample records.',
    });
    expectStatus(recorded, 200);
    expect(await auditTotal(cookie)).toBe(before + 1);

    const adminDenied = await call(cookie, 'GET', '/api/v1/admin/overview');
    expectStatus(adminDenied, 403);
    expect((adminDenied.json as { error?: { code?: string } }).error?.code).toBe('forbidden');
    const locked = await call(cookie, 'GET', '/api/v1/tenant/m/cpoe');
    expectStatus(locked, 403);
    expect((locked.json as { error?: { code?: string } }).error?.code).toBe('not_entitled');

    const locations = await call(cookie, 'GET', '/api/v1/tenant/locations');
    expectStatus(locations, 200);
    const locationId = (locations.json as { id: string }[])[0]?.id;
    expect(locationId).toBeTruthy();
    const beforeInvite = await auditTotal(cookie);
    const invite = await call(cookie, 'POST', '/api/v1/tenant/users/invite', {
      name: 'Cashier Demo',
      email: `cashier.${randomUUID()}@hospitalos.test`,
      roleKey: 'cashier',
      locationIds: [locationId],
    });
    expectStatus(invite, 200);
    expect(await auditTotal(cookie)).toBe(beforeInvite + 1);
    const inviteUrl = (invite.json as { devInviteUrl?: string }).devInviteUrl;
    expect(inviteUrl, 'invite did not return devInviteUrl').toBeTruthy();
    const token = new URL(inviteUrl!).searchParams.get('invite');
    expect(token).toBeTruthy();
    const accepted = await call('', 'POST', '/api/v1/auth/accept-invite', { token, password: 'Cashier#2026' });
    expectStatus(accepted, 200);
    const cashier = sessionCookie(accepted.headers);
    expect(cashier).toBeTruthy();
    const forbidden = await call(cashier!, 'POST', '/api/v1/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': idem() });
    expectStatus(forbidden, 403);
    expect((forbidden.json as { error?: { code?: string } }).error?.code).toBe('forbidden');

    intraInvoiceId = invoiceId;
    intraCookie = cookie;
  });

  it('raises an inter-state IGST invoice and hides it from the other hospital', async () => {
    expect(intraInvoiceId, 'intra-state invoice id from the prior example').toBeTruthy();
    expect(intraCookie, 'intra-state session from the prior example').toBeTruthy();
    const cookie = await signUp('Fictional Narmada Nursing Home', 'Narmada Demo', '23', 'Indore', '452001');
    const basicId = await basicPlan();
    expectStatus(await call(cookie, 'PUT', '/api/v1/onboarding/plan', { planId: basicId, cycle: 'monthly', locationCount: 1 }), 200);
    expectStatus(await call(cookie, 'PUT', '/api/v1/onboarding/addons', { moduleIds: [] }), 200);
    const quote = await call(cookie, 'GET', '/api/v1/onboarding/quote');
    expectStatus(quote, 200);
    assertGst(quote.json as QuoteDto, true, '23');

    const order = await call(cookie, 'POST', '/api/v1/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': idem() });
    expectStatus(order, 200);
    const orderId = (order.json as { id: string }).id;

    const failed = await call(
      cookie,
      'POST',
      `/api/v1/billing/orders/${orderId}/pay`,
      { method: 'card', outcome: 'failure', details: { cardLast4: '4242', cardNetwork: 'Visa' } },
      { 'idempotency-key': idem() },
    );
    expectStatus(failed, 200);
    expect((failed.json as { payment: { status: string } }).payment.status).toBe('failed');

    const pending = await call(
      cookie,
      'POST',
      `/api/v1/billing/orders/${orderId}/pay`,
      { method: 'upi', outcome: 'pending', details: {} },
      { 'idempotency-key': idem() },
    );
    expectStatus(pending, 200);
    const pendingId = (pending.json as { payment: { id: string } }).payment.id;
    const declined = await resolvePayment(pendingId, 'failure');
    expectStatus(declined, 200);
    expect((declined.json as { status: string }).status).toBe('failed');

    const pendingAgain = await call(
      cookie,
      'POST',
      `/api/v1/billing/orders/${orderId}/pay`,
      { method: 'upi', outcome: 'pending', details: {} },
      { 'idempotency-key': idem() },
    );
    expectStatus(pendingAgain, 200);
    const pendingAgainId = (pendingAgain.json as { payment: { id: string } }).payment.id;
    const resolved = await resolvePayment(pendingAgainId, 'success');
    expectStatus(resolved, 200);
    expect((resolved.json as { status: string }).status).toBe('captured');

    const invoices = await call(cookie, 'GET', '/api/v1/billing/invoices');
    expectStatus(invoices, 200);
    const list = invoices.json as { id: string; number: string }[];
    expect(list).toHaveLength(1);
    expect(list[0]!.number.length).toBeLessThanOrEqual(16);
    const invoice = await call(cookie, 'GET', `/api/v1/billing/invoices/${list[0]!.id}`);
    expectStatus(invoice, 200);
    assertGst(invoice.json as InvoiceDto, true, '23');
    const pdf = await call(cookie, 'GET', `/api/v1/billing/invoices/${list[0]!.id}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.body.startsWith('%PDF')).toBe(true);

    const provision = await call(cookie, 'POST', '/api/v1/onboarding/provision');
    expectStatus(provision, 200);
    expect((provision.json as { tenant: { status: string } }).tenant.status).toBe('active');

    const hidden = await call(cookie, 'GET', `/api/v1/billing/invoices/${intraInvoiceId}`);
    expectStatus(hidden, 404);
    const hiddenBack = await call(intraCookie, 'GET', `/api/v1/billing/invoices/${list[0]!.id}`);
    expectStatus(hiddenBack, 404);
  });

  it('ignores a client failure when the simulator is off and replays the pay key once', async () => {
    await setSimulator(false);
    try {
      const cookie = await signUp('Fictional Simulator Off Nursing Home', 'Simulator Off', '27', 'Pune', '411001');
      const basicId = await basicPlan();
      expectStatus(await call(cookie, 'PUT', '/api/v1/onboarding/plan', { planId: basicId, cycle: 'monthly', locationCount: 1 }), 200);
      expectStatus(await call(cookie, 'PUT', '/api/v1/onboarding/addons', { moduleIds: [] }), 200);
      const order = await call(cookie, 'POST', '/api/v1/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': idem() });
      expectStatus(order, 200);
      const orderId = (order.json as { id: string }).id;
      const payKey = idem();
      const body = { method: 'upi', outcome: 'failure', details: { vpa: 'asha.demo@upi' } };
      const paid = await call(cookie, 'POST', `/api/v1/billing/orders/${orderId}/pay`, body, { 'idempotency-key': payKey });
      expectStatus(paid, 200);
      const captured = paid.json as { order: { status: string }; payment: { status: string; id: string }; checkout: unknown };
      expect(captured.payment.status).toBe('captured');
      expect(captured.order.status).toBe('paid');
      expect(captured.checkout).not.toBeNull();
      expect(await countPayments(orderId)).toBe(1);

      const replay = await call(cookie, 'POST', `/api/v1/billing/orders/${orderId}/pay`, body, { 'idempotency-key': payKey });
      expectStatus(replay, 200);
      expect(header(replay, 'idempotent-replayed')).toBe('true');
      expect((replay.json as { payment: { id: string; status: string } }).payment.id).toBe(captured.payment.id);
      expect((replay.json as { payment: { status: string } }).payment.status).toBe('captured');
      expect(await countPayments(orderId)).toBe(1);
    } finally {
      await setSimulator(true);
    }
  });

  async function signUp(legalName: string, displayName: string, stateCode: string, city: string, pincode: string): Promise<string> {
    const notice = await call('', 'GET', '/api/v1/privacy-notice/current');
    expectStatus(notice, 200);
    const version = (notice.json as { version?: string }).version;
    expect(version).toBeTruthy();
    const gstinBody = `${stateCode}ABCDE1234F1Z`;
    const signup = await call('', 'POST', '/api/v1/auth/signup', {
      name: 'Asha Demo',
      email: `owner.${randomUUID()}@hospitalos.test`,
      mobile: mobile(),
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
    expect(challenge.devCode).toMatch(/^[0-9]{6}$/);
    const verified = await call('', 'POST', '/api/v1/auth/otp/verify', { challengeId: challenge.challengeId, code: challenge.devCode });
    expectStatus(verified, 200);
    const cookie = sessionCookie(verified.headers);
    expect(cookie, 'otp verify did not set hos_session').toBeTruthy();
    const runTag = randomUUID().slice(0, 8);
    const facility = await call(cookie!, 'PUT', '/api/v1/onboarding/facility', {
      facilityType: 'nursing_home',
      legalName: `zz-test-${runTag} ${legalName}`,
      displayName: `zz-test ${displayName}`,
      gstin: `${gstinBody}${gstinCheckDigit(gstinBody)}`,
      registrationNo: 'LIC-DEMO-001',
      bedCount: 12,
      specialities: ['General Medicine'],
    });
    expectStatus(facility, 200);
    const locations = await call(cookie!, 'PUT', '/api/v1/onboarding/locations', {
      locations: [{ name: city, addressLine1: '12 Demo Marg', city, stateCode, pincode, departments: ['OPD', 'General Ward'] }],
    });
    expectStatus(locations, 200);
    return cookie!;
  }

  async function basicPlan(): Promise<string> {
    const catalog = await call('', 'GET', '/api/v1/catalog');
    expectStatus(catalog, 200);
    const id = (catalog.json as { plans: { id: string; key: string }[] }).plans.find((plan) => plan.key === 'basic')?.id;
    expect(id, 'catalogue has no Basic plan').toBeTruthy();
    return id!;
  }

  async function auditTotal(cookie: string): Promise<number> {
    const res = await call(cookie, 'GET', '/api/v1/tenant/audit');
    expectStatus(res, 200);
    return (res.json as { total: number }).total;
  }

  async function setSimulator(enabled: boolean): Promise<void> {
    if (!admin) return;
    const updated = await admin.query('update platform_settings set mock_payment_simulator = $1 where id = 1', [enabled]);
    if (updated.rowCount !== 1) throw new Error('platform_settings row is missing');
  }

  async function resolvePayment(paymentId: string, outcome: 'success' | 'failure'): Promise<ApiResult> {
    const body = { paymentId, outcome };
    const secret = process.env.MOCK_GATEWAY_KEY_SECRET || 'mock_secret_change_me_dev_only';
    return call('', 'POST', '/api/v1/billing/webhooks/mock', body, {
      'idempotency-key': idem(),
      'x-hos-signature': webhookSignature(secret, body),
    });
  }

  async function countPayments(publicOrderId: string): Promise<number> {
    const row = await admin!.query<{ n: number }>(
      `select count(*)::int as n from payments where order_id = (select id from orders where public_id = $1)`,
      [publicOrderId],
    );
    return Number(row.rows[0]?.n);
  }

  async function countOpenOrders(publicId: string): Promise<number> {
    const row = await admin!.query<{ n: number }>(
      `select count(*)::int as n
         from orders
        where tenant_id = (select tenant_id from orders where public_id = $1)
          and status in ('created', 'attempted')`,
      [publicId],
    );
    return Number(row.rows[0]?.n);
  }

  function mobile(): string {
    stamp += 1;
    return `9${String(Date.now() + stamp).slice(-9)}`;
  }

  function idem(): string {
    return `idem-${randomUUID()}`;
  }
});

let intraInvoiceId = '';
let intraCookie = '';

function sign(orderId: string, paymentId: string): string {
  const secret = process.env.MOCK_GATEWAY_KEY_SECRET || 'mock_secret_change_me_dev_only';
  return createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

function assertGst(doc: QuoteDto | InvoiceDto, interState: boolean, place: string): void {
  expect(doc.placeOfSupplyStateCode).toBe(place);
  const totals = 'totals' in doc ? doc.totals : doc;
  expect(totals.interState).toBe(interState);
  expect(totals.totalPaise).toBe(totals.taxablePaise + (totals.cgstPaise + totals.sgstPaise + totals.igstPaise));
  if (interState) {
    expect(totals.cgstPaise).toBe(0);
    expect(totals.sgstPaise).toBe(0);
    expect(totals.igstPaise).toBeGreaterThan(0);
  } else {
    expect(totals.igstPaise).toBe(0);
    expect(totals.cgstPaise).toBeGreaterThan(0);
    expect(totals.cgstPaise).toBe(totals.sgstPaise);
  }
  if ('lines' in doc && Array.isArray(doc.lines)) {
    for (const line of doc.lines) {
      if (interState) {
        expect(line.cgstPaise).toBe(0);
        expect(line.sgstPaise).toBe(0);
      } else {
        expect(line.igstPaise).toBe(0);
      }
    }
  }
}

async function call(
  cookie: string,
  method: string,
  url: string,
  body?: unknown,
  extra: Record<string, string> = {},
): Promise<ApiResult> {
  if (!app) throw new Error('app was not started');
  const res = await app.inject({
    method,
    url,
    headers: {
      ...csrf,
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...extra,
    },
    payload: body,
  });
  return { status: res.statusCode, json: parseBody(res.body), body: res.body, headers: res.headers };
}

function parseBody(body: string): unknown {
  const trimmed = body.trimStart();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function expectStatus(res: ApiResult, status: number): void {
  const detail = res.json == null ? res.body.slice(0, 400) : JSON.stringify(res.json).slice(0, 800);
  expect(res.status, detail).toBe(status);
}

function header(res: ApiResult, name: string): string | undefined {
  const value = res.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value == null ? undefined : String(value);
}

function sessionCookie(headers: Injected['headers']): string | null {
  const raw = headers['set-cookie'];
  const lines = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
  for (const line of lines) {
    const match = /hos_session=([^;]+)/.exec(line);
    if (match?.[1]) return `hos_session=${match[1]}`;
  }
  return null;
}
