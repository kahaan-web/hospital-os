import { randomInt, randomUUID } from 'node:crypto';
import { dbEnv } from '@hos/db';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, expectIsolation, type ClinicalFixture } from '../testkit';

const PREFIX = '/api/v1/tenant/m/ot-scheduling';
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

it('schedules a case, blocks a room clash, then starts and completes it', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  // A far-future slot keeps repeated runs and the demo seed out of the way.
  const start = new Date(Date.now() + randomInt(3000, 9000) * 86_400_000);
  const payload = {
    patientId: fx.sunrise.patientId,
    procedureName: 'Sample appendicectomy',
    surgeonName: 'Dr. Asha Fictional',
    roomCode: 'OT-1',
    scheduledStart: start.toISOString(),
    durationMin: 60,
  };
  const created = await app.inject({ method: 'POST', url: `${PREFIX}/cases`, headers: headers(cookie), payload });
  expect(created.statusCode, created.body).toBe(201);
  const body = created.json() as { id: string; status: string; number: string };
  expect(body.status).toBe('scheduled');

  const clash = await app.inject({
    method: 'POST',
    url: `${PREFIX}/cases`,
    headers: headers(cookie),
    payload: { ...payload, scheduledStart: new Date(start.getTime() + 30 * 60_000).toISOString() },
  });
  expect(clash.statusCode).toBe(409);

  const list = await app.inject({ method: 'GET', url: `${PREFIX}/cases?status=scheduled`, headers: headers(cookie) });
  expect(list.statusCode, list.body).toBe(200);
  expect((list.json() as Array<{ id: string }>).some((row) => row.id === body.id)).toBe(true);

  const started = await app.inject({ method: 'POST', url: `${PREFIX}/cases/${body.id}/start`, headers: headers(cookie), payload: {} });
  expect(started.statusCode, started.body).toBe(200);
  const completed = await app.inject({ method: 'POST', url: `${PREFIX}/cases/${body.id}/complete`, headers: headers(cookie), payload: {} });
  expect(completed.statusCode, completed.body).toBe(200);
  expect((completed.json() as { status: string }).status).toBe('completed');

  const again = await app.inject({ method: 'POST', url: `${PREFIX}/cases/${body.id}/complete`, headers: headers(cookie), payload: {} });
  expect(again.statusCode).toBe(409);
});

it('does not show or touch another tenant’s OT case', async () => {
  const admin = new pg.Client({ connectionString: dbEnv().migrationUrl });
  await admin.connect();
  try {
    const inserted = await admin.query<{ id: string }>(
      `insert into ot_cases (tenant_id, location_id, patient_id, number, procedure_name, surgeon_name, room_code,
                             scheduled_start, scheduled_end, is_sample)
       values ($1, $2, $3, $4, 'Sample procedure', 'Dr. Sample', 'OT-1', now() + interval '2 days', now() + interval '2 days 1 hour', true)
       returning id`,
      [fx.lotus.tenantId, fx.lotus.locationId, fx.lotus.patientId, `ZOT-ISO-${randomUUID().slice(0, 8)}`],
    );
    const lotusCase = inserted.rows[0]!.id;
    const cookie = await login(fx.sunrise.ownerEmail);
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/cases/${lotusCase}`, headers: headers(cookie) });
    expect(res.statusCode).toBe(404);
    await expectIsolation('ot_cases', lotusCase);
  } finally {
    await Promise.race([admin.end(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
});
