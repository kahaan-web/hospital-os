import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, type ClinicalFixture } from '../testkit';

// MVP demo slice smoke tests: indents create, list and cross-tenant isolation.
const PREFIX = '/api/v1/tenant/m/indents-purchase';
const app = await buildApp();
let fx: ClinicalFixture;

beforeAll(async () => {
  await app.ready();
  fx = await clinicalFixture();
}, 180_000);

afterAll(async () => {
  await app.close();
  await closeClinicalPools();
});

async function login(email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'x-hos-csrf': '1' },
    payload: { email, password: fx.password },
  });
  expect(res.statusCode).toBe(200);
  const setCookie = res.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return String(cookie).split(';')[0] ?? '';
}

function headers(cookie: string) {
  return { cookie, 'x-hos-csrf': '1', 'idempotency-key': randomUUID() };
}

it('creates an indent and lists it for Sunrise', async () => {
  const cookie = await login('owner@sunrise.demo');
  const created = await app.inject({
    method: 'POST',
    url: `${PREFIX}/indents`,
    headers: headers(cookie),
    payload: { department: 'Smoke test ward', priority: 'routine', lines: [{ itemName: 'Gloves (Sample)', unit: 'box', qty: 2 }] },
  });
  expect(created.statusCode, created.body).toBeLessThan(300);
  const indent = created.json() as { id: string; status: string; lines: { qty: number }[] };
  expect(indent.status).toBe('draft');
  expect(indent.lines[0]?.qty).toBe(2);

  const list = await app.inject({ method: 'GET', url: `${PREFIX}/indents`, headers: { cookie } });
  expect(list.statusCode, list.body).toBe(200);
  const ids = (list.json() as { id: string }[]).map((row) => row.id);
  expect(ids).toContain(indent.id);
});

it('keeps Lotus (Basic, no indents module) out of Sunrise indents', async () => {
  const cookie = await login('owner@lotus.demo');
  const res = await app.inject({ method: 'GET', url: `${PREFIX}/indents`, headers: { cookie } });
  expect(res.statusCode).toBe(403);
  expect(res.json()).toMatchObject({ error: { code: 'not_entitled' } });
});
