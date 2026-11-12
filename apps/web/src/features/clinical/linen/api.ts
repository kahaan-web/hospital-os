import { apiGet, apiPost } from '@/lib/api';

// MVP demo slice. Shapes mirror apps/api/src/clinical/linen/routes.ts.
const BASE = '/tenant/m/linen-laundry';

export interface LinenItem {
  id: string;
  name: string;
  cleanQty: number;
  inLaundryQty: number;
}

export interface LaundryBatch {
  id: string;
  number: string;
  linenItemId: string;
  itemName: string;
  vendor: string;
  qtySent: number;
  qtyReceived: number | null;
  qtyMissing: number;
  status: string;
  sentAt: string;
}

function key() {
  return crypto.randomUUID();
}

export const linenApi = {
  stock: () => apiGet<LinenItem[]>(`${BASE}/stock`),
  createItem: (body: { name: string; cleanQty: number }) => apiPost<LinenItem>(`${BASE}/stock`, body, key()),
  batches: () => apiGet<LaundryBatch[]>(`${BASE}/laundry-batches`),
  sendToLaundry: (body: { linenItemId: string; qtySent: number; vendor?: string }) =>
    apiPost<unknown>(`${BASE}/laundry-batches`, body, key()),
  receive: (id: string, qtyReceived: number) =>
    apiPost<unknown>(`${BASE}/laundry-batches/${id}/receive`, { qtyReceived }, key()),
};
