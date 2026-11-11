import { createDb, dbEnv, schema, withTenant } from '@hos/db';
import { sql } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app';
import { totpAt } from '../../apps/api/src/crypto';

const app = await buildApp();
const csrf = { 'x-hos-csrf': '1' };
const handle = createDb(dbEnv().appUrl, { max: 4 });

let cookie = '';
let tenantId = '';
let locationId = '';

beforeAll(async () => {
  await app.ready();
  const catalog = await app.inject({ method: 'GET', url: '/api/v1/catalog' });
  expect(catalog.statusCode, catalog.body).toBe(200);
  const basicPlanId = (catalog.json().plans as { id: string; key: string }[]).find((plan) => plan.key === 'basic')!.id;
  const stamp = Date.now();
  cookie = await provision(stamp, `seats.${stamp}@sbx.hospitalos.test`, basicPlanId);
  const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } });
  expect(me.statusCode, me.body).toBe(200);
  tenantId = me.json().tenant.id as string;
  const locations = await app.inject({ method: 'GET', url: '/api/v1/tenant/locations', headers: { cookie } });
  locationId = locations.json()[0].id as string;
}, 180_000);

afterAll(async () => {
  await app.close();
  await handle.close();
});

it('lets one of ten concurrent invites take the last seat, then refuses the disabled invitee', async () => {
  await withTenant(handle.db, tenantId, async (tx) => {
    for (let i = 0; i < 6; i++) {
      await tx.insert(schema.users).values({
        tenantId,
        email: `filled.${i}.${tenantId.slice(0, 8)}@sbx.hospitalos.test`,
        name: `Filled Sample ${i}`,
        status: 'active',
      });
    }
  });

  const stamp = Date.now();
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      send(cookie, 'POST', '/api/v1/tenant/users/invite', {
        name: `Race Sample ${i}`,
        email: `race.${i}.${stamp}@sbx.hospitalos.test`,
        roleKey: 'front_desk',
        locationIds: [locationId],
      }),
    ),
  );
  const won = results.filter((res) => res.statusCode === 200);
  const limited = results.filter((res) => res.statusCode === 403 && res.json().error?.code === 'seat_limit');
  expect(won, results.map((res) => `${res.statusCode} ${res.body}`).join('\n')).toHaveLength(1);
  expect(limited).toHaveLength(9);

  const winner = won[0]!.json() as { user: { id: string; status: string }; devInviteUrl: string };
  expect(winner.user.status).toBe('pending');
  expect(await countedSeats()).toBe(8);

  const disabled = await send(cookie, 'PATCH', `/api/v1/tenant/users/${winner.user.id}`, { status: 'disabled' });
  expect(disabled.statusCode, disabled.body).toBe(200);
  expect(disabled.json().status).toBe('disabled');
  const revoked = await withTenant(handle.db, tenantId, (tx) =>
    tx.execute<{ status: string }>(sql`select status from invitations where user_id = ${winner.user.id}::uuid`),
  );
  expect(revoked.rows.length).toBeGreaterThan(0);
  expect(revoked.rows.every((row) => row.status === 'revoked')).toBe(true);

  const token = new URL(winner.devInviteUrl).searchParams.get('invite');
  expect(token).toBeTruthy();
  const accepted = await send('', 'POST', '/api/v1/auth/accept-invite', { token, password: 'Invite#2026' });
  expect(accepted.statusCode, accepted.body).toBe(400);
  expect(accepted.json().error.code).toBe('invite_invalid');
  expect(sessionCookie(accepted)).toBeNull();
  const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: sessionCookie(accepted) ?? '' } });
  expect(me.statusCode).toBe(401);

  const listed = await app.inject({ method: 'GET', url: '/api/v1/tenant/users?pageSize=100', headers: { cookie } });
  const row = (listed.json().items as { id: string; status: string }[]).find((user) => user.id === winner.user.id);
  expect(row?.status).toBe('disabled');

  const replacement = await send(cookie, 'POST', '/api/v1/tenant/users/invite', {
    name: 'Replacement Sample',
    email: `replaced.${stamp}@sbx.hospitalos.test`,
    roleKey: 'nurse',
    locationIds: [locationId],
  });
  expect(replacement.statusCode, replacement.body).toBe(200);
  expect(await countedSeats()).toBeLessThanOrEqual(8);
  expect(await countedSeats()).toBe(8);
});

it('lets a nurse set up an authenticator', async () => {
  const found = await handle.db.execute<{ tenant_id: string; user_id: string }>(
    sql`select tenant_id, user_id from hos_login_lookup('nurse@sunrise.demo')`,
  );
  const nurseRow = found.rows[0];
  expect(nurseRow).toBeTruthy();
  await withTenant(handle.db, nurseRow!.tenant_id, (tx) =>
    tx.execute(sql`update users set totp_enabled = false, totp_secret = null where id = ${nurseRow!.user_id}::uuid`),
  );
  const nurse = await login('nurse@sunrise.demo', 'Demo@12345');
  const setup = await send(nurse, 'POST', '/api/v1/auth/totp/setup', {});
  expect(setup.statusCode, setup.body).toBe(200);
  const secret = setup.json().secret as string;
  expect(secret.length).toBeGreaterThan(0);
  expect(setup.json().otpauthUrl as string).toContain('otpauth://totp/');
  const enabled = await send(nurse, 'POST', '/api/v1/auth/totp/enable', { code: totpAt(secret) });
  expect(enabled.statusCode, enabled.body).toBe(204);
  const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: nurse } });
  expect(me.statusCode, me.body).toBe(200);
  expect(me.json().user.totpEnabled).toBe(true);
});

