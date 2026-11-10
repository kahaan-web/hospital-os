import { formatDate, formatINR, isoToDDMMYYYY, parseDDMMYYYY, stateName } from '@hos/shared';

export { formatDate, formatINR, isoToDDMMYYYY, parseDDMMYYYY, stateName };

/** 24-hour clock, HH:mm. */
export function formatTime(hhmm: string | null | undefined): string {
  if (!hhmm) return '—';
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
}

export function formatSlot(start: string, end: string): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}

export function formatPhone(mobile: string): string {
  const d = mobile.replace(/\D/g, '');
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return mobile || '—';
}

export function dash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export function todayIso(now = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const mo = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function formatBp(sys: number | null, dia: number | null): string {
  if (sys === null && dia === null) return '—';
  if (sys === null || dia === null) return `${sys ?? '—'} / ${dia ?? '—'} mmHg`;
  return `${sys} / ${dia} mmHg`;
}
