'use client';

import { createTranslator, type MessageKey } from '@hos/shared';
import Link from 'next/link';

const t = createTranslator('en');

const LINKS: { href: string; label: MessageKey }[] = [
  { href: '/app/adt', label: 'clinical.adt.title' },
  { href: '/app/adt/admit', label: 'clinical.adt.admit' },
  { href: '/app/adt/masters', label: 'clinical.adt.masters' },
  { href: '/app/adt/reports', label: 'clinical.adt.reports' },
];

export function AdtLinks({ current }: { current: string }) {
  return (
    <nav aria-label="Admission" className="mb-4 flex flex-wrap gap-4 text-sm">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} aria-current={current === link.href ? 'page' : undefined} className="hos-link">
          {t(link.label)}
        </Link>
      ))}
    </nav>
  );
}

export function formatWhen(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

const STATUS_KEY: Record<string, MessageKey> = {
  vacant: 'clinical.adt.vacant',
  occupied: 'clinical.adt.occupied',
  housekeeping: 'clinical.adt.housekeeping',
  maintenance: 'clinical.adt.maintenance',
  blocked: 'clinical.adt.blocked',
  admitted: 'clinical.adt.admitted',
  discharge_initiated: 'clinical.adt.dischargeInitiated',
  discharged: 'clinical.adt.discharged',
  cancelled: 'clinical.adt.cancelled',
  emergency: 'clinical.adt.typeEmergency',
  elective: 'clinical.adt.typeElective',
  day_care: 'clinical.adt.typeDayCare',
  draft: 'clinical.adt.draft',
  final: 'clinical.adt.finalStatus',
  none: 'clinical.adt.none',
};

export function statusLabel(status: string): string {
  const key = STATUS_KEY[status];
  return key ? t(key) : status;
}
