import { apiGet, apiPost } from '@/lib/api';

const BASE = '/tenant/m/equipment-maintenance';

export type Criticality = 'high' | 'medium' | 'low';
export type EquipmentStatus = 'operational' | 'non_operational' | 'under_maintenance' | 'condemned';

export interface EquipmentAssetRow {
  id: string;
  assetTag: string;
  name: string;
  category: string;
  department: string;
  criticality: Criticality;
  status: EquipmentStatus;
  purchaseCostPaise: number;
  installedOn: string | null;
  warrantyUntil: string | null;
  nextPmDue: string | null;
  pmOverdue: boolean;
}

export interface PmScheduleRow {
  id: string;
  equipmentId: string;
  title: string;
  frequencyDays: number;
  nextDue: string;
  lastDoneOn: string | null;
}

export interface ServiceLogRow {
  id: string;
  kind: 'pm' | 'breakdown' | 'restored';
  description: string;
  loggedAt: string;
}

export interface EquipmentDetail {
  asset: EquipmentAssetRow;
  pmSchedules: PmScheduleRow[];
  logs: ServiceLogRow[];
}

export interface NewAssetInput {
  assetTag: string;
  name: string;
  category: string;
  department: string;
  criticality: Criticality;
  purchaseCostPaise: number;
  installedOn?: string;
  warrantyUntil?: string;
}

function key() {
  return crypto.randomUUID();
}

export const equipmentApi = {
  assets: () => apiGet<EquipmentAssetRow[]>(`${BASE}/assets`),
  asset: (id: string) => apiGet<EquipmentDetail>(`${BASE}/assets/${id}`),
  createAsset: (body: NewAssetInput) => apiPost<EquipmentAssetRow>(`${BASE}/assets`, body, key()),
  addPm: (assetId: string, body: { title: string; frequencyDays: number; nextDue: string }) =>
    apiPost<PmScheduleRow>(`${BASE}/assets/${assetId}/pm-schedules`, body, key()),
  completePm: (pmId: string) => apiPost<PmScheduleRow>(`${BASE}/pm-schedules/${pmId}/complete`, {}, key()),
  reportBreakdown: (assetId: string, description: string) =>
    apiPost<EquipmentAssetRow>(`${BASE}/assets/${assetId}/breakdown`, { description }, key()),
  restore: (assetId: string) => apiPost<EquipmentAssetRow>(`${BASE}/assets/${assetId}/restore`, {}, key()),
};

export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
