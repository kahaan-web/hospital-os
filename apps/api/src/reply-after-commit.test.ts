import { randomUUID } from 'node:crypto';
import { dbEnv } from '@hos/db';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from './app';
import { clinicalFixture, closeClinicalPools, type ClinicalFixture } from './clinical/testkit';

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

async function login(email: string, password: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'x-hos-csrf': '1' },
    payload: { email, password },
  });
  expect(res.statusCode, res.body).toBe(200);
  const setCookie = res.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return String(cookie).split(';')[0] ?? '';
}

function headers(cookie: string, key?: string) {
  return { cookie, 'x-hos-csrf': '1', ...(key ? { 'idempotency-key': key } : {}) };
}

/** A connection that did not run the request transaction. Migration role bypasses RLS. */
async function onOtherConnection<T extends pg.QueryResultRow>(text: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: dbEnv().migrationUrl });
  await client.connect();
  try {
    const result = await client.query<T>(text, params);
    return result.rows;
  } finally {
    await client.end();
  }
}

async function expectRow(table: string, id: string): Promise<void> {
  const rows = await onOtherConnection<{ id: string }>(`select id::text as id from ${table} where id = $1`, [id]);
  expect(rows, `${table} ${id} was not visible after the response`).toEqual([{ id }]);
}

function stamp(): string {
  return randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
}

