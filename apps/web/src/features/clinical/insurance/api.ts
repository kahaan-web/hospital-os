import { apiGet, apiPost } from '@/lib/api';

const base = '/tenant/m/insurance';

export type PayerType = 'insurer' | 'tpa' | 'corporate' | 'government';
export type RequestStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface PayerRow {
  id: string;
  name: string;
  payerType: PayerType;
  copayPct: number;
  creditDays: number;
  active: boolean;
}

export interface InsuranceRequestRow {
  id: string;
  payerId: string;
  payerName: string;
  kind: 'preauth' | 'claim';
  patientName: string;
  uhid: string;
  policyNo: string;
  diagnosis: string;
  estimatedPaise: number;
  approvedPaise: number | null;
  status: RequestStatus;
  decidedAt: string | null;
  rejectReason: string;
  createdAt: string;
}

export interface NewRequestInput {
  payerId: string;
  kind: 'preauth' | 'claim';
  patientName: string;
  uhid: string;
  policyNo: string;
  diagnosis: string;
  estimatedPaise: number;
}

export const insuranceApi = {
  payers: () => apiGet<PayerRow[]>(`${base}/payers`),
  createPayer: (body: { name: string; payerType: PayerType; copayPct: number; creditDays: number }) => apiPost<PayerRow>(`${base}/payers`, body),
  requests: (status?: RequestStatus) => apiGet<InsuranceRequestRow[]>(`${base}/requests${status ? `?status=${status}` : ''}`),
  request: (id: string) => apiGet<InsuranceRequestRow>(`${base}/requests/${id}`),
  createRequest: (body: NewRequestInput) => apiPost<InsuranceRequestRow>(`${base}/requests`, body),
  approve: (id: string, approvedPaise: number) => apiPost<InsuranceRequestRow>(`${base}/requests/${id}/approve`, { approvedPaise }),
  reject: (id: string, reason: string) => apiPost<InsuranceRequestRow>(`${base}/requests/${id}/reject`, { reason }),
};

export function statusTone(status: RequestStatus): 'neutral' | 'info' | 'warning' | 'success' | 'error' {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'error';
  if (status === 'submitted') return 'info';
  return 'neutral';
}
