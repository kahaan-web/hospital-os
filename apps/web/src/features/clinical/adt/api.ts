import type {
  AdmissionDto,
  AdmissionRegisterRow,
  AdmissionRequestDto,
  AdmitInput,
  BedBoardDto,
  BedChargePostResult,
  BedDto,
  DischargeRegisterRow,
  DischargeSummaryDto,
  DischargeSummaryReportRow,
  DischargeSummarySections,
  DischargeType,
  DoctorDto,
  RoomDto,
  ServiceDto,
  TransferRegisterRow,
  WardDto,
  WardType,
} from '@hos/shared';
import { apiGet, apiPatch, apiPost, apiPut, apiRequest } from '@/lib/api';

const BASE = '/tenant/m/adt';

function key() {
  return crypto.randomUUID();
}

export const adtApi = {
  board: () => apiGet<BedBoardDto>(`${BASE}/bed-board`),
  wards: () => apiGet<WardDto[]>(`${BASE}/wards`),
  rooms: () => apiGet<RoomDto[]>(`${BASE}/rooms`),
  beds: () => apiGet<BedDto[]>(`${BASE}/beds`),
  doctors: () => apiGet<DoctorDto[]>('/tenant/clinical/doctors'),
  bedServices: () => apiGet<ServiceDto[]>('/tenant/clinical/services?category=bed'),
  admission: (id: string) => apiGet<AdmissionDto>(`${BASE}/admissions/${id}`),
  requests: () => apiGet<AdmissionRequestDto[]>(`${BASE}/admission-requests?status=requested`),
  admit: (body: AdmitInput) => apiPost<AdmissionDto>(`${BASE}/admissions`, body, key()),
  transfer: (id: string, bedId: string) => apiPost<AdmissionDto>(`${BASE}/admissions/${id}/transfer`, { bedId }, key()),
  discharge: (id: string, dischargeType: DischargeType, overrideReason?: string) =>
    apiPost<AdmissionDto>(`${BASE}/admissions/${id}/discharge`, { dischargeType, overrideReason }, key()),
  summary: (id: string) => apiGet<DischargeSummaryDto>(`${BASE}/admissions/${id}/summary`),
  saveSummary: (id: string, sections: DischargeSummarySections) =>
    apiPut<DischargeSummaryDto>(`${BASE}/admissions/${id}/summary`, { sections }),
  finaliseSummary: (id: string) => apiPost<DischargeSummaryDto>(`${BASE}/admissions/${id}/summary/finalise`, {}, key()),
  postCharges: (date?: string) => apiPost<BedChargePostResult>(`${BASE}/bed-charges/post${date ? `?date=${date}` : ''}`, {}, key()),
  createWard: (body: { code: string; name: string; wardType: WardType; isIcu: boolean; bedServiceId: string | null }) =>
    apiPost<WardDto>(`${BASE}/wards`, body, key()),
  createRoom: (body: { wardId: string; code: string; name: string }) => apiPost<RoomDto>(`${BASE}/rooms`, body, key()),
  createBed: (body: { roomId: string; label: string; wardClass: WardType }) => apiPost<BedDto>(`${BASE}/beds`, body, key()),
  patchBed: (id: string, status: BedDto['status']) => apiPatch<BedDto>(`${BASE}/beds/${id}`, { status }),
  report: (kind: 'admissions' | 'transfers' | 'discharges' | 'discharge-summaries', from: string, to: string) => {
    const params = new URLSearchParams({ from, to });
    return apiGet<{ items: AdmissionRegisterRow[] | TransferRegisterRow[] | DischargeRegisterRow[] | DischargeSummaryReportRow[] }>(
      `${BASE}/reports/${kind}?${params}`,
    );
  },
  async preview(id: string, kind: 'sticker' | 'summary') {
    const res = await apiRequest<Response>(`${BASE}/admissions/${id}/print/${kind}/html`);
    return res.text();
  },
};
