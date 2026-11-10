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
}

export interface SlotDto {
  doctorId: string;
  date: string;
  start: string;
  end: string;
  available: boolean;
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
