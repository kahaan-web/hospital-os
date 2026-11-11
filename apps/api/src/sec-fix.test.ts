import { createDb, dbEnv } from '@hos/db';
import { sql } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from './app';

const app = await buildApp();
const csrf = { 'x-hos-csrf': '1' };

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

it('keeps unknown logins off the platform pool and the platform audit chain', async () => {
  const adminCookie = await login('admin@hospitalos.test', 'Admin@12345');
  const before = await platformChainRows();
  const stamp = Date.now();
  const flood = Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: csrf,
        payload: { email: `nobody.${stamp}.${i}@sbx.hospitalos.test`, password: 'not-a-real-password' },
      }),
    ),
  );
  const started = Date.now();
  const overview = await app.inject({ method: 'GET', url: '/api/v1/admin/overview', headers: { cookie: adminCookie } });
  const elapsed = Date.now() - started;
  const results = await flood;
  expect(results.every((res) => res.statusCode === 401)).toBe(true);
  expect(overview.statusCode, overview.body).toBe(200);
  expect(elapsed, 'platform overview waited on the login flood').toBeLessThan(1000);
  const wrong = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: csrf,
    payload: { email: 'owner@sunrise.demo', password: 'not-the-demo-password' },
  });
  expect(wrong.statusCode).toBe(401);
  // The overview read itself appends one platform audit row. The 20 unknown
  // emails and the tenant password failure must not append any more.
  expect(await platformChainRows()).toBe(before + 1);
});

it('does not replay one user idempotency body to another user', async () => {
  const owner = await login('owner@sunrise.demo', 'Demo@12345');
  const admin = await login('location.admin@sunrise.demo', 'Demo@12345');
  const locations = await app.inject({ method: 'GET', url: '/api/v1/tenant/locations', headers: { cookie: owner } });
  expect(locations.statusCode, locations.body).toBe(200);
  const locationId = (locations.json() as { id: string }[])[0]?.id;
  expect(locationId).toBeTruthy();
  const key = `invite-${Date.now()}-actor`;
  const body = {
    name: 'Idem Sample',
    email: `idem.actor.${Date.now()}@sbx.hospitalos.test`,
    roleKey: 'front_desk',
    locationIds: [locationId],
  };
  const first = await app.inject({
    method: 'POST',
    url: '/api/v1/tenant/users/invite',
    headers: { ...csrf, cookie: owner, 'idempotency-key': key },
    payload: body,
  });
  expect(first.statusCode, first.body).toBe(200);
  const inviteUrl = first.json().devInviteUrl as string;
  expect(inviteUrl).toContain('invite=');
  const second = await app.inject({
    method: 'POST',
    url: '/api/v1/tenant/users/invite',
    headers: { ...csrf, cookie: admin, 'idempotency-key': key },
    payload: body,
  });
  expect(second.statusCode, second.body).toBe(409);
  expect(second.headers['idempotent-replayed']).toBeUndefined();
  expect(JSON.stringify(second.json())).not.toContain(inviteUrl);
});

async function platformChainRows(): Promise<number> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const counted = await handle.db.execute<{ n: number }>(sql`select count(*)::int as n from audit_log where chain_key = 'platform'`);
    return Number(counted.rows[0]?.n ?? 0);
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

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
