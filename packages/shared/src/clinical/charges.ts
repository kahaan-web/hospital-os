import type { GstTreatment } from './gst-health';
import type { PaymentMode } from './codes';

export type ChargeModule = 'opd' | 'adt' | 'lab' | 'pharmacy' | 'billing' | 'cpoe' | 'nursing';

export interface ChargeSource {
  module: ChargeModule;
  type: string;
  id: string;
  line?: string;
}

export interface ChargeInput {
  encounterId: string;
  patientId: string;
  serviceId: string | null;
  description: string;
  qty: number;
  unitPricePaise: number;
  discountPaise?: number;
  gstTreatment: GstTreatment;
  gstRateBp: number;
  hsnSac: string;
  serviceDate: string;
  performingDoctorId?: string | null;
  referringDoctorId?: string | null;
  source: ChargeSource;
}

export interface ChargeDto {
  id: string;
  locationId: string;
  encounterId: string;
  patientId: string;
  serviceId: string | null;
  description: string;
  qty: number;
  unitPricePaise: number;
  amountPaise: number;
  discountPaise: number;
  gstTreatment: GstTreatment;
  gstRateBp: number;
  hsnSac: string;
  serviceDate: string;
  performingDoctorId: string | null;
  referringDoctorId: string | null;
  sourceModule: ChargeModule;
  sourceType: string;
  sourceId: string;
  sourceLine: string;
  status: 'unbilled' | 'billed' | 'reversed';
  billId: string | null;
  reversalOfId: string | null;
  postedBy: string | null;
  createdAt: string;
}

export type CashEntryType = 'receipt' | 'refund' | 'deposit' | 'deposit_refund' | 'deposit_adjust';
export type CashDirection = 'in' | 'out';
export type CashRefType = 'bill' | 'deposit' | 'pharmacy_sale' | 'pharmacy_return';

export interface CashEntryInput {
  counterCode?: string;
  entryType: CashEntryType;
  direction: CashDirection;
  mode: PaymentMode;
  amountPaise: number;
  patientId?: string | null;
  encounterId?: string | null;
  refType: CashRefType;
  refId: string;
  instrumentRef?: string | null;
}

export interface CashEntryDto {
  id: string;
  locationId: string;
  counterCode: string;
  entryType: CashEntryType;
  direction: CashDirection;
  mode: PaymentMode;
  amountPaise: number;
  number: string;
  patientId: string | null;
  encounterId: string | null;
  refType: CashRefType;
  refId: string;
  instrumentRef: string | null;
  receivedBy: string | null;
  receivedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface ServiceDto {
  id: string;
  code: string;
  name: string;
  category: string;
  doctorId: string | null;
  hsnSac: string;
  gstTreatment: GstTreatment;
  gstRateBp: number;
  active: boolean;
  /** Price in paise for the current location and general payer, when a tariff exists. */
  unitPricePaise: number | null;
}

export interface DoctorDto {
  id: string;
  name: string;
  qualification: string;
  speciality: string;
  registrationNo: string;
  departmentId: string | null;
  locationId: string;
  userId: string | null;
  active: boolean;
}
