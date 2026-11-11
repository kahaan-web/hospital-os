import type {
  CasePaperDto,
  CasePaperInput,
  ClinicalOrderDto,
  InpatientRowDto,
  MyQueueItemDto,
  OrderSetDto,
  OrderSetInput,
  PrescriptionInput,
  ServiceDto,
  ServiceOrderInput,
  VitalsGraphDto,
} from '@hos/shared';
import { apiGet, apiPost, apiPut, apiRequest } from '@/lib/api';

const OPD = '/tenant/m/opd-visit/doctor';
const CPOE = '/tenant/m/cpoe';

export const doctorApi = {
  myQueue(date: string): Promise<MyQueueItemDto[]> {
    return apiGet(`${OPD}/my-queue?date=${encodeURIComponent(date)}`);
  },
  casePaper(encounterId: string): Promise<CasePaperDto> {
    return apiGet(`${OPD}/encounters/${encounterId}/case-paper`);
  },
  saveCasePaper(encounterId: string, body: CasePaperInput): Promise<CasePaperDto> {
    return apiPut(`${OPD}/encounters/${encounterId}/case-paper`, body);
  },
  prescribe(encounterId: string, body: PrescriptionInput): Promise<ClinicalOrderDto> {
    return apiPost(`${OPD}/encounters/${encounterId}/prescription`, body);
  },
  printUrl(encounterId: string, kind: 'case-paper' | 'prescription' | 'investigation', format: 'pdf' | 'html'): string {
    return `/api/v1${OPD}/encounters/${encounterId}/print/${kind}/${format}`;
  },
  inpatients(): Promise<InpatientRowDto[]> {
    return apiGet(`${CPOE}/inpatients`);
  },
  orderSets(): Promise<OrderSetDto[]> {
    return apiGet(`${CPOE}/order-sets`);
  },
  createOrderSet(body: OrderSetInput): Promise<OrderSetDto> {
    return apiPost(`${CPOE}/order-sets`, body);
  },
  diagnosticOrder(encounterId: string, body: ServiceOrderInput): Promise<ClinicalOrderDto> {
    return apiPost(`${CPOE}/encounters/${encounterId}/orders/diagnostic`, body);
  },
  vitalsGraph(encounterId: string): Promise<VitalsGraphDto> {
    return apiGet(`${CPOE}/encounters/${encounterId}/vitals-graph`);
  },
  services(category?: string): Promise<ServiceDto[]> {
    const q = category ? `?category=${encodeURIComponent(category)}` : '';
    return apiRequest<ServiceDto[]>(`/tenant/clinical/services${q}`);
  },
};
