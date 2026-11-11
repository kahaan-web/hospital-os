import { randomUUID } from 'node:crypto';
import { createDb, dbEnv, withTenant } from '@hos/db';
import type { CashSummaryDto, OpBillDto } from '@hos/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { writeAudit } from '../../http';
import { charges } from '../charges';
import { clinicalFixture, closeClinicalPools, expectIsolation, type ClinicalFixture } from '../testkit';
import { billingIsolationIds } from './billing.test-seed';

const PREFIX = '/api/v1/tenant/m/op-billing';
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

function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

async function openVisit(): Promise<{ id: string; patientId: string }> {
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const found = await handle.db.execute<{ id: string; patient_id: string }>(sql`
      select id, patient_id from encounters
       where tenant_id = ${fx.sunrise.tenantId}::uuid
         and location_id = ${fx.sunrise.locationId}::uuid
         and kind = 'opd'
         and status = 'open'
       order by number
       limit 1
    `);
    const visit = found.rows[0];
    if (!visit) throw new Error('sunrise has no open OP visit');
    return { id: visit.id, patientId: visit.patient_id };
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

async function postCharge(visit: { id: string; patientId: string }, amount: number, treatment: 'exempt_healthcare' | 'taxable', rate: number): Promise<string> {
  const handle = createDb(dbEnv().appUrl, { max: 1 });
  try {
    return await withTenant(handle.db, fx.sunrise.tenantId, async (tx) => {
      const posted = await charges.post(
        {
          tx,
          tenantId: fx.sunrise.tenantId,
          locationId: fx.sunrise.locationId,
          userId: fx.sunrise.userId,
          audit: (action, entityType, entityId, before, after) =>
            writeAudit(
              tx,
              {
                actorType: 'user',
                actorId: fx.sunrise.userId,
                actorLabel: fx.sunrise.ownerEmail,
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
        },
        {
          encounterId: visit.id,
          patientId: visit.patientId,
          serviceId: null,
          description: treatment === 'taxable' ? 'Food (Sample)' : 'Consultation (Sample)',
          qty: 1,
          unitPricePaise: amount,
          gstTreatment: treatment,
          gstRateBp: rate,
          hsnSac: treatment === 'taxable' ? '996331' : '9993',
          serviceDate: istToday(),
          source: { module: 'billing', type: 'test', id: visit.id, line: randomUUID() },
        },
      );
      return posted.id;
    });
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

async function createBill(cookie: string, encounterId: string, chargeIds: string[], payClass: 'cash' | 'credit' | 'free' = 'cash') {
  return app.inject({
    method: 'POST',
    url: `${PREFIX}/bills`,
    headers: headers(cookie),
    payload: { encounterId, chargeIds, payClass },
  });
}

it('writes a bill of supply with zero tax for an exempt visit', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const visit = await openVisit();
  const chargeId = await postCharge(visit, 80_000, 'exempt_healthcare', 0);
  const res = await createBill(cookie, visit.id, [chargeId]);
  expect(res.statusCode).toBe(201);
  const bill = res.json() as OpBillDto;
  expect(bill.docType).toBe('bill_of_supply');
  expect(bill.cgstPaise + bill.sgstPaise + bill.igstPaise).toBe(0);
  expect(bill.totalPaise).toBe(80_000);
  const lineSum = (bill.lines ?? []).reduce((sum, line) => sum + line.taxablePaise + line.cgstPaise + line.sgstPaise + line.igstPaise, 0);
  expect(lineSum + bill.roundOffPaise).toBe(bill.totalPaise);
}, 60_000);

it('writes an invoice-cum-bill of supply when exempt and taxable lines share a bill', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const visit = await openVisit();
  const exempt = await postCharge(visit, 50_000, 'exempt_healthcare', 0);
  const taxable = await postCharge(visit, 15_001, 'taxable', 500);
  const res = await createBill(cookie, visit.id, [exempt, taxable]);
  expect(res.statusCode, res.body).toBe(201);
  const bill = res.json() as OpBillDto;
  expect(bill.docType).toBe('invoice_cum_bill_of_supply');
  expect(bill.cgstPaise + bill.sgstPaise).toBe(750);
  expect(bill.igstPaise).toBe(0);
  expect(Math.abs(bill.roundOffPaise)).toBeLessThanOrEqual(50);
  const lineSum = (bill.lines ?? []).reduce((sum, line) => sum + line.taxablePaise + line.cgstPaise + line.sgstPaise + line.igstPaise, 0);
  expect(lineSum + bill.roundOffPaise).toBe(bill.totalPaise);
  expect(bill.subtotalPaise - bill.discountPaise + bill.cgstPaise + bill.sgstPaise + bill.igstPaise + bill.roundOffPaise).toBe(bill.totalPaise);
}, 60_000);

it('keeps one cash row when the same settle request is replayed', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const visit = await openVisit();
  const chargeId = await postCharge(visit, 40_000, 'exempt_healthcare', 0);
  const created = await createBill(cookie, visit.id, [chargeId]);
  expect(created.statusCode).toBe(201);
  const draft = created.json() as OpBillDto;
  const finalised = await app.inject({
    method: 'POST',
    url: `${PREFIX}/bills/${draft.id}/finalise`,
    headers: headers(cookie),
  });
  expect(finalised.statusCode, finalised.body).toBe(200);
  const bill = finalised.json() as OpBillDto;
  expect(bill.number).toBeTruthy();
  const key = randomUUID();
  const payload = { mode: 'cash', amountPaise: bill.totalPaise };
  const first = await app.inject({
    method: 'POST',
    url: `${PREFIX}/bills/${bill.id}/settle`,
    headers: headers(cookie, { 'idempotency-key': key }),
    payload,
  });
  expect(first.statusCode, first.body).toBe(200);
  const second = await app.inject({
    method: 'POST',
    url: `${PREFIX}/bills/${bill.id}/settle`,
    headers: headers(cookie, { 'idempotency-key': key }),
    payload,
  });
  expect(second.statusCode).toBe(200);
  expect(second.headers['idempotent-replayed']).toBe('true');
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const count = await handle.db.execute<{ n: number }>(sql`
      select count(*)::int as n from cash_ledger
       where ref_type = 'bill' and ref_id = ${bill.id}::uuid and entry_type = 'receipt' and voided_at is null
    `);
    expect(Number(count.rows[0]?.n ?? 0)).toBe(1);
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}, 60_000);

it('rejects a refund larger than the amount paid', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const visit = await openVisit();
  const chargeId = await postCharge(visit, 20_000, 'exempt_healthcare', 0);
  const created = await createBill(cookie, visit.id, [chargeId]);
  const draft = created.json() as OpBillDto;
  const finalised = await app.inject({
    method: 'POST',
    url: `${PREFIX}/bills/${draft.id}/finalise`,
    headers: headers(cookie),
  });
  const bill = finalised.json() as OpBillDto;
  const settled = await app.inject({
    method: 'POST',
    url: `${PREFIX}/bills/${bill.id}/settle`,
    headers: headers(cookie),
    payload: { mode: 'upi', amountPaise: bill.totalPaise },
  });
  expect(settled.statusCode, settled.body).toBe(200);
  const refund = await app.inject({
    method: 'POST',
    url: `${PREFIX}/bills/${bill.id}/refund`,
    headers: headers(cookie),
    payload: { amountPaise: bill.totalPaise + 1, reason: 'Over the amount paid', mode: 'cash' },
  });
  expect(refund.statusCode).toBe(422);
  expect(refund.json().error.code).toBe('refund_exceeds_paid');
}, 60_000);

it('requires an approved concession before a free bill can be finalised', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const visit = await openVisit();
  const chargeId = await postCharge(visit, 50_000, 'exempt_healthcare', 0);
  const created = await createBill(cookie, visit.id, [chargeId], 'free');
  expect(created.statusCode, created.body).toBe(201);
  const draft = created.json() as OpBillDto;
  const blocked = await app.inject({
    method: 'POST',
    url: `${PREFIX}/bills/${draft.id}/finalise`,
    headers: headers(cookie),
  });
  expect(blocked.statusCode).toBe(422);
  expect(blocked.json().error.code).toBe('approval_required');
  const conceded = await app.inject({
    method: 'POST',
    url: `${PREFIX}/bills/${draft.id}/concessions`,
    headers: headers(cookie),
    payload: { amountPaise: draft.totalPaise, reason: 'Staff courtesy (Sample)' },
  });
  expect(conceded.statusCode, conceded.body).toBe(201);
  expect((conceded.json() as OpBillDto).totalPaise).toBe(0);
  const finalised = await app.inject({
    method: 'POST',
    url: `${PREFIX}/bills/${draft.id}/finalise`,
    headers: headers(cookie),
  });
  expect(finalised.statusCode, finalised.body).toBe(200);
  const bill = finalised.json() as OpBillDto;
  expect(bill.status).toBe('final');
  expect(bill.number).toBeTruthy();
  expect(bill.totalPaise).toBe(0);
}, 60_000);

