import { randomUUID } from 'node:crypto';
import { dbEnv } from '@hos/db';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, expectIsolation, type ClinicalFixture } from '../testkit';

const PREFIX = '/api/v1/tenant/m/insurance';
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

it('creates a payer and a request, lists them, then approves and refuses a second decision', async () => {
  const cookie = await login('owner@sunrise.demo');
  const payerRes = await app.inject({
    method: 'POST',
    url: `${PREFIX}/payers`,
    headers: headers(cookie),
    payload: { name: `Sample Test Payer ${randomUUID().slice(0, 8)}`, payerType: 'tpa', copayPct: 5, creditDays: 45 },
  });
  expect(payerRes.statusCode, payerRes.body).toBe(200);
  const payer = payerRes.json() as { id: string };

  const created = await app.inject({
    method: 'POST',
    url: `${PREFIX}/requests`,
    headers: headers(cookie),
    payload: { payerId: payer.id, kind: 'preauth', patientName: 'Test Patient (Sample)', uhid: 'DEMO-INS-T001', estimatedPaise: 5000000 },
  });
  expect(created.statusCode, created.body).toBe(200);
  const request = created.json() as { id: string; status: string };
  expect(request.status).toBe('submitted');

  const list = await app.inject({ method: 'GET', url: `${PREFIX}/requests?status=submitted`, headers: { cookie } });
  expect(list.statusCode, list.body).toBe(200);
  expect((list.json() as { id: string }[]).some((r) => r.id === request.id)).toBe(true);

  const approved = await app.inject({
    method: 'POST',
    url: `${PREFIX}/requests/${request.id}/approve`,
    headers: headers(cookie),
    payload: { approvedPaise: 4500000 },
  });
  expect(approved.statusCode, approved.body).toBe(200);
  expect(approved.json()).toMatchObject({ status: 'approved', approvedPaise: 4500000 });

  const again = await app.inject({
    method: 'POST',
    url: `${PREFIX}/requests/${request.id}/reject`,
    headers: headers(cookie),
    payload: { reason: 'Too late' },
  });
  expect(again.statusCode).toBe(409);
});

it('keeps another hospital out: not entitled over the API, invisible and unwritable in Postgres', async () => {
  const lotus = await login('owner@lotus.demo');
  const res = await app.inject({ method: 'GET', url: `${PREFIX}/requests`, headers: { cookie: lotus } });
  expect(res.statusCode).toBe(403);

  const admin = new pg.Client({ connectionString: dbEnv().adminUrl });
  await admin.connect();
  try {
    const payer = await admin.query<{ id: string }>(
      `insert into insurance_payers (tenant_id, name, payer_type, is_sample) values ($1, $2, 'insurer', true) returning id`,
      [fx.lotus.tenantId, `Lotus Sample Payer ${randomUUID().slice(0, 8)}`],
    );
    await expectIsolation('insurance_payers', payer.rows[0]!.id);
    const req = await admin.query<{ id: string }>(
      `insert into insurance_requests (tenant_id, payer_id, patient_name, estimated_paise, is_sample)
       values ($1, $2, 'Lotus Patient (Sample)', 100000, true) returning id`,
      [fx.lotus.tenantId, payer.rows[0]!.id],
    );
    await expectIsolation('insurance_requests', req.rows[0]!.id);

    const sunrise = await login('owner@sunrise.demo');
    const list = await app.inject({ method: 'GET', url: `${PREFIX}/requests`, headers: { cookie: sunrise } });
    expect((list.json() as { id: string }[]).some((r) => r.id === req.rows[0]!.id)).toBe(false);
    const get = await app.inject({ method: 'GET', url: `${PREFIX}/requests/${req.rows[0]!.id}`, headers: { cookie: sunrise } });
    expect(get.statusCode).toBe(404);
  } finally {
    await Promise.race([admin.end(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
});