it('keeps a single open onboarding order when two creates race', async () => {
  const catalog = await app.inject({ method: 'GET', url: '/api/v1/catalog' });
  const basicPlanId = (catalog.json().plans as { id: string; key: string }[]).find((plan) => plan.key === 'basic')!.id;
  const stamp = Date.now();
  const owner = await provision(stamp, `orders.${stamp}@sbx.hospitalos.test`, basicPlanId, false);
  const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: owner } });
  expect(me.statusCode, me.body).toBe(200);
  const hospitalId = me.json().tenant.id as string;

  const [first, second] = await Promise.all([
    send(owner, 'POST', '/api/v1/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': `race-a-${stamp}` }),
    send(owner, 'POST', '/api/v1/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': `race-b-${stamp}` }),
  ]);
  const statuses = [first.statusCode, second.statusCode].sort();
  expect(statuses.filter((code) => code === 200).length, `${first.statusCode} ${first.body}\n${second.statusCode} ${second.body}`).toBeGreaterThan(0);

  const open = await withTenant(handle.db, hospitalId, (tx) =>
    tx.execute<{ n: number }>(sql`
      select count(*)::int as n from orders
      where purpose = 'onboarding' and status in ('created', 'attempted')
    `),
  );
  expect(Number(open.rows[0]?.n)).toBe(1);
  const index = await handle.db.execute<{ indexname: string }>(sql`
    select indexname from pg_indexes where indexname = 'orders_one_open_purpose_uq'
  `);
  expect(index.rows).toHaveLength(1);
});

async function countedSeats(): Promise<number> {
  const listed = await app.inject({ method: 'GET', url: '/api/v1/tenant/users?pageSize=100', headers: { cookie } });
  expect(listed.statusCode, listed.body).toBe(200);
  return (listed.json().items as { status: string }[]).filter((user) => user.status === 'active' || user.status === 'pending').length;
}

async function provision(stamp: number, email: string, planId: string, finish = true): Promise<string> {
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
  const session = cookieOf(verified);
  expect((await send(session, 'PUT', '/api/v1/onboarding/facility', {
    facilityType: 'clinic',
    legalName: 'Lotus Demo Clinic',
    displayName: 'Lotus Demo Clinic',
    gstin: '',
    registrationNo: 'DEMO-MH-LOTUS',
    bedCount: 8,
    specialities: ['General Medicine'],
  })).statusCode).toBe(200);
  expect((await send(session, 'PUT', '/api/v1/onboarding/locations', {
    locations: [{ name: 'Lotus Sample Ward', addressLine1: '1 Sample Road', city: 'Mumbai', stateCode: '27', pincode: '400001', departments: ['OPD'] }],
  })).statusCode).toBe(200);
  expect((await send(session, 'PUT', '/api/v1/onboarding/plan', { planId, cycle: 'monthly', locationCount: 1 })).statusCode).toBe(200);
  expect((await send(session, 'PUT', '/api/v1/onboarding/addons', { moduleIds: [] })).statusCode).toBe(200);
  if (!finish) return session;
  const order = await send(session, 'POST', '/api/v1/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': `onb-${stamp}` });
  expect(order.statusCode, order.body).toBe(200);
  const paid = await send(
    session,
    'POST',
    `/api/v1/billing/orders/${order.json().id}/pay`,
    { method: 'upi', outcome: 'success', details: {} },
    { 'idempotency-key': `onbpay-${stamp}` },
  );
  expect(paid.statusCode, paid.body).toBe(200);
  expect((await send(session, 'POST', '/api/v1/billing/verify', paid.json().checkout, { 'idempotency-key': `onbver-${stamp}` })).statusCode).toBe(200);
  expect((await send(session, 'POST', '/api/v1/onboarding/provision', {})).statusCode).toBe(200);
  return session;
}

async function login(email: string, password: string): Promise<string> {
  const res = await send('', 'POST', '/api/v1/auth/login', { email, password });
  expect(res.statusCode, res.body).toBe(200);
  return cookieOf(res);
}

function send(
  cookieHeader: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload: Record<string, unknown>,
  extra: Record<string, string> = {},
): Promise<LightMyRequestResponse> {
  return app.inject({
    method,
    url,
    payload,
    headers: { ...csrf, ...(cookieHeader ? { cookie: cookieHeader } : {}), ...extra },
  });
}

function cookieOf(res: LightMyRequestResponse): string {
  const raw = sessionCookie(res);
  if (!raw) throw new Error('session cookie missing');
  return raw;
}

function sessionCookie(res: LightMyRequestResponse): string | null {
  const raw = res.headers['set-cookie'];
  const line = Array.isArray(raw) ? raw.join(';') : (raw ?? '');
  const match = /hos_session=([^;]+)/.exec(line);
  return match?.[1] ? `hos_session=${match[1]}` : null;
}
