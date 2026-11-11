import { randomUUID } from 'node:crypto';
import type { AdmissionDto, BedChargePostResult, ServiceDto } from '@hos/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { ApiError } from '../../http';
import { buildApp } from '../../app';
import { clinicalFixture, closeClinicalPools, expectIsolation, type ClinicalFixture } from '../testkit';
import { assertDischargeClearance } from './service';

const PREFIX = '/api/v1/tenant/m/adt';
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

function headers(cookie: string) {
  return { cookie, 'x-hos-csrf': '1', 'idempotency-key': randomUUID() };
}

function tag() {
  return randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
}

async function createPatient(cookie: string, firstName: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/tenant/m/patient-registration/patients',
    headers: headers(cookie),
    payload: {
      firstName,
      lastName: 'Fictional',
      gender: 'female',
      mobile: `+9190000${String((parseInt(randomUUID().replace(/-/g, '').slice(0, 8), 16) % 90000) + 10000)}`,
      city: 'Pune',
      stateCode: 'MH',
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string };
}

async function bedService(cookie: string, code: string) {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/tenant/clinical/services?category=bed',
    headers: { cookie },
  });
  expect(res.statusCode, res.body).toBe(200);
  const row = (res.json() as ServiceDto[]).find((service) => service.code === code);
  if (!row) throw new Error(`missing bed service ${code}`);
  return row;
}

async function makeBed(cookie: string, ward: { code: string; name: string; wardType: string; isIcu: boolean; bedServiceId: string }, label: string) {
  const suffix = tag();
  const wardRes = await app.inject({
    method: 'POST',
    url: `${PREFIX}/wards`,
    headers: headers(cookie),
    payload: { ...ward, code: `${ward.code}${suffix}`.slice(0, 8) },
  });
  expect(wardRes.statusCode, wardRes.body).toBe(201);
  const createdWard = wardRes.json() as { id: string };
  const roomRes = await app.inject({
    method: 'POST',
    url: `${PREFIX}/rooms`,
    headers: headers(cookie),
    payload: { wardId: createdWard.id, code: `R${suffix}`.slice(0, 8), name: 'Room' },
  });
  expect(roomRes.statusCode, roomRes.body).toBe(201);
  const room = roomRes.json() as { id: string };
  const bedRes = await app.inject({
    method: 'POST',
    url: `${PREFIX}/beds`,
    headers: headers(cookie),
    payload: { roomId: room.id, label, wardClass: ward.wardType, status: 'vacant' },
  });
  expect(bedRes.statusCode, bedRes.body).toBe(201);
  return bedRes.json() as { id: string };
}

async function admitTo(cookie: string, patientId: string, bedId: string) {
  return app.inject({
    method: 'POST',
    url: `${PREFIX}/admissions`,
    headers: headers(cookie),
    payload: {
      patientId,
      doctorId: fx.sunrise.doctorId,
      bedId,
      admissionType: 'elective',
      payerType: 'self',
      isMlc: false,
      attendant: 'Meera Joshi',
      provisionalDiagnosis: 'Observation',
    },
  });
}

it('blocks discharge when billing is not cleared unless IP billing overrides', () => {
  const blocked = { ok: false, balancePaise: 150000, reasons: ['Balance due'] };
  expect(() => assertDischargeClearance(blocked, false, undefined)).toThrow(ApiError);
  expect(() => assertDischargeClearance(blocked, true, 'ok')).toThrow(ApiError);
  expect(() => assertDischargeClearance(blocked, true, 'Owner cleared')).not.toThrow();
  expect(() => assertDischargeClearance({ ok: true, balancePaise: 0, reasons: [] }, false, undefined)).not.toThrow();
  try {
    assertDischargeClearance(blocked, false, undefined);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(422);
    expect((error as ApiError).code).toBe('billing_not_cleared');
  }
});

it('gives one success and one 409 when two admissions take the same bed', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const [a, b] = await Promise.all([createPatient(cookie, 'Anita'), createPatient(cookie, 'Bhavna')]);
  const bed = await makeBed(cookie, { code: 'C', name: 'Concurrent', wardType: 'general', isIcu: false, bedServiceId: (await bedService(cookie, 'BED-GEN')).id }, 'C-1');
  const results = await Promise.all([admitTo(cookie, a.id, bed.id), admitTo(cookie, b.id, bed.id)]);
  const codes = results.map((res) => res.statusCode).sort();
  expect(codes, results.map((res) => res.body).join('\n')).toEqual([201, 409]);
}, 60_000);

