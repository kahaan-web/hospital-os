import { apiGet, apiPost } from '@/lib/api';

const base = '/tenant/m/doctor-accounting';

export type ShareType = 'pct_net' | 'pct_gross' | 'fixed_per_unit';
export type EncounterType = 'op' | 'ip' | 'any';
export type PayMode = 'bank_transfer' | 'upi' | 'cheque' | 'cash';

export interface DoctorOption {
  id: string;
  name: string;
}

export interface ShareRuleRow {
  id: string;
  doctorId: string;
  doctorName: string;
  serviceCategory: string;
  encounterType: EncounterType;
  shareType: ShareType;
  shareValue: number;
  effectiveFrom: string;
  active: boolean;
}

export interface PayoutRow {
  id: string;
  doctorId: string;
  doctorName: string;
  periodFrom: string;
  periodTo: string;
  grossPaise: number;
  sharePaise: number;
  status: 'pending' | 'paid';
  paidOn: string | null;
  payMode: string;
  payRef: string;
}

export const doctorAccountingApi = {
  doctors: () => apiGet<DoctorOption[]>(`${base}/doctors`),
  rules: () => apiGet<ShareRuleRow[]>(`${base}/rules`),
  createRule: (body: { doctorId: string; serviceCategory: string; encounterType: EncounterType; shareType: ShareType; shareValue: number }) =>
    apiPost<ShareRuleRow>(`${base}/rules`, body),
  payouts: (doctorId?: string) => apiGet<PayoutRow[]>(`${base}/payouts${doctorId ? `?doctorId=${doctorId}` : ''}`),
  createPayout: (body: { doctorId: string; periodFrom: string; periodTo: string; grossPaise: number; sharePaise: number }) =>
    apiPost<PayoutRow>(`${base}/payouts`, body),
  markPaid: (id: string, body: { mode: PayMode; reference: string }) => apiPost<PayoutRow>(`${base}/payouts/${id}/pay`, body),
};

export const SHARE_TYPE_LABEL: Record<ShareType, string> = {
  pct_net: '% of net',
  pct_gross: '% of gross',
  fixed_per_unit: 'Fixed per unit',
};
