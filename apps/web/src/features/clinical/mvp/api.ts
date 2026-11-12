import { apiGet, apiPost } from '@/lib/api';

export type BbComponent = 'wb' | 'prbc' | 'ffp' | 'pc' | 'cryo';
export type BbAbo = 'A' | 'B' | 'AB' | 'O';
export type BbRh = 'pos' | 'neg';

export const COMPONENT_LABEL: Record<BbComponent, string> = {
  wb: 'Whole blood',
  prbc: 'Packed red cells',
  ffp: 'Fresh frozen plasma',
  pc: 'Platelet concentrate',
  cryo: 'Cryoprecipitate',
};

export interface BbUnit {
  id: string;
  unitNo: string;
  component: BbComponent;
  abo: BbAbo;
  rh: BbRh;
  volumeMl: number;
  collectedOn: string;
  expiresAt: string;
  sourceCentre: string;
  ttiCleared: boolean;
  status: 'available' | 'reserved' | 'issued' | 'discarded';
}

export interface BbRequestRow {
  id: string;
  patientId: string;
  uhid: string;
  patientName: string;
  patientAbo: BbAbo;
  patientRh: BbRh;
  component: BbComponent;
  urgency: 'routine' | 'urgent' | 'emergency';
  indication: string;
  status: 'open' | 'issued' | 'cancelled';
  unitId: string | null;
  issuedAt: string | null;
  createdAt: string;
}

export interface BbRequestDetail {
  request: BbRequestRow & { receivedBy: string };
  patient: { uhid: string; name: string } | null;
  candidates: (BbUnit & { issuable: boolean })[];
}

export interface Campaign {
  id: string;
  name: string;
  channel: 'sms' | 'email' | 'whatsapp';
  segmentNote: string;
  message: string;
  status: 'draft' | 'sent' | 'cancelled';
  audienceCount: number;
  sentCount: number;
  suppressedCount: number;
  sentAt: string | null;
  createdAt: string;
}

export interface MisKpis {
  asOf: string;
  revenue: { todayPaise: number; monthPaise: number; billsThisMonth: number; outstandingPaise: number };
  adt: { totalBeds: number; occupiedBeds: number; occupancyPct: number; currentInpatients: number; admissionsThisMonth: number };
  stores: { stockLines: number; unitsOnHand: number; nearExpiryLines: number };
}

const BB = '/tenant/m/blood-bank';
const MKT = '/tenant/m/marketing';

export const bloodBankApi = {
  inventory: () => apiGet<{ units: BbUnit[]; today: string }>(`${BB}/inventory`),
  receive: (body: Omit<BbUnit, 'id' | 'status'>) => apiPost<BbUnit>(`${BB}/units/receive`, body, crypto.randomUUID()),
  requests: () => apiGet<BbRequestRow[]>(`${BB}/requests`),
  request: (id: string) => apiGet<BbRequestDetail>(`${BB}/requests/${id}`),
  createRequest: (body: { patientId: string; patientAbo: BbAbo; patientRh: BbRh; component: BbComponent; urgency: string; indication: string }) =>
    apiPost<BbRequestRow>(`${BB}/requests`, body, crypto.randomUUID()),
  issue: (id: string, body: { unitId: string; receivedBy: string }) => apiPost<BbRequestRow>(`${BB}/requests/${id}/issue`, body, crypto.randomUUID()),
};

export const marketingApi = {
  list: () => apiGet<Campaign[]>(`${MKT}/campaigns`),
  create: (body: { name: string; channel: string; segmentNote: string; message: string; audienceCount: number }) =>
    apiPost<Campaign>(`${MKT}/campaigns`, body, crypto.randomUUID()),
  markSent: (id: string) => apiPost<Campaign>(`${MKT}/campaigns/${id}/mark-sent`, {}, crypto.randomUUID()),
};

export const misApi = {
  kpis: () => apiGet<MisKpis>('/tenant/m/mis-dashboards/kpis'),
};
