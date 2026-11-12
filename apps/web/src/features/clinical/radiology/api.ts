import { apiGet, apiPost, apiPut } from '@/lib/api';

const base = '/tenant/m/radiology';

export type RadStatus = 'ordered' | 'in_progress' | 'done' | 'reported' | 'cancelled';
export type RadModality = 'xray' | 'usg' | 'ct' | 'mri' | 'mammo' | 'other';

export interface RadReportDto {
  id: string;
  version: number;
  findings: string;
  impression: string;
  status: 'draft' | 'final';
  signedAt: string | null;
}

export interface RadOrderDto {
  id: string;
  number: string;
  patientId: string;
  patientName: string;
  uhid: string;
  modality: RadModality;
  studyName: string;
  priority: 'routine' | 'urgent' | 'stat';
  clinicalNotes: string;
  orderingDoctorName: string;
  status: RadStatus;
  performedAt: string | null;
  createdAt: string;
}

export interface RadOrderDetailDto extends RadOrderDto {
  report: RadReportDto | null;
}

export interface RadOrderInput {
  patientId: string;
  modality: RadModality;
  studyName: string;
  priority: 'routine' | 'urgent' | 'stat';
  orderingDoctorName: string;
  clinicalNotes: string;
}

export const MODALITIES: ReadonlyArray<{ id: RadModality; label: string }> = [
  { id: 'xray', label: 'X-ray' },
  { id: 'usg', label: 'Ultrasound' },
  { id: 'ct', label: 'CT' },
  { id: 'mri', label: 'MRI' },
  { id: 'mammo', label: 'Mammography' },
  { id: 'other', label: 'Other' },
];

export const radApi = {
  list(params: { status?: RadStatus; modality?: RadModality } = {}): Promise<RadOrderDto[]> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.modality) query.set('modality', params.modality);
    const qs = query.toString();
    return apiGet(`${base}/orders${qs ? `?${qs}` : ''}`);
  },
  get(id: string): Promise<RadOrderDetailDto> {
    return apiGet(`${base}/orders/${id}`);
  },
  create(body: RadOrderInput): Promise<RadOrderDto> {
    return apiPost(`${base}/orders`, body);
  },
  start(id: string): Promise<RadOrderDto> {
    return apiPost(`${base}/orders/${id}/start`, {});
  },
  done(id: string): Promise<RadOrderDto> {
    return apiPost(`${base}/orders/${id}/done`, {});
  },
  saveReport(id: string, body: { findings: string; impression: string }): Promise<RadReportDto> {
    return apiPut(`${base}/orders/${id}/report`, body);
  },
  sign(id: string): Promise<RadOrderDetailDto> {
    return apiPost(`${base}/orders/${id}/report/sign`, {});
  },
};
