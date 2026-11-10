import type {
  MlcCaseDto,
  PageDto,
  PatientCreateInput,
  PatientDocumentDto,
  PatientDto,
  PatientSummaryDto,
  PatientUpdateInput,
  RegisterReportQuery,
  RegisterReportRow,
} from '@hos/shared';
import { ApiError, apiGet, apiPatch, apiPost, apiRequest } from '@/lib/api';

const BASE = '/tenant/m/patient-registration';

export const registrationApi = {
  search(q: string, page = 1): Promise<PageDto<PatientSummaryDto>> {
    const params = new URLSearchParams({ q, page: String(page) });
    return apiRequest<PageDto<PatientSummaryDto>>(`/tenant/clinical/patients?${params}`);
  },
  patient(id: string): Promise<PatientDto> {
    return apiRequest<PatientDto>(`/tenant/clinical/patients/${id}`);
  },
  create(body: PatientCreateInput): Promise<PatientDto> {
    return apiPost<PatientDto>(`${BASE}/patients`, body);
  },
  update(id: string, body: PatientUpdateInput): Promise<PatientDto> {
    return apiPatch<PatientDto>(`${BASE}/patients/${id}`, body);
  },
  documents(id: string): Promise<PatientDocumentDto[]> {
    return apiGet<PatientDocumentDto[]>(`${BASE}/patients/${id}/documents`);
  },
  printUrl(id: string, kind: string, format: 'pdf' | 'html'): string {
    return `/api/v1${BASE}/patients/${id}/print/${kind}/${format}`;
  },
  report(query: RegisterReportQuery): Promise<{ items: RegisterReportRow[] }> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== '') params.set(key, String(value));
    }
    return apiGet(`${BASE}/reports/register?${params}`);
  },
  reportCsvUrl(query: RegisterReportQuery): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== '') params.set(key, String(value));
    }
    return `/api/v1${BASE}/reports/register.csv?${params}`;
  },
  listMlc(): Promise<MlcCaseDto[]> {
    return apiGet<MlcCaseDto[]>(`${BASE}/mlc`);
  },
  createMlc(body: { patientId: string; encounterId: string; injurySummary: string; policeStation?: string; broughtBy?: string }): Promise<MlcCaseDto> {
    return apiPost(`${BASE}/mlc`, body);
  },
  async createWithDuplicateCheck(body: PatientCreateInput): Promise<PatientDto> {
    try {
      return await registrationApi.create(body);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'possible_duplicate' && !body.confirmNew) {
        throw e;
      }
      throw e;
    }
  },
};
