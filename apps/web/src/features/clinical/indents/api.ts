import { apiGet, apiPost } from '@/lib/api';

// MVP demo slice. Shapes mirror apps/api/src/clinical/indents/routes.ts.
const BASE = '/tenant/m/indents-purchase';

export interface IndentLine {
  id: string;
  lineNo: number;
  itemName: string;
  unit: string;
  qty: number;
}

export interface PurchaseOrderRef {
  id: string;
  number: string;
  supplierName: string;
  expectedBy: string | null;
  status: string;
}

export interface Indent {
  id: string;
  number: string;
  department: string;
  priority: string;
  requiredBy: string | null;
  status: string;
  approvedAt: string | null;
  createdAt: string;
  lines: IndentLine[];
  purchaseOrder: PurchaseOrderRef | null;
}

export interface NewIndentInput {
  department: string;
  priority: 'routine' | 'urgent';
  requiredBy?: string;
  lines: { itemName: string; unit: string; qty: number }[];
}

function key() {
  return crypto.randomUUID();
}

export const indentsApi = {
  list: () => apiGet<Indent[]>(`${BASE}/indents`),
  create: (body: NewIndentInput) => apiPost<Indent>(`${BASE}/indents`, body, key()),
  approve: (id: string) => apiPost<Indent>(`${BASE}/indents/${id}/approve`, {}, key()),
  convertToPo: (id: string, body: { supplierName: string; expectedBy?: string }) =>
    apiPost<Indent>(`${BASE}/indents/${id}/convert-to-po`, body, key()),
};
