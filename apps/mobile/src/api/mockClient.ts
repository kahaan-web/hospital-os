import {
  bookAppointmentSchema,
  fieldErrors,
  placeOrderSchema,
  submitFeedbackSchema,
  type Appointment,
  type Bill,
  type Feedback,
  type LoginInput,
  type Me,
  type Order,
  type Visit,
} from '@hos/shared';
import { z } from 'zod';
import { copy } from '../copy';
import {
  buildSlots,
  clone,
  doctors,
  mockUsers,
  patientPriya,
  seedAppointments,
  seedBills,
  seedFeedback,
  seedOrders,
  seedVisits,
  TENANT_ID,
} from '../mock/fixtures';
import { ApiError, type MobileApi } from './client';

type Store = {
  token: string | null;
  me: Me | null;
  appointments: Appointment[];
  visits: Visit[];
  bills: Bill[];
  orders: Order[];
  feedback: Feedback[];
};

const store: Store = {
  token: null,
  me: null,
  appointments: clone(seedAppointments),
  visits: clone(seedVisits),
  bills: clone(seedBills),
  orders: clone(seedOrders),
  feedback: clone(seedFeedback),
};

function requireMe(): Me {
  if (!store.me) throw new ApiError(401, 'unauthenticated', copy.signInToContinue);
  return store.me;
}

function tenantUserId(): string {
  const me = requireMe();
  if (me.kind !== 'tenant') throw new ApiError(403, 'forbidden', 'This screen is for hospital users.');
  return me.user.id;
}

function isPatient(): boolean {
  const me = requireMe();
  return me.kind === 'tenant' && me.roles.some((r) => r.roleKey === 'patient');
}

function isDoctor(): boolean {
  const me = requireMe();
  return me.kind === 'tenant' && me.roles.some((r) => r.roleKey === 'doctor');
}

function requirePatient(): void {
  if (!isPatient()) throw new ApiError(403, 'forbidden', 'This screen is for patients.');
}

function requireDoctor(): void {
  if (!isDoctor()) throw new ApiError(403, 'forbidden', 'This screen is for doctors.');
}

function notFound(entity: string): never {
  throw new ApiError(404, 'not_found', `${entity} was not found.`);
}

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    const message = Object.values(fields)[0] ?? copy.checkForm;
    throw new ApiError(400, 'validation', message, fields);
  }
  return parsed.data;
}

function ownAppointment(row: Appointment): boolean {
  const me = requireMe();
  if (me.kind !== 'tenant') return false;
  if (isPatient()) return row.patientId === me.user.id;
  if (isDoctor()) return row.doctorId === me.user.id;
  return false;
}

function ownPatientVisit(row: Visit): boolean {
  const me = requireMe();
  return me.kind === 'tenant' && isPatient() && row.patientId === me.user.id;
}

function ownDoctorVisit(row: Visit): boolean {
  const me = requireMe();
  return me.kind === 'tenant' && isDoctor() && row.doctorId === me.user.id;
}

let seq = 500;

