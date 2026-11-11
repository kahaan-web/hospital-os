import type {
  PharmacyAdjustmentInput,
  PharmacyGrnInput,
  PharmacyInpatientDto,
  PharmacyIpIssueDto,
  PharmacyIpIssueInput,
  PharmacyIpReturnInput,
  PharmacyItemDto,
  PharmacyItemInput,
  PharmacyQueueItemDto,
  PharmacyReportDto,
  PharmacyReportKey,
  PharmacySaleDto,
  PharmacySaleInput,
  PharmacySaleReturnInput,
  PharmacyStockRowDto,
  PharmacySupplierDto,
  PharmacySupplierInput,
  PharmacySupplierReturnInput,
} from '@hos/shared';
import { apiGet, apiPatch, apiPost, apiRequest } from '@/lib/api';

const BASE = '/tenant/m/pharmacy';

function key(): string {
  return crypto.randomUUID();
}

export const pharmacyApi = {
  items(q = ''): Promise<PharmacyItemDto[]> {
    const params = q ? `?q=${encodeURIComponent(q)}` : '';
    return apiGet(`${BASE}/items${params}`);
  },
  createItem(body: PharmacyItemInput): Promise<PharmacyItemDto> {
    return apiPost(`${BASE}/items`, body);
  },
  suppliers(q = ''): Promise<PharmacySupplierDto[]> {
    const params = q ? `?q=${encodeURIComponent(q)}` : '';
    return apiGet(`${BASE}/suppliers${params}`);
  },
  createSupplier(body: PharmacySupplierInput): Promise<PharmacySupplierDto> {
    return apiPost(`${BASE}/suppliers`, body);
  },
  updateSupplier(id: string, body: Partial<PharmacySupplierInput>): Promise<PharmacySupplierDto> {
    return apiPatch(`${BASE}/suppliers/${id}`, body);
  },
  stock(): Promise<PharmacyStockRowDto[]> {
    return apiGet(`${BASE}/stock`);
  },
  queue(): Promise<PharmacyQueueItemDto[]> {
    return apiGet(`${BASE}/prescriptions/open`);
  },
  inpatients(): Promise<PharmacyInpatientDto[]> {
    return apiGet(`${BASE}/inpatients`);
  },
  ipIssues(): Promise<PharmacyIpIssueDto[]> {
    return apiGet(`${BASE}/ip-issues`);
  },
  receive(body: PharmacyGrnInput): Promise<{ id: string; number: string; totalPaise: number }> {
    return apiPost(`${BASE}/grns`, body, key());
  },
  supplierReturn(body: PharmacySupplierReturnInput): Promise<{ id: string; number: string }> {
    return apiPost(`${BASE}/supplier-returns`, body, key());
  },
  sale(body: PharmacySaleInput): Promise<PharmacySaleDto> {
    return apiPost(`${BASE}/sales`, body, key());
  },
  saleById(id: string): Promise<PharmacySaleDto> {
    return apiGet(`${BASE}/sales/${id}`);
  },
  returnSale(id: string, body: PharmacySaleReturnInput): Promise<{ id: string; number: string; grossPaise: number }> {
    return apiPost(`${BASE}/sales/${id}/return`, body, key());
  },
  issue(body: PharmacyIpIssueInput): Promise<PharmacyIpIssueDto> {
    return apiPost(`${BASE}/ip-issues`, body, key());
  },
  returnIssue(id: string, body: PharmacyIpReturnInput): Promise<PharmacyIpIssueDto> {
    return apiPost(`${BASE}/ip-issues/${id}/return`, body, key());
  },
  adjust(body: PharmacyAdjustmentInput): Promise<{ id: string; number: string }> {
    return apiPost(`${BASE}/adjustments`, body, key());
  },
  report(report: PharmacyReportKey, query: { from?: string; to?: string; patientId?: string } = {}): Promise<PharmacyReportDto> {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) {
      if (value) params.set(name, value);
    }
    const suffix = params.size ? `?${params}` : '';
    return apiGet(`${BASE}/reports/${report}${suffix}`);
  },
  async printHtml(id: string): Promise<string> {
    const res = await apiRequest<Response>(`${BASE}/sales/${id}/print?format=html`);
    return res.text();
  },
  printPdfUrl(id: string): string {
    return `/api/v1${BASE}/sales/${id}/print?format=pdf`;
  },
};
