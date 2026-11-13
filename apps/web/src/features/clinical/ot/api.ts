import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { minutesOf } from './format';

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

/**
 * GKNM OT contract (`/api/v1/tenant/m/ot-scheduling`).
 * List payloads may be a bare array or `{ items | rows | requests | bookings }`.
 * Field names accept the contract names plus a few aliases the parallel API may use.
 */

export type OtSort = 'requestNo' | 'patientNo' | 'patientName' | 'doctorName';
export type OtPatientType = 'ip' | 'op' | '';
export type OtSurgeryKind = '' | 'major' | 'minor';
export type OtRequestStatus = 'requested' | 'booked' | 'cancelled';
export type OtBookingType = 'select' | 'planned' | 'emergency';
export type OtCaseKind = 'elective' | 'emergency';
export type OtTee = 'yes' | 'no';

export interface OtNamed {
  id: string;
  name: string;
}

export interface OtResourceDto {
  id: string;
  code: string;
  name: string;
  categoryCode: string;
  categoryName: string;
  sessionStart: string;
  sessionEnd: string;
  slotDurationMin: number;
}

export interface OtSurgeryDto {
  id: string;
  name: string;
  type: OtSurgeryKind;
  department: string;
}

export interface OtSpecialRemarkDto {
  id: string;
  text: string;
}

export interface OtDoctorDto {
  id: string;
  name: string;
  code: string;
  surgeon: boolean;
  anaesthetist: boolean;
}

export interface OtSettingsDto {
  cutoffTime: string;
  minLeadDays: number;
  emergencyBypass: boolean;
}

export interface OtRequestDto {
  id: string;
  requestNo: string;
  ipNo: string;
  patientId: string;
  patientNo: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  patientType: OtPatientType;
  officePermission: boolean;
  officePermissionRemark: string;
  sex: string;
  ageYears: number | null;
  ageMonths: number | null;
  ageDays: number | null;
  ageLabel: string;
  dob: string;
  mobile: string;
  expectedDate: string;
  expectedTime: string;
  status: OtRequestStatus;
  otId: string;
  diagnosis: string;
  surgeryType: OtSurgeryKind;
  surgeryId: string | null;
  surgeryName: string;
  frozenSection: boolean;
  teeRequired: OtTee;
  specialRemarkIds: string[];
  specialRemarks: string[];
  weight: string;
  language: string;
  indication: string;
  surgeonIds: string[];
  surgeons: OtNamed[];
  anaesthetistIds: string[];
  anaesthetists: OtNamed[];
  ward: string;
  bed: string;
  admissionId: string;
}

export interface OtRequestWrite {
  patientId: string;
  doctorId: string;
  patientType: 'ip' | 'op';
  expectedDate: string;
  expectedTime: string;
  officePermission: boolean;
  officePermissionRemark: string;
  diagnosis: string;
  surgeryType: OtSurgeryKind;
  surgeryId: string | null;
  frozenSection: boolean;
  teeRequired: OtTee;
  specialRemarkIds: string[];
  weight: string;
  language: string;
  sex: string;
  indication: string;
  surgeonIds: string[];
  anaesthetistIds: string[];
  ward: string | null;
  bed: string | null;
}

export interface OtRequestQuery {
  from?: string;
  to?: string;
  otId?: string;
  sort?: OtSort;
  q?: string;
  status?: string;
}

export interface OtOutstandingDto {
  unsettledPaise: number;
  unbilledPaise: number;
  depositPaise: number;
  duePaise: number;
  officePermission: boolean;
}

export interface OtFutureItem {
  date: string;
  ipNo: string;
  patientName: string;
  doctorName: string;
  status: string;
  refNo: string;
}

export interface OtPatientContext {
  patientType: OtPatientType;
  sex: string;
  ageYears: number | null;
  ageMonths: number | null;
  ageDays: number | null;
  ageLabel: string;
  ward: string;
  bed: string;
  admissionId: string;
  ipNo: string;
  department: string;
}

export interface OtBookingDto {
  id: string;
  apptNo: string;
  requestId: string;
  requestNo: string;
  resourceId: string;
  resourceName: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMin: number;
  slots: number | null;
  bookingType: OtBookingType;
  caseType: OtCaseKind;
  remarks: string;
  cancelRemarks: string;
  status: string;
  doctorId: string;
  doctorCode: string;
  doctorName: string;
  patientId: string;
  patientNo: string;
  patientName: string;
  patientType: OtPatientType;
  ipNo: string;
  ageLabel: string;
  weight: string;
  language: string;
  sex: string;
  department: string;
  ward: string;
  bed: string;
  surgeryType: OtSurgeryKind;
  surgeryId: string | null;
  surgeryName: string;
  frozenSection: boolean;
  teeRequired: OtTee;
  indication: string;
  diagnosis: string;
  surgeonIds: string[];
  surgeons: OtNamed[];
  anaesthetistIds: string[];
  anaesthetists: OtNamed[];
  serviceNames: string[];
  employeeNames: string[];
  anesType: string;
  anesTypeCode: string;
  nurseName: string;
}

