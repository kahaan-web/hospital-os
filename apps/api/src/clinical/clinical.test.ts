import { createDb, dbEnv, withTenant } from '@hos/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../app';
import { writeAudit } from '../http';
import { charges } from './charges';
import { numbering } from './numbering';
import { orders } from './orders';
import { clinicalFixture, expectIsolation, type ClinicalFixture } from './testkit';

const app = await buildApp();
let fx: ClinicalFixture;

beforeAll(async () => {
  await app.ready();
  fx = await clinicalFixture();
}, 180_000);

afterAll(async () => {
  await app.close();
});

function ctx(tx: Parameters<typeof numbering.next>[0]['tx']) {
  return {
    tx,
    tenantId: fx.sunrise.tenantId,
    locationId: fx.sunrise.locationId,
    userId: fx.sunrise.userId,
    audit: (action: string, entityType: string, entityId: string | null, before: unknown, after: unknown) =>
      writeAudit(
        tx,
        {
          actorType: 'user',
          actorId: fx.sunrise.userId,
          actorLabel: 'owner@sunrise.demo',
          tenantId: fx.sunrise.tenantId,
          locationId: fx.sunrise.locationId,
          ip: null,
          userAgent: null,
        },
        action,
        entityType,
        entityId,
        before,
        after,
      ),
  };
}

async function login(email: string, native = false) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'x-hos-csrf': '1', ...(native ? { 'x-hos-client': 'native' } : {}) },
    payload: { email, password: fx.password },
  });
  expect(res.statusCode).toBe(200);
  const setCookie = res.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return { body: res.json() as { sessionToken?: string }, cookie: String(cookie).split(';')[0] ?? '' };
}

it('issues 00001–00020 for twenty concurrent OP bills', async () => {
  const handle = createDb(dbEnv().appUrl, { max: 20 });
  try {
    await withTenant(handle.db, fx.sunrise.tenantId, async (tx) => {
      await tx.execute(sql`delete from number_series where series_key = 'op_bill'`);
    });
    const numbers = await Promise.all(
      Array.from({ length: 20 }, () => withTenant(handle.db, fx.sunrise.tenantId, (tx) => numbering.next(ctx(tx), 'op_bill'))),
    );
    expect(numbers.map((n) => n.slice(-5)).sort()).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(5, '0')));
    expect(numbers.every((n) => n.length <= 16)).toBe(true);
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
});

it('posts a lab charge once per item and reverses them on cancel', async () => {
  const handle = createDb(dbEnv().appUrl, { max: 2 });
  try {
    await withTenant(handle.db, fx.sunrise.tenantId, async (tx) => {
      const c = ctx(tx);
      const source = { module: 'lab' as const, type: 'clinical_order', id: fx.sunrise.encounterId, line: 'probe' };
      const input = {
        encounterId: fx.sunrise.encounterId,
        patientId: fx.sunrise.patientId,
        serviceId: fx.sunrise.labServiceIds[0],
        description: 'Complete blood count',
        qty: 1,
        unitPricePaise: 35000,
        gstTreatment: 'exempt_healthcare' as const,
        gstRateBp: 0,
        hsnSac: '9993',
        serviceDate: '2026-11-11',
        source,
      };
      const first = await charges.post(c, input);
      const second = await charges.post(c, input);
      expect(second.id).toBe(first.id);
      const order = await orders.place(c, fx.sunrise.encounterId, {
        kind: 'lab',
        source: 'opd',
        items: [{ serviceId: fx.sunrise.labServiceIds[0] }, { serviceId: fx.sunrise.labServiceIds[1] }],
      });
      const posted = await charges.listUnbilled(c, fx.sunrise.encounterId);
      const mine = posted.filter((row) => row.sourceId === order.id);
      expect(mine).toHaveLength(2);
      await orders.cancel(c, order.id, 'Sample cancelled');
      const after = await charges.listUnbilled(c, fx.sunrise.encounterId);
      expect(after.filter((row) => row.sourceId === order.id)).toHaveLength(0);
    });
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
});

it('hides another tenant patient and refuses a Lotus CPOE order', async () => {
  const lotus = await login(fx.lotus.ownerEmail);
  const hidden = await app.inject({
    method: 'GET',
    url: `/api/v1/tenant/clinical/patients/${fx.sunrise.patientId}`,
    headers: { cookie: lotus.cookie },
  });
  expect(hidden.statusCode).toBe(404);
  const order = await app.inject({
    method: 'POST',
    url: `/api/v1/tenant/clinical/encounters/${fx.lotus.encounterId}/orders`,
    headers: { cookie: lotus.cookie, 'x-hos-csrf': '1', 'idempotency-key': 'lotus-cpoe-order-1' },
    payload: {
      kind: 'medicine',
      source: 'cpoe',
      items: [{ drugName: 'Paracetamol', genericCode: 'PARA', frequencyCode: 'TDS' }],
    },
  });
  expect(order.statusCode).toBe(403);
  expect(order.json().error.code).toBe('not_entitled');
});

it('returns a native session token and rejects cookie plus header', async () => {
  const native = await login(fx.sunrise.ownerEmail, true);
  expect(native.body.sessionToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  const me = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { 'x-hos-session': native.body.sessionToken! },
  });
  expect(me.statusCode).toBe(200);
  expect(me.json().kind).toBe('tenant');
  const both = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { 'x-hos-session': native.body.sessionToken!, cookie: native.cookie },
  });
  expect(both.statusCode).toBe(400);
});

it('isolates clinical tables', async () => {
  await expectIsolation('patients', fx.lotus.patientId);
  await expectIsolation('encounters', fx.lotus.encounterId);
});
