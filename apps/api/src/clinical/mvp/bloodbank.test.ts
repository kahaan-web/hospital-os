import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, expectIsolation, type ClinicalFixture } from '../testkit';
import { asOwner, headers, login } from './testutil';

const PREFIX = '/api/v1/tenant/m/blood-bank';
const app = await buildApp();
let fx: ClinicalFixture;
let cookie = '';

beforeAll(async () => {
  await app.ready();
  fx = await clinicalFixture();
  cookie = await login(app, fx, fx.sunrise.ownerEmail);
}, 180_000);

afterAll(async () => {
  await app.close();
  await closeClinicalPools();
});

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

function unitBody(unitNo: string, over: Record<string, unknown> = {}) {
  return {
    unitNo,
    component: 'prbc',
    abo: 'A',
    rh: 'pos',
    volumeMl: 280,
    collectedOn: day(-1),
    expiresAt: day(30),
    sourceCentre: 'Sample Regional Blood Centre (Sample)',
    ttiCleared: true,
    ...over,
  };
}

it('receives a unit, lists it, raises a request and issues a compatible unit', async () => {
  const unitNo = `DEMO-T-${randomUUID().slice(0, 8)}`;
  const received = await app.inject({ method: 'POST', url: `${PREFIX}/units/receive`, headers: headers(cookie), payload: unitBody(unitNo) });
  expect(received.statusCode).toBe(201);
  const unit = received.json() as { id: string };

  const inventory = await app.inject({ method: 'GET', url: `${PREFIX}/inventory`, headers: { cookie } });
  expect(inventory.statusCode).toBe(200);
  expect((inventory.json() as { units: { unitNo: string }[] }).units.map((u) => u.unitNo)).toContain(unitNo);

  const created = await app.inject({
    method: 'POST',
    url: `${PREFIX}/requests`,
    headers: headers(cookie),
    payload: { patientId: fx.sunrise.patientId, patientAbo: 'A', patientRh: 'pos', component: 'prbc', urgency: 'routine', indication: 'Smoke test (Sample)' },
  });
  expect(created.statusCode).toBe(201);
  const request = created.json() as { id: string };

  const list = await app.inject({ method: 'GET', url: `${PREFIX}/requests`, headers: { cookie } });
  expect((list.json() as { id: string }[]).map((r) => r.id)).toContain(request.id);

  const issued = await app.inject({
    method: 'POST',
    url: `${PREFIX}/requests/${request.id}/issue`,
    headers: headers(cookie),
    payload: { unitId: unit.id, receivedBy: 'Nurse Sample' },
  });
  expect(issued.statusCode).toBe(200);
  expect((issued.json() as { status: string }).status).toBe('issued');

  // The unit is gone from stock: a second issue of it is blocked.
  const again = await app.inject({
    method: 'POST',
    url: `${PREFIX}/requests`,
    headers: headers(cookie),
    payload: { patientId: fx.sunrise.patientId, patientAbo: 'A', patientRh: 'pos', component: 'prbc', urgency: 'routine', indication: '' },
  });
  const blocked = await app.inject({
    method: 'POST',
    url: `${PREFIX}/requests/${(again.json() as { id: string }).id}/issue`,
    headers: headers(cookie),
    payload: { unitId: unit.id, receivedBy: 'Nurse Sample' },
  });
  expect(blocked.statusCode).toBe(422);
});

it('blocks an expired, uncleared or incompatible unit', async () => {
  const mk = async (over: Record<string, unknown>) => {
    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/units/receive`,
      headers: headers(cookie),
      payload: unitBody(`DEMO-T-${randomUUID().slice(0, 8)}`, over),
    });
    expect(res.statusCode).toBe(201);
    return (res.json() as { id: string }).id;
  };
  const expired = await mk({ collectedOn: day(-40), expiresAt: day(-1) });
  const uncleared = await mk({ ttiCleared: false });
  const wrongGroup = await mk({ abo: 'B', rh: 'pos' });
  const request = await app.inject({
    method: 'POST',
    url: `${PREFIX}/requests`,
    headers: headers(cookie),
    payload: { patientId: fx.sunrise.patientId, patientAbo: 'A', patientRh: 'pos', component: 'prbc', urgency: 'routine', indication: '' },
  });
  const id = (request.json() as { id: string }).id;
  for (const unitId of [expired, uncleared, wrongGroup]) {
    const res = await app.inject({ method: 'POST', url: `${PREFIX}/requests/${id}/issue`, headers: headers(cookie), payload: { unitId, receivedBy: 'Nurse Sample' } });
    expect(res.statusCode).toBe(422);
  }
});

it('keeps blood bank data inside the tenant', async () => {
  const lotusUnit = await asOwner(async (client) => {
    await client.query(
      `insert into bb_units (tenant_id, location_id, unit_no, component, abo, rh, volume_ml, collected_on, expires_at, tti_cleared, is_sample)
       values ($1, $2, 'DEMO-LOTUS-ISO', 'prbc', 'O', 'pos', 280, current_date - 1, current_date + 30, true, true)
       on conflict (tenant_id, location_id, unit_no) do nothing`,
      [fx.lotus.tenantId, fx.lotus.locationId],
    );
    const row = await client.query<{ id: string }>(`select id from bb_units where tenant_id = $1 and unit_no = 'DEMO-LOTUS-ISO'`, [fx.lotus.tenantId]);
    return row.rows[0]!.id;
  });

  const inventory = await app.inject({ method: 'GET', url: `${PREFIX}/inventory`, headers: { cookie } });
  const units = (inventory.json() as { units: { id: string; unitNo: string }[] }).units;
  expect(units.some((u) => u.id === lotusUnit)).toBe(false);

  const lotusCookie = await login(app, fx, fx.lotus.ownerEmail);
  const denied = await app.inject({ method: 'GET', url: `${PREFIX}/inventory`, headers: { cookie: lotusCookie } });
  expect(denied.statusCode).toBe(403);

  await expectIsolation('bb_units', lotusUnit);
});