export interface OtBookingWrite {
  resourceId: string;
  date: string;
  startTime: string;
  durationMin: number;
  bookingType: OtBookingType;
  caseType: OtCaseKind;
  remarks: string;
  doctorId: string;
  patientId: string;
  patientType: 'ip' | 'op';
  weight: string;
  language: string;
  sex: string;
  department: string;
  ward: string;
  bed: string;
  surgeryType: OtSurgeryKind;
  surgeryId: string | null;
  frozenSection: boolean;
  teeRequired: OtTee;
  indication: string;
  diagnosis: string;
  surgeonIds: string[];
  anaesthetistIds: string[];
  serviceNames: string[];
  employeeNames: string[];
}

export interface OtScheduleBooking {
  id: string;
  resourceId: string;
  resourceName: string;
  category: string;
  apptNo: string;
  fromTime: string;
  toTime: string;
  patientName: string;
  patientNo: string;
  doctorName: string;
  doctorId: string;
  doctors: string;
  date: string;
}

export interface OtScheduleRow {
  resourceId: string;
  resourceName: string;
  category: string;
  bookings: OtScheduleBooking[];
}

export interface OtBulkItem {
  id: string;
  label: string;
}

export interface OtBulkFailure {
  id: string;
  message: string;
}

export interface OtBulkResult {
  done: OtBulkItem[];
  failed: OtBulkFailure[];
}

export interface OtBulkCancelInput {
  ids?: string[];
  doctorId?: string;
  from?: string;
  to?: string;
  reason: string;
}

export interface OtBulkRescheduleInput {
  ids?: string[];
  doctorId?: string;
  from?: string;
  to?: string;
  shiftDays?: number;
  toDate?: string;
}

function q(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

function pathId(id: string): string {
  return encodeURIComponent(id);
}

function rec(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const row = data as Record<string, unknown>;
  if (row.id != null || row.requestId != null || row.requestNo != null || row.bookingId != null) return row;
  for (const key of ['request', 'booking', 'item']) {
    const inner = row[key];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner as Record<string, unknown>;
  }
  return row;
}

function asRecords(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter((item) => item && typeof item === 'object') as Record<string, unknown>[];
  if (!data || typeof data !== 'object') return [];
  const row = data as Record<string, unknown>;
  for (const key of ['items', 'rows', 'requests', 'bookings', 'data', 'results']) {
    const value = row[key];
    if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[];
  }
  return [];
}

function str(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function bool(row: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'boolean') return value;
    if (value === 'yes' || value === 'true' || value === 'Y' || value === 1) return true;
    if (value === 'no' || value === 'false' || value === 0) return false;
  }
  return false;
}

function numOrNull(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function child(row: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = row[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function idList(row: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = row[key];
    if (!Array.isArray(value)) continue;
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'number') return String(item);
        if (item && typeof item === 'object') return str(item as Record<string, unknown>, ['id', 'doctorId']);
        return '';
      })
      .filter(Boolean);
  }
  return [];
}

function nameList(row: Record<string, unknown>, keys: string[]): OtNamed[] {
  for (const key of keys) {
    const value = row[key];
    if (!Array.isArray(value)) continue;
    const out: OtNamed[] = [];
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) out.push({ id: item, name: item });
      else if (item && typeof item === 'object') {
        const recItem = item as Record<string, unknown>;
        const id = str(recItem, ['id', 'doctorId']);
        const name = str(recItem, ['name', 'fullName', 'doctorName']);
        if (id || name) out.push({ id: id || name, name: name || id });
      }
    }
    return out;
  }
  return [];
}

function stringList(row: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.split(',').map((part) => part.trim()).filter(Boolean);
    if (!Array.isArray(value)) continue;
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : item && typeof item === 'object' ? str(item as Record<string, unknown>, ['name', 'text']) : ''))
      .filter(Boolean);
  }
  return [];
}

