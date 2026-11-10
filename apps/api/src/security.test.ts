import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from './app';

const app = await buildApp();
const csrf = { 'x-hos-csrf': '1' };

let ownerCookie = '';
let wizardCookie = '';
let wizardUserId = '';
let ownerInvoiceId = '';
let orderId = '';
let paymentId = '';
let idemKey = '';

beforeAll(async () => {
  await app.ready();
  ownerCookie = await login('owner@sunrise.demo', 'Demo@12345');
  const invoices = await app.inject({ method: 'GET', url: '/api/v1/billing/invoices', headers: { cookie: ownerCookie } });
  expect(invoices.statusCode).toBe(200);
  ownerInvoiceId = invoices.json()[0].id as string;

  const notice = await app.inject({ method: 'GET', url: '/api/v1/privacy-notice/current' });
  expect(notice.statusCode).toBe(200);
  const stamp = Date.now();
  const signup = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    headers: csrf,
    payload: {
      name: 'Wizard Fictional',
      email: `wizard.${stamp}@example.com`,
      mobile: `9${String(stamp).slice(-9)}`,
      password: 'Demo@12345',
      designation: 'owner',
      acceptTerms: true,
      acceptPrivacy: true,
      productUpdates: false,
      noticeVersion: notice.json().version,
    },
  });
  expect(signup.statusCode, signup.body).toBe(200);
  const devCode = signup.json().devCode as string;
  expect(devCode).toMatch(/^[0-9]{6}$/);
  const verified = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp/verify',
    headers: csrf,
    payload: { challengeId: signup.json().challengeId, code: devCode },
  });
  expect(verified.statusCode, verified.body).toBe(200);
  wizardCookie = cookieOf(verified);
  wizardUserId = verified.json().user.id as string;

  const facility = await send(wizardCookie, 'PUT', '/api/v1/onboarding/facility', {
    facilityType: 'hospital',
    legalName: 'Fictional Test Hospital',
    displayName: 'Fictional Test Hospital',
    gstin: '',
    registrationNo: 'REG-FICTION-1',
    bedCount: 12,
    specialities: ['General Medicine'],
  });
  expect(facility.statusCode, facility.body).toBe(200);

  const locations = await send(wizardCookie, 'PUT', '/api/v1/onboarding/locations', {
    locations: [
      {
        name: 'Fiction Ward',
        addressLine1: '1 Sample Road',
        city: 'Mumbai',
        stateCode: '27',
        pincode: '400001',
        departments: ['OPD'],
      },
    ],
  });
  expect(locations.statusCode, locations.body).toBe(200);

  const catalog = await app.inject({ method: 'GET', url: '/api/v1/catalog' });
  const planId = catalog.json().plans[0].id as string;
  const plan = await send(wizardCookie, 'PUT', '/api/v1/onboarding/plan', { planId, cycle: 'monthly', locationCount: 1 });
  expect(plan.statusCode, plan.body).toBe(200);
  const addons = await send(wizardCookie, 'PUT', '/api/v1/onboarding/addons', { moduleIds: [] });
  expect(addons.statusCode, addons.body).toBe(200);

  idemKey = `idem-${stamp}`;
  const first = await send(wizardCookie, 'POST', '/api/v1/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': idemKey });
  expect(first.statusCode, first.body).toBe(200);
  orderId = first.json().id as string;

  const paid = await send(
    wizardCookie,
    'POST',
    `/api/v1/billing/orders/${orderId}/pay`,
    { method: 'upi', outcome: 'success', details: {} },
    { 'idempotency-key': `pay-${stamp}` },
  );
  expect(paid.statusCode, paid.body).toBe(200);
  paymentId = paid.json().checkout.paymentId as string;
}, 60_000);

afterAll(async () => {
  await app.close();
});

it('replays an order create that repeats the same idempotency key', async () => {
  const replay = await send(wizardCookie, 'POST', '/api/v1/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': idemKey });
  expect(replay.statusCode, replay.body).toBe(200);
  expect(replay.headers['idempotent-replayed']).toBe('true');
  expect(replay.json().id).toBe(orderId);
});

it('hides another tenant’s invoice and user (404, not 403)', async () => {
  const invoice = await app.inject({
    method: 'GET',
    url: `/api/v1/billing/invoices/${ownerInvoiceId}`,
    headers: { cookie: wizardCookie },
  });
  expect(invoice.statusCode).toBe(404);
  const user = await send(ownerCookie, 'PATCH', `/api/v1/tenant/users/${wizardUserId}`, { status: 'disabled' });
  expect(user.statusCode).toBe(404);
  expect(user.json().error.code).toBe('not_found');
});

it('returns not_entitled for a module the plan does not include', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/tenant/m/not-a-real-module',
    headers: { cookie: ownerCookie },
  });
  expect(res.statusCode).toBe(403);
  expect(res.json().error.code).toBe('not_entitled');
});

it('rejects a tampered payment signature', async () => {
  const missing = await send(wizardCookie, 'POST', '/api/v1/billing/verify', {
    orderId,
    paymentId,
    signature: 'ab'.repeat(32),
  });
  expect(missing.statusCode).toBe(400);
  expect(missing.json().error.code).toBe('idempotency_key_required');
  const res = await send(
    wizardCookie,
    'POST',
    '/api/v1/billing/verify',
    {
      orderId,
      paymentId,
      signature: 'ab'.repeat(32),
    },
    { 'idempotency-key': 'verify-tampered-1' },
  );
  expect(res.statusCode).toBe(400);
  expect(res.json().error.code).toBe('signature_invalid');
});

it('rejects onboarding routes after go-live', async () => {
  const read = await app.inject({ method: 'GET', url: '/api/v1/onboarding', headers: { cookie: ownerCookie } });
  expect(read.statusCode).toBe(409);
  expect(read.json().error.code).toBe('onboarding_closed');
  const write = await send(ownerCookie, 'PUT', '/api/v1/onboarding/facility', {
    facilityType: 'hospital',
    legalName: 'Should Not Save',
    displayName: 'Should Not Save',
    gstin: '',
    registrationNo: 'REG-NOPE',
    bedCount: 1,
    specialities: [],
  });
  expect(write.statusCode).toBe(409);
  expect(write.json().error.code).toBe('onboarding_closed');
});

async function login(email: string, password: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: csrf, payload: { email, password } });
  expect(res.statusCode, res.body).toBe(200);
  return cookieOf(res);
}

function cookieOf(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie'];
  const line = Array.isArray(raw) ? raw.join(';') : (raw ?? '');
  const match = /hos_session=([^;]+)/.exec(line);
  if (!match) throw new Error('session cookie missing');
  return `hos_session=${match[1]}`;
}

async function send(
  cookie: string,
  method: 'POST' | 'PUT' | 'PATCH',
  url: string,
  payload: Record<string, unknown>,
  extra: Record<string, string> = {},
): Promise<LightMyRequestResponse> {
  return app.inject({ method, url, payload, headers: { ...csrf, cookie, ...extra } });
}
