import type {
  CreateDepositInput,
  CreateIpBillInput,
  EncounterPayerInput,
  IpRunningBalanceDto,
  ManualChargeInput,
  OpBillDto,
  PayerCreateInput,
  PayerDto,
  SettleInput,
  StatementOfAccountDto,
} from '@hos/shared';
import { apiGet, apiPost, apiPut } from '@/lib/api';

const BASE = '/tenant/m/ip-billing';

function key(): string {
  return crypto.randomUUID();
}

export const ipBillingApi = {
  running(): Promise<IpRunningBalanceDto[]> {
    return apiGet(`${BASE}/running`);
  },
  statement(encounterId: string): Promise<StatementOfAccountDto> {
    return apiGet(`${BASE}/encounters/${encounterId}/statement`);
  },
  postCharge(encounterId: string, body: ManualChargeInput) {
    return apiPost(`${BASE}/encounters/${encounterId}/charges`, body, key());
  },
  createBill(encounterId: string, body: CreateIpBillInput): Promise<OpBillDto> {
    return apiPost(`${BASE}/encounters/${encounterId}/bills`, body, key());
  },
  finalise(billId: string): Promise<OpBillDto> {
    return apiPost(`${BASE}/bills/${billId}/finalise`, {}, key());
  },
  settle(billId: string, body: SettleInput): Promise<OpBillDto> {
    return apiPost(`${BASE}/bills/${billId}/settle`, body, key());
  },
  acceptDeposit(body: CreateDepositInput) {
    return apiPost(`${BASE}/deposits`, body, key());
  },
  payers(): Promise<PayerDto[]> {
    return apiGet(`${BASE}/payers`);
  },
  createPayer(body: PayerCreateInput): Promise<PayerDto> {
    return apiPost(`${BASE}/payers`, body, key());
  },
  setEncounterPayer(encounterId: string, body: EncounterPayerInput) {
    return apiPut(`${BASE}/encounters/${encounterId}/payer`, body);
  },
};
