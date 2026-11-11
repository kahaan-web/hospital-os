import { randomUUID } from 'node:crypto';
import { createDb, dbEnv, schema, withTenant, type Tx } from '@hos/db';
import { flagLabValue, type LabAccessionDetailDto, type LabFlag } from '@hos/shared';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { writeAudit } from '../../http';
import { numbering } from '../numbering';
import { orders } from '../orders';
import { clinicalFixture, closeClinicalPools, expectIsolation, type ClinicalFixture } from '../testkit';
import { collectSample } from './service';

const PREFIX = '/api/v1/tenant/m/lab';
const TOKEN = 'demo-sunrise-lab-token';
const LOTUS_TOKEN = 'demo-lotus-lab-token';
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

function ctx(tx: Tx) {
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

function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  if (typeof record.code === 'string' && /^[0-9A-Z]{5}$/.test(record.code)) return record.code;
  return pgCode(record.cause);
}

function headers(cookie: string, extra: Record<string, string> = {}) {
  return { cookie, 'x-hos-csrf': '1', 'idempotency-key': randomUUID(), ...extra };
}

async function placeLabOrder(cookie: string, serviceId: string) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/tenant/clinical/encounters/${fx.sunrise.encounterId}/orders`,
    headers: headers(cookie),
    payload: { kind: 'lab', source: 'opd', items: [{ serviceId }] },
  });
  expect(res.statusCode, res.body).toBe(200);
  const body = res.json() as { id: string; items: Array<{ id: string }> };
  return body.items[0]!.id;
}

it('flags a critical value and a sex-and-age band, then keeps the verified report while an amendment is version 2', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const orderItemId = await placeLabOrder(cookie, fx.sunrise.labServiceIds[0]);
  const collected = await app.inject({
    method: 'POST',
    url: `${PREFIX}/accessions`,
    headers: headers(cookie),
    payload: { orderItemId },
  });
  expect(collected.statusCode, collected.body).toBe(201);
  const accession = collected.json() as LabAccessionDetailDto;
  expect(accession.number).toMatch(/LA\//);
  expect(accession.status).toBe('collected');

  const again = await app.inject({
    method: 'POST',
    url: `${PREFIX}/accessions`,
    headers: headers(cookie),
    payload: { orderItemId },
  });
  expect(again.statusCode).toBe(409);

  const received = await app.inject({
    method: 'POST',
    url: `${PREFIX}/accessions/${accession.id}/receive`,
    headers: headers(cookie),
    payload: {},
  });
  expect(received.statusCode, received.body).toBe(200);
  const detail = received.json() as LabAccessionDetailDto;
  const hb = detail.lines.find((line) => line.code === 'HB');
  const wbc = detail.lines.find((line) => line.code === 'WBC');
  expect(hb && wbc).toBeTruthy();

  const saved = await app.inject({
    method: 'PUT',
    url: `${PREFIX}/accessions/${accession.id}/results`,
    headers: headers(cookie),
    payload: {
      values: [
        { paramId: hb!.paramId, valueNum: 1 },
        { paramId: wbc!.paramId, valueNum: 7 },
      ],
    },
  });
  expect(saved.statusCode, saved.body).toBe(200);
  const resulted = saved.json() as LabAccessionDetailDto;
  const savedHb = resulted.lines.find((line) => line.code === 'HB')!;
  const savedWbc = resulted.lines.find((line) => line.code === 'WBC')!;
  expect(savedHb.flag).toBe('LL');
  expect(savedHb.critical).toBe(true);
  expect(savedHb.flagLabel).toBe('Critical low');
  const expectedWbc = flagLabValue({
    valueType: 'numeric',
    valueNum: 7,
    sex: resulted.sex,
    ageYears: resulted.ageYears,
    refRanges: savedWbc.refRanges,
    criticalLow: savedWbc.criticalLow,
    criticalHigh: savedWbc.criticalHigh,
  });
  expect(savedWbc.flag).toBe(expectedWbc);

  const verified = await app.inject({
    method: 'POST',
    url: `${PREFIX}/accessions/${accession.id}/verify`,
    headers: headers(cookie),
    payload: {},
  });
  expect(verified.statusCode, verified.body).toBe(200);
  expect((verified.json() as LabAccessionDetailDto).immutable).toBe(true);

  const locked = await app.inject({
    method: 'PUT',
    url: `${PREFIX}/accessions/${accession.id}/results`,
    headers: headers(cookie),
    payload: { values: [{ paramId: hb!.paramId, valueNum: 14 }] },
  });
  expect(locked.statusCode).toBe(422);
  expect(locked.json().error.code).toBe('amendment_required');

  const amended = await app.inject({
    method: 'PUT',
    url: `${PREFIX}/accessions/${accession.id}/results`,
    headers: headers(cookie),
    payload: { values: [{ paramId: hb!.paramId, valueNum: 14 }], amendReason: 'Rechecked the sample' },
  });
  expect(amended.statusCode, amended.body).toBe(200);
  const version2 = amended.json() as LabAccessionDetailDto;
  expect(version2.version).toBe(2);
  expect(version2.status).toBe('resulted');
  const amendedHb = version2.lines.find((line) => line.code === 'HB')!;
  const expectedHb = flagLabValue({
    valueType: 'numeric',
    valueNum: 14,
    sex: version2.sex,
    ageYears: version2.ageYears,
    refRanges: amendedHb.refRanges,
    criticalLow: amendedHb.criticalLow,
    criticalHigh: amendedHb.criticalHigh,
  }) as LabFlag;
  expect(amendedHb.flag).toBe(expectedHb);

  const report = await app.inject({
    method: 'GET',
    url: `${PREFIX}/accessions/${accession.id}/report`,
    headers: { cookie },
  });
  expect(report.statusCode).toBe(200);
  const printed = report.json() as { version: number; immutable: boolean; lines: Array<{ name: string; flag: string }> };
  expect(printed.version).toBe(1);
  expect(printed.immutable).toBe(true);
  expect(printed.lines.find((line) => line.name === 'Haemoglobin')?.flag).toBe('LL');

  const handle = createDb(dbEnv().appUrl, { max: 1 });
  try {
    await withTenant(handle.db, fx.sunrise.tenantId, async (tx) => {
      const audited = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from audit_log
         where action = 'lab.result.amend' and entity_id = ${accession.id}
      `);
      expect(Number(audited.rows[0]?.n ?? 0)).toBeGreaterThan(0);
      await expect(
        tx.execute(sql`update lab_results set value_num = 9 where accession_id = ${accession.id}::uuid and verified_by is not null`),
      ).rejects.toSatisfy((error: unknown) => pgCode(error) === '42501');
    });
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}, 60_000);

