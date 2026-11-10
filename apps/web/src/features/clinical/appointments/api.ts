import type {
  AppointmentDto,
  DiaryDto,
  DoctorDto,
  DoctorScheduleDto,
  OpdQueueItemDto,
  PutScheduleInput,
  RegisteredVisitDto,
  SlotDto,
  VisitRegisterDto,
  VisitStatisticsDto,
} from '@hos/shared';
import { apiGet, apiPost, apiPut } from '@/lib/api';

function q(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const appointmentsApi = {
  doctors: () => apiGet<DoctorDto[]>('/tenant/clinical/doctors'),
  diary: (date: string, doctorId?: string) => apiGet<DiaryDto>(`/tenant/m/appointments/diary${q({ date, doctorId })}`),
  slots: (doctorId: string, date: string) => apiGet<SlotDto[]>(`/tenant/m/appointments/slots${q({ doctorId, date })}`),
  schedule: (doctorId: string) => apiGet<DoctorScheduleDto>(`/tenant/m/appointments/schedules/${doctorId}`),
  saveSchedule: (doctorId: string, body: PutScheduleInput) => apiPut<DoctorScheduleDto>(`/tenant/m/appointments/schedules/${doctorId}`, body),
  appointment: (id: string) => apiGet<AppointmentDto>(`/tenant/m/appointments/appointments/${id}`),
  book: (body: unknown) => apiPost<AppointmentDto>('/tenant/m/appointments/appointments', body),
  cancel: (id: string, reason: string) => apiPost<AppointmentDto>(`/tenant/m/appointments/appointments/${id}/cancel`, { reason }),
  reschedule: (id: string, date: string, slotStart: string) =>
    apiPost<AppointmentDto>(`/tenant/m/appointments/appointments/${id}/reschedule`, { date, slotStart }),
  queue: (date?: string, doctorId?: string) => apiGet<OpdQueueItemDto[]>(`/tenant/m/opd-visit/queue${q({ date, doctorId })}`),
  registerVisit: (body: unknown) => apiPost<RegisteredVisitDto>('/tenant/m/opd-visit/visits', body, crypto.randomUUID()),
  setStatus: (encounterId: string, status: OpdQueueItemDto['status']) =>
    apiPost<OpdQueueItemDto>(`/tenant/m/opd-visit/visits/${encounterId}/status`, { status }),
  register: (from: string, to: string, doctorId?: string) =>
    apiGet<VisitRegisterDto>(`/tenant/m/opd-visit/reports/visit-register${q({ from, to, doctorId })}`),
  byDoctor: (from: string, to: string, doctorId: string) =>
    apiGet<VisitRegisterDto>(`/tenant/m/opd-visit/reports/visit-detail-by-doctor${q({ from, to, doctorId })}`),
  statistics: (from: string, to: string) => apiGet<VisitStatisticsDto>(`/tenant/m/opd-visit/reports/visit-statistics${q({ from, to })}`),
};

export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function plusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatMobile(value: string | null | undefined): string {
  if (!value) return '—';
  const digits = value.replace(/\D/g, '');
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10) return value;
  return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
