import { randomUUID } from 'node:crypto';
import { createDb, dbEnv, schema } from '@hos/db';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, expectIsolation, type ClinicalFixture } from '../testkit';

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

/** A fresh calendar day so a re-run does not find the previous booking still holding the seat. */
function openDate(): string {
  const n = parseInt(randomUUID().replaceAll('-', '').slice(0, 8), 16) % 2500;
  return new Date(Date.UTC(2027, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
}

function idemKey(prefix: string): string {
  return `${prefix}-${randomUUID().replaceAll('-', '').slice(0, 20)}`;
}

function windows(slotMinutes: number, maxPerSlot: number, end = '10:00') {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '09:00', end, slotMinutes, maxPerSlot }));
}

async function putSchedule(cookie: string, doctorId: string, body: object) {
  const res = await app.inject({
    method: 'PUT',
    url: `/api/v1/tenant/m/appointments/schedules/${doctorId}`,
    headers: { cookie, 'x-hos-csrf': '1' },
    payload: body,
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
}

it('builds slots from the weekly hours and from exceptions', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const doctorId = fx.sunrise.doctorId;
  await putSchedule(cookie, doctorId, {
    windows: windows(30, 2),
    exceptions: [
      { date: '2026-12-02', kind: 'closed', reason: 'Camp day' },
      { date: '2026-12-03', kind: 'closed', start: '09:00', end: '09:30', reason: 'Meeting' },
      { date: '2026-12-04', kind: 'override', start: '14:00', end: '14:30', slotMinutes: 30, maxPerSlot: 1, reason: 'Afternoon only' },
    ],
  });
  const open = await app.inject({
    method: 'GET',
    url: `/api/v1/tenant/m/appointments/slots?doctorId=${doctorId}&date=2026-12-01`,
    headers: { cookie },
  });
  expect(open.statusCode).toBe(200);
  const openSlots = open.json() as { start: string; available: boolean; note: string | null }[];
  expect(openSlots.map((slot) => slot.start)).toEqual(['09:00', '09:30']);
  expect(openSlots.every((slot) => slot.available)).toBe(true);

  const shut = await app.inject({
    method: 'GET',
    url: `/api/v1/tenant/m/appointments/slots?doctorId=${doctorId}&date=2026-12-02`,
    headers: { cookie },
  });
  const shutSlots = shut.json() as { available: boolean; note: string | null }[];
  expect(shutSlots.length).toBeGreaterThan(0);
  expect(shutSlots.every((slot) => slot.available === false && slot.note === 'Closed')).toBe(true);

  const partial = await app.inject({
    method: 'GET',
    url: `/api/v1/tenant/m/appointments/slots?doctorId=${doctorId}&date=2026-12-03`,
    headers: { cookie },
  });
  const partialSlots = partial.json() as { start: string; available: boolean; note: string | null }[];
  expect(partialSlots.find((slot) => slot.start === '09:00')).toMatchObject({ available: false, note: 'Closed' });
  expect(partialSlots.find((slot) => slot.start === '09:30')).toMatchObject({ available: true, note: null });

  const override = await app.inject({
    method: 'GET',
    url: `/api/v1/tenant/m/appointments/slots?doctorId=${doctorId}&date=2026-12-04`,
    headers: { cookie },
  });
  expect((override.json() as { start: string }[]).map((slot) => slot.start)).toEqual(['14:00']);

  const offGrid = await app.inject({
    method: 'POST',
    url: '/api/v1/tenant/m/appointments/appointments',
    headers: { cookie, 'x-hos-csrf': '1', 'idempotency-key': idemKey('offgrid') },
    payload: { doctorId, date: '2026-12-01', slotStart: '09:15', reason: 'Not on the grid', patientId: fx.sunrise.patientId },
  });
  expect(offGrid.statusCode).toBe(422);
  expect(offGrid.json().error.code).toBe('not_on_schedule');
}, 30_000);

it('gives one success and one 409 when two bookings take the same seat', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const doctorId = fx.sunrise.doctorId;
  await putSchedule(cookie, doctorId, { windows: windows(30, 1, '09:30') });
  const payload = { doctorId, date: openDate(), slotStart: '09:00', reason: 'Concurrent seat', patientId: fx.sunrise.patientId };
  const [a, b] = await Promise.all([
    app.inject({ method: 'POST', url: '/api/v1/tenant/m/appointments/appointments', headers: { cookie, 'x-hos-csrf': '1', 'idempotency-key': idemKey('seat-a') }, payload }),
    app.inject({ method: 'POST', url: '/api/v1/tenant/m/appointments/appointments', headers: { cookie, 'x-hos-csrf': '1', 'idempotency-key': idemKey('seat-b') }, payload }),
  ]);
  const codes = [a.statusCode, b.statusCode].sort();
  expect(codes, `${a.body}\n${b.body}`).toEqual([201, 409]);
}, 30_000);

