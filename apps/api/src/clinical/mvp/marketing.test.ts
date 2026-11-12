import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, expectIsolation, type ClinicalFixture } from '../testkit';
import { asOwner, headers, login } from './testutil';

const PREFIX = '/api/v1/tenant/m/marketing';
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

it('creates a campaign, lists it and marks it sent (mock) once', async () => {
  const created = await app.inject({
    method: 'POST',
    url: `${PREFIX}/campaigns`,
    headers: headers(cookie),
    payload: { name: 'Smoke test camp (Sample)', channel: 'sms', segmentNote: 'Opted-in patients', message: 'Free check-up camp. Reply STOP to opt out.', audienceCount: 100 },
  });
  expect(created.statusCode).toBe(201);
  const campaign = created.json() as { id: string; status: string };
  expect(campaign.status).toBe('draft');

  const list = await app.inject({ method: 'GET', url: `${PREFIX}/campaigns`, headers: { cookie } });
  expect(list.statusCode).toBe(200);
  expect((list.json() as { id: string }[]).map((c) => c.id)).toContain(campaign.id);

  const sent = await app.inject({ method: 'POST', url: `${PREFIX}/campaigns/${campaign.id}/mark-sent`, headers: headers(cookie), payload: {} });
  expect(sent.statusCode).toBe(200);
  const body = sent.json() as { status: string; sentCount: number; suppressedCount: number };
  expect(body.status).toBe('sent');
  expect(body.sentCount + body.suppressedCount).toBe(100);

  const twice = await app.inject({ method: 'POST', url: `${PREFIX}/campaigns/${campaign.id}/mark-sent`, headers: headers(cookie), payload: {} });
  expect(twice.statusCode).toBe(409);
});

it('keeps campaigns inside the tenant', async () => {
  const lotusCampaign = await asOwner(async (client) => {
    const row = await client.query<{ id: string }>(
      `insert into mkt_campaigns (tenant_id, name, channel, message, is_sample)
       values ($1, 'Lotus isolation probe (Sample)', 'sms', 'Probe message', true) returning id`,
      [fx.lotus.tenantId],
    );
    return row.rows[0]!.id;
  });

  const list = await app.inject({ method: 'GET', url: `${PREFIX}/campaigns`, headers: { cookie } });
  expect((list.json() as { id: string }[]).some((c) => c.id === lotusCampaign)).toBe(false);

  const direct = await app.inject({ method: 'GET', url: `${PREFIX}/campaigns/${lotusCampaign}`, headers: { cookie } });
  expect(direct.statusCode).toBe(404);

  const lotusCookie = await login(app, fx, fx.lotus.ownerEmail);
  const denied = await app.inject({ method: 'GET', url: `${PREFIX}/campaigns`, headers: { cookie: lotusCookie } });
  expect(denied.statusCode).toBe(403);

  await expectIsolation('mkt_campaigns', lotusCampaign);
});
