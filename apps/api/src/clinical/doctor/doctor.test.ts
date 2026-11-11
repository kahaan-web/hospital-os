import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, expectIsolation, type ClinicalFixture } from '../testkit';
import { PREFIX_CPOE, PREFIX_OPD } from './routes';
import { doctorIsolationIds, penicillinEncounterId } from './doctor.test-seed';

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

it('Lotus can save a case paper', async () => {
  const cookie = await login(fx.lotus.ownerEmail);
  const res = await app.inject({
    method: 'PUT',
    url: `${PREFIX_OPD}/encounters/${fx.lotus.encounterId}/case-paper`,
    headers: headers(cookie),
    payload: {
      chiefComplaint: 'Sample headache',
      history: 'Two days',
      examination: 'Alert',
      diagnoses: [{ code: 'R51', codeDisplay: 'Headache' }],
      advice: 'Rest and fluids',
    },
  });
  expect(res.statusCode).toBe(200);
  expect((res.json() as { chiefComplaint: string }).chiefComplaint).toBe('Sample headache');
}, 120_000);

it('Lotus gets 403 on procedure orders and order sets', async () => {
  const cookie = await login(fx.lotus.ownerEmail);
  const [procService] = fx.sunrise.labServiceIds;
  const procedure = await app.inject({
    method: 'POST',
    url: `${PREFIX_CPOE}/encounters/${fx.lotus.encounterId}/orders/procedure`,
    headers: headers(cookie),
    payload: { items: [{ serviceId: procService }] },
  });
  expect(procedure.statusCode).toBe(403);
  expect(procedure.json().error.code).toBe('not_entitled');
  const sets = await app.inject({ method: 'GET', url: `${PREFIX_CPOE}/order-sets`, headers: { cookie } });
  expect(sets.statusCode).toBe(403);
  expect(sets.json().error.code).toBe('not_entitled');
}, 120_000);

it('places a lab order with exactly one new charge', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const before = await app.inject({
    method: 'GET',
    url: `/api/v1/tenant/clinical/encounters/${fx.sunrise.encounterId}/charges`,
    headers: { cookie },
  });
  expect(before.statusCode).toBe(200);
  const countBefore = (before.json() as unknown[]).length;
  const labId = fx.sunrise.labServiceIds[0];
  const placed = await app.inject({
    method: 'POST',
    url: `${PREFIX_CPOE}/encounters/${fx.sunrise.encounterId}/orders/diagnostic`,
    headers: headers(cookie),
    payload: { items: [{ serviceId: labId, instructions: 'Fasting' }] },
  });
  expect(placed.statusCode).toBe(201);
  const after = await app.inject({
    method: 'GET',
    url: `/api/v1/tenant/clinical/encounters/${fx.sunrise.encounterId}/charges`,
    headers: { cookie },
  });
  expect((after.json() as unknown[]).length).toBe(countBefore + 1);
}, 120_000);

it('blocks amoxicillin when penicillin allergy is on file', async () => {
  const encounterId = (await penicillinEncounterId(fx.sunrise.tenantId)) ?? fx.sunrise.encounterId;
  const cookie = await login('doctor@sunrise.demo');
  const blocked = await app.inject({
    method: 'POST',
    url: `${PREFIX_OPD}/encounters/${encounterId}/prescription`,
    headers: headers(cookie),
    payload: {
      items: [
        {
          drugName: 'Amoxicillin',
          genericCode: 'AMOXICILLIN',
          strength: '500 mg',
          frequencyCode: 'TDS',
          durationDays: 5,
        },
      ],
    },
  });
  expect(blocked.statusCode).toBe(422);
  expect(blocked.json().error.code).toBe('allergy_conflict');
  const ok = await app.inject({
    method: 'POST',
    url: `${PREFIX_OPD}/encounters/${encounterId}/prescription`,
    headers: headers(cookie),
    payload: {
      overrideReason: 'Sample override for test',
      items: [
        {
          drugName: 'Amoxicillin',
          genericCode: 'AMOXICILLIN',
          strength: '500 mg',
          frequencyCode: 'TDS',
          durationDays: 5,
        },
      ],
    },
  });
  expect(ok.statusCode).toBe(201);
}, 120_000);

it('prescription PDF includes doctor registration number', async () => {
  const cookie = await login('doctor@sunrise.demo');
  const encounterId = fx.sunrise.encounterId;
  const rx = await app.inject({
    method: 'POST',
    url: `${PREFIX_OPD}/encounters/${encounterId}/prescription`,
    headers: headers(cookie),
    payload: {
      items: [{ drugName: 'Paracetamol', genericCode: 'PARACETAMOL', frequencyCode: 'OD', durationDays: 3 }],
    },
  });
  expect(rx.statusCode).toBe(201);
  const orderId = (rx.json() as { id: string }).id;
  const printPdf = await app.inject({
    method: 'GET',
    url: `${PREFIX_OPD}/encounters/${encounterId}/print/prescription/pdf`,
    headers: { cookie },
  });
  expect(printPdf.statusCode).toBe(200);
  const pdf = await PDFDocument.load(printPdf.rawPayload);
  expect(pdf.getPageCount()).toBeGreaterThan(0);
  const printHtml = await app.inject({
    method: 'GET',
    url: `${PREFIX_OPD}/encounters/${encounterId}/print/prescription/html`,
    headers: { cookie },
  });
  expect(printHtml.statusCode).toBe(200);
  expect(printHtml.body).toContain('MH-DEMO-1001');
  expect(orderId).toBeTruthy();
}, 120_000);

it('isolates doctor tables', async () => {
  const ids = await doctorIsolationIds();
  await expectIsolation('order_sets', ids.lotusOrderSetId);
}, 60_000);
