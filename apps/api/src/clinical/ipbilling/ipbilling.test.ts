import { randomUUID } from 'node:crypto';
import { createDb, dbEnv, withTenant } from '@hos/db';
import type { OpBillDto } from '@hos/shared';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { writeAudit } from '../../http';
import { charges } from '../charges';
import { clinicalFixture, closeClinicalPools, expectIsolation, type ClinicalFixture } from '../testkit';

const PREFIX = '/api/v1/tenant/m/ip-billing';
const ADT = '/api/v1/tenant/m/adt';
const app = await buildApp();
let fx: ClinicalFixture;

beforeAll(async () => {
  await app.ready();
  fx = await clinicalFixture();
}, 180_000);

afterAll(async () => {
  await ensureOpenIpdSeed();
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

async function ensureOpenIpdSeed(): Promise<void> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    await handle.db.execute(sql`
      update encounters set status = 'open', ended_at = null
       where tenant_id = ${fx.sunrise.tenantId}::uuid and kind = 'ipd'
         and id = (
           select id from encounters where tenant_id = ${fx.sunrise.tenantId}::uuid and kind = 'ipd' order by started_at limit 1
         )`);
    await handle.db.execute(sql`
      update admissions set status = 'admitted', discharged_at = null, discharge_type = null
       where tenant_id = ${fx.sunrise.tenantId}::uuid
         and encounter_id = (
           select id from encounters where tenant_id = ${fx.sunrise.tenantId}::uuid and kind = 'ipd' order by started_at limit 1
         )`);
  } finally {
    await Promise.race([handle.close(), new Promise((r) => setTimeout(r, 2000))]);
  }
}

async function ipdEncounter(_cookie: string, openOnly = false): Promise<string> {
  if (openOnly) await ensureOpenIpdSeed();
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const found = openOnly
      ? await handle.db.execute<{ id: string }>(sql`
          select id from encounters
           where tenant_id = ${fx.sunrise.tenantId}::uuid and kind = 'ipd' and status = 'open'
           order by started_at desc limit 1`)
      : await handle.db.execute<{ id: string }>(sql`
          select id from encounters
           where tenant_id = ${fx.sunrise.tenantId}::uuid and kind = 'ipd'
           order by started_at desc limit 1`);
    const id = found.rows[0]?.id;
    if (!id) throw new Error('no IPD encounter in seed');
    return id;
  } finally {
    await Promise.race([handle.close(), new Promise((r) => setTimeout(r, 2000))]);
  }
}

async function postSampleCharge(
  encounterId: string,
  amount: number,
  treatment: 'exempt_healthcare' | 'taxable' = 'exempt_healthcare',
  rate = 0,
): Promise<void> {
  const handle = createDb(dbEnv().appUrl, { max: 1 });
  try {
    await withTenant(handle.db, fx.sunrise.tenantId, async (tx) => {
      const enc = await tx.execute<{ patient_id: string }>(sql`select patient_id from encounters where id = ${encounterId}::uuid`);
      const patientId = enc.rows[0]?.patient_id;
      if (!patientId) throw new Error('encounter missing');
      await charges.post(
        {
          tx,
          tenantId: fx.sunrise.tenantId,
          locationId: fx.sunrise.locationId,
          userId: fx.sunrise.userId,
          audit: (action, entityType, entityId, before, after) =>
            writeAudit(tx, {
              actorType: 'user',
              actorId: fx.sunrise.userId,
              actorLabel: fx.sunrise.ownerEmail,
              tenantId: fx.sunrise.tenantId,
              locationId: fx.sunrise.locationId,
              ip: null,
              userAgent: null,
            }, action, entityType, entityId, before, after),
        },
        {
          encounterId,
          patientId,
          serviceId: null,
          description: treatment === 'taxable' ? 'Attendant meal (Sample)' : 'Nursing day (Sample)',
          qty: 1,
          unitPricePaise: amount,
          gstTreatment: treatment,
          gstRateBp: rate,
          hsnSac: treatment === 'taxable' ? '996331' : '9993',
          serviceDate: new Date().toISOString().slice(0, 10),
          source: { module: 'billing', type: 'ip_test', id: randomUUID(), line: '' },
        },
      );
    });
  } finally {
    await Promise.race([handle.close(), new Promise((r) => setTimeout(r, 2000))]);
  }
}

it('isolates payers across tenants', async () => {
  const handle = createDb(dbEnv().appUrl, { max: 1 });
  try {
    const row = await handle.db.execute<{ id: string }>(sql`select id from payers where tenant_id = ${fx.lotus.tenantId}::uuid limit 1`);
    const id = row.rows[0]?.id;
    if (!id) return;
    await expectIsolation('payers', id);
  } finally {
    await Promise.race([handle.close(), new Promise((r) => setTimeout(r, 2000))]);
  }
});

