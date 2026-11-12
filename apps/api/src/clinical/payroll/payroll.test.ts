import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, type ClinicalFixture } from '../testkit';

// MVP demo slice smoke tests: create, list, attendance mark, payslip preview, and cross-tenant isolation.
const PREFIX = '/api/v1/tenant/m/payroll-attendance';
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

it('creates an employee, marks attendance and previews the payslip for Sunrise', async () => {
  const cookie = await login('owner@sunrise.demo');
  const code = `EMP-T-${randomUUID().slice(0, 6)}`;
  const created = await app.inject({
    method: 'POST',
    url: `${PREFIX}/employees`,
    headers: headers(cookie),
    payload: { employeeCode: code, fullName: 'Test Staff Member', monthlyBasicPaise: 3_000_000 },
  });
  expect(created.statusCode, created.body).toBe(200);
  const employeeId = (created.json() as { id: string }).id;

  const marked = await app.inject({
    method: 'PUT',
    url: `${PREFIX}/employees/${employeeId}/attendance`,
    headers: headers(cookie),
    payload: { workDate: '2026-11-05', status: 'absent', note: 'Smoke test' },
  });
  expect(marked.statusCode, marked.body).toBe(200);

  // 30-day month with one absent day: gross = 29/30 of basic, PF capped at the ₹25,000 ceiling.
  const slip = await app.inject({
    method: 'GET',
    url: `${PREFIX}/employees/${employeeId}/payslip?month=2026-11`,
    headers: { cookie },
  });
  expect(slip.statusCode, slip.body).toBe(200);
  expect(slip.json()).toMatchObject({ grossPaise: 2_900_000, pfEmployeePaise: 300_000, esiEmployeePaise: 0, placeholderRates: true });

  const list = await app.inject({ method: 'GET', url: `${PREFIX}/employees`, headers: { cookie } });
  expect((list.json() as { employeeCode: string }[]).some((row) => row.employeeCode === code)).toBe(true);
});

it('keeps Lotus out of payroll for Sunrise staff', async () => {
  const sunrise = await login('owner@sunrise.demo');
  const list = await app.inject({ method: 'GET', url: `${PREFIX}/employees`, headers: { cookie: sunrise } });
  const employeeId = (list.json() as { id: string }[])[0]?.id;
  expect(employeeId).toBeTruthy();

  const lotus = await login('owner@lotus.demo');
  const lotusList = await app.inject({ method: 'GET', url: `${PREFIX}/employees`, headers: { cookie: lotus } });
  expect(lotusList.statusCode).toBe(403);
  expect(lotusList.json()).toMatchObject({ error: { code: 'not_entitled' } });

  const lotusSlip = await app.inject({
    method: 'GET',
    url: `${PREFIX}/employees/${employeeId}/payslip?month=2026-11`,
    headers: { cookie: lotus },
  });
  expect(lotusSlip.statusCode).toBe(403);
});
