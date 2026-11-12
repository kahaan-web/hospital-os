import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, type ClinicalFixture } from '../testkit';

// MVP demo slice smoke tests: create, list, and cross-tenant isolation for equipment maintenance.
const PREFIX = '/api/v1/tenant/m/equipment-maintenance';
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

it('creates an asset for Sunrise and lists it', async () => {
  const cookie = await login('owner@sunrise.demo');
  const tag = `EQ-T-${randomUUID().slice(0, 8)}`;
  const created = await app.inject({
    method: 'POST',
    url: `${PREFIX}/assets`,
    headers: headers(cookie),
    payload: { assetTag: tag, name: 'Test ECG machine', criticality: 'high', purchaseCostPaise: 400000 },
  });
  expect(created.statusCode, created.body).toBe(200);

  const list = await app.inject({ method: 'GET', url: `${PREFIX}/assets`, headers: { cookie } });
  expect(list.statusCode, list.body).toBe(200);
  expect((list.json() as { assetTag: string }[]).some((row) => row.assetTag === tag)).toBe(true);
});

it('keeps Lotus out: no list, no detail, for a Sunrise asset', async () => {
  const sunrise = await login('owner@sunrise.demo');
  const list = await app.inject({ method: 'GET', url: `${PREFIX}/assets`, headers: { cookie: sunrise } });
  const assetId = (list.json() as { id: string }[])[0]?.id;
  expect(assetId).toBeTruthy();

  const lotus = await login('owner@lotus.demo');
  const lotusList = await app.inject({ method: 'GET', url: `${PREFIX}/assets`, headers: { cookie: lotus } });
  expect(lotusList.statusCode).toBe(403);
  expect(lotusList.json()).toMatchObject({ error: { code: 'not_entitled' } });

  const lotusDetail = await app.inject({ method: 'GET', url: `${PREFIX}/assets/${assetId}`, headers: { cookie: lotus } });
  expect(lotusDetail.statusCode).toBe(403);
});
