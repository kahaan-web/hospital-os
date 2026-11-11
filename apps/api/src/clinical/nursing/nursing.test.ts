import { randomUUID } from 'node:crypto';
import { dbEnv } from '@hos/db';
import { istDateKey } from '@hos/shared';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, expectIsolation, type ClinicalFixture } from '../testkit';

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

function headers(cookie: string, extra: Record<string, string> = {}) {
  return { cookie, 'x-hos-csrf': '1', 'idempotency-key': randomUUID(), ...extra };
}

async function wardRows(cookie: string): Promise<{ encounterId: string }[]> {
  const ward = await app.inject({ method: 'GET', url: `${PREFIX}/ward`, headers: { cookie } });
  expect(ward.statusCode, ward.body).toBe(200);
  return ward.json() as { encounterId: string }[];
}

/** The seeded TDS order sits on GW-1. Other suites leave extra admissions that sort earlier on the board. */
async function findAmoxEncounter(cookie: string): Promise<string> {
  const date = istDateKey(new Date());
  for (const row of await wardRows(cookie)) {
    const mar = await app.inject({
      method: 'GET',
      url: `${PREFIX}/encounters/${row.encounterId}/mar?date=${date}`,
      headers: { cookie },
    });
    expect(mar.statusCode, mar.body).toBe(200);
    const doses = mar.json() as { drugName: string }[];
    if (doses.some((d) => d.drugName.toLowerCase().includes('amoxicillin'))) return row.encounterId;
  }
  throw new Error('no amoxicillin MAR on the ward — run db:seed');
}

it('rejects Lotus tenant on ward board', async () => {
  const cookie = await login('owner@lotus.demo');
  const res = await app.inject({ method: 'GET', url: `${PREFIX}/ward`, headers: { cookie } });
  expect(res.statusCode).toBe(403);
  expect(res.json()).toMatchObject({ error: { code: 'not_entitled' } });
});

it('TDS MAR has three slots per day and regeneration is idempotent', async () => {
  const cookie = await login('owner@sunrise.demo');
  const encounterId = await findAmoxEncounter(cookie);
  const date = istDateKey(new Date());
  const first = await app.inject({
    method: 'GET',
    url: `${PREFIX}/encounters/${encounterId}/mar?date=${date}`,
    headers: { cookie },
  });
  expect(first.statusCode, first.body).toBe(200);
  const doses = first.json() as { id: string; drugName: string }[];
  const amox = doses.filter((d) => d.drugName.toLowerCase().includes('amoxicillin'));
  expect(amox.length).toBe(3);

  const second = await app.inject({
    method: 'GET',
    url: `${PREFIX}/encounters/${encounterId}/mar?date=${date}`,
    headers: { cookie },
  });
  expect(second.statusCode).toBe(200);
  expect((second.json() as { id: string }[]).length).toBe(doses.length);
});

it('cannot record the same dose twice', async () => {
  const cookie = await login('owner@sunrise.demo');
  const encounterId = await findAmoxEncounter(cookie);
  const date = istDateKey(new Date());
  const mar = await app.inject({
    method: 'GET',
    url: `${PREFIX}/encounters/${encounterId}/mar?date=${date}`,
    headers: { cookie },
  });
  const dose = (mar.json() as { id: string; status: string; drugName: string }[]).find(
    (d) => d.status === 'due' && d.drugName.toLowerCase().includes('amoxicillin'),
  );
  expect(dose).toBeTruthy();
  const ok = await app.inject({
    method: 'POST',
    url: `${PREFIX}/mar/${dose!.id}/administer`,
    headers: headers(cookie),
    payload: { status: 'given', doseGiven: '500 mg', reason: 'Ward round early (sample)' },
  });
  expect(ok.statusCode, ok.body).toBe(200);
  const again = await app.inject({
    method: 'POST',
    url: `${PREFIX}/mar/${dose!.id}/administer`,
    headers: headers(cookie),
    payload: { status: 'given' },
  });
  expect(again.statusCode).toBe(409);
});

it('voids future MAR slots when the medicine order is cancelled', async () => {
  const cookie = await login('owner@sunrise.demo');
  const rows = await wardRows(cookie);
  const encounterId = rows[0]?.encounterId;
  if (!encounterId) throw new Error('no IPD patient on ward board — run db:seed');
  const date = istDateKey(new Date());
  await app.inject({ method: 'GET', url: `${PREFIX}/encounters/${encounterId}/mar?date=${date}`, headers: { cookie } });

  const placed = await app.inject({
    method: 'POST',
    url: `/api/v1/tenant/clinical/encounters/${encounterId}/orders`,
    headers: headers(cookie),
    payload: {
      kind: 'medicine',
      source: 'nurse',
      items: [{ drugName: 'Sample cancel drug', genericCode: 'PARACETAMOL', frequencyCode: 'TDS', durationDays: 3 }],
    },
  });
  expect(placed.statusCode, placed.body).toBe(200);
  const order = placed.json() as { id: string; items: { id: string }[] };
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = istDateKey(tomorrow);
  const marBefore = await app.inject({
    method: 'GET',
    url: `${PREFIX}/encounters/${encounterId}/mar?date=${tomorrowKey}`,
    headers: { cookie },
  });
  expect((marBefore.json() as unknown[]).length).toBeGreaterThan(0);

  const cancelled = await app.inject({
    method: 'POST',
    url: `/api/v1/tenant/clinical/orders/${order.id}/cancel`,
    headers: headers(cookie),
    payload: { reason: 'Stopped by doctor (sample)' },
  });
  expect(cancelled.statusCode).toBe(200);

  const marAfter = await app.inject({
    method: 'GET',
    url: `${PREFIX}/encounters/${encounterId}/mar?date=${tomorrowKey}`,
    headers: { cookie },
  });
  const pending = (marAfter.json() as { status: string; orderItemId: string }[]).filter(
    (d) => d.orderItemId === order.items[0]!.id && d.status === 'due',
  );
  expect(pending.length).toBe(0);
});

it('isolates mar_schedules across tenants', async () => {
  const admin = new pg.Client({ connectionString: dbEnv().adminUrl });
  await admin.connect();
  try {
    const row = await admin.query<{ id: string }>(
      `select m.id from mar_schedules m
       join tenants t on t.id = m.tenant_id
       where t.slug = 'lotus-demo' limit 1`,
    );
    if (!row.rows[0]) return;
    await expectIsolation('mar_schedules', row.rows[0].id);
  } finally {
    await admin.end();
  }
});
