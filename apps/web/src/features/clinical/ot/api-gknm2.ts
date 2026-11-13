import { apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';

const base = '/tenant/m/ot-scheduling';

function q(params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else {
      search.set(key, value);
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export type SurgeryType = 'major' | 'minor';
export type ListStatusCriteria = 'surgery' | 'booking';
export type ListStatusFilter = 'active' | 'cancelled' | 'all';
export type ReportKind =
  | 'register'
  | 'doctor'
  | 'department'
  | 'anaesthetist'
  | 'cancellation'
  | 'duplicates'
  | 'frozen';

export const ANAESTHESIA_TYPES = [
  'General',
  'Spinal',
  'Epidural',
  'Regional block',
  'Local',
  'Sedation/MAC',
] as const;

export interface OtBookingSummaryDto {
  id: string;
  appointmentNo: string;
  patientNo: string;
  patientName: string;
  ipNo: string | null;
  surgeryDate: string;
  bookedSurgery: string;
  theatre: string;
  surgeonName: string;
  anaesthetistName?: string;
}

export interface PostOpDto {
  booking: OtBookingSummaryDto;
  preOpTime: string | null;
  wheelingInTime: string | null;
  anaesthesiaStartTime: string | null;
  surgeryStartTime: string | null;
  surgeryEndTime: string | null;
  anaesthesiaEndTime: string | null;
  wheelingOutTime: string | null;
  executedSurgery: string;
  executedSurgeryRemarks: string;
  perOpFindings: string;
  assistedDoctors: string;
  scrubNurse: string;
  floorNurse: string;
  adverseAnaesthesiaEvent: string;
  changeOfPlan: string;
  anaesthesiaType: string;
  surgeryType: SurgeryType | '';
  complication: string;
  outcome: string;
  antibiotic: string;
}

export type PostOpInput = Omit<PostOpDto, 'booking'>;

export interface ListStatusRowDto {
  surgeryDate: string;
  bookingDate: string;
  bookingTime: string;
  theatre: string;
  fromTime: string;
  toTime: string;
  bookingDoctor: string;
  surgeonAndAssistant: string;
  surgery: string;
  remark: string;
  patientNo: string;
  ipNo: string | null;
  patientName: string;
  creditCompany?: string | null;
  patientType?: string | null;
}

export interface RegisterReportRowDto {
  sno?: number;
  ot: string;
  date: string;
  time?: string;
  opNo: string;
  ipNo: string | null;
  name: string;
  sex: string;
  age: string;
  diagnosis: string;
  surgery: string;
  lengthOfStay?: string | null;
  surgeon?: string;
  department?: string;
}

export interface DepartmentMatrixCellDto {
  department: string;
  ot: string;
  count: number;
}

export interface DepartmentMatrixDto {
  departments: string[];
  ots: string[];
  cells: DepartmentMatrixCellDto[];
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grandTotal: number;
}

export interface CancellationReportRowDto {
  type: string;
  ot: string;
  number: string;
  name: string;
  date: string;
  time: string;
  reason: string;
}

export interface DuplicateReportRowDto {
  sno: number;
  date: string;
  time: string;
  opNo: string;
  ipNo: string | null;
  name: string;
  sex: string;
  diagnosis: string;
  surgery: string;
}

export interface FrozenStatsRowDto {
  sno: number;
  patientType: string;
  number: string;
  dateTime: string;
  name: string;
  sexAge: string;
  ward: string;
  ot: string;
  diagnosis: string;
  surgery: string;
  surgeon: string;
  frozenIndication: string;
  cancelled: boolean;
}

export type ReportResultDto =
  | { kind: 'register' | 'doctor' | 'anaesthetist'; rows: RegisterReportRowDto[] }
  | { kind: 'department'; matrix: DepartmentMatrixDto }
  | { kind: 'cancellation'; rows: CancellationReportRowDto[] }
  | { kind: 'duplicates'; rows: DuplicateReportRowDto[] }
  | { kind: 'frozen'; rows: FrozenStatsRowDto[] };

export interface SurgeryMasterDto {
  id: string;
  name: string;
  type: SurgeryType;
  departmentId: string | null;
  departmentName?: string | null;
  active: boolean;
}

export interface SurgeryMasterInput {
  name: string;
  type: SurgeryType;
  departmentId?: string | null;
  active?: boolean;
}

export interface SpecialRemarkDto {
  id: string;
  text: string;
  active: boolean;
}

export interface OtDoctorRoleDto {
  doctorId: string;
  name: string;
  code?: string;
  surgeon: boolean;
  anaesthetist: boolean;
}

export interface OtResourceDto {
  id: string;
  categoryCode: string;
  categoryName: string;
  mainCode: string;
  resourceCode: string;
  resourceType: 'medical' | 'non_medical';
  defaultChargeCode: string;
  defaultServiceCode: string;
  storeCode: string;
  onlineDate: string | null;
  maxCalendarDays: number;
  maxHistoryDays: number;
  overlapAllowed: boolean;
  maxOverlap: number;
  printSlips: boolean;
  sessionCount: number;
  slotDurationHours: number;
  slotDurationMinutes: number;
  bookingStatus: 'active' | 'inactive';
  appointmentFor: string;
  sessionStartTime: string;
  sessionEndTime: string;
  otCategory: string;
  otType: string;
  restrictionDays: number;
  restrictionTime: string;
  active: boolean;
}

export type OtResourceInput = Omit<OtResourceDto, 'id'>;

export interface OtSettingsDto {
  cutoffTime: string;
  minLeadDays: number;
  emergencyBypass: boolean;
}

export interface OtResourceOptionDto {
  id: string;
  resourceCode: string;
  categoryName?: string;
}

export interface OtDepartmentOptionDto {
  id: string;
  name: string;
}

export const otGknm2Api = {
  getPostOp(bookingId: string): Promise<PostOpDto> {
    return apiGet(`${base}/bookings/${bookingId}/post-op`);
  },
  savePostOp(bookingId: string, body: PostOpInput): Promise<PostOpDto> {
    return apiPut(`${base}/bookings/${bookingId}/post-op`, body);
  },

  listStatus(params: {
    from?: string;
    to?: string;
    criteria?: ListStatusCriteria;
    status?: ListStatusFilter;
    otId?: string;
    creditCompany?: string;
    patientType?: string;
  }): Promise<ListStatusRowDto[]> {
    return apiGet(`${base}/list-status${q(params)}`);
  },

  report(params: {
    kind: ReportKind;
    from?: string;
    to?: string;
    otId?: string;
    doctorId?: string;
    departmentId?: string;
    anaesthetistId?: string;
    bookingType?: string;
    surgeryIds?: string[];
  }): Promise<ReportResultDto> {
    const { kind, surgeryIds, ...rest } = params;
    return apiGet(`${base}/reports/${kind}${q({ ...rest, surgeryIds })}`);
  },

  listSurgeries(type?: SurgeryType): Promise<SurgeryMasterDto[]> {
    return apiGet(`${base}/masters/surgeries${q({ type })}`);
  },
  createSurgery(body: SurgeryMasterInput): Promise<SurgeryMasterDto> {
    return apiPost(`${base}/masters/surgeries`, body);
  },
  patchSurgery(id: string, body: Partial<SurgeryMasterInput>): Promise<SurgeryMasterDto> {
    return apiPatch(`${base}/masters/surgeries/${id}`, body);
  },

  listSpecialRemarks(): Promise<SpecialRemarkDto[]> {
    return apiGet(`${base}/masters/special-remarks`);
  },
  createSpecialRemark(text: string): Promise<SpecialRemarkDto> {
    return apiPost(`${base}/masters/special-remarks`, { text });
  },

  listDoctorRoles(role?: 'surgeon' | 'anaesthetist'): Promise<OtDoctorRoleDto[]> {
    return apiGet(`${base}/masters/doctors${q({ role })}`);
  },
  setDoctorRoles(doctorId: string, body: { surgeon: boolean; anaesthetist: boolean }): Promise<OtDoctorRoleDto> {
    return apiPut(`${base}/masters/doctors/${doctorId}/roles`, body);
  },

  listResources(): Promise<OtResourceDto[]> {
    return apiGet(`${base}/resources`);
  },
  createResource(body: OtResourceInput): Promise<OtResourceDto> {
    return apiPost(`${base}/resources`, body);
  },
  patchResource(id: string, body: Partial<OtResourceInput>): Promise<OtResourceDto> {
    return apiPatch(`${base}/resources/${id}`, body);
  },

  getSettings(): Promise<OtSettingsDto> {
    return apiGet(`${base}/settings`);
  },
  saveSettings(body: OtSettingsDto): Promise<OtSettingsDto> {
    return apiPut(`${base}/settings`, body);
  },

  /** Lightweight OT list for filters; falls back to resources if dedicated endpoint missing. */
  async listOtOptions(): Promise<OtResourceOptionDto[]> {
    try {
      const rows = await apiGet<OtResourceOptionDto[]>(`${base}/resources`);
      return rows.map((r) => ({
        id: r.id,
        resourceCode: (r as OtResourceDto).resourceCode ?? (r as OtResourceOptionDto).resourceCode,
        categoryName: (r as OtResourceDto).categoryName,
      }));
    } catch {
      return [];
    }
  },
};
