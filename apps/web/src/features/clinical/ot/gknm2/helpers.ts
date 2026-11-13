/** Local calendar date as YYYY-MM-DD (IST-neutral: uses browser local date). */
export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function plusDays(iso: string, days: number): string {
  const parts = iso.split('-').map(Number);
  const y = parts[0] ?? 0;
  const mo = parts[1] ?? 1;
  const da = parts[2] ?? 1;
  const dt = new Date(y, mo - 1, da);
  dt.setDate(dt.getDate() + days);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

/** HH:mm in local time for time inputs. */
export function nowTimeValue(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export const PATIENT_TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'pay_patient', label: 'Pay patient' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'staff', label: 'Staff' },
] as const;

export const BOOKING_TYPE_OPTIONS = [
  { value: '', label: 'All booking types' },
  { value: 'planned', label: 'Planned' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'select', label: 'Select' },
] as const;
