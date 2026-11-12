import { randomUUID } from 'node:crypto';
import { dbEnv } from '@hos/db';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, expectIsolation, type ClinicalFixture } from '../testkit';

const PREFIX = '/api/v1/tenant/m/radiology';
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

const headers = (cookie: string) => ({ cookie, 'x-hos-csrf': '1', 'idempotency-key': randomUUID() });

it('orders a study, runs it, writes and signs the report, and freezes it after signing', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const created = await app.inject({
    method: 'POST',
    url: `${PREFIX}/orders`,
    headers: headers(cookie),
    payload: { patientId: fx.sunrise.patientId, modality: 'xray', studyName: 'Chest PA view (sample)' },
  });
  expect(created.statusCode, created.body).toBe(201);
  const order = created.json() as { id: string; status: string };
  expect(order.status).toBe('ordered');

  const list = await app.inject({ method: 'GET', url: `${PREFIX}/orders?status=ordered`, headers: headers(cookie) });
  expect(list.statusCode, list.body).toBe(200);
  expect((list.json() as Array<{ id: string }>).some((row) => row.id === order.id)).toBe(true);

  // A report cannot start before the study is done.
  const early = await app.inject({
    method: 'PUT',
    url: `${PREFIX}/orders/${order.id}/report`,
    headers: headers(cookie),
    payload: { findings: 'Clear lung fields', impression: 'Normal study' },
  });
  expect(early.statusCode).toBe(409);

  for (const action of ['start', 'done']) {
    const res = await app.inject({ method: 'POST', url: `${PREFIX}/orders/${order.id}/${action}`, headers: headers(cookie), payload: {} });
    expect(res.statusCode, res.body).toBe(200);
  }
  const draft = await app.inject({
    method: 'PUT',
    url: `${PREFIX}/orders/${order.id}/report`,
    headers: headers(cookie),
    payload: { findings: 'Clear lung fields', impression: 'Normal study' },
  });
  expect(draft.statusCode, draft.body).toBe(200);
  const signed = await app.inject({ method: 'POST', url: `${PREFIX}/orders/${order.id}/report/sign`, headers: headers(cookie), payload: {} });
  expect(signed.statusCode, signed.body).toBe(200);
  expect((signed.json() as { status: string }).status).toBe('reported');

  const edit = await app.inject({
    method: 'PUT',
    url: `${PREFIX}/orders/${order.id}/report`,
    headers: headers(cookie),
    payload: { findings: 'Changed', impression: 'Changed' },
  });
  expect(edit.statusCode).toBe(409);
});

it('does not show or touch another tenant’s radiology order', async () => {
  const admin = new pg.Client({ connectionString: dbEnv().migrationUrl });
  await admin.connect();
  try {
    const inserted = await admin.query<{ id: string }>(
      `insert into rad_orders (tenant_id, location_id, patient_id, number, modality, study_name, is_sample)
       values ($1, $2, $3, $4, 'usg', 'Abdomen ultrasound (Sample)', true) returning id`,
      [fx.lotus.tenantId, fx.lotus.locationId, fx.lotus.patientId, `ZRD-ISO-${randomUUID().slice(0, 8)}`],
    );
    const lotusOrder = inserted.rows[0]!.id;
    const cookie = await login(fx.sunrise.ownerEmail);
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/orders/${lotusOrder}`, headers: headers(cookie) });
    expect(res.statusCode).toBe(404);
    await expectIsolation('rad_orders', lotusOrder);
  } finally {
    await Promise.race([admin.end(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
});