it('applies IGST when the payer GSTIN is in another state', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  await ensureOpenIpdSeed();
  const encounterId = await ipdEncounter(cookie, true);
  const payerRes = await app.inject({
    method: 'POST',
    url: `${PREFIX}/payers`,
    headers: headers(cookie),
    payload: {
      code: `IGST${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
      name: 'Remote TPA (Sample)',
      kind: 'tpa',
      gstin: '29AABCS1429B1Z5',
      stateCode: 'KA',
    },
  });
  expect(payerRes.statusCode, payerRes.body).toBe(201);
  const payer = payerRes.json() as { id: string };
  await app.inject({
    method: 'PUT',
    url: `${PREFIX}/encounters/${encounterId}/payer`,
    headers: headers(cookie),
    payload: { payerId: payer.id, policyNo: 'POL-IGST' },
  });
  await postSampleCharge(encounterId, 50_000, 'taxable', 1800);
  const billRes = await app.inject({
    method: 'POST',
    url: `${PREFIX}/encounters/${encounterId}/bills`,
    headers: headers(cookie),
    payload: { interim: true, payClass: 'cash' },
  });
  expect(billRes.statusCode, billRes.body).toBe(201);
  const bill = billRes.json() as OpBillDto;
  expect(bill.igstPaise).toBeGreaterThan(0);
}, 60_000);

it('creates a receivable when a TPA split is posted', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const encounterId = await ipdEncounter(cookie);
  await postSampleCharge(encounterId, 80_000);
  const billRes = await app.inject({
    method: 'POST',
    url: `${PREFIX}/encounters/${encounterId}/bills`,
    headers: headers(cookie),
    payload: { interim: true, payClass: 'cash' },
  });
  expect(billRes.statusCode).toBe(201);
  const bill = billRes.json() as OpBillDto;
  await app.inject({ method: 'POST', url: `${PREFIX}/bills/${bill.id}/finalise`, headers: headers(cookie) });
  const payers = await app.inject({ method: 'GET', url: `${PREFIX}/payers`, headers: { cookie } });
  const payerList = payers.json() as { id: string }[];
  const payerId = payerList[0]?.id;
  if (!payerId) return;
  await app.inject({
    method: 'PUT',
    url: `${PREFIX}/encounters/${encounterId}/payer`,
    headers: headers(cookie),
    payload: { payerId, policyNo: 'SPLIT-DEMO', approvedAmountPaise: 40_000 },
  });
  const split = await app.inject({
    method: 'POST',
    url: `${PREFIX}/bills/${bill.id}/split`,
    headers: headers(cookie),
    payload: { payerSharePaise: 40_000 },
  });
  expect(split.statusCode, split.body).toBe(200);
  const recv = await app.inject({ method: 'GET', url: `${PREFIX}/bills/${bill.id}/receivables`, headers: { cookie } });
  expect(recv.statusCode).toBe(200);
  expect((recv.json() as unknown[]).length).toBe(1);
}, 90_000);

it('blocks discharge until the IP balance is cleared', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const encounterId = await ipdEncounter(cookie, true);
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  let admissionId = '';
  try {
    const adm = await handle.db.execute<{ id: string }>(sql`
      select id from admissions where encounter_id = ${encounterId}::uuid and status = 'admitted' limit 1`);
    admissionId = adm.rows[0]?.id ?? '';
  } finally {
    await Promise.race([handle.close(), new Promise((r) => setTimeout(r, 2000))]);
  }
  if (!admissionId) return;
  await postSampleCharge(encounterId, 120_000);
  const blocked = await app.inject({
    method: 'POST',
    url: `${ADT}/admissions/${admissionId}/discharge`,
    headers: headers(cookie),
    payload: { dischargeType: 'normal', summaryReady: true },
  });
  expect(blocked.statusCode, blocked.body).toBe(422);
  const billRes = await app.inject({
    method: 'POST',
    url: `${PREFIX}/encounters/${encounterId}/bills`,
    headers: headers(cookie),
    payload: { interim: false, applyDeposits: true, payClass: 'cash' },
  });
  expect(billRes.statusCode, billRes.body).toBe(201);
  const bill = billRes.json() as OpBillDto;
  const balance = bill.totalPaise - bill.paidPaise;
  if (balance > 0) {
    await app.inject({
      method: 'POST',
      url: `${PREFIX}/bills/${bill.id}/settle`,
      headers: headers(cookie),
      payload: { mode: 'cash', amountPaise: balance },
    });
  }
  const ok = await app.inject({
    method: 'POST',
    url: `${ADT}/admissions/${admissionId}/discharge`,
    headers: headers(cookie),
    payload: { dischargeType: 'normal', summaryReady: true },
  });
  expect(ok.statusCode, ok.body).toBe(200);
  await ensureOpenIpdSeed();
}, 120_000);

it('returns a statement with deposit credits on the running balance', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  await ensureOpenIpdSeed();
  const encounterId = await ipdEncounter(cookie, true);
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  let patientId = fx.sunrise.patientId;
  try {
    const row = await handle.db.execute<{ patient_id: string }>(sql`select patient_id from encounters where id = ${encounterId}::uuid`);
    patientId = row.rows[0]?.patient_id ?? patientId;
  } finally {
    await Promise.race([handle.close(), new Promise((r) => setTimeout(r, 2000))]);
  }
  const dep = await app.inject({
    method: 'POST',
    url: `${PREFIX}/deposits`,
    headers: headers(cookie),
    payload: { patientId, encounterId, amountPaise: 25_000, mode: 'cash' },
  });
  expect(dep.statusCode, dep.body).toBe(201);
  const stmt = await app.inject({ method: 'GET', url: `${PREFIX}/encounters/${encounterId}/statement`, headers: { cookie } });
  expect(stmt.statusCode).toBe(200);
  const body = stmt.json() as { depositBalancePaise: number };
  expect(body.depositBalancePaise).toBeGreaterThanOrEqual(25_000);
}, 60_000);
