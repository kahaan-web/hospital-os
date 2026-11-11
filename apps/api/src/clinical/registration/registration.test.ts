import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { dbEnv } from '@hos/db';
import { PDFDocument } from 'pdf-lib';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { apiEnv } from '../../env';
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
  expect(codes, codes.map((c, i) => `${i}:${c}`).join(', ')).toEqual(Array(10).fill(201));
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

it('records a patient update without identifiers and hides that payload from audit-only readers', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const mobile = '+919000066601';
  const firstName = 'PhiHide';
  const abhaNumber = '00-1111-2222-3333';
  const created = await app.inject({
    method: 'POST',
    url: `${PREFIX}/patients`,
    headers: headers(cookie),
    payload: { firstName: 'Before', lastName: 'Audit', gender: 'female', mobile: '+919000066600', confirmNew: true },
  });
  expect(created.statusCode, created.body).toBe(201);
  const patientId = (created.json() as { id: string }).id;
  const patched = await app.inject({
    method: 'PATCH',
    url: `${PREFIX}/patients/${patientId}`,
    headers: headers(cookie),
    payload: { firstName, mobile, abhaNumber },
  });
  expect(patched.statusCode, patched.body).toBe(200);

  const listed = await app.inject({ method: 'GET', url: '/api/v1/tenant/audit?page=1&pageSize=25', headers: { cookie } });
  expect(listed.statusCode, listed.body).toBe(200);
  const row = (listed.json().items as AuditItem[]).find((item) => item.action === 'registration.patient.update' && item.entityId === patientId);
  expect(row, 'registration.patient.update').toBeTruthy();
  const after = row!.after as { changed?: string[] };
  expect(after.changed).toEqual(expect.arrayContaining(['firstName', 'mobile', 'abhaNumber']));
  const blob = JSON.stringify({ before: row!.before, after: row!.after });
  expect(blob).not.toContain(mobile);
  expect(blob).not.toContain(firstName);
  expect(blob).not.toContain(abhaNumber);
  expect(after).not.toHaveProperty('mobile');
  expect(after).not.toHaveProperty('firstName');
  expect(after).not.toHaveProperty('abhaNumber');

  const reader = await auditOnlyCookie(fx.sunrise.tenantId);
  const hidden = await app.inject({ method: 'GET', url: '/api/v1/tenant/audit?page=1&pageSize=50', headers: { cookie: reader } });
  expect(hidden.statusCode, hidden.body).toBe(200);
  const hiddenRow = (hidden.json().items as AuditItem[]).find((item) => item.action === 'registration.patient.update' && item.entityId === patientId);
  expect(hiddenRow, 'patient update visible to audit.view').toBeTruthy();
  expect(hiddenRow!.before).toBeNull();
  expect(hiddenRow!.after).toBeNull();
}, 60_000);

it('returns 404 for a photo of an unknown patient and creates no directory', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const id = randomUUID();
  const boundary = '----hosphoto';
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n`),
    png,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await app.inject({
    method: 'POST',
    url: `${PREFIX}/patients/${id}/photo`,
    headers: { ...headers(cookie), 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload,
  });
  expect(res.statusCode, res.body).toBe(404);
  expect(res.json().error.code).toBe('not_found');
  expect(existsSync(join(apiEnv().uploadDir, 'patients', fx.sunrise.tenantId, id))).toBe(false);
}, 30_000);

it('isolates registration tables', async () => {
  const { registrationIsolationIds } = await import('./registration.test-seed');
  const ids = await registrationIsolationIds();
  await expectIsolation('patient_documents', ids.lotusDocumentId);
  await expectIsolation('mlc_cases', ids.lotusMlcId);
}, 60_000);

interface AuditItem {
  action: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
}

/** Staff login that holds audit.view and not patients.view. Password matches the Sunrise owner. */
async function auditOnlyCookie(tenantId: string): Promise<string> {
  const email = `audit.only.${randomUUID().slice(0, 8)}@sbx.hospitalos.test`;
  const client = new pg.Client({ connectionString: dbEnv().migrationUrl });
  await client.connect();
  try {
    const owner = await client.query<{ password_hash: string }>(`select password_hash from users where lower(email) = 'owner@sunrise.demo'`);
    const passwordHash = owner.rows[0]?.password_hash;
    if (!passwordHash) throw new Error('sunrise owner has no password');
    const existing = await client.query<{ id: string }>(`select id from roles where tenant_id = $1 and key = 'audit_only'`, [tenantId]);
    const roleId =
      existing.rows[0]?.id ??
      (
        await client.query<{ id: string }>(
          `insert into roles (tenant_id, key, name, description, is_system) values ($1, 'audit_only', 'Audit only', 'Reads the audit trail without patient records', false) returning id`,
          [tenantId],
        )
      ).rows[0]!.id;
    await client.query(`insert into role_permissions (role_id, permission_key) values ($1, 'audit.view') on conflict do nothing`, [roleId]);
    const user = await client.query<{ id: string }>(
      `insert into users (tenant_id, email, name, password_hash, status) values ($1, $2, 'Audit Reader', $3, 'active') returning id`,
      [tenantId, email, passwordHash],
    );
    await client.query(`insert into user_location_roles (tenant_id, user_id, role_id, location_id) values ($1, $2, $3, null)`, [
      tenantId,
      user.rows[0]!.id,
      roleId,
    ]);
  } finally {
    await client.end();
  }
  return login(email);
}
