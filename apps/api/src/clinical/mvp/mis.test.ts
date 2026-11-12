import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, type ClinicalFixture } from '../testkit';
import { login } from './testutil';

const URL = '/api/v1/tenant/m/mis-dashboards/kpis';
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

it('returns KPI cards for the signed-in hospital', async () => {
  const cookie = await login(app, fx, fx.sunrise.ownerEmail);
  const res = await app.inject({ method: 'GET', url: URL, headers: { cookie } });
  expect(res.statusCode).toBe(200);
  const kpis = res.json() as {
    revenue: { monthPaise: number };
    adt: { totalBeds: number; occupancyPct: number };
    stores: { stockLines: number };
  };
  expect(kpis.revenue.monthPaise).toBeGreaterThanOrEqual(0);
  expect(kpis.adt.occupancyPct).toBeGreaterThanOrEqual(0);
  expect(kpis.adt.occupancyPct).toBeLessThanOrEqual(100);
  expect(kpis.stores.stockLines).toBeGreaterThanOrEqual(0);
});

it('does not serve another hospital that has not been granted the module', async () => {
  const cookie = await login(app, fx, fx.lotus.ownerEmail);
  const res = await app.inject({ method: 'GET', url: URL, headers: { cookie } });
  expect(res.statusCode).toBe(403);
});
