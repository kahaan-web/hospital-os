import {
  bookAppointmentSchema,
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
import { ApiError, type MobileApi } from './client';
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
  DOC_ARJUN,
  TENANT_ID,
} from '../mock/fixtures';

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
  if (!store.me) throw new ApiError(401, 'unauthenticated', 'Sign in to continue.');
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

function notFound(entity: string): never {
  throw new ApiError(404, 'not_found', `${entity} was not found.`);
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
    const id = tenantUserId();
    const rows = isPatient()
      ? store.appointments.filter((a) => a.patientId === id)
      : store.appointments.filter((a) => a.doctorId === id);
    return clone(rows.sort((a, b) => `${b.date}${b.slotStart}`.localeCompare(`${a.date}${a.slotStart}`)));
  },

  async getAppointment(id) {
    const row = store.appointments.find((a) => a.id === id);
    if (!row) notFound('Appointment');
    return clone(row);
  },

  async listDoctors() {
    requireMe();
    return clone(doctors);
  },

  async listSlots(doctorId, date) {
    requireMe();
    if (!doctors.some((d) => d.id === doctorId)) notFound('Doctor');
    return buildSlots(doctorId, date, store.appointments);
  },

  async bookAppointment(input) {
    const parsed = bookAppointmentSchema.parse(input);
    const me = requireMe();
    if (me.kind !== 'tenant' || !isPatient()) {
      throw new ApiError(403, 'forbidden', 'Only a patient can book from this app.');
    }
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
    requireMe();
    const row = store.appointments.find((a) => a.id === id);
    if (!row) notFound('Appointment');
    if (row.status === 'completed' || row.status === 'cancelled') {
      throw new ApiError(422, 'not_cancellable', 'This appointment cannot be cancelled.');
    }
    row.status = 'cancelled';
    return clone(row);
  },

  async listVisits() {
    const id = tenantUserId();
    const rows = isPatient() ? store.visits.filter((v) => v.patientId === id) : store.visits.filter((v) => v.doctorId === id);
    return clone(rows.sort((a, b) => b.visitedOn.localeCompare(a.visitedOn)));
  },

  async getVisit(id) {
    requireMe();
    const row = store.visits.find((v) => v.id === id);
    if (!row) notFound('Visit');
    return clone(row);
  },

  async listBills() {
    const id = tenantUserId();
    return clone(store.bills.filter((b) => b.patientId === id));
  },

  async getBill(id) {
    requireMe();
    const row = store.bills.find((b) => b.id === id);
    if (!row) notFound('Bill');
    return clone(row);
  },

  async getProfile() {
    requireMe();
    if (!isPatient()) throw new ApiError(403, 'forbidden', 'Profile here is the patient record.');
    return clone(patientPriya);
  },

  async submitFeedback(input) {
    const parsed = submitFeedbackSchema.parse(input);
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
    requireMe();
    if (!isDoctor()) throw new ApiError(403, 'forbidden', 'The diary is for doctors.');
    const id = tenantUserId();
    const rows = store.appointments
      .filter((a) => a.doctorId === id && a.date === date && a.status !== 'cancelled')
      .sort((a, b) => a.slotStart.localeCompare(b.slotStart));
    for (const a of rows) {
      if (a.visitId && store.visits.some((v) => v.id === a.visitId)) continue;
      const visit: Visit = {
        id: `vis_auto_${a.id}`,
        appointmentId: a.id,
        patientId: a.patientId,
        patientName: a.patientName,
        uhid: a.uhid,
        doctorId: a.doctorId,
        doctorName: a.doctorName,
        locationId: a.locationId,
        locationName: a.locationName,
        visitedOn: a.date,
        chiefComplaint: a.reason,
        diagnosis: '',
        notes: '',
        vitals: {
          bpSystolic: null,
          bpDiastolic: null,
          pulse: null,
          tempC: null,
          spo2: null,
          weightKg: null,
        },
        tests: [],
        medicines: [],
      };
      store.visits.push(visit);
      a.visitId = visit.id;
    }
    return clone(rows);
  },

  async placeOrder(input) {
    const parsed = placeOrderSchema.parse(input);
    requireMe();
    if (!isDoctor()) throw new ApiError(403, 'forbidden', 'Only a doctor can place this order.');
    const visit = store.visits.find((v) => v.id === parsed.visitId);
    if (!visit) notFound('Visit');
    const row: Order = {
      id: `ord_${++seq}`,
      visitId: visit.id,
      patientId: visit.patientId,
      patientName: visit.patientName,
      uhid: visit.uhid,
      doctorId: DOC_ARJUN,
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
    requireMe();
    const rows = visitId ? store.orders.filter((o) => o.visitId === visitId) : store.orders;
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
