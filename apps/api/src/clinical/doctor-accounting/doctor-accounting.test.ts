import { randomUUID } from 'node:crypto';
import { dbEnv } from '@hos/db';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, expectIsolation, type ClinicalFixture } from '../testkit';

const PREFIX = '/api/v1/tenant/m/doctor-accounting';
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

it('creates a share rule and a payout, lists them, and marks the payout paid once', async () => {
  const cookie = await login('owner@sunrise.demo');
  const doctorId = fx.sunrise.doctorId;

  const rule = await app.inject({
    method: 'POST',
    url: `${PREFIX}/rules`,
    headers: headers(cookie),
    payload: { doctorId, serviceCategory: 'consultation', encounterType: 'op', shareType: 'pct_net', shareValue: 55 },
  });
  expect(rule.statusCode, rule.body).toBe(200);
  const rules = await app.inject({ method: 'GET', url: `${PREFIX}/rules`, headers: { cookie } });
  expect(rules.statusCode).toBe(200);
  expect((rules.json() as { id: string }[]).some((r) => r.id === (rule.json() as { id: string }).id)).toBe(true);

  const bad = await app.inject({
    method: 'POST',
    url: `${PREFIX}/rules`,
    headers: headers(cookie),
    payload: { doctorId, shareType: 'pct_net', shareValue: 150 },
  });
  expect(bad.statusCode).toBe(422);

  const payout = await app.inject({
    method: 'POST',
    url: `${PREFIX}/payouts`,
    headers: headers(cookie),
    payload: { doctorId, periodFrom: '2026-11-01', periodTo: '2026-11-30', grossPaise: 1000000, sharePaise: 550000 },
  });
  expect(payout.statusCode, payout.body).toBe(200);
  const payoutId = (payout.json() as { id: string }).id;
  expect(payout.json()).toMatchObject({ status: 'pending' });

  const paid = await app.inject({
    method: 'POST',
    url: `${PREFIX}/payouts/${payoutId}/pay`,
    headers: headers(cookie),
    payload: { mode: 'upi', reference: 'SAMPLE-REF-1' },
  });
  expect(paid.statusCode, paid.body).toBe(200);
  expect(paid.json()).toMatchObject({ status: 'paid', payMode: 'upi' });

  const twice = await app.inject({
    method: 'POST',
    url: `${PREFIX}/payouts/${payoutId}/pay`,
    headers: headers(cookie),
    payload: { mode: 'upi', reference: 'SAMPLE-REF-2' },
  });
  expect(twice.statusCode).toBe(409);

  const statement = await app.inject({ method: 'GET', url: `${PREFIX}/payouts?doctorId=${doctorId}`, headers: { cookie } });
  expect(statement.statusCode).toBe(200);
  expect((statement.json() as { id: string }[]).some((r) => r.id === payoutId)).toBe(true);
});

it('keeps another hospital out: not entitled over the API, invisible and unwritable in Postgres', async () => {
  const lotus = await login('owner@lotus.demo');
  const res = await app.inject({ method: 'GET', url: `${PREFIX}/payouts`, headers: { cookie: lotus } });
  expect(res.statusCode).toBe(403);

  const admin = new pg.Client({ connectionString: dbEnv().adminUrl });
  await admin.connect();
  try {
    let doctor = await admin.query<{ id: string }>(`select id from doctors where tenant_id = $1 limit 1`, [fx.lotus.tenantId]);
    if (doctor.rowCount === 0) {
      doctor = await admin.query<{ id: string }>(
        `insert into doctors (tenant_id, location_id, name) values ($1, $2, 'Dr. Lotus Fictional') returning id`,
        [fx.lotus.tenantId, fx.lotus.locationId],
      );
    }
    const rule = await admin.query<{ id: string }>(
      `insert into doctor_share_rules (tenant_id, doctor_id, share_type, share_value, is_sample)
       values ($1, $2, 'pct_net', 30, true) returning id`,
      [fx.lotus.tenantId, doctor.rows[0]!.id],
    );
    await expectIsolation('doctor_share_rules', rule.rows[0]!.id);
    const payout = await admin.query<{ id: string }>(
      `insert into doctor_payouts (tenant_id, doctor_id, period_from, period_to, gross_paise, share_paise, is_sample)
       values ($1, $2, current_date - 30, current_date, 100000, 30000, true) returning id`,
      [fx.lotus.tenantId, doctor.rows[0]!.id],
    );
    await expectIsolation('doctor_payouts', payout.rows[0]!.id);

    const sunrise = await login('owner@sunrise.demo');
    const get = await app.inject({ method: 'GET', url: `${PREFIX}/payouts/${payout.rows[0]!.id}`, headers: { cookie: sunrise } });
    expect(get.statusCode).toBe(404);
  } finally {
    await Promise.race([admin.end(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
});
