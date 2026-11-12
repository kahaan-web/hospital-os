import { apiGet, apiPost } from '@/lib/api';

const base = '/tenant/m/ot-scheduling';

export type OtStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface OtCaseDto {
  id: string;
  number: string;
  patientId: string;
  patientName: string;
  uhid: string;
  procedureName: string;
  surgeonName: string;
  anaesthetistName: string;
  roomCode: string;
  priority: 'elective' | 'emergency';
  anaesthesiaType: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: OtStatus;
  inRoomAt: string | null;
  outRoomAt: string | null;
  notes: string;
}

export interface OtCaseInput {
  patientId: string;
  procedureName: string;
  surgeonName: string;
  anaesthetistName: string;
  roomCode: string;
  priority: 'elective' | 'emergency';
  anaesthesiaType: string;
  scheduledStart: string;
  durationMin: number;
  notes: string;
}

export const otApi = {
  list(status?: OtStatus): Promise<OtCaseDto[]> {
    return apiGet(`${base}/cases${status ? `?status=${status}` : ''}`);
  },
  create(body: OtCaseInput): Promise<OtCaseDto> {
    return apiPost(`${base}/cases`, body);
  },
  start(id: string): Promise<OtCaseDto> {
    return apiPost(`${base}/cases/${id}/start`, {});
  },
  complete(id: string, notes?: string): Promise<OtCaseDto> {
    return apiPost(`${base}/cases/${id}/complete`, { notes });
  },
  cancel(id: string, reason: string): Promise<OtCaseDto> {
    return apiPost(`${base}/cases/${id}/cancel`, { reason });
  },
};
