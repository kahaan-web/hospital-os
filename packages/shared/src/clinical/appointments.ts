import { z } from 'zod';
import { PAYER_TYPES, type PayerType, type VisitType } from './codes';
import type { AppointmentDto } from './contract-dtos';
import type { EncounterDto } from './encounter';
import type { GstTreatment } from './gst-health';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm (24-hour)');

export const OPD_QUEUE_STATUSES = ['waiting', 'in_consultation', 'done', 'skipped'] as const;
export type OpdQueueStatus = (typeof OPD_QUEUE_STATUSES)[number];

export const SCHEDULE_EXCEPTION_KINDS = ['closed', 'override', 'extra'] as const;
export type ScheduleExceptionKind = (typeof SCHEDULE_EXCEPTION_KINDS)[number];

export const COUNTER_KINDS = ['new', 'repeat'] as const;
export type CounterKind = (typeof COUNTER_KINDS)[number];

export function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

export function addMinutes(value: string, minutes: number): string {
  const [h, m] = value.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + minutes;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export const scheduleWindowSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    start: hhmm,
    end: hhmm,
    slotMinutes: z.number().int().min(5).max(180),
    maxPerSlot: z.number().int().min(1).max(50),
  })
  .superRefine((value, ctx) => {
    if (value.end <= value.start) ctx.addIssue({ code: 'custom', path: ['end'], message: 'End time must be after the start time' });
  });
export type ScheduleWindowInput = z.infer<typeof scheduleWindowSchema>;

export const scheduleExceptionInputSchema = z
  .object({
    date: isoDate,
    kind: z.enum(SCHEDULE_EXCEPTION_KINDS),
    start: hhmm.optional(),
    end: hhmm.optional(),
    slotMinutes: z.number().int().min(5).max(180).optional(),
    maxPerSlot: z.number().int().min(1).max(50).optional(),
    reason: z.string().trim().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    const hasStart = Boolean(value.start);
    const hasEnd = Boolean(value.end);
    if (hasStart !== hasEnd) ctx.addIssue({ code: 'custom', path: ['end'], message: 'Enter both a start and an end, or leave both blank' });
    if (value.start && value.end && value.end <= value.start) ctx.addIssue({ code: 'custom', path: ['end'], message: 'End time must be after the start time' });
    if (value.kind === 'closed') return;
    if (!value.start || !value.end) ctx.addIssue({ code: 'custom', path: ['start'], message: 'This exception needs a start and an end time' });
  });
export type ScheduleExceptionInput = z.infer<typeof scheduleExceptionInputSchema>;

export const putScheduleSchema = z.object({
  windows: z.array(scheduleWindowSchema).max(21),
  exceptions: z.array(scheduleExceptionInputSchema).max(90).optional(),
});
export type PutScheduleInput = z.infer<typeof putScheduleSchema>;

export interface ScheduleExceptionDto {
  id: string;
  date: string;
  kind: ScheduleExceptionKind;
  start: string | null;
  end: string | null;
  slotMinutes: number | null;
  maxPerSlot: number | null;
  reason: string;
}

export interface DoctorScheduleDto {
  doctorId: string;
  locationId: string;
  windows: ScheduleWindowInput[];
  exceptions: ScheduleExceptionDto[];
}

export const bookCounterAppointmentSchema = z
  .object({
    doctorId: z.uuid(),
    date: isoDate,
    slotStart: hhmm,
    reason: z.string().trim().min(1, 'Say why this visit is needed').max(240),
    patientId: z.uuid().optional(),
    walkinName: z.string().trim().max(120).optional(),
    walkinMobile: z.string().trim().max(20).optional(),
    counterKind: z.enum(COUNTER_KINDS).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.patientId) return;
    if (!value.walkinName || value.walkinName.trim().length < 2) {
      ctx.addIssue({ code: 'custom', path: ['walkinName'], message: "Enter the caller's name" });
    }
    if (!value.walkinMobile || value.walkinMobile.trim().length < 10) {
      ctx.addIssue({ code: 'custom', path: ['walkinMobile'], message: 'Enter a 10-digit mobile number' });
    }
  });
export type BookCounterAppointmentInput = z.infer<typeof bookCounterAppointmentSchema>;

export const rescheduleAppointmentSchema = z.object({
  date: isoDate,
  slotStart: hhmm,
});
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;

export const cancelAppointmentSchema = z.object({
  reason: z.string().trim().min(2, 'Say why this appointment is cancelled').max(300),
});
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;

export interface DiaryColumnDto {
  doctorId: string;
  doctorName: string;
  speciality: string;
  appointments: AppointmentDto[];
}

export interface DiaryDto {
  date: string;
  locationId: string;
  doctorId: string | null;
  columns: DiaryColumnDto[];
}

export const registerVisitSchema = z.object({
  patientId: z.uuid(),
  doctorId: z.uuid(),
  appointmentId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
  visitType: z.enum(['new', 'follow_up']).optional(),
  payerType: z.enum(PAYER_TYPES).optional(),
});
export type RegisterVisitInput = z.infer<typeof registerVisitSchema>;

export interface ConsultationChargeDto {
  description: string;
  amountPaise: number;
  gstTreatment: GstTreatment;
  gstRateBp: number;
  hsnSac: string;
}

/** Encounter plus the token issued at check-in. Consultation GST is configuration (confirm with your CA). */
export interface RegisteredVisitDto extends EncounterDto {
  token: number;
  queueStatus: OpdQueueStatus;
  consultation: ConsultationChargeDto;
}

export const setVisitStatusSchema = z.object({
  status: z.enum(OPD_QUEUE_STATUSES),
});
export type SetVisitStatusInput = z.infer<typeof setVisitStatusSchema>;

export interface OpdQueueItemDto {
  encounterId: string;
  encounterNumber: string;
  appointmentId: string | null;
  patientId: string;
  patientName: string;
  uhid: string;
  doctorId: string;
  doctorName: string;
  token: number;
  status: OpdQueueStatus;
  visitType: VisitType | null;
  channel: string | null;
  arrivedAt: string;
}

export const visitReportQuery = z
  .object({
    from: isoDate,
    to: isoDate,
    doctorId: z.uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.to < value.from) ctx.addIssue({ code: 'custom', path: ['to'], message: 'The end date is before the start date' });
  });
export type VisitReportQuery = z.infer<typeof visitReportQuery>;

export interface VisitRegisterRowDto {
  encounterId: string;
  number: string;
  startedAt: string;
  patientName: string;
  uhid: string;
  doctorId: string | null;
  doctorName: string;
  visitType: VisitType | null;
  token: number | null;
  payerType: PayerType;
  status: string;
}

export interface VisitRegisterDto {
  from: string;
  to: string;
  locationId: string;
  locationName: string;
  rows: VisitRegisterRowDto[];
  truncated: boolean;
}

export interface VisitDoctorStatDto {
  doctorId: string | null;
  doctorName: string;
  total: number;
  newCount: number;
  followUpCount: number;
}

export interface VisitStatisticsDto {
  from: string;
  to: string;
  locationId: string;
  locationName: string;
  total: number;
  newCount: number;
  followUpCount: number;
  byDoctor: VisitDoctorStatDto[];
  truncated: boolean;
}
