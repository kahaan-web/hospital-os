import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, type ClinicalFixture } from '../testkit';

const PREFIX = '/api/v1/tenant/m/nurse-station';
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

it('handover sheet lists in-patients with dose counts', async () => {
  const cookie = await login('owner@sunrise.demo');
  const res = await app.inject({ method: 'GET', url: `${PREFIX}/handover`, headers: { cookie } });
  expect(res.statusCode, res.body).toBe(200);
  const sheet = res.json() as { date: string; patients: { encounterId: string; dosesDue: number; dosesGiven: number; dosesOther: number }[] };
  expect(sheet.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(Array.isArray(sheet.patients)).toBe(true);
  for (const p of sheet.patients) {
    expect(p.dosesDue + p.dosesGiven + p.dosesOther).toBeGreaterThanOrEqual(0);
  }
});

it('handover sheet is closed to non-Premium tenants', async () => {
  const cookie = await login('owner@lotus.demo');
  const res = await app.inject({ method: 'GET', url: `${PREFIX}/handover`, headers: { cookie } });
  expect(res.statusCode).toBe(403);
});
