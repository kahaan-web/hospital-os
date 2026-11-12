'use client';

import type { MessageKey, ModuleStateDto } from '@hos/shared';
import { createTranslator } from '@hos/shared';
import type { ShellNavItem } from '@hos/ui';
import {
  BedDouble,
  CalendarClock,
  FlaskConical,
  HeartPulse,
  Pill,
  Receipt,
  ScanLine,
  Scissors,
  Stethoscope,
  UserRound,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { isNavActive } from '@/lib/navActive';

const t = createTranslator('en');

export interface ClinicalScreen {
  id: string;
  labelKey: MessageKey;
  href: string;
  moduleKey: string;
  permission: string;
  /** Sidebar entry. Detail routes stay registered for the task that owns the page. */
  nav: boolean;
}

/** Every Phase B screen. Later tasks own the pages; this registry only decides who sees the link. */
export const CLINICAL_SCREENS: readonly ClinicalScreen[] = [
  { id: 'patients', labelKey: 'clinical.registration.nav', href: '/app/patients', moduleKey: 'patient-registration', permission: 'patients.view', nav: true },
  { id: 'patients-new', labelKey: 'clinical.registration.new', href: '/app/patients/new', moduleKey: 'patient-registration', permission: 'patients.manage', nav: false },
  { id: 'patients-detail', labelKey: 'clinical.registration.title', href: '/app/patients/[id]', moduleKey: 'patient-registration', permission: 'patients.view', nav: false },
  { id: 'patients-edit', labelKey: 'clinical.registration.new', href: '/app/patients/[id]/edit', moduleKey: 'patient-registration', permission: 'patients.manage', nav: false },
  { id: 'patients-mlc', labelKey: 'clinical.registration.mlc', href: '/app/patients/mlc', moduleKey: 'patient-registration', permission: 'patients.manage', nav: false },
  { id: 'patients-reports', labelKey: 'clinical.registration.reports', href: '/app/patients/reports', moduleKey: 'patient-registration', permission: 'reports.view', nav: false },
  { id: 'appointments', labelKey: 'clinical.appointments.nav', href: '/app/appointments', moduleKey: 'appointments', permission: 'appointments.manage', nav: true },
  { id: 'appointments-new', labelKey: 'clinical.appointments.new', href: '/app/appointments/new', moduleKey: 'appointments', permission: 'appointments.manage', nav: false },
  { id: 'opd-queue', labelKey: 'clinical.appointments.queue', href: '/app/opd/queue', moduleKey: 'opd-visit', permission: 'opd.manage', nav: true },
  { id: 'opd-visits', labelKey: 'clinical.appointments.visits', href: '/app/opd/visits', moduleKey: 'opd-visit', permission: 'opd.manage', nav: false },
  { id: 'opd-reports', labelKey: 'clinical.appointments.reports', href: '/app/opd/reports', moduleKey: 'opd-visit', permission: 'reports.view', nav: false },
  { id: 'clinic', labelKey: 'clinical.doctor.nav', href: '/app/clinic', moduleKey: 'opd-visit', permission: 'clinical.order', nav: true },
  { id: 'clinic-encounter', labelKey: 'clinical.doctor.encounter', href: '/app/clinic/encounters/[id]', moduleKey: 'opd-visit', permission: 'clinical.order', nav: false },
  { id: 'clinic-inpatients', labelKey: 'clinical.doctor.inpatients', href: '/app/clinic/inpatients', moduleKey: 'cpoe', permission: 'clinical.order', nav: false },
  { id: 'clinic-order-sets', labelKey: 'clinical.doctor.orderSets', href: '/app/clinic/order-sets', moduleKey: 'cpoe', permission: 'clinical.order', nav: false },
  { id: 'adt', labelKey: 'clinical.adt.nav', href: '/app/adt', moduleKey: 'adt', permission: 'adt.manage', nav: true },
  { id: 'adt-admit', labelKey: 'clinical.adt.admit', href: '/app/adt/admit', moduleKey: 'adt', permission: 'adt.manage', nav: false },
  { id: 'adt-admission', labelKey: 'clinical.adt.admission', href: '/app/adt/admissions/[id]', moduleKey: 'adt', permission: 'adt.manage', nav: false },
  { id: 'adt-summary', labelKey: 'clinical.adt.summary', href: '/app/adt/admissions/[id]/summary', moduleKey: 'adt', permission: 'adt.manage', nav: false },
  { id: 'adt-masters', labelKey: 'clinical.adt.masters', href: '/app/adt/masters', moduleKey: 'adt', permission: 'adt.manage', nav: false },
  { id: 'adt-reports', labelKey: 'clinical.adt.reports', href: '/app/adt/reports', moduleKey: 'adt', permission: 'reports.view', nav: false },
  { id: 'billing', labelKey: 'clinical.billing.nav', href: '/app/billing', moduleKey: 'op-billing', permission: 'billing.op.post', nav: true },
  { id: 'billing-bill', labelKey: 'clinical.billing.bill', href: '/app/billing/bills/[id]', moduleKey: 'op-billing', permission: 'billing.op.post', nav: false },
  { id: 'billing-deposits', labelKey: 'clinical.billing.deposits', href: '/app/billing/deposits', moduleKey: 'op-billing', permission: 'billing.op.post', nav: false },
  { id: 'billing-refunds', labelKey: 'clinical.billing.refunds', href: '/app/billing/refunds', moduleKey: 'op-billing', permission: 'billing.op.refund', nav: false },
  { id: 'billing-services', labelKey: 'clinical.billing.services', href: '/app/billing/services', moduleKey: 'op-billing', permission: 'billing.op.post', nav: false },
  { id: 'billing-reports', labelKey: 'clinical.billing.reports', href: '/app/billing/reports', moduleKey: 'op-billing', permission: 'reports.view', nav: false },
  { id: 'ip-billing', labelKey: 'clinical.ipbilling.nav', href: '/app/ip-billing', moduleKey: 'ip-billing', permission: 'billing.ip.manage', nav: true },
  { id: 'ip-billing-encounter', labelKey: 'clinical.ipbilling.encounter', href: '/app/ip-billing/[encounterId]', moduleKey: 'ip-billing', permission: 'billing.ip.manage', nav: false },
  { id: 'ip-billing-payers', labelKey: 'clinical.ipbilling.payers', href: '/app/ip-billing/payers', moduleKey: 'ip-billing', permission: 'billing.ip.manage', nav: false },
  { id: 'ip-billing-reports', labelKey: 'clinical.ipbilling.reports', href: '/app/ip-billing/reports', moduleKey: 'ip-billing', permission: 'reports.view', nav: false },
  { id: 'pharmacy', labelKey: 'clinical.pharmacy.nav', href: '/app/pharmacy', moduleKey: 'pharmacy', permission: 'pharmacy.manage', nav: true },
  { id: 'pharmacy-sale', labelKey: 'clinical.pharmacy.sale', href: '/app/pharmacy/sales/new', moduleKey: 'pharmacy', permission: 'pharmacy.manage', nav: false },
  { id: 'pharmacy-ip', labelKey: 'clinical.pharmacy.ipIssues', href: '/app/pharmacy/ip-issues', moduleKey: 'pharmacy', permission: 'pharmacy.manage', nav: false },
  { id: 'pharmacy-grn', labelKey: 'clinical.pharmacy.grn', href: '/app/pharmacy/grn', moduleKey: 'pharmacy', permission: 'pharmacy.manage', nav: false },
  { id: 'pharmacy-stock', labelKey: 'clinical.pharmacy.stock', href: '/app/pharmacy/stock', moduleKey: 'pharmacy', permission: 'pharmacy.manage', nav: false },
  { id: 'pharmacy-items', labelKey: 'clinical.pharmacy.items', href: '/app/pharmacy/items', moduleKey: 'pharmacy', permission: 'pharmacy.manage', nav: false },
  { id: 'pharmacy-reports', labelKey: 'clinical.pharmacy.reports', href: '/app/pharmacy/reports', moduleKey: 'pharmacy', permission: 'reports.view', nav: false },
  { id: 'lab', labelKey: 'clinical.lab.nav', href: '/app/lab', moduleKey: 'lab', permission: 'lab.manage', nav: true },
  { id: 'lab-accession', labelKey: 'clinical.lab.accession', href: '/app/lab/accessions/[id]', moduleKey: 'lab', permission: 'lab.manage', nav: false },
  { id: 'lab-tests', labelKey: 'clinical.lab.tests', href: '/app/lab/tests', moduleKey: 'lab', permission: 'lab.manage', nav: false },
  { id: 'lab-reports', labelKey: 'clinical.lab.reports', href: '/app/lab/reports', moduleKey: 'lab', permission: 'reports.view', nav: false },
  { id: 'nursing', labelKey: 'clinical.nursing.nav', href: '/app/nursing', moduleKey: 'nurse-station', permission: 'nursing.manage', nav: true },
  { id: 'nursing-encounter', labelKey: 'clinical.nursing.encounter', href: '/app/nursing/encounters/[id]', moduleKey: 'nurse-station', permission: 'nursing.manage', nav: false },
  { id: 'nursing-diet', labelKey: 'clinical.nursing.diet', href: '/app/nursing/diet', moduleKey: 'nurse-station', permission: 'nursing.manage', nav: false },
  { id: 'ot', labelKey: 'clinical.ot.nav', href: '/app/ot', moduleKey: 'ot-scheduling', permission: 'ot.manage', nav: true },
  { id: 'ot-new', labelKey: 'clinical.ot.new', href: '/app/ot/new', moduleKey: 'ot-scheduling', permission: 'ot.manage', nav: false },
  { id: 'radiology', labelKey: 'clinical.radiology.nav', href: '/app/radiology', moduleKey: 'radiology', permission: 'radiology.manage', nav: true },
  { id: 'radiology-new', labelKey: 'clinical.radiology.new', href: '/app/radiology/new', moduleKey: 'radiology', permission: 'radiology.manage', nav: false },
];

const ICONS: Record<string, ReactNode> = {
  patients: <UserRound size={18} aria-hidden strokeWidth={1.5} />,
  appointments: <CalendarClock size={18} aria-hidden strokeWidth={1.5} />,
  'opd-queue': <Stethoscope size={18} aria-hidden strokeWidth={1.5} />,
  clinic: <HeartPulse size={18} aria-hidden strokeWidth={1.5} />,
  adt: <BedDouble size={18} aria-hidden strokeWidth={1.5} />,
  billing: <Receipt size={18} aria-hidden strokeWidth={1.5} />,
  'ip-billing': <Wallet size={18} aria-hidden strokeWidth={1.5} />,
  pharmacy: <Pill size={18} aria-hidden strokeWidth={1.5} />,
  lab: <FlaskConical size={18} aria-hidden strokeWidth={1.5} />,
  nursing: <HeartPulse size={18} aria-hidden strokeWidth={1.5} />,
  ot: <Scissors size={18} aria-hidden strokeWidth={1.5} />,
  radiology: <ScanLine size={18} aria-hidden strokeWidth={1.5} />,
};

export function clinicalNavItems(opts: {
  modules: ModuleStateDto[];
  permissions?: readonly string[];
  activePath?: string;
  onNavigate?: (href: string) => void;
}): ShellNavItem[] {
  const enabled = new Set(opts.modules.filter((mod) => mod.access === 'enabled').map((mod) => mod.key));
  return CLINICAL_SCREENS.filter((screen) => screen.nav && enabled.has(screen.moduleKey))
    .filter((screen) => !opts.permissions || opts.permissions.includes(screen.permission))
    .map((screen) => ({
      id: screen.id,
      label: t(screen.labelKey),
      href: screen.href,
      icon: ICONS[screen.id],
      active: isNavActive(opts.activePath, screen.href),
      onClick: opts.onNavigate ? () => opts.onNavigate?.(screen.href) : undefined,
    }));
}