function people(row: Record<string, unknown>, idKey: string, listKey: string): { ids: string[]; people: OtNamed[] } {
  const named = nameList(row, [listKey]);
  const ids = [...new Set([...idList(row, [idKey]), ...named.map((person) => person.id)].filter(Boolean))];
  return { ids, people: named.length > 0 ? named : ids.map((id) => ({ id, name: '' })) };
}

function patientTypeOf(value: string): OtPatientType {
  const v = value.toLowerCase().replace(/\s+/g, '_');
  if (v === 'ip' || v === 'in_patient' || v === 'inpatient' || v === 'i') return 'ip';
  if (v === 'op' || v === 'out_patient' || v === 'outpatient' || v === 'o') return 'op';
  return '';
}

function surgeryKindOf(value: string): OtSurgeryKind {
  const v = value.toLowerCase();
  if (v === 'major' || v === 'minor') return v;
  return '';
}

function teeOf(row: Record<string, unknown>): OtTee {
  const value = row.teeRequired ?? row.tee;
  if (value === true || value === 'yes' || value === 'Yes' || value === 'Y' || value === 'y') return 'yes';
  return 'no';
}

function requestStatusOf(value: string): OtRequestStatus {
  const v = value.toLowerCase();
  if (v === 'booked' || v === 'scheduled' || v === 'confirmed') return 'booked';
  if (v === 'cancelled' || v === 'canceled') return 'cancelled';
  return 'requested';
}

function bookingTypeOf(value: string): OtBookingType {
  const v = value.toLowerCase();
  if (v === 'emergency') return 'emergency';
  if (v === 'select') return 'select';
  return 'planned';
}

function caseKindOf(value: string): OtCaseKind {
  return value.toLowerCase() === 'emergency' ? 'emergency' : 'elective';
}

function specials(row: Record<string, unknown>): { ids: string[]; labels: string[] } {
  const ids = [...idList(row, ['specialRemarkIds'])];
  const labels: string[] = [];
  const raw = row.specialRemarks ?? row.specialRemark;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') {
        if (/^[0-9a-f-]{8,}$/i.test(item)) ids.push(item);
        else if (item.trim()) labels.push(item.trim());
      } else if (item && typeof item === 'object') {
        const recItem = item as Record<string, unknown>;
        const id = str(recItem, ['id']);
        const text = str(recItem, ['text', 'name', 'remark']);
        if (id) ids.push(id);
        if (text) labels.push(text);
      }
    }
  }
  return { ids: [...new Set(ids)], labels };
}

function normalizeRequest(input: unknown): OtRequestDto | null {
  const row = rec(input);
  const patient = child(row, 'patient');
  const doctor = child(row, 'doctor');
  const surgery = child(row, 'surgery');
  const id = str(row, ['id', 'requestId']);
  const requestNo = str(row, ['requestNo', 'reqNo', 'number']);
  if (!id && !requestNo) return null;
  const surgeons = people(row, 'surgeonIds', 'surgeons');
  const anaesthetists = people(row, 'anaesthetistIds', 'anaesthetists');
  const remarks = specials(row);
  const age = child(row, 'age');
  return {
    id: id || requestNo,
    requestNo: requestNo || id,
    ipNo: str(row, ['ipNo', 'ipNumber']) || (patient ? str(patient, ['ipNo', 'ipNumber']) : ''),
    patientId: str(row, ['patientId']) || (patient ? str(patient, ['id']) : ''),
    patientNo: str(row, ['patientNo', 'uhid', 'patientNumber']) || (patient ? str(patient, ['uhid', 'patientNo']) : ''),
    patientName: str(row, ['patientName', 'fullName']) || (patient ? str(patient, ['fullName', 'name']) : ''),
    doctorId: str(row, ['doctorId']) || (doctor ? str(doctor, ['id']) : ''),
    doctorName: str(row, ['doctorName']) || (doctor ? str(doctor, ['name', 'fullName']) : ''),
    patientType: patientTypeOf(str(row, ['patientType', 'patType'])),
    officePermission: bool(row, ['officePermission', 'officePermissionGranted']),
    officePermissionRemark: str(row, ['officePermissionRemark', 'permissionRemark']),
    sex: str(row, ['sex', 'gender']) || (patient ? str(patient, ['sex', 'gender']) : ''),
    ageYears: numOrNull(row, ['ageYears']) ?? (age ? numOrNull(age, ['years', 'y']) : null),
    ageMonths: numOrNull(row, ['ageMonths']) ?? (age ? numOrNull(age, ['months', 'm']) : null),
    ageDays: numOrNull(row, ['ageDays']) ?? (age ? numOrNull(age, ['days', 'd']) : null),
    ageLabel: str(row, ['ageLabel', 'age']),
    dob: str(row, ['dob']) || (patient ? str(patient, ['dob']) : ''),
    mobile: str(row, ['mobile']) || (patient ? str(patient, ['mobile']) : ''),
    expectedDate: str(row, ['expectedDate', 'date']).slice(0, 10),
    expectedTime: str(row, ['expectedTime', 'time']).slice(0, 5),
    status: requestStatusOf(str(row, ['status'])),
    otId: str(row, ['otId', 'resourceId']),
    diagnosis: str(row, ['diagnosis']),
    surgeryType: surgeryKindOf(str(row, ['surgeryType', 'type']) || (surgery ? str(surgery, ['type', 'surgeryType']) : '')),
    surgeryId: str(row, ['surgeryId']) || (surgery ? str(surgery, ['id']) : '') || null,
    surgeryName: str(row, ['surgeryName']) || (surgery ? str(surgery, ['name']) : ''),
    frozenSection: bool(row, ['frozenSection']),
    teeRequired: teeOf(row),
    specialRemarkIds: remarks.ids,
    specialRemarks: remarks.labels,
    weight: str(row, ['weight']),
    language: str(row, ['language']),
    indication: str(row, ['indication']),
    surgeonIds: surgeons.ids,
    surgeons: surgeons.people,
    anaesthetistIds: anaesthetists.ids,
    anaesthetists: anaesthetists.people,
    ward: str(row, ['ward', 'wardName']),
    bed: str(row, ['bed', 'bedNo', 'bedNumber']),
    admissionId: str(row, ['admissionId']),
  };
}