it('keeps the original bed when a transfer into an occupied bed fails', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const serviceId = (await bedService(cookie, 'BED-GEN')).id;
  const spec = { code: 'T', name: 'Transfer', wardType: 'general', isIcu: false, bedServiceId: serviceId };
  const bed1 = await makeBed(cookie, spec, 'T-1');
  const bed2 = await makeBed(cookie, spec, 'T-2');
  const bed3 = await makeBed(cookie, spec, 'T-3');
  const [a, b] = await Promise.all([createPatient(cookie, 'Chitra'), createPatient(cookie, 'Deepa')]);
  const first = await admitTo(cookie, a.id, bed1.id);
  const second = await admitTo(cookie, b.id, bed2.id);
  expect(first.statusCode, first.body).toBe(201);
  expect(second.statusCode, second.body).toBe(201);
  const admission = first.json() as AdmissionDto;
  const blocked = await app.inject({
    method: 'POST',
    url: `${PREFIX}/admissions/${admission.id}/transfer`,
    headers: headers(cookie),
    payload: { bedId: bed2.id },
  });
  expect(blocked.statusCode).toBe(409);
  const still = await app.inject({ method: 'GET', url: `${PREFIX}/admissions/${admission.id}`, headers: { cookie } });
  expect(still.statusCode).toBe(200);
  const stayed = still.json() as AdmissionDto;
  expect(stayed.assignments.filter((row) => row.toAt == null).map((row) => row.bedId)).toEqual([bed1.id]);
  const moved = await app.inject({
    method: 'POST',
    url: `${PREFIX}/admissions/${admission.id}/transfer`,
    headers: headers(cookie),
    payload: { bedId: bed3.id },
  });
  expect(moved.statusCode, moved.body).toBe(200);
  const after = moved.json() as AdmissionDto;
  const open = after.assignments.find((row) => row.toAt == null);
  expect(open?.bedId).toBe(bed3.id);
  expect(after.assignments.some((row) => row.bedId === bed1.id && row.toAt != null)).toBe(true);
  const beds = await app.inject({ method: 'GET', url: `${PREFIX}/beds`, headers: { cookie } });
  const rows = beds.json() as { id: string; status: string }[];
  expect(rows.find((row) => row.id === bed1.id)?.status).toBe('housekeeping');
  expect(rows.find((row) => row.id === bed3.id)?.status).toBe('occupied');
}, 60_000);

it('taxes a private room at 5 percent and an ICU stay at 0 percent, once per date', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const priv = await bedService(cookie, 'BED-PVT');
  const icu = await bedService(cookie, 'BED-ICU');
  const privateBed = await makeBed(cookie, { code: 'P', name: 'Private', wardType: 'private', isIcu: false, bedServiceId: priv.id }, 'P-1');
  const icuBed = await makeBed(cookie, { code: 'I', name: 'ICU', wardType: 'icu', isIcu: true, bedServiceId: icu.id }, 'I-1');
  const [a, b] = await Promise.all([createPatient(cookie, 'Esha'), createPatient(cookie, 'Farah')]);
  const privateStay = await admitTo(cookie, a.id, privateBed.id);
  const icuStay = await admitTo(cookie, b.id, icuBed.id);
  expect(privateStay.statusCode, privateStay.body).toBe(201);
  expect(icuStay.statusCode, icuStay.body).toBe(201);
  const privateAdmission = privateStay.json() as AdmissionDto;
  const icuAdmission = icuStay.json() as AdmissionDto;
  const first = await app.inject({ method: 'POST', url: `${PREFIX}/bed-charges/post`, headers: headers(cookie) });
  expect(first.statusCode, first.body).toBe(200);
  const posted = first.json() as BedChargePostResult;
  const privateCharge = posted.charges.find((charge) => charge.encounterId === privateAdmission.encounterId);
  const icuCharge = posted.charges.find((charge) => charge.encounterId === icuAdmission.encounterId);
  expect(privateCharge?.unitPricePaise).toBe(600_000);
  expect(privateCharge?.gstTreatment).toBe('room_rent_rule');
  expect(privateCharge?.gstRateBp).toBe(500);
  expect(icuCharge?.unitPricePaise).toBe(800_000);
  expect(icuCharge?.gstTreatment).toBe('exempt_healthcare');
  expect(icuCharge?.gstRateBp).toBe(0);
  const second = await app.inject({ method: 'POST', url: `${PREFIX}/bed-charges/post`, headers: headers(cookie) });
  expect(second.statusCode).toBe(200);
  const again = second.json() as BedChargePostResult;
  expect(again.charges.find((charge) => charge.encounterId === privateAdmission.encounterId)?.id).toBe(privateCharge?.id);
  expect(again.charges.find((charge) => charge.encounterId === icuAdmission.encounterId)?.id).toBe(icuCharge?.id);
  const listed = await app.inject({
    method: 'GET',
    url: `/api/v1/tenant/clinical/encounters/${privateAdmission.encounterId}/charges`,
    headers: { cookie },
  });
  expect(listed.statusCode, listed.body).toBe(200);
  const lines = (listed.json() as { sourceType: string; sourceLine: string }[]).filter((line) => line.sourceType === 'bed_assignment');
  expect(lines).toHaveLength(1);
}, 60_000);