it('includes every module in the cash summary and keeps visit statistics off the Basic plan', async () => {
  const day = istToday();
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    await handle.db.execute(sql`
      insert into cash_ledger (
        tenant_id, location_id, entry_type, direction, mode, amount_paise, number, ref_type, ref_id
      ) values (
        ${fx.sunrise.tenantId}::uuid, ${fx.sunrise.locationId}::uuid, 'receipt', 'in', 'cash', 2500,
        ${`PH${randomUUID().slice(0, 8)}`}, 'pharmacy_sale', gen_random_uuid()
      )
    `);
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
  const sunrise = await login(fx.sunrise.ownerEmail);
  const cash = await app.inject({
    method: 'GET',
    url: `${PREFIX}/reports/cash?from=${day}&to=${day}`,
    headers: { cookie: sunrise },
  });
  expect(cash.statusCode, cash.body).toBe(200);
  const summary = cash.json() as CashSummaryDto;
  expect(summary.rows.some((row) => row.refType === 'pharmacy_sale')).toBe(true);

  const lotus = await login(fx.lotus.ownerEmail);
  const blocked = await app.inject({
    method: 'GET',
    url: `${PREFIX}/reports/visit-statistics?from=${day}&to=${day}`,
    headers: { cookie: lotus },
  });
  expect(blocked.statusCode).toBe(403);
  expect(blocked.json().error.code).toBe('not_entitled');
  const allowed = await app.inject({
    method: 'GET',
    url: `${PREFIX}/reports/cash?from=${day}&to=${day}`,
    headers: { cookie: lotus },
  });
  expect(allowed.statusCode, allowed.body).toBe(200);
}, 60_000);

it('hides Lotus billing rows from Sunrise', async () => {
  const ids = await billingIsolationIds();
  await expectIsolation('bills', ids.billId);
  await expectIsolation('bill_lines', ids.lineId);
  await expectIsolation('deposits', ids.depositId);
  await expectIsolation('bill_settlements', ids.settlementId);
  await expectIsolation('concessions', ids.concessionId);
  await expectIsolation('refunds', ids.refundId);
  await expectIsolation('bill_credit_notes', ids.creditNoteId);
}, 60_000);
