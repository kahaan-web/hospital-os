import type { WardType } from './codes';

/** Owning tasks may add optional fields. They may not rename or remove these. */

export interface BillDto {
  id: string;
  number: string | null;
  kind: 'op' | 'ip';
  status: string;
  totalPaise: number;
  paidPaise: number;
  patientId: string;
  encounterId: string | null;
}

export interface AdmissionRequestDto {
  id: string;
  patientId: string;
  fromEncounterId: string;
  doctorId: string;
  reason: string;
  plannedOn: string;
  wardType: WardType | null;
  status: string;
}

export interface AppointmentDto {
  id: string;
  doctorId: string;
  patientId: string | null;
  date: string;
  slotStart: string;
  slotEnd: string | null;
  status: string;
  channel: string;
  locationId?: string;
  encounterId?: string | null;
  reason?: string;
  walkinName?: string | null;
  walkinMobile?: string | null;
  seq?: number;
  counterKind?: 'new' | 'repeat' | null;
  patientName?: string | null;
  uhid?: string | null;
  doctorName?: string | null;
  cancelReason?: string | null;
  token?: number | null;
}

export interface SlotDto {
  doctorId: string;
  date: string;
  start: string;
  end: string;
  available: boolean;
  /** Seats still open in this slot. */
  remaining?: number;
  /** Why the slot cannot be booked, when available is false. */
  note?: string | null;
}

export interface LabResultSummaryDto {
  orderItemId: string;
  status: string;
  flag: string | null;
  reportedAt: string | null;
}

export interface LabReportListItem {
  id: string;
  orderItemId: string;
  name: string;
  status: string;
  reportedAt: string | null;
}