it('replays a collect when the same Idempotency-Key is sent twice', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const orderItemId = await placeLabOrder(cookie, fx.sunrise.labServiceIds[1]);
  const key = randomUUID();
  const first = await app.inject({
    method: 'POST',
    url: `${PREFIX}/accessions`,
    headers: headers(cookie, { 'idempotency-key': key }),
    payload: { orderItemId },
  });
  expect(first.statusCode, first.body).toBe(201);
  const second = await app.inject({
    method: 'POST',
    url: `${PREFIX}/accessions`,
    headers: headers(cookie, { 'idempotency-key': key }),
    payload: { orderItemId },
  });
  expect(second.statusCode).toBe(201);
  expect(second.headers['idempotent-replayed']).toBe('true');
  expect((second.json() as { id: string }).id).toBe((first.json() as { id: string }).id);
}, 30_000);

it('refuses an OPD collect until the bill is settled, unless the lab allows collection first', async () => {
  const handle = createDb(dbEnv().appUrl, { max: 1 });
  const unsettled = {
    settledSources: async () => new Set<string>(),
    billsForPatient: async () => [],
  };
  try {
    await withTenant(handle.db, fx.sunrise.tenantId, async (tx) => {
      const c = ctx(tx);
      const order = await orders.place(c, fx.sunrise.encounterId, {
        kind: 'lab',
        source: 'opd',
        items: [{ serviceId: fx.sunrise.labServiceIds[1] }],
      });
      const itemId = order.items[0]!.id;
      await expect(collectSample(c, { orderItemId: itemId }, { billing: unsettled, orders, numbering })).rejects.toMatchObject({
        code: 'payment_required',
      });
      await tx.update(schema.labSettings).set({ collectBeforePayment: true }).where(eq(schema.labSettings.tenantId, fx.sunrise.tenantId));
      const collected = await collectSample(c, { orderItemId: itemId }, { billing: unsettled, orders, numbering });
      expect(collected.status).toBe('collected');
      await tx.update(schema.labSettings).set({ collectBeforePayment: false }).where(eq(schema.labSettings.tenantId, fx.sunrise.tenantId));
    });
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}, 30_000);

it('returns 403 not_entitled for Lotus on every lab feature, and for Sunrise email', async () => {
  const lotus = await login(fx.lotus.ownerEmail);
  const sunrise = await login(fx.sunrise.ownerEmail);
  const missing = '00000000-0000-4000-8000-000000000001';
  const checks: Array<{ method: 'GET' | 'POST' | 'PUT'; url: string; payload?: object }> = [
    { method: 'GET', url: `${PREFIX}/tests` },
    { method: 'GET', url: `${PREFIX}/worklist` },
    { method: 'POST', url: `${PREFIX}/accessions`, payload: { orderItemId: missing } },
    { method: 'PUT', url: `${PREFIX}/accessions/${missing}/results`, payload: { values: [{ paramId: missing, valueNum: 1 }] } },
    { method: 'POST', url: `${PREFIX}/accessions/${missing}/verify`, payload: {} },
    { method: 'GET', url: `${PREFIX}/accessions/${missing}/report` },
    { method: 'GET', url: `${PREFIX}/patients/${missing}/history` },
    { method: 'GET', url: `${PREFIX}/reports/mis?from=2026-01-01&to=2026-12-31` },
    { method: 'POST', url: `${PREFIX}/accessions/${missing}/email`, payload: { to: 'lab@sbx.example' } },
  ];
  for (const check of checks) {
    const res = await app.inject({
      method: check.method,
      url: check.url,
      headers: check.method === 'GET' ? { cookie: lotus } : headers(lotus),
      payload: check.payload,
    });
    expect(res.statusCode, `${check.method} ${check.url} ${res.body}`).toBe(403);
    expect(res.json().error.code).toBe('not_entitled');
  }
  const email = await app.inject({
    method: 'POST',
    url: `${PREFIX}/accessions/${missing}/email`,
    headers: headers(sunrise),
    payload: { to: 'lab@sbx.example' },
  });
  expect(email.statusCode).toBe(403);
  expect(email.json().error.code).toBe('not_entitled');
}, 30_000);

it('returns 403 for a cashier who cannot manage the lab', async () => {
  const cookie = await login('cashier@sunrise.demo');
  const res = await app.inject({
    method: 'GET',
    url: `${PREFIX}/worklist`,
    headers: { cookie },
  });
  expect(res.statusCode).toBe(403);
  expect(res.json().error.code).toBe('forbidden');
}, 30_000);

it('rejects analyser ingest without a valid token, then accepts it after the equipment feature is granted', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const orderItemId = await placeLabOrder(cookie, fx.sunrise.labServiceIds[0]);
  const collected = await app.inject({
    method: 'POST',
    url: `${PREFIX}/accessions`,
    headers: headers(cookie),
    payload: { orderItemId },
  });
  expect(collected.statusCode, collected.body).toBe(201);
  const accession = collected.json() as LabAccessionDetailDto;

  const admin = new pg.Client({ connectionString: dbEnv().migrationUrl });
  await admin.connect();
  let interfaceId = '';
  let lotusInterfaceId = '';
  try {
    const found = await admin.query<{ id: string }>(`select id from lab_interfaces where tenant_id = $1 limit 1`, [fx.sunrise.tenantId]);
    interfaceId = found.rows[0]?.id ?? '';
    const lotusFound = await admin.query<{ id: string }>(`select id from lab_interfaces where tenant_id = $1 limit 1`, [fx.lotus.tenantId]);
    lotusInterfaceId = lotusFound.rows[0]?.id ?? '';
    expect(interfaceId).toMatch(/^[0-9a-f-]{36}$/);

    const missing = await app.inject({
      method: 'POST',
      url: `${PREFIX}/interfaces/${interfaceId}/ingest`,
      headers: { 'x-hos-csrf': '1' },
      payload: { accessionNumber: accession.number, values: [{ paramCode: 'HB', valueNum: 13.5 }] },
    });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error.code).toBe('invalid_token');

    const bad = await app.inject({
      method: 'POST',
      url: `${PREFIX}/interfaces/${interfaceId}/ingest`,
      headers: { 'x-hos-csrf': '1', 'x-lab-interface-token': 'not-the-token' },
      payload: { accessionNumber: accession.number, values: [{ paramCode: 'HB', valueNum: 13.5 }] },
    });
    expect(bad.statusCode).toBe(401);

    const blocked = await app.inject({
      method: 'POST',
      url: `${PREFIX}/interfaces/${interfaceId}/ingest`,
      headers: { 'x-hos-csrf': '1', 'x-lab-interface-token': TOKEN },
      payload: { accessionNumber: accession.number, values: [{ paramCode: 'HB', valueNum: 13.5 }, { paramCode: 'WBC', valueNum: 6 }] },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('not_entitled');

    if (lotusInterfaceId) {
      const lotusBlocked = await app.inject({
        method: 'POST',
        url: `${PREFIX}/interfaces/${lotusInterfaceId}/ingest`,
        headers: { 'x-hos-csrf': '1', 'x-lab-interface-token': LOTUS_TOKEN },
        payload: { accessionNumber: 'XLA/2627/90001', values: [{ paramCode: 'HB', valueNum: 13 }] },
      });
      expect(lotusBlocked.statusCode).toBe(403);
      expect(lotusBlocked.json().error.code).toBe('not_entitled');
    }

    await admin.query(
      `insert into tenant_entitlement_overrides (tenant_id, target, feature_id, effect, reason)
       select $1, 'feature', id, 'grant', 'b8 equipment probe'
         from module_features where key = 'lab.2-lab-equipments'`,
      [fx.sunrise.tenantId],
    );
    const ingested = await app.inject({
      method: 'POST',
      url: `${PREFIX}/interfaces/${interfaceId}/ingest`,
      headers: { 'x-hos-csrf': '1', 'x-lab-interface-token': TOKEN },
      payload: { accessionNumber: accession.number, values: [{ paramCode: 'HB', valueNum: 13.5 }, { paramCode: 'WBC', valueNum: 6 }] },
    });
    expect(ingested.statusCode, ingested.body).toBe(200);
    expect((ingested.json() as { accessionId: string }).accessionId).toBe(accession.id);
  } finally {
    await admin.query(`delete from tenant_entitlement_overrides where tenant_id = $1 and reason = 'b8 equipment probe'`, [fx.sunrise.tenantId]);
    await Promise.race([admin.end(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}, 60_000);

it('isolates every lab table', async () => {
  const admin = new pg.Client({ connectionString: dbEnv().migrationUrl });
  await admin.connect();
  try {
    const one = async (table: string) => {
      const found = await admin.query<{ id: string }>(`select id from ${table} where tenant_id = $1 limit 1`, [fx.lotus.tenantId]);
      expect(found.rows[0]?.id, table).toBeTruthy();
      await expectIsolation(table, found.rows[0]!.id);
    };
    await one('lab_tests');
    await one('lab_test_params');
    await one('lab_accessions');
    await one('lab_results');
    await one('lab_interfaces');
    await one('lab_settings');
  } finally {
    await Promise.race([admin.end(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}, 60_000);