export const mockClient: MobileApi = {
  async login(input: LoginInput) {
    const email = input.email.trim().toLowerCase();
    const row = mockUsers.find((u) => u.email === email && u.password === input.password);
    if (!row) throw new ApiError(401, 'invalid_credentials', 'Email or password is wrong.');
    store.token = row.token;
    store.me = clone(row.me);
    return clone(row.me);
  },

  async logout() {
    store.token = null;
    store.me = null;
  },

  async me() {
    return clone(requireMe());
  },

  async listAppointments() {
    requirePatient();
    const id = tenantUserId();
    const rows = store.appointments.filter((a) => a.patientId === id);
    return clone(rows.sort((a, b) => `${b.date}${b.slotStart}`.localeCompare(`${a.date}${a.slotStart}`)));
  },

  async getAppointment(id) {
    const row = store.appointments.find((a) => a.id === id);
    if (!row || !ownAppointment(row)) notFound('Appointment');
    return clone(row);
  },

  async listDoctors() {
    requirePatient();
    return clone(doctors);
  },

  async listSlots(doctorId, date) {
    requirePatient();
    if (!doctors.some((d) => d.id === doctorId)) notFound('Doctor');
    return buildSlots(doctorId, date, store.appointments);
  },

  async bookAppointment(input) {
    const parsed = parseBody(bookAppointmentSchema, input);
    requirePatient();
    const me = requireMe();
    if (me.kind !== 'tenant') throw new ApiError(403, 'forbidden', 'Only a patient can book from this app.');
    const slots = buildSlots(parsed.doctorId, parsed.date, store.appointments);
    const slot = slots.find((s) => s.start === parsed.slotStart);
    if (!slot || !slot.available) {
      throw new ApiError(409, 'slot_taken', 'That slot is no longer free. Pick another.');
    }
    const doc = doctors.find((d) => d.id === parsed.doctorId)!;
    const row: Appointment = {
      id: `apt_${++seq}`,
      tenantId: TENANT_ID,
      locationId: patientPriya.locationId,
      locationName: patientPriya.locationName,
      patientId: me.user.id,
      patientName: me.user.name,
      uhid: patientPriya.uhid,
      doctorId: doc.id,
      doctorName: doc.name,
      speciality: doc.speciality,
      date: parsed.date,
      slotStart: slot.start,
      slotEnd: slot.end,
      status: 'booked',
      reason: parsed.reason,
      visitId: null,
      createdAt: new Date().toISOString(),
    };
    store.appointments.push(row);
    return clone(row);
  },

  async cancelAppointment(id) {
    requirePatient();
    const row = store.appointments.find((a) => a.id === id);
    if (!row || !ownAppointment(row)) notFound('Appointment');
    if (row.status === 'completed' || row.status === 'cancelled') {
      throw new ApiError(422, 'not_cancellable', 'This appointment cannot be cancelled.');
    }
    row.status = 'cancelled';
    return clone(row);
  },

  async listVisits() {
    requirePatient();
    const id = tenantUserId();
    const rows = store.visits.filter((v) => v.patientId === id);
    return clone(rows.sort((a, b) => b.visitedOn.localeCompare(a.visitedOn)));
  },

  async getVisit(id) {
    requirePatient();
    const row = store.visits.find((v) => v.id === id);
    if (!row || !ownPatientVisit(row)) notFound('Visit');
    return clone(row);
  },

  async listDoctorVisits() {
    requireDoctor();
    const id = tenantUserId();
    const rows = store.visits.filter((v) => v.doctorId === id);
    return clone(rows.sort((a, b) => b.visitedOn.localeCompare(a.visitedOn)));
  },

  async getDoctorVisit(id) {
    requireDoctor();
    const row = store.visits.find((v) => v.id === id);
    if (!row || !ownDoctorVisit(row)) notFound('Visit');
    return clone(row);
  },

  async listBills() {
    requirePatient();
    const id = tenantUserId();
    return clone(store.bills.filter((b) => b.patientId === id));
  },

  async getBill(id) {
    requirePatient();
    const row = store.bills.find((b) => b.id === id);
    if (!row || row.patientId !== tenantUserId()) notFound('Bill');
    return clone(row);
  },

  async getProfile() {
    requirePatient();
    return clone(patientPriya);
  },

  async submitFeedback(input) {
    const parsed = parseBody(submitFeedbackSchema, input);
    requirePatient();
    const me = requireMe();
    if (me.kind !== 'tenant') throw new ApiError(403, 'forbidden', 'Sign in as a patient to send feedback.');
    const row: Feedback = {
      id: `fb_${++seq}`,
      patientId: me.user.id,
      visitId: parsed.visitId ?? null,
      rating: parsed.rating,
      comment: parsed.comment,
      categories: parsed.categories ?? [],
      createdAt: new Date().toISOString(),
    };
    store.feedback.push(row);
    return clone(row);
  },

  async listDiary(date) {
    requireDoctor();
    const id = tenantUserId();
    const rows = store.appointments
      .filter((a) => a.doctorId === id && a.date === date && a.status !== 'cancelled')
      .sort((a, b) => a.slotStart.localeCompare(b.slotStart));
    return clone(rows);
  },

  async placeOrder(input) {
    const parsed = parseBody(placeOrderSchema, input);
    requireDoctor();
    const me = requireMe();
    if (me.kind !== 'tenant') throw new ApiError(403, 'forbidden', 'Only a doctor can place this order.');
    const visit = store.visits.find((v) => v.id === parsed.visitId);
    if (!visit || !ownDoctorVisit(visit)) notFound('Visit');
    const row: Order = {
      id: `ord_${++seq}`,
      visitId: visit.id,
      patientId: visit.patientId,
      patientName: visit.patientName,
      uhid: visit.uhid,
      doctorId: me.user.id,
      kind: parsed.kind,
      items: parsed.items,
      status: 'placed',
      createdAt: new Date().toISOString(),
    };
    store.orders.push(row);
    if (parsed.kind === 'test') {
      for (const item of parsed.items) {
        visit.tests.push({ name: item.name, status: 'ordered', resultSummary: null });
      }
    } else {
      for (const item of parsed.items) {
        visit.medicines.push({
          name: item.name,
          dose: item.dose ?? '—',
          frequency: item.frequency ?? '—',
          days: item.days ?? 0,
        });
      }
    }
    return clone(row);
  },

  async listOrders(visitId) {
    requireDoctor();
    const id = tenantUserId();
    const rows = store.orders.filter((o) => o.doctorId === id && (!visitId || o.visitId === visitId));
    return clone(rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },
};

export function hydrateMockSession(token: string): Me | null {
  const row = mockUsers.find((u) => u.token === token);
  if (!row) return null;
  store.token = token;
  store.me = clone(row.me);
  return clone(row.me);
}

export function currentMockToken(): string | null {
  return store.token;
}
