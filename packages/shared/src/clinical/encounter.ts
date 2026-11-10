import type { PatientAlertDto, PatientSummaryDto } from './patient';
import type { PayerType, VisitType } from './codes';

export type EncounterKind = 'opd' | 'ipd' | 'daycare' | 'emergency';
export type EncounterStatus = 'open' | 'closed' | 'cancelled';
export type { PayerType, VisitType };

export interface EncounterDto {
  id: string;
  locationId: string;
  patientId: string;
  kind: EncounterKind;
  number: string;
  status: EncounterStatus;
  doctorId: string | null;
  departmentId: string | null;
  visitType: VisitType | null;
  appointmentId: string | null;
  payerType: PayerType;
  isMlc: boolean;
  currentWardCode: string | null;
  currentBedLabel: string | null;
  referredBy: string | null;
  startedAt: string;
  endedAt: string | null;
  createdBy: string | null;
  patient?: PatientSummaryDto;
}

/** Encounter plus the banner fields and active alerts. */
export interface EncounterDetailDto extends EncounterDto {
  patient: PatientSummaryDto;
  alerts: PatientAlertDto[];
}