function normalizeResource(row: Record<string, unknown>): OtResourceDto | null {
  const id = str(row, ['id', 'resourceId']);
  const code = str(row, ['code', 'resourceCode', 'resource']);
  const name = str(row, ['name', 'resourceName']) || code;
  if (!id && !name) return null;
  const slot = numOrNull(row, ['slotDurationMin', 'slotMinutes']);
  return {
    id: id || name,
    code: code || name,
    name: name || code,
    categoryCode: str(row, ['categoryCode']),
    categoryName: str(row, ['categoryName', 'category', 'otCategory']) || str(row, ['categoryCode']),
    sessionStart: str(row, ['sessionStart', 'startTime']).slice(0, 5),
    sessionEnd: str(row, ['sessionEnd', 'endTime']).slice(0, 5),
    slotDurationMin: slot != null && slot > 0 ? slot : 15,
  };
}

function normalizeSurgery(row: Record<string, unknown>): OtSurgeryDto | null {
  const id = str(row, ['id']);
  const name = str(row, ['name', 'surgeryName']);
  if (!id && !name) return null;
  if (row.active === false) return null;
  return {
    id: id || name,
    name: name || id,
    type: surgeryKindOf(str(row, ['type', 'surgeryType'])),
    department: str(row, ['department', 'departmentName']),
  };
}

function normalizeRemark(row: Record<string, unknown>): OtSpecialRemarkDto | null {
  if (row.active === false) return null;
  const id = str(row, ['id']);
  const text = str(row, ['text', 'name', 'remark']);
  if (!id && !text) return null;
  return { id: id || text, text: text || id };
}

function normalizeDoctor(row: Record<string, unknown>, role: 'surgeon' | 'anaesthetist'): OtDoctorDto | null {
  const id = str(row, ['id', 'doctorId']);
  if (!id) return null;
  const name = str(row, ['name', 'fullName', 'doctorName']);
  const code = str(row, ['code', 'doctorNo', 'number']);
  return {
    id,
    name: name || code || id,
    code,
    surgeon: bool(row, ['surgeon']) || role === 'surgeon',
    anaesthetist: bool(row, ['anaesthetist']) || role === 'anaesthetist',
  };
}

function normalizeFuture(row: Record<string, unknown>): OtFutureItem | null {
  const date = str(row, ['date', 'expectedDate', 'forDate']).slice(0, 10);
  const refNo = str(row, ['refNo', 'reqOrAppNo', 'requestNo', 'apptNo', 'number']);
  if (!date && !refNo && !str(row, ['patientName'])) return null;
  return {
    date,
    ipNo: str(row, ['ipNo', 'ipNumber']),
    patientName: str(row, ['patientName']),
    doctorName: str(row, ['doctorName']),
    status: str(row, ['status']) || 'REQUEST',
    refNo,
  };
}

