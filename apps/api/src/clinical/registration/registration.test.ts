import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, expectIsolation, type ClinicalFixture } from '../testkit';
import { PAGE } from '../print';

const PREFIX = '/api/v1/tenant/m/patient-registration';
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

const samplePatient = {
  firstName: 'Test',
  lastName: 'Registrant',
  gender: 'male' as const,
  mobile: '+91 90000 88101',
  city: 'Pune',
  stateCode: 'MH',
};

it('issues unique UHIDs for ten concurrent creates', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const mobileBase = 100_000 + Math.floor(Math.random() * 700_000);
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      app.inject({
        method: 'POST',
        url: `${PREFIX}/patients`,
        headers: headers(cookie),
        payload: { ...samplePatient, firstName: `Concurrent${i}`, lastName: `Batch${mobileBase}`, mobile: `+9190${mobileBase + i}` },
      }),
    ),
  );
  const codes = results.map((r) => r.statusCode);
  expect(codes, results.map((r, i) => `${i}:${r.statusCode}:${r.body}`).join(' | ')).toEqual(Array(10).fill(201));
  const uhids = results.map((r) => (r.json() as { uhid: string }).uhid);
  expect(new Set(uhids).size).toBe(10);
}, 60_000);

it('returns 409 possible_duplicate when mobile and name match', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const mobile = `+9190000${Math.floor(Math.random() * 90000 + 10000)}`;
  const payload = { firstName: 'Dup', lastName: 'Probe', gender: 'female' as const, mobile, dob: '1992-03-10' };
  const first = await app.inject({
    method: 'POST',
    url: `${PREFIX}/patients`,
    headers: headers(cookie),
    payload,
  });
  expect(first.statusCode).toBe(201);
  const dup = await app.inject({
    method: 'POST',
    url: `${PREFIX}/patients`,
    headers: headers(cookie),
    payload,
  });
  expect(dup.statusCode).toBe(409);
  expect(dup.json().error.code).toBe('possible_duplicate');
  expect((dup.json().error as { details?: { duplicates?: unknown[] } }).details?.duplicates?.length).toBeGreaterThan(0);
}, 30_000);

it('rejects a 12-digit Aadhaar value', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const res = await app.inject({
    method: 'POST',
    url: `${PREFIX}/patients`,
    headers: headers(cookie),
    payload: { ...samplePatient, firstName: 'Aadhaar', mobile: '+91 90000 88301', idType: 'aadhaar_last4', idLast4: '123456789012' },
  });
  expect(res.statusCode).toBe(400);
}, 30_000);

it('renders a 50x25 mm sticker with a Code128 UHID barcode', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const res = await app.inject({
    method: 'GET',
    url: `${PREFIX}/patients/${fx.sunrise.patientId}/print/sticker/pdf`,
    headers: { cookie },
  });
  expect(res.statusCode).toBe(200);
  const pdf = await PDFDocument.load(res.rawPayload);
  const page = pdf.getPage(0);
  const size = page.getSize();
  const want = PAGE.label_50x25;
  expect(Math.round(size.width)).toBe(Math.round(want[0]!));
  expect(Math.round(size.height)).toBe(Math.round(want[1]!));
}, 30_000);

it('returns 403 for Lotus on documents and MLC', async () => {
  const cookie = await login(fx.lotus.ownerEmail);
  const docs = await app.inject({
    method: 'GET',
    url: `${PREFIX}/patients/${fx.lotus.patientId}/documents`,
    headers: { cookie },
  });
  expect(docs.statusCode).toBe(403);
  expect(docs.json().error.code).toBe('not_entitled');
  const mlc = await app.inject({
    method: 'POST',
    url: `${PREFIX}/mlc`,
    headers: headers(cookie),
    payload: {
      patientId: fx.lotus.patientId,
      encounterId: fx.lotus.encounterId,
      injurySummary: 'Should be blocked',
    },
  });
  expect(mlc.statusCode).toBe(403);
  expect(mlc.json().error.code).toBe('not_entitled');
}, 30_000);

it('isolates registration tables', async () => {
  const { registrationIsolationIds } = await import('./registration.test-seed');
  const ids = await registrationIsolationIds();
  await expectIsolation('patient_documents', ids.lotusDocumentId);
  await expectIsolation('mlc_cases', ids.lotusMlcId);
}, 60_000);
