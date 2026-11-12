import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../app';
import { clinicalFixture, closeClinicalPools, type ClinicalFixture } from './testkit';

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
  expect(res.statusCode, res.body).toBe(200);
  const setCookie = res.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return String(cookie).split(';')[0] ?? '';
}

it('serves the lab TAT and critical-value reports and rejects anonymous callers', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const range = 'from=2020-01-01&to=2099-12-31';
  const tat = await app.inject({ method: 'GET', url: `/api/v1/tenant/m/lab/reports/tat?${range}`, headers: { cookie } });
  expect(tat.statusCode, tat.body).toBe(200);
  expect(Array.isArray(tat.json())).toBe(true);
  const critical = await app.inject({ method: 'GET', url: `/api/v1/tenant/m/lab/reports/critical?${range}`, headers: { cookie } });
  expect(critical.statusCode, critical.body).toBe(200);
  expect(Array.isArray(critical.json())).toBe(true);
  const backwards = await app.inject({ method: 'GET', url: '/api/v1/tenant/m/lab/reports/tat?from=2026-02-01&to=2026-01-01', headers: { cookie } });
  expect(backwards.statusCode).toBe(422);
  const anonymous = await app.inject({ method: 'GET', url: `/api/v1/tenant/m/lab/reports/tat?${range}` });
  expect(anonymous.statusCode).toBe(401);
}, 60_000);

it('serves the pharmacy Schedule H1 / X register', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/tenant/m/pharmacy/reports/h1-register',
    headers: { cookie, 'idempotency-key': randomUUID() },
  });
  expect(res.statusCode, res.body).toBe(200);
  const body = res.json() as { key: string; title: string; columns: string[]; rows: string[][] };
  expect(body.key).toBe('h1-register');
  expect(body.columns).toContain('Batch');
  expect(Array.isArray(body.rows)).toBe(true);
}, 60_000);

it('lists and adds patient allergies through the alerts API', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const url = `/api/v1/tenant/clinical/patients/${fx.sunrise.patientId}/alerts`;
  const added = await app.inject({
    method: 'POST',
    url,
    headers: { cookie, 'x-hos-csrf': '1', 'idempotency-key': randomUUID() },
    payload: { kind: 'allergy', text: 'Penicillin: rash', severity: 'high' },
  });
  expect(added.statusCode, added.body).toBeLessThan(300);
  const list = await app.inject({ method: 'GET', url, headers: { cookie } });
  expect(list.statusCode, list.body).toBe(200);
  const rows = list.json() as Array<{ kind: string; text: string }>;
  expect(rows.some((row) => row.kind === 'allergy' && row.text === 'Penicillin: rash')).toBe(true);
}, 60_000);
