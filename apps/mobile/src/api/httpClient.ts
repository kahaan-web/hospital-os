import type {
  Appointment,
  Bill,
  BookAppointmentInput,
  DoctorDirectoryItem,
  DoctorSlot,
  Feedback,
  LoginInput,
  Me,
  MobileList,
  Order,
  PatientProfile,
  PlaceOrderInput,
  SubmitFeedbackInput,
  Visit,
} from '@hos/shared';
import { Platform } from 'react-native';
import { copy } from '../copy';
import { API_BASE } from '../env';
import { newIdempotencyKey } from '../idempotency';
import { clearSessionToken, getSessionToken, setSessionToken } from '../session';
import { ApiError, type MobileApi } from './client';

const isWeb = Platform.OS === 'web';

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  authed = true,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD') headers['x-hos-csrf'] = '1';

  // Native live: one header with the stored opaque session. Web live: httpOnly cookie via credentials.
  if (authed && !isWeb) {
    const token = await getSessionToken();
    if (token) headers['x-hos-session'] = token;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, 'network', copy.networkError);
  }

  if (!isWeb) {
    const sessionHeader = res.headers.get('x-hos-session');
    if (sessionHeader) await setSessionToken(sessionHeader);
  }

  if (res.status === 204) return undefined as T;

  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { error: { code: 'invalid_json', message: text.slice(0, 180) } };
    }
  }

  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; fields?: Record<string, string> } })?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'error',
      err?.message ?? `Request failed (${res.status})`,
      err?.fields,
    );
  }
  return json as T;
}

function items<T>(value: T[] | MobileList<T>): T[] {
  return Array.isArray(value) ? value : value.items;
}

export const httpClient: MobileApi = {
  async login(input: LoginInput) {
    const data = await request<Me | { me: Me; sessionToken?: string }>('POST', '/auth/login', input, false);
    if (!isWeb && data && typeof data === 'object' && 'sessionToken' in data && data.sessionToken) {
      await setSessionToken(data.sessionToken);
    }
    if (data && typeof data === 'object' && 'me' in data) return data.me;
    return data as Me;
  },

  async logout() {
    try {
      await request<void>('POST', '/auth/logout');
    } finally {
      await clearSessionToken();
    }
  },

  async me() {
    return request<Me>('GET', '/auth/me');
  },

  async listAppointments() {
    return items(await request<Appointment[] | MobileList<Appointment>>('GET', '/patient/appointments'));
  },
  async getAppointment(id) {
    return request<Appointment>('GET', `/patient/appointments/${id}`);
  },
  async listDoctors() {
    return items(await request<DoctorDirectoryItem[] | MobileList<DoctorDirectoryItem>>('GET', '/patient/doctors'));
  },
  async listSlots(doctorId, date) {
    return items(
      await request<DoctorSlot[] | MobileList<DoctorSlot>>(
        'GET',
        `/patient/doctors/${encodeURIComponent(doctorId)}/slots?date=${encodeURIComponent(date)}`,
      ),
    );
  },
  async bookAppointment(input: BookAppointmentInput) {
    return request<Appointment>('POST', '/patient/appointments', input, true, {
      'Idempotency-Key': newIdempotencyKey(),
    });
  },
  async cancelAppointment(id) {
    return request<Appointment>('POST', `/patient/appointments/${id}/cancel`);
  },

  async listVisits() {
    return items(await request<Visit[] | MobileList<Visit>>('GET', '/patient/visits'));
  },
  async getVisit(id) {
    return request<Visit>('GET', `/patient/visits/${id}`);
  },

  async listDoctorVisits() {
    return items(await request<Visit[] | MobileList<Visit>>('GET', '/doctor/visits'));
  },
  async getDoctorVisit(id) {
    return request<Visit>('GET', `/doctor/visits/${id}`);
  },

  async listBills() {
    return items(await request<Bill[] | MobileList<Bill>>('GET', '/patient/bills'));
  },
  async getBill(id) {
    return request<Bill>('GET', `/patient/bills/${id}`);
  },

  async getProfile() {
    return request<PatientProfile>('GET', '/patient/profile');
  },
  async submitFeedback(input: SubmitFeedbackInput) {
    return request<Feedback>('POST', '/patient/feedback', input);
  },

  async listDiary(date) {
    return items(
      await request<Appointment[] | MobileList<Appointment>>(
        'GET',
        `/doctor/diary?date=${encodeURIComponent(date)}`,
      ),
    );
  },
  async placeOrder(input: PlaceOrderInput) {
    return request<Order>('POST', '/doctor/orders', input, true, {
      'Idempotency-Key': newIdempotencyKey(),
    });
  },
  async listOrders(visitId) {
    const q = visitId ? `?visitId=${encodeURIComponent(visitId)}` : '';
    return items(await request<Order[] | MobileList<Order>>('GET', `/doctor/orders${q}`));
  },
};