function openDate(): string {
  const n = parseInt(randomUUID().replaceAll('-', '').slice(0, 8), 16) % 2000;
  return new Date(Date.UTC(2028, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
}

it('the next connection sees each committed mutation, including an idempotent replay', async () => {
  const adminCookie = await login(process.env.SEED_ADMIN_EMAIL || 'admin@hospitalos.test', process.env.SEED_ADMIN_PASSWORD || 'Admin@12345');
  const before = await onOtherConnection<{ status: string }>(`select status from tenants where id = $1`, [fx.sunrise.tenantId]);
  if (before[0]?.status === 'suspended') {
    const restored = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/tenants/${fx.sunrise.tenantId}/reactivate`,
      headers: headers(adminCookie),
    });
    expect(restored.statusCode, restored.body).toBe(204);
    const active = await onOtherConnection<{ status: string }>(`select status from tenants where id = $1`, [fx.sunrise.tenantId]);
    expect(active[0]?.status).toBe('active');
  }

  const cookie = await login(fx.sunrise.ownerEmail, fx.password);
  const mark = stamp();

  const patient = await app.inject({
    method: 'POST',
    url: '/api/v1/tenant/m/patient-registration/patients',
    headers: headers(cookie),
    payload: {
      firstName: 'Commit',
      lastName: `Probe${mark}`,
      gender: 'female',
      mobile: `+9190${100000 + (parseInt(mark.slice(0, 5), 16) % 700000)}`,
      city: 'Pune',
      stateCode: 'MH',
    },
  });
  expect(patient.statusCode, patient.body).toBe(201);
  const patientId = patient.json().id as string;
  await expectRow('patients', patientId);

  const schedule = await app.inject({
    method: 'PUT',
    url: `/api/v1/tenant/m/appointments/schedules/${fx.sunrise.doctorId}`,
    headers: headers(cookie),
    payload: {
      windows: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '09:00', end: '09:30', slotMinutes: 30, maxPerSlot: 2 })),
    },
  });
  expect(schedule.statusCode, schedule.body).toBe(200);
  const apptKey = `racappt${mark}${stamp()}`;
  const apptPayload = { doctorId: fx.sunrise.doctorId, date: openDate(), slotStart: '09:00', reason: 'Commit probe', patientId };
  const booked = await app.inject({
    method: 'POST',
    url: '/api/v1/tenant/m/appointments/appointments',
    headers: headers(cookie, apptKey),
    payload: apptPayload,
  });
  expect(booked.statusCode, booked.body).toBe(201);
  const appointmentId = booked.json().id as string;
  await expectRow('appointments', appointmentId);
  const stored = await onOtherConnection<{ response_status: number; id: string }>(
    `select response_status, response_body->>'id' as id from idempotency_keys where tenant_id = $1 and key = $2`,
    [fx.sunrise.tenantId, apptKey],
  );
  expect(stored).toEqual([{ response_status: 201, id: appointmentId }]);
  const replay = await app.inject({
    method: 'POST',
    url: '/api/v1/tenant/m/appointments/appointments',
    headers: headers(cookie, apptKey),
    payload: apptPayload,
  });
  expect(replay.statusCode, replay.body).toBe(201);
  expect(replay.headers['idempotent-replayed']).toBe('true');
  expect(replay.json().id).toBe(appointmentId);
  const stillOne = await onOtherConnection<{ n: number }>(`select count(*)::int as n from appointments where id = $1`, [appointmentId]);
  expect(stillOne[0]?.n).toBe(1);

  const ward = await app.inject({
    method: 'POST',
    url: '/api/v1/tenant/m/adt/wards',
    headers: headers(cookie),
    payload: { code: `R${mark}`.slice(0, 8), name: `Commit ${mark}`, wardType: 'general' },
  });
  expect(ward.statusCode, ward.body).toBe(201);
  await expectRow('wards', ward.json().id as string);

  const service = await app.inject({
    method: 'POST',
    url: '/api/v1/tenant/m/op-billing/services',
    headers: headers(cookie),
    payload: { code: `RAC${mark}`, name: `Commit lab ${mark}`, category: 'lab' },
  });
  expect(service.statusCode, service.body).toBe(201);
  const serviceId = service.json().id as string;
  await expectRow('services', serviceId);

  const supplier = await app.inject({
    method: 'POST',
    url: '/api/v1/tenant/m/pharmacy/suppliers',
    headers: headers(cookie),
    payload: { name: `Commit supplier ${mark}`, city: 'Pune' },
  });
  expect(supplier.statusCode, supplier.body).toBe(201);
  await expectRow('pharmacy_suppliers', supplier.json().id as string);

  const lab = await app.inject({
    method: 'POST',
    url: '/api/v1/tenant/m/lab/tests',
    headers: headers(cookie),
    payload: { serviceId, specimen: 'blood', container: 'EDTA', tatHours: 4 },
  });
  expect(lab.statusCode, lab.body).toBe(201);
  await expectRow('lab_tests', lab.json().id as string);

  const encounters = await app.inject({
    method: 'GET',
    url: '/api/v1/tenant/clinical/encounters?kind=ipd&status=open',
    headers: { cookie },
  });
  expect(encounters.statusCode, encounters.body).toBe(200);
  const encounterId = (encounters.json() as { items: { id: string }[] }).items[0]?.id;
  expect(encounterId, 'seeded open IPD encounter').toBeTruthy();
  const diet = await app.inject({
    method: 'POST',
    url: `/api/v1/tenant/m/nurse-station/encounters/${encounterId}/diet`,
    headers: headers(cookie),
    payload: { kind: 'diet', source: 'nurse', items: [{ dietCode: 'soft', instructions: 'Commit probe' }] },
  });
  expect(diet.statusCode, diet.body).toBe(200);
  await expectRow('clinical_orders', diet.json().id as string);

  const suspended = await app.inject({
    method: 'POST',
    url: `/api/v1/admin/tenants/${fx.sunrise.tenantId}/suspend`,
    headers: headers(adminCookie),
    payload: { reason: 'Commit visibility probe' },
  });
  expect(suspended.statusCode, suspended.body).toBe(204);
  const suspendedRows = await onOtherConnection<{ status: string }>(`select status from tenants where id = $1`, [fx.sunrise.tenantId]);
  expect(suspendedRows[0]?.status).toBe('suspended');
  try {
    const reactivated = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/tenants/${fx.sunrise.tenantId}/reactivate`,
      headers: headers(adminCookie),
    });
    expect(reactivated.statusCode, reactivated.body).toBe(204);
    const restored = await onOtherConnection<{ status: string }>(`select status from tenants where id = $1`, [fx.sunrise.tenantId]);
    expect(restored[0]?.status).toBe('active');
  } finally {
    const now = await onOtherConnection<{ status: string }>(`select status from tenants where id = $1`, [fx.sunrise.tenantId]);
    if (now[0]?.status === 'suspended') {
      const again = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/tenants/${fx.sunrise.tenantId}/reactivate`,
        headers: headers(adminCookie),
      });
      expect([204, 409]).toContain(again.statusCode);
    }
  }
}, 120_000);
