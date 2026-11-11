import type {
  CashSummaryDto,
  CreateDepositInput,
  DepositDto,
  TariffCreateInput,
  TariffDto,
  DepositRegisterDto,
  DoctorSharingDto,
  OpBillDto,
  OutstandingReportDto,
  RefundDto,
  RevenueReportDto,
  ServiceCreateInput,
  ServiceMasterDto,
  UnbilledEncounterDto,
  VisitStatisticsDto,
} from '@hos/shared';
import { apiGet, apiPost } from '@/lib/api';

const BASE = '/tenant/m/op-billing';

function key(): string {
  return crypto.randomUUID();
}

export const billingApi = {
  worklist(): Promise<UnbilledEncounterDto[]> {
    return apiGet(`${BASE}/worklist`);
  },
  bills(page = 1): Promise<{ items: OpBillDto[]; total: number; page: number; pageSize: number }> {
    return apiGet(`${BASE}/bills?page=${page}`);
  },
  bill(id: string): Promise<OpBillDto> {
    return apiGet(`${BASE}/bills/${id}`);
  },
  createBill(body: { encounterId: string; payClass: 'cash' | 'credit' | 'free' }): Promise<OpBillDto> {
    return apiPost(`${BASE}/bills`, body, key());
  },
  finalise(id: string): Promise<OpBillDto> {
    return apiPost(`${BASE}/bills/${id}/finalise`, {}, key());
  },
  settle(id: string, body: { mode: string; amountPaise: number; depositId?: string; instrumentRef?: string }): Promise<OpBillDto> {
    return apiPost(`${BASE}/bills/${id}/settle`, body, key());
  },
  concede(id: string, body: { amountPaise: number; reason: string }): Promise<OpBillDto> {
    return apiPost(`${BASE}/bills/${id}/concessions`, body, key());
  },
  refund(id: string, body: { amountPaise: number; reason: string; mode: string }): Promise<OpBillDto> {
    return apiPost(`${BASE}/bills/${id}/refund`, body, key());
  },
  printUrl(id: string): string {
    return `/api/v1${BASE}/bills/${id}/print?format=pdf`;
  },
  deposits(patientId?: string): Promise<DepositDto[]> {
    const query = patientId ? `?patientId=${patientId}` : '';
    return apiGet(`${BASE}/deposits${query}`);
  },
  createDeposit(body: CreateDepositInput): Promise<DepositDto> {
    return apiPost(`${BASE}/deposits`, body, key());
  },
  refundDeposit(id: string, body: { amountPaise: number; reason: string; mode: string }): Promise<DepositDto> {
    return apiPost(`${BASE}/deposits/${id}/refund`, body, key());
  },
  refunds(): Promise<RefundDto[]> {
    return apiGet(`${BASE}/refunds`);
  },
  services(): Promise<ServiceMasterDto[]> {
    return apiGet(`${BASE}/services`);
  },
  createService(body: ServiceCreateInput): Promise<ServiceMasterDto> {
    return apiPost(`${BASE}/services`, body, key());
  },
  createTariff(body: TariffCreateInput): Promise<TariffDto> {
    return apiPost(`${BASE}/tariffs`, body);
  },
  cash(from: string, to: string): Promise<CashSummaryDto> {
    return apiGet(`${BASE}/reports/cash?from=${from}&to=${to}`);
  },
  revenue(from: string, to: string): Promise<RevenueReportDto> {
    return apiGet(`${BASE}/reports/revenue?from=${from}&to=${to}`);
  },
  doctorSharing(from: string, to: string): Promise<DoctorSharingDto> {
    return apiGet(`${BASE}/reports/doctor-sharing?from=${from}&to=${to}`);
  },
  outstanding(): Promise<OutstandingReportDto> {
    return apiGet(`${BASE}/reports/outstanding`);
  },
  depositRegister(): Promise<DepositRegisterDto> {
    return apiGet(`${BASE}/reports/deposits`);
  },
  visitStatistics(from: string, to: string): Promise<VisitStatisticsDto> {
    return apiGet(`${BASE}/reports/visit-statistics?from=${from}&to=${to}`);
  },
};
