import { isoToDDMMYYYY } from '@hos/shared';
import { ApiError } from '@/lib/api';

export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function plusDays(iso: string, days: number): string {
  const parts = iso.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function formatOtDate(iso: string | null | undefined): string {
  const text = isoToDDMMYYYY(iso ?? undefined);
  return text || '—';
}

export function dash(value: string | number | null | undefined): string {
  if (value == null) return '—';
  const text = String(value).trim();
  return text ? text : '—';
}

export function minutesOf(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(mins) || hours > 24 || mins > 59) return null;
  return hours * 60 + mins;
}

export function formatClock(totalMin: number): string {
  const hours = Math.floor(totalMin / 60) % 24;
  const mins = ((totalMin % 60) + 60) % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** 12-hour clock used on the schedule blocks, e.g. 07:00 AM. */
export function formatTime12(time: string | null | undefined): string {
  const mins = minutesOf(time);
  if (mins == null) return time?.trim() || '—';
  const hours = Math.floor(mins / 60) % 24;
  const minutes = mins % 60;
  const suffix = hours < 12 ? 'AM' : 'PM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function formatOtAge(input: {
  years?: number | null;
  months?: number | null;
  days?: number | null;
  label?: string | null;
  dob?: string | null;
}): string {
  if (input.years != null || input.months != null || input.days != null) {
    return `${input.years ?? 0} Y ${input.months ?? 0} M ${input.days ?? 0} D`;
  }
  if (input.dob) {
    const parts = ageParts(input.dob);
    if (parts) return `${parts.years} Y ${parts.months} M ${parts.days} D`;
  }
  const label = input.label?.trim();
  if (label) return label;
  return '—';
}

function ageParts(dob: string): { years: number; months: number; days: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  const now = /^(\d{4})-(\d{2})-(\d{2})/.exec(todayIso());
  if (!match || !now) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const ny = Number(now[1]);
  const nm = Number(now[2]);
  const nd = Number(now[3]);
  if (![y, m, d, ny, nm, nd].every((n) => Number.isFinite(n))) return null;
  let years = ny - y;
  let months = nm - m;
  let days = nd - d;
  if (days < 0) {
    months -= 1;
    const prevMonth = nm === 1 ? 12 : nm - 1;
    const prevYear = nm === 1 ? ny - 1 : ny;
    days += new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years: Math.max(years, 0), months: Math.max(months, 0), days: Math.max(days, 0) };
}

export function patientTypeLabel(value: string | null | undefined): string {
  if (value === 'ip') return 'IP';
  if (value === 'op') return 'OP';
  return dash(value);
}

export function sexLabel(value: string | null | undefined): string {
  if (!value) return '';
  const v = value.toLowerCase();
  if (v === 'male' || v === 'm') return 'Male';
  if (v === 'female' || v === 'f') return 'Female';
  if (v === 'other' || v === 'o') return 'Other';
  return value;
}

export function yesNo(value: boolean | 'yes' | 'no' | string | null | undefined): string {
  if (value === true || value === 'yes') return 'Yes';
  if (value === false || value === 'no') return 'No';
  return dash(value);
}

export function otActionError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'slot_overlap') return err.message || 'This slot overlaps another booking on this theatre.';
    if (err.code === 'booking_cutoff') return err.message || 'This booking is past the cutoff for that date.';
    if (err.code === 'validation' && err.fields) {
      const details = Object.values(err.fields).filter(Boolean).join(' ');
      if (details) return details;
    }
    return err.message || 'The request failed.';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Try again.';
}
