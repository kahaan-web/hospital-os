import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, type ClinicalFixture } from '../testkit';

// MVP demo slice smoke tests: linen stock, send to laundry, list and cross-tenant isolation.
const PREFIX = '/api/v1/tenant/m/linen-laundry';
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

it('creates a linen item, sends it to the laundry and lists the batch for Sunrise', async () => {
  const cookie = await login('owner@sunrise.demo');
  const item = await app.inject({
    method: 'POST',
    url: `${PREFIX}/stock`,
    headers: headers(cookie),
    payload: { name: `Smoke sheet ${randomUUID().slice(0, 8)}`, cleanQty: 10 },
  });
  expect(item.statusCode, item.body).toBeLessThan(300);
  const { id: linenItemId } = item.json() as { id: string };

  const sent = await app.inject({
    method: 'POST',
    url: `${PREFIX}/laundry-batches`,
    headers: headers(cookie),
    payload: { linenItemId, qtySent: 4 },
  });
  expect(sent.statusCode, sent.body).toBeLessThan(300);

  const tooMany = await app.inject({
    method: 'POST',
    url: `${PREFIX}/laundry-batches`,
    headers: headers(cookie),
    payload: { linenItemId, qtySent: 999 },
  });
  expect(tooMany.statusCode).toBe(422);

  const list = await app.inject({ method: 'GET', url: `${PREFIX}/laundry-batches`, headers: { cookie } });
  expect(list.statusCode, list.body).toBe(200);
  const rows = list.json() as { linenItemId: string; qtySent: number }[];
  expect(rows.some((row) => row.linenItemId === linenItemId && row.qtySent === 4)).toBe(true);
});

it('keeps Lotus (Basic, no linen module) out of Sunrise linen', async () => {
  const cookie = await login('owner@lotus.demo');
  const res = await app.inject({ method: 'GET', url: `${PREFIX}/stock`, headers: { cookie } });
  expect(res.statusCode).toBe(403);
  expect(res.json()).toMatchObject({ error: { code: 'not_entitled' } });
});
