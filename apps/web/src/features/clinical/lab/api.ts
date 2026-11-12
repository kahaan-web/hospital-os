import type {
  ClinicalCodesDto,
  CollectSampleInput,
  LabAccessionDetailDto,
  LabMisDto,
  LabParamDto,
  LabParamInput,
  LabReportDto,
  LabTestCreateInput,
  LabTestDto,
  LabTestPatchInput,
  LabWorklistItemDto,
  ServiceDto,
} from '@hos/shared';
import { apiBlob, apiGet, apiPatch, apiPost, apiPut, apiRequest, apiText } from '@/lib/api';

const base = '/tenant/m/lab';

export type LabTatRow = { testName: string; samples: number; avgHours: number; targetHours: number; breaches: number };
export type LabCriticalRow = {
  accessionId: string;
  accessionNumber: string;
  patientName: string;
  uhid: string;
  parameter: string;
  value: string;
  flag: string;
  verifiedAt: string | null;
};

export const labApi = {
  worklist(status?: string): Promise<LabWorklistItemDto[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return apiGet<LabWorklistItemDto[]>(`${base}/worklist${query}`);
  },
  tests(): Promise<LabTestDto[]> {
    return apiGet(`${base}/tests`);
  },
  createTest(body: LabTestCreateInput): Promise<LabTestDto> {
    return apiPost(`${base}/tests`, body);
  },
  updateTest(id: string, body: LabTestPatchInput): Promise<LabTestDto> {
    return apiPatch(`${base}/tests/${id}`, body);
  },
  params(testId: string): Promise<LabParamDto[]> {
    return apiGet(`${base}/tests/${testId}/params`);
  },
  createParam(testId: string, body: LabParamInput): Promise<LabParamDto> {
    return apiPost(`${base}/tests/${testId}/params`, body);
  },
  accession(id: string): Promise<LabAccessionDetailDto> {
    return apiGet(`${base}/accessions/${id}`);
  },
  collect(body: CollectSampleInput): Promise<LabAccessionDetailDto> {
    return apiPost(`${base}/accessions`, body, crypto.randomUUID());
  },
  receive(id: string): Promise<LabAccessionDetailDto> {
    return apiPost(`${base}/accessions/${id}/receive`, {});
  },
  reject(id: string, reason: string): Promise<LabAccessionDetailDto> {
    return apiPost(`${base}/accessions/${id}/reject`, { reason });
  },
  saveResults(id: string, values: Array<{ paramId: string; valueNum?: number | null; valueText?: string | null }>, amendReason?: string): Promise<LabAccessionDetailDto> {
    return apiPut(`${base}/accessions/${id}/results`, { values, amendReason });
  },
  verify(id: string): Promise<LabAccessionDetailDto> {
    return apiPost(`${base}/accessions/${id}/verify`, {});
  },
  report(id: string): Promise<LabReportDto> {
    return apiGet(`${base}/accessions/${id}/report`);
  },
  reportHtml(id: string): Promise<string> {
    return apiText(`${base}/accessions/${id}/report?format=html`);
  },
  reportPdf(id: string): Promise<Blob> {
    return apiBlob(`${base}/accessions/${id}/report?format=pdf`);
  },
  history(patientId: string): Promise<Array<{ id: string; orderItemId: string; name: string; status: string; reportedAt: string | null }>> {
    return apiGet(`${base}/patients/${patientId}/history`);
  },
  mis(from: string, to: string): Promise<LabMisDto> {
    return apiGet(`${base}/reports/mis?from=${from}&to=${to}`);
  },
  tat(from: string, to: string): Promise<LabTatRow[]> {
    return apiGet(`${base}/reports/tat?from=${from}&to=${to}`);
  },
  critical(from: string, to: string): Promise<LabCriticalRow[]> {
    return apiGet(`${base}/reports/critical?from=${from}&to=${to}`);
  },
  labServices(): Promise<ServiceDto[]> {
    return apiGet('/tenant/clinical/services?category=lab');
  },
  codes(): Promise<ClinicalCodesDto> {
    return apiRequest('/tenant/clinical/codes');
  },
};