function normalizeContext(data: unknown): OtPatientContext {
  const row = rec(data);
  const age = child(row, 'age');
  return {
    patientType: patientTypeOf(str(row, ['patientType', 'patType'])),
    sex: str(row, ['sex', 'gender']),
    ageYears: numOrNull(row, ['ageYears']) ?? (age ? numOrNull(age, ['years', 'y']) : null),
    ageMonths: numOrNull(row, ['ageMonths']) ?? (age ? numOrNull(age, ['months', 'm']) : null),
    ageDays: numOrNull(row, ['ageDays']) ?? (age ? numOrNull(age, ['days', 'd']) : null),
    ageLabel: str(row, ['age', 'ageLabel']),
    ward: str(row, ['ward', 'wardName']),
    bed: str(row, ['bed', 'bedNo', 'bedNumber']),
    admissionId: str(row, ['admissionId']),
    ipNo: str(row, ['ipNo', 'ipNumber']),
    department: str(row, ['department', 'departmentName']),
  };
}

function normalizeOutstanding(data: unknown): OtOutstandingDto {
  const row = rec(data);
  const paise = (key: string) => {
    const value = numOrNull(row, [key]);
    return value == null ? 0 : Math.round(value);
  };
  return {
    unsettledPaise: paise('unsettledPaise'),
    unbilledPaise: paise('unbilledPaise'),
    depositPaise: paise('depositPaise'),
    duePaise: paise('duePaise'),
    officePermission: bool(row, ['officePermission', 'granted']),
  };
}

function normalizeSettings(data: unknown): OtSettingsDto {
  const row = rec(data);
  return {
    cutoffTime: str(row, ['cutoffTime']) || '17:00',
    minLeadDays: numOrNull(row, ['minLeadDays']) ?? 1,
    emergencyBypass: row.emergencyBypass === undefined ? true : bool(row, ['emergencyBypass']),
  };
}

function normalizeBooking(input: unknown): OtBookingDto | null {
  const row = rec(input);
  const id = str(row, ['id', 'bookingId']);
  if (!id) return null;
  const patient = child(row, 'patient');
  const doctor = child(row, 'doctor');
  const request = child(row, 'request');
  const surgery = child(row, 'surgery');
  const resource = child(row, 'resource');
  const surgeons = people(row, 'surgeonIds', 'surgeons');
  const anaesthetists = people(row, 'anaesthetistIds', 'anaesthetists');
  const startTime = str(row, ['startTime', 'fromTime']).slice(0, 5);
  const endTime = str(row, ['endTime', 'toTime']).slice(0, 5);
  const direct = numOrNull(row, ['durationMin', 'duration']);
  const startMin = minutesOf(startTime);
  const endMin = minutesOf(endTime);
  const durationMin = direct != null && direct > 0 ? direct : startMin != null && endMin != null && endMin > startMin ? endMin - startMin : 0;
  return {
    id,
    apptNo: str(row, ['apptNo', 'appointmentNo', 'number']),
    requestId: str(row, ['requestId']) || (request ? str(request, ['id']) : ''),
    requestNo: str(row, ['requestNo']) || (request ? str(request, ['requestNo', 'number']) : ''),
    resourceId: str(row, ['resourceId', 'otId']) || (resource ? str(resource, ['id']) : ''),
    resourceName: str(row, ['resourceName', 'otName']) || (resource ? str(resource, ['name', 'code']) : ''),
    date: str(row, ['date', 'surgeryDate']).slice(0, 10),
    startTime,
    endTime,
    durationMin,
    slots: numOrNull(row, ['slots', 'noOfSlots']),
    bookingType: bookingTypeOf(str(row, ['bookingType'])),
    caseType: caseKindOf(str(row, ['caseType', 'priority'])),
    remarks: str(row, ['remarks', 'remark']),
    cancelRemarks: str(row, ['cancelRemarks', 'cancellationRemarks']),
    status: str(row, ['status']) || 'booked',
    doctorId: str(row, ['doctorId']) || (doctor ? str(doctor, ['id']) : ''),
    doctorCode: str(row, ['doctorCode', 'doctorNo']) || (doctor ? str(doctor, ['code', 'doctorNo']) : ''),
    doctorName: str(row, ['doctorName']) || (doctor ? str(doctor, ['name', 'fullName']) : ''),
    patientId: str(row, ['patientId']) || (patient ? str(patient, ['id']) : ''),
    patientNo: str(row, ['patientNo', 'uhid']) || (patient ? str(patient, ['uhid', 'patientNo']) : ''),
    patientName: str(row, ['patientName']) || (patient ? str(patient, ['fullName', 'name']) : ''),
    patientType: patientTypeOf(str(row, ['patientType', 'patType'])),
    ipNo: str(row, ['ipNo', 'ipNumber']),
    ageLabel: str(row, ['ageLabel', 'age']),
    weight: str(row, ['weight']),
    language: str(row, ['language']),
    sex: str(row, ['sex', 'gender']),
    department: str(row, ['department', 'departmentName']),
    ward: str(row, ['ward', 'wardName']),
    bed: str(row, ['bed', 'bedNo']),
    surgeryType: surgeryKindOf(str(row, ['surgeryType']) || (surgery ? str(surgery, ['type']) : '')),
    surgeryId: str(row, ['surgeryId']) || (surgery ? str(surgery, ['id']) : '') || null,
    surgeryName: str(row, ['surgeryName', 'surgery']) || (surgery ? str(surgery, ['name']) : ''),
    frozenSection: bool(row, ['frozenSection']),
    teeRequired: teeOf(row),
    indication: str(row, ['indication']),
    diagnosis: str(row, ['diagnosis']),
    surgeonIds: surgeons.ids,
    surgeons: surgeons.people,
    anaesthetistIds: anaesthetists.ids,
    anaesthetists: anaesthetists.people,
    serviceNames: stringList(row, ['serviceNames', 'services']),
    employeeNames: stringList(row, ['employeeNames', 'employees']),
    anesType: str(row, ['anesType', 'anaesthesiaType', 'anesthesiaType']),
    anesTypeCode: str(row, ['anesTypeCode', 'anesTypCd', 'anaesthesiaTypeCode']),
    nurseName: str(row, ['nurseName']),
  };
}