it('checks a patient in once, including an idempotency replay', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const doctorId = fx.sunrise.doctorId;
  await putSchedule(cookie, doctorId, { windows: windows(30, 2, '12:00') });
  const booked = await app.inject({
    method: 'POST',
    url: '/api/v1/tenant/m/appointments/appointments',
    headers: { cookie, 'x-hos-csrf': '1', 'idempotency-key': idemKey('book') },
    payload: { doctorId, date: openDate(), slotStart: '11:00', reason: 'Check-in sample', patientId: fx.sunrise.patientId },
  });
  expect(booked.statusCode, booked.body).toBe(201);
  const appointmentId = booked.json().id as string;
  const headers = { cookie, 'x-hos-csrf': '1', 'idempotency-key': idemKey('checkin') };
  const payload = { patientId: fx.sunrise.patientId, doctorId, appointmentId };
  const first = await app.inject({ method: 'POST', url: '/api/v1/tenant/m/opd-visit/visits', headers, payload });
  expect(first.statusCode, first.body).toBe(201);
  const visit = first.json() as { id: string; token: number; consultation: { gstTreatment: string; gstRateBp: number } };
  expect(visit.token).toBeGreaterThan(0);
  expect(visit.consultation.gstTreatment).toBe('exempt_healthcare');
  expect(visit.consultation.gstRateBp).toBe(0);
  const second = await app.inject({ method: 'POST', url: '/api/v1/tenant/m/opd-visit/visits', headers, payload });
  expect(second.statusCode).toBe(201);
  expect(second.headers['idempotent-replayed']).toBe('true');
  expect(second.json().id).toBe(visit.id);
  expect(second.json().token).toBe(visit.token);

  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const encounters = await handle.db.select().from(schema.encounters).where(eq(schema.encounters.appointmentId, appointmentId));
    expect(encounters).toHaveLength(1);
    const charges = await handle.db
      .select()
      .from(schema.charges)
      .where(and(eq(schema.charges.encounterId, visit.id), eq(schema.charges.sourceLine, 'consultation'), isNull(schema.charges.reversalOfId)));
    expect(charges.filter((row) => row.status !== 'reversed')).toHaveLength(1);
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}, 30_000);

it('links a phone booking to the patient on arrival', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const doctorId = fx.sunrise.doctorId;
  await putSchedule(cookie, doctorId, { windows: windows(15, 2, '11:00') });
  const booked = await app.inject({
    method: 'POST',
    url: '/api/v1/tenant/m/appointments/appointments',
    headers: { cookie, 'x-hos-csrf': '1', 'idempotency-key': idemKey('phone') },
    payload: {
      doctorId,
      date: openDate(),
      slotStart: '09:15',
      reason: 'Caller not yet registered',
      walkinName: 'Mehul Joshi',
      walkinMobile: '9000011102',
    },
  });
  expect(booked.statusCode, booked.body).toBe(201);
  expect(booked.json().patientId).toBeNull();
  expect(booked.json().channel).toBe('phone');
  const appointmentId = booked.json().id as string;
  const visit = await app.inject({
    method: 'POST',
    url: '/api/v1/tenant/m/opd-visit/visits',
    headers: { cookie, 'x-hos-csrf': '1', 'idempotency-key': idemKey('phonelink') },
    payload: { patientId: fx.sunrise.patientId, doctorId, appointmentId },
  });
  expect(visit.statusCode, visit.body).toBe(201);
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const [row] = await handle.db.select().from(schema.appointments).where(eq(schema.appointments.id, appointmentId));
    expect(row?.patientId).toBe(fx.sunrise.patientId);
    expect(row?.encounterId).toBe(visit.json().id);
    expect(row?.status).toBe('checked_in');
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}, 30_000);

it('keeps Lotus entitled to the diary and hides its rows from Sunrise', async () => {
  const lotus = await login(fx.lotus.ownerEmail);
  const diary = await app.inject({
    method: 'GET',
    url: '/api/v1/tenant/m/appointments/diary?date=2026-12-01',
    headers: { cookie: lotus },
  });
  expect(diary.statusCode, diary.body).toBe(200);
  const sunrise = await login(fx.sunrise.ownerEmail);
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    const [lotusAppt] = await handle.db.select().from(schema.appointments).where(eq(schema.appointments.tenantId, fx.lotus.tenantId));
    expect(lotusAppt).toBeTruthy();
    const hidden = await app.inject({
      method: 'GET',
      url: `/api/v1/tenant/m/appointments/appointments/${lotusAppt!.id}`,
      headers: { cookie: sunrise },
    });
    expect(hidden.statusCode).toBe(404);
    await expectIsolation('doctor_schedules', (await handle.db.select().from(schema.doctorSchedules).where(eq(schema.doctorSchedules.tenantId, fx.lotus.tenantId)))[0]!.id);
    await expectIsolation('schedule_exceptions', (await handle.db.select().from(schema.scheduleExceptions).where(eq(schema.scheduleExceptions.tenantId, fx.lotus.tenantId)))[0]!.id);
    await expectIsolation('appointments', lotusAppt!.id);
    const [queue] = await handle.db.select().from(schema.opdQueue).where(eq(schema.opdQueue.tenantId, fx.lotus.tenantId));
    expect(queue).toBeTruthy();
    await expectIsolation('opd_queue', queue!.id);
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}, 60_000);
