import { apiGet, apiPost, apiRequest } from '@/lib/api';

const BASE = '/tenant/m/payroll-attendance';

export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'leave' | 'week_off' | 'holiday';

export interface EmployeeRow {
  id: string;
  employeeCode: string;
  fullName: string;
  department: string;
  designation: string;
  monthlyBasicPaise: number;
  joinedOn: string | null;
  isActive: boolean;
}

export interface AttendanceRow {
  id: string;
  workDate: string;
  status: AttendanceStatus;
  note: string;
}

export interface EmployeeDetail {
  employee: EmployeeRow;
  month: string;
  attendance: AttendanceRow[];
}

export interface PayslipPreview {
  employee: { id: string; employeeCode: string; fullName: string };
  month: string;
  daysInMonth: number;
  paidDays: number;
  lopDays: number;
  basicPaise: number;
  grossPaise: number;
  pfEmployeePaise: number;
  esiEmployeePaise: number;
  professionalTaxPaise: number;
  netPaise: number;
  placeholderRates: boolean;
  notes: string[];
}

function key() {
  return crypto.randomUUID();
}

export const payrollApi = {
  employees: () => apiGet<EmployeeRow[]>(`${BASE}/employees`),
  employee: (id: string, month: string) => apiGet<EmployeeDetail>(`${BASE}/employees/${id}?month=${month}`),
  createEmployee: (body: {
    employeeCode: string;
    fullName: string;
    department: string;
    designation: string;
    monthlyBasicPaise: number;
    joinedOn?: string;
  }) => apiPost<EmployeeRow>(`${BASE}/employees`, body, key()),
  markAttendance: (employeeId: string, body: { workDate: string; status: AttendanceStatus; note: string }) =>
    apiRequest<AttendanceRow>(`${BASE}/employees/${employeeId}/attendance`, { method: 'PUT', body, idempotencyKey: key() }),
  payslip: (employeeId: string, month: string) => apiGet<PayslipPreview>(`${BASE}/employees/${employeeId}/payslip?month=${month}`),
};

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  half_day: 'Half day',
  leave: 'Leave',
  week_off: 'Week off',
  holiday: 'Holiday',
};

export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