function normalizeScheduleBooking(
  row: Record<string, unknown>,
  fallbackResourceId: string,
  fallbackName: string,
  fallbackCategory: string,
  date: string,
): OtScheduleBooking | null {
  const booking = normalizeBooking(row);
  const id = booking?.id || str(row, ['id', 'bookingId']);
  if (!id) return null;
  const surgeons = nameList(row, ['surgeons', 'doctors']);
  const doctorName = booking?.doctorName || str(row, ['doctorName']) || surgeons[0]?.name || '';
  const doctorLabel = [...new Set(surgeons.map((person) => person.name).filter(Boolean))].join(', ');
  return {
    id,
    resourceId: booking?.resourceId || str(row, ['resourceId', 'otId']) || fallbackResourceId,
    resourceName: booking?.resourceName || str(row, ['resourceName', 'otName']) || fallbackName,
    category: str(row, ['category', 'categoryName']) || fallbackCategory,
    apptNo: booking?.apptNo || str(row, ['apptNo', 'appointmentNo']),
    fromTime: booking?.startTime || str(row, ['fromTime', 'startTime']).slice(0, 5),
    toTime: booking?.endTime || str(row, ['toTime', 'endTime']).slice(0, 5),
    patientName: booking?.patientName || str(row, ['patientName']),
    patientNo: booking?.patientNo || str(row, ['patientNo', 'uhid']),
    doctorName,
    doctorId: booking?.doctorId || str(row, ['doctorId']),
    doctors: str(row, ['doctorsLabel']) || doctorLabel || doctorName,
    date: (booking?.date || str(row, ['date']) || date).slice(0, 10),
  };
}

function normalizeSchedule(data: unknown, date: string): OtScheduleRow[] {
  const row = !Array.isArray(data) && data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const nested = row && Array.isArray(row.rows) ? (row.rows as unknown[]) : null;
  if (nested) {
    const out: OtScheduleRow[] = [];
    for (const item of nested) {
      if (!item || typeof item !== 'object') continue;
      const resource = item as Record<string, unknown>;
      const resourceId = str(resource, ['resourceId', 'id', 'otId']);
      const resourceName = str(resource, ['resourceName', 'name', 'otName']) || resourceId;
      const category = str(resource, ['category', 'categoryName', 'categoryCode']);
      const bookingsRaw = Array.isArray(resource.bookings) ? (resource.bookings as unknown[]) : [];
      const bookings = bookingsRaw
        .map((entry) => (entry && typeof entry === 'object' ? normalizeScheduleBooking(entry as Record<string, unknown>, resourceId, resourceName, category, date) : null))
        .filter((entry): entry is OtScheduleBooking => entry != null);
      if (resourceId || resourceName) out.push({ resourceId: resourceId || resourceName, resourceName, category, bookings });
    }
    if (out.length > 0) return out;
  }
  const flat = asRecords(data);
  const groups = new Map<string, OtScheduleRow>();
  for (const entry of flat) {
    const booking = normalizeScheduleBooking(entry, '', '', '', date);
    if (!booking) continue;
    const key = booking.resourceId || booking.resourceName || 'ot';
    const existing = groups.get(key);
    if (existing) existing.bookings.push(booking);
    else groups.set(key, { resourceId: booking.resourceId || key, resourceName: booking.resourceName || key, category: booking.category, bookings: [booking] });
  }
  return [...groups.values()];
}