it('returns 403 for Lotus on discharge summaries and allows the register', async () => {
  const cookie = await login(fx.lotus.ownerEmail);
  const summary = await app.inject({
    method: 'GET',
    url: `${PREFIX}/admissions/${randomUUID()}/summary`,
    headers: { cookie },
  });
  expect(summary.statusCode).toBe(403);
  expect(summary.json().error.code).toBe('not_entitled');
  const save = await app.inject({
    method: 'PUT',
    url: `${PREFIX}/admissions/${randomUUID()}/summary`,
    headers: headers(cookie),
    payload: { sections: { diagnosis: 'Should be blocked' } },
  });
  expect(save.statusCode).toBe(403);
  expect(save.json().error.code).toBe('not_entitled');
  const register = await app.inject({
    method: 'GET',
    url: `${PREFIX}/reports/admissions?from=2026-04-01&to=2026-11-11`,
    headers: { cookie },
  });
  expect(register.statusCode, register.body).toBe(200);
}, 30_000);

it('saves and finalises a discharge summary on the Medium plan', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const serviceId = (await bedService(cookie, 'BED-GEN')).id;
  const bed = await makeBed(cookie, { code: 'S', name: 'Summary', wardType: 'general', isIcu: false, bedServiceId: serviceId }, 'S-1');
  const patient = await createPatient(cookie, 'Gita');
  const created = await admitTo(cookie, patient.id, bed.id);
  expect(created.statusCode, created.body).toBe(201);
  const admission = created.json() as AdmissionDto;
  const saved = await app.inject({
    method: 'PUT',
    url: `${PREFIX}/admissions/${admission.id}/summary`,
    headers: headers(cookie),
    payload: { sections: { diagnosis: 'Viral fever', course: 'Observed overnight', treatment: 'Fluids', condition: 'Stable', advice: 'Rest', followUp: '5 days' } },
  });
  expect(saved.statusCode, saved.body).toBe(200);
  const finalised = await app.inject({
    method: 'POST',
    url: `${PREFIX}/admissions/${admission.id}/summary/finalise`,
    headers: headers(cookie),
  });
  expect(finalised.statusCode, finalised.body).toBe(200);
  expect(finalised.json().status).toBe('final');
  const locked = await app.inject({
    method: 'PUT',
    url: `${PREFIX}/admissions/${admission.id}/summary`,
    headers: headers(cookie),
    payload: { sections: { diagnosis: 'Changed' } },
  });
  expect(locked.statusCode).toBe(409);
}, 60_000);

it('requires an idempotency key when admitting', async () => {
  const cookie = await login(fx.sunrise.ownerEmail);
  const res = await app.inject({
    method: 'POST',
    url: `${PREFIX}/admissions`,
    headers: { cookie, 'x-hos-csrf': '1' },
    payload: { patientId: fx.sunrise.patientId, doctorId: fx.sunrise.doctorId, bedId: randomUUID(), admissionType: 'elective' },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json().error.code).toBe('idempotency_key_required');
});

it('isolates ADT tables', async () => {
  const { adtIsolationIds } = await import('./adt.test-seed');
  const ids = await adtIsolationIds();
  await expectIsolation('wards', ids.wardId);
  await expectIsolation('rooms', ids.roomId);
  await expectIsolation('beds', ids.bedId);
  await expectIsolation('admissions', ids.admissionId);
  await expectIsolation('bed_assignments', ids.assignmentId);
  await expectIsolation('admission_requests', ids.requestId);
  await expectIsolation('discharge_summaries', ids.summaryId);
}, 120_000);
