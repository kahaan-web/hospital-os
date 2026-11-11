import type {
  ClinicalNoteDto,
  ClinicalOrderDto,
  DietOrderView,
  MarDose,
  PlaceClinicalOrderInput,
  VitalSignsDto,
  WardPatient,
} from '@hos/shared';
import { apiGet, apiPost } from '@/lib/api';

const BASE = '/tenant/m/nurse-station';

function key() {
  return crypto.randomUUID();
}

export const nursingApi = {
  ward: (wardCode?: string) => apiGet<WardPatient[]>(`${BASE}/ward${wardCode ? `?wardCode=${encodeURIComponent(wardCode)}` : ''}`),
  orders: (encounterId: string) => apiGet<ClinicalOrderDto[]>(`${BASE}/encounters/${encounterId}/orders`),
  results: (encounterId: string) =>
    apiGet<{ orderItemId: string; summary: unknown }[]>(`${BASE}/encounters/${encounterId}/results`),
  notes: (encounterId: string) => apiGet<ClinicalNoteDto[]>(`${BASE}/encounters/${encounterId}/doctor-notes`),
  vitals: (encounterId: string) => apiGet<VitalSignsDto[]>(`${BASE}/encounters/${encounterId}/vitals-chart`),
  mar: (encounterId: string, date: string) => apiGet<MarDose[]>(`${BASE}/encounters/${encounterId}/mar?date=${date}`),
  administer: (doseId: string, body: { status: 'given' | 'held' | 'refused' | 'missed' | 'self'; doseGiven?: string; reason?: string; witnessUserId?: string }) =>
    apiPost<MarDose>(`${BASE}/mar/${doseId}/administer`, body, key()),
  dietList: (q?: { wardCode?: string; encounterId?: string }) => {
    const params = new URLSearchParams();
    if (q?.wardCode) params.set('wardCode', q.wardCode);
    if (q?.encounterId) params.set('encounterId', q.encounterId);
    const qs = params.toString();
    return apiGet<DietOrderView[]>(`${BASE}/diet${qs ? `?${qs}` : ''}`);
  },
  placeDiet: (encounterId: string, body: PlaceClinicalOrderInput) => apiPost<ClinicalOrderDto>(`${BASE}/encounters/${encounterId}/diet`, body, key()),
  printUrl: (encounterId: string, kind: 'medicine' | 'investigation', format: 'html' | 'pdf') =>
    `/api/v1${BASE}/encounters/${encounterId}/print/${kind}/${format}`,
};