function asBulk(data: unknown): OtBulkResult {
  if (Array.isArray(data)) {
    return {
      done: data.map((item, index) => {
        if (typeof item === 'string') return { id: item, label: item };
        const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const id = str(row, ['id', 'bookingId']) || String(index + 1);
        return { id, label: str(row, ['apptNo', 'label', 'requestNo']) || id };
      }),
      failed: [],
    };
  }
  const row = rec(data);
  const doneRaw = row.done ?? row.moved ?? row.cancelled ?? row.rescheduled ?? row.succeeded ?? row.ok ?? [];
  const failedRaw = row.failed ?? row.errors ?? row.failures ?? [];
  const mapDone = (value: unknown): OtBulkItem[] => {
    if (!Array.isArray(value)) return [];
    return value.map((item, index) => {
      if (typeof item === 'string') return { id: item, label: item };
      const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const id = str(entry, ['id', 'bookingId']) || String(index + 1);
      return { id, label: str(entry, ['apptNo', 'label', 'requestNo', 'message']) || id };
    });
  };
  const mapFailed = (value: unknown): OtBulkFailure[] => {
    if (!Array.isArray(value)) return [];
    return value.map((item, index) => {
      if (typeof item === 'string') return { id: String(index + 1), message: item };
      const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        id: str(entry, ['id', 'bookingId']) || String(index + 1),
        message: str(entry, ['message', 'reason', 'error']) || 'Could not update this booking',
      };
    });
  };
  return { done: mapDone(doneRaw), failed: mapFailed(failedRaw) };
}

function requireRequest(input: unknown): OtRequestDto {
  const dto = normalizeRequest(input);
  if (!dto) throw new Error('The OT request response was empty.');
  return dto;
}

function requireBooking(input: unknown): OtBookingDto {
  const dto = normalizeBooking(input);
  if (!dto) throw new Error('The OT booking response was empty.');
  return dto;
}

function requestPayload(body: OtRequestWrite): Record<string, unknown> {
  return {
    patientId: body.patientId,
    doctorId: body.doctorId,
    patientType: body.patientType,
    expectedDate: body.expectedDate,
    ...(body.expectedTime ? { expectedTime: body.expectedTime } : {}),
    officePermission: body.officePermission,
    officePermissionRemark: body.officePermissionRemark,
    diagnosis: body.diagnosis,
    ...(body.surgeryType ? { surgeryType: body.surgeryType } : {}),
    surgeryId: body.surgeryId,
    frozenSection: body.frozenSection,
    teeRequired: body.teeRequired,
    specialRemarkIds: body.specialRemarkIds,
    weight: body.weight,
    language: body.language,
    sex: body.sex,
    indication: body.indication,
    surgeonIds: body.surgeonIds,
    anaesthetistIds: body.anaesthetistIds,
    ward: body.ward,
    bed: body.bed,
  };
}

function bookingPayload(body: OtBookingWrite): Record<string, unknown> {
  return {
    resourceId: body.resourceId,
    date: body.date,
    startTime: body.startTime,
    durationMin: body.durationMin,
    bookingType: body.bookingType,
    caseType: body.caseType,
    remarks: body.remarks,
    doctorId: body.doctorId,
    patientId: body.patientId,
    patientType: body.patientType,
    weight: body.weight,
    language: body.language,
    sex: body.sex,
    department: body.department,
    ward: body.ward,
    bed: body.bed,
    ...(body.surgeryType ? { surgeryType: body.surgeryType } : {}),
    surgeryId: body.surgeryId,
    frozenSection: body.frozenSection,
    teeRequired: body.teeRequired,
    indication: body.indication,
    diagnosis: body.diagnosis,
    surgeonIds: body.surgeonIds,
    anaesthetistIds: body.anaesthetistIds,
    serviceNames: body.serviceNames,
    employeeNames: body.employeeNames,
  };
}

function mapRows<T>(data: unknown, map: (row: Record<string, unknown>) => T | null): T[] {
  return asRecords(data)
    .map(map)
    .filter((row): row is T => row != null);
}

export const otSchedulingApi = {
  resources: async (): Promise<OtResourceDto[]> => mapRows(await apiGet<unknown>(`${base}/resources`), normalizeResource),
  surgeries: async (type?: 'major' | 'minor'): Promise<OtSurgeryDto[]> =>
    mapRows(await apiGet<unknown>(`${base}/masters/surgeries${q({ type })}`), normalizeSurgery),
  specialRemarks: async (): Promise<OtSpecialRemarkDto[]> => mapRows(await apiGet<unknown>(`${base}/masters/special-remarks`), normalizeRemark),
  doctors: async (role: 'surgeon' | 'anaesthetist'): Promise<OtDoctorDto[]> =>
    mapRows(await apiGet<unknown>(`${base}/masters/doctors${q({ role })}`), (row) => normalizeDoctor(row, role)),
  settings: async (): Promise<OtSettingsDto> => normalizeSettings(await apiGet<unknown>(`${base}/settings`)),
  requests: async (query: OtRequestQuery): Promise<OtRequestDto[]> => mapRows(await apiGet<unknown>(`${base}/requests${q({ ...query })}`), (row) => normalizeRequest(row)),
  request: async (id: string): Promise<OtRequestDto> => requireRequest(await apiGet<unknown>(`${base}/requests/${pathId(id)}`)),
  createRequest: async (body: OtRequestWrite): Promise<OtRequestDto> =>
    requireRequest(await apiPost<unknown>(`${base}/requests`, requestPayload(body), crypto.randomUUID())),
  updateRequest: async (id: string, body: OtRequestWrite): Promise<OtRequestDto> =>
    requireRequest(await apiPatch<unknown>(`${base}/requests/${pathId(id)}`, requestPayload(body))),
  cancelRequest: (id: string, reason: string) => apiPost<unknown>(`${base}/requests/${pathId(id)}/cancel`, { reason }, crypto.randomUUID()),
  outstanding: async (id: string): Promise<OtOutstandingDto> => normalizeOutstanding(await apiGet<unknown>(`${base}/requests/${pathId(id)}/outstanding`)),
  officePermission: (id: string, body: { granted: boolean; remark: string }) =>
    apiPost<unknown>(`${base}/requests/${pathId(id)}/office-permission`, body),
  future: async (patientId: string): Promise<OtFutureItem[]> =>
    mapRows(await apiGet<unknown>(`${base}/patients/${pathId(patientId)}/future`), normalizeFuture),
  patientContext: async (patientId: string): Promise<OtPatientContext> =>
    normalizeContext(await apiGet<unknown>(`${base}/patients/${pathId(patientId)}/context`)),
  dayBookings: async (date: string, resourceId?: string): Promise<OtBookingDto[]> =>
    mapRows(await apiGet<unknown>(`${base}/bookings${q({ date, resourceId })}`), (row) => normalizeBooking(row)),
  createBooking: async (body: OtBookingWrite): Promise<OtBookingDto> =>
    requireBooking(await apiPost<unknown>(`${base}/bookings`, bookingPayload(body), crypto.randomUUID())),
  bookRequest: async (requestId: string, body: OtBookingWrite): Promise<OtBookingDto> =>
    requireBooking(await apiPost<unknown>(`${base}/requests/${pathId(requestId)}/book`, bookingPayload(body), crypto.randomUUID())),
  modifyBooking: async (id: string, body: OtBookingWrite): Promise<OtBookingDto> =>
    requireBooking(await apiPatch<unknown>(`${base}/bookings/${pathId(id)}`, bookingPayload(body))),
  cancelBooking: (id: string, remarks: string) => apiPost<unknown>(`${base}/bookings/${pathId(id)}/cancel`, { remarks }, crypto.randomUUID()),
  shift: (id: string, body: { resourceId: string; date: string; startTime: string }) =>
    apiPost<unknown>(`${base}/bookings/${pathId(id)}/shift`, body, crypto.randomUUID()),
  shiftNow: (id: string, body: { resourceId: string }) =>
    apiPost<unknown>(`${base}/bookings/${pathId(id)}/shift-now`, body, crypto.randomUUID()),
  schedule: async (date: string, category?: string): Promise<OtScheduleRow[]> =>
    normalizeSchedule(await apiGet<unknown>(`${base}/schedule${q({ date, category })}`), date),
  bulkCancel: async (body: OtBulkCancelInput): Promise<OtBulkResult> => asBulk(await apiPost<unknown>(`${base}/bookings/bulk-cancel`, body, crypto.randomUUID())),
  bulkReschedule: async (body: OtBulkRescheduleInput): Promise<OtBulkResult> =>
    asBulk(await apiPost<unknown>(`${base}/bookings/bulk-reschedule`, body, crypto.randomUUID())),
};
