import { CLINICAL_FEATURES } from '@hos/shared';
import type { FastifyRequest } from 'fastify';
import { ApiError } from './http';

/**
 * Baseline permission for shell routes any signed-in tenant user may call.
 * `requirePermission` treats this as already satisfied: `openTenant` has
 * rejected missing, pending and disabled users. Phase B module routes must
 * use a real permission from `PERMISSIONS` plus `module` / `feature`.
 */
export const AUTHENTICATED = 'authenticated';

/** A fixed key, or a route param such as `:moduleKey`. */
export type GuardKeySpec = string | { param: string };

/**
 * Declared on every tenant route. `openTenant` enforces the row and fails
 * closed when a tenant route has none, so a new handler cannot ship unguarded.
 * The route-inventory test compares this map to Fastify `printRoutes`.
 */
export interface TenantRouteGuard {
  /**
   * Null only for session identity (`/auth/me`) and session teardown (`/auth/logout`).
   * A string is one required permission (`authenticated` = any active tenant user).
   * An array means any one of those permissions is enough (`requireAnyPermission`).
   */
  permission: string | readonly string[] | null;
  /** One module, or any one of several (`requireAnyModule`). */
  module?: GuardKeySpec | readonly GuardKeySpec[];
  feature?: GuardKeySpec;
  /** Suspended hospitals may still read their own session and billing documents. */
  allowWhenSuspended?: boolean;
}

function entry(method: string, url: string, guard: TenantRouteGuard): [string, TenantRouteGuard] {
  return [`${method} ${url}`, guard];
}

const view = (method: string, url: string, permission: string, extra: Partial<TenantRouteGuard> = {}): [string, TenantRouteGuard] =>
  entry(method, url, { permission, ...extra });

const REG = '/api/v1/tenant/m/patient-registration';
const regFeature = CLINICAL_FEATURES.patientRegistration;

/** B1 routes. Print features depend on :kind and are enforced in the handler. */
function registrationGuards(): [string, TenantRouteGuard][] {
  return [
    entry('POST', `${REG}/patients`, {
      permission: 'patients.manage',
      module: 'patient-registration',
      feature: regFeature.newRegistration,
    }),
    entry('PATCH', `${REG}/patients/:id`, {
      permission: 'patients.manage',
      module: 'patient-registration',
      feature: regFeature.editRegistration,
    }),
    entry('POST', `${REG}/patients/:id/photo`, {
      permission: 'patients.manage',
      module: 'patient-registration',
    }),
    entry('GET', `${REG}/patients/:id/documents`, {
      permission: ['patients.view', 'patients.manage'],
      module: 'patient-registration',
      feature: regFeature.attachPatientDocuments,
    }),
    entry('POST', `${REG}/patients/:id/documents`, {
      permission: 'patients.manage',
      module: 'patient-registration',
      feature: regFeature.attachPatientDocuments,
    }),
    entry('DELETE', `${REG}/patients/:id/documents/:docId`, {
      permission: 'patients.manage',
      module: 'patient-registration',
      feature: regFeature.attachPatientDocuments,
    }),
    entry('GET', `${REG}/patients/:id/documents/:docId/file`, {
      permission: ['patients.view', 'patients.manage'],
      module: 'patient-registration',
      feature: regFeature.attachPatientDocuments,
    }),
    entry('GET', `${REG}/patients/:id/print/:kind/:format`, {
      permission: ['patients.view', 'patients.manage'],
      module: 'patient-registration',
    }),
    entry('GET', `${REG}/reports/register`, {
      permission: 'reports.view',
      module: 'patient-registration',
      feature: regFeature.printRegister,
    }),
    entry('GET', `${REG}/reports/register.csv`, {
      permission: 'reports.view',
      module: 'patient-registration',
      feature: regFeature.patientExcelData,
    }),
    entry('POST', `${REG}/patients/:id/mailer`, {
      permission: 'patients.manage',
      module: 'patient-registration',
      feature: regFeature.sendMailers,
    }),
    entry('GET', `${REG}/mlc`, {
      permission: 'patients.manage',
      module: 'patient-registration',
      feature: regFeature.mlcCaseRegister,
    }),
    entry('POST', `${REG}/mlc`, {
      permission: 'patients.manage',
      module: 'patient-registration',
      feature: regFeature.mlcRegistration,
    }),
    entry('GET', `${REG}/reports/mlc`, {
      permission: 'reports.view',
      module: 'patient-registration',
      feature: regFeature.mlcCaseRegister,
    }),
  ];
}

const OPD_DOC = '/api/v1/tenant/m/opd-visit/doctor';
const CPOE = '/api/v1/tenant/m/cpoe';
const opdFeat = CLINICAL_FEATURES.opdVisit;
const cpoeFeat = CLINICAL_FEATURES.cpoe;

/** B3 doctor workspace routes. */
function doctorGuards(): [string, TenantRouteGuard][] {
  return [
    entry('GET', `${OPD_DOC}/my-queue`, {
      permission: 'clinical.view',
      module: 'opd-visit',
      feature: opdFeat.visitRegistration,
    }),
    entry('GET', `${OPD_DOC}/encounters/:id/case-paper`, {
      permission: 'clinical.view',
      module: 'opd-visit',
      feature: opdFeat.visitRegistration,
    }),
    entry('PUT', `${OPD_DOC}/encounters/:id/case-paper`, {
      permission: 'clinical.order',
      module: 'opd-visit',
      feature: opdFeat.visitRegistration,
    }),
    entry('POST', `${OPD_DOC}/encounters/:id/prescription`, {
      permission: 'clinical.order',
      module: 'opd-visit',
      feature: opdFeat.visitRegistration,
    }),
    entry('GET', `${OPD_DOC}/encounters/:id/print/:kind/:format`, {
      permission: 'clinical.view',
      module: 'opd-visit',
    }),
    entry('GET', `${CPOE}/inpatients`, {
      permission: 'clinical.view',
      module: 'cpoe',
    }),
    entry('POST', `${CPOE}/encounters/:id/orders/diagnostic`, {
      permission: 'clinical.order',
      module: ['cpoe', 'lab'],
      feature: cpoeFeat.diagnosticOrders,
    }),
    entry('POST', `${CPOE}/encounters/:id/orders/procedure`, {
      permission: 'clinical.order',
      module: 'cpoe',
      feature: cpoeFeat.procedureOrders,
    }),
    entry('GET', `${CPOE}/order-sets`, {
      permission: 'clinical.view',
      module: 'cpoe',
      feature: cpoeFeat.diagnosticOrders,
    }),
    entry('POST', `${CPOE}/order-sets`, {
      permission: 'clinical.order',
      module: 'cpoe',
      feature: cpoeFeat.diagnosticOrders,
    }),
    entry('POST', `${CPOE}/encounters/:id/admission-request`, {
      permission: 'clinical.order',
      module: 'cpoe',
      feature: cpoeFeat.requestAdmission,
    }),
    entry('GET', `${CPOE}/encounters/:id/vitals-graph`, {
      permission: 'clinical.view',
      module: 'cpoe',
      feature: cpoeFeat.vitalsTable,
    }),
    entry('GET', `${CPOE}/encounters/:id/print/:kind/:format`, {
      permission: 'clinical.view',
      module: ['opd-visit', 'cpoe'],
    }),
  ];
}

const ENTRIES: [string, TenantRouteGuard][] = [
  entry('GET', '/api/v1/auth/me', { permission: null, allowWhenSuspended: true }),
  entry('POST', '/api/v1/auth/logout', { permission: null, allowWhenSuspended: true }),
  entry('POST', '/api/v1/auth/switch-location', { permission: AUTHENTICATED }),
  entry('POST', '/api/v1/auth/totp/setup', { permission: AUTHENTICATED }),
  entry('POST', '/api/v1/auth/totp/enable', { permission: AUTHENTICATED }),

  view('GET', '/api/v1/onboarding', 'tenant.manage'),
  view('GET', '/api/v1/onboarding/quote', 'tenant.manage'),
  view('PUT', '/api/v1/onboarding/facility', 'tenant.manage'),
  view('POST', '/api/v1/onboarding/logo', 'tenant.manage'),
  view('GET', '/api/v1/onboarding/logo', 'tenant.manage'),
  view('PUT', '/api/v1/onboarding/locations', 'tenant.manage'),
  view('PUT', '/api/v1/onboarding/plan', 'tenant.manage'),
  view('PUT', '/api/v1/onboarding/addons', 'tenant.manage'),
  view('POST', '/api/v1/onboarding/provision', 'tenant.manage'),

  view('POST', '/api/v1/billing/orders', 'billing.manage'),
  view('POST', '/api/v1/billing/orders/:orderId/pay', 'billing.manage'),
  view('POST', '/api/v1/billing/verify', 'billing.manage'),
  view('GET', '/api/v1/billing/subscription', 'billing.view', { allowWhenSuspended: true }),
  view('POST', '/api/v1/billing/change-quote', 'billing.manage'),
  view('POST', '/api/v1/billing/change-apply', 'billing.manage'),
  view('GET', '/api/v1/billing/invoices', 'billing.view', { allowWhenSuspended: true }),
  view('GET', '/api/v1/billing/invoices/:id', 'billing.view', { allowWhenSuspended: true }),
  view('GET', '/api/v1/billing/invoices/:id/pdf', 'billing.view', { allowWhenSuspended: true }),
  view('GET', '/api/v1/billing/invoices/:id/html', 'billing.view', { allowWhenSuspended: true }),

  view('GET', '/api/v1/tenant/dashboard', AUTHENTICATED),
  view('GET', '/api/v1/tenant/entitlements', AUTHENTICATED),
  view('GET', '/api/v1/tenant/locations', AUTHENTICATED),
  view('GET', '/api/v1/tenant/roles', 'users.view'),
  view('GET', '/api/v1/tenant/users', 'users.view'),
  view('POST', '/api/v1/tenant/users/invite', 'users.manage'),
  view('PATCH', '/api/v1/tenant/users/:id', 'users.manage'),
  view('PATCH', '/api/v1/tenant/checklist/:key', 'tenant.manage'),
  view('GET', '/api/v1/tenant/audit', 'audit.view'),
  view('GET', '/api/v1/tenant/audit/verify', 'audit.view'),
  view('GET', '/api/v1/tenant/privacy/requests', 'privacy.manage'),
  view('POST', '/api/v1/tenant/privacy/requests', 'privacy.manage'),
  view('PATCH', '/api/v1/tenant/privacy/requests/:id', 'privacy.manage'),
  view('GET', '/api/v1/tenant/consents', 'privacy.manage'),
  entry('GET', '/api/v1/tenant/m/:moduleKey', { permission: AUTHENTICATED, module: { param: 'moduleKey' } }),
  entry('GET', '/api/v1/tenant/m/:moduleKey/features/:featureKey', {
    permission: AUTHENTICATED,
    module: { param: 'moduleKey' },
    feature: { param: 'featureKey' },
  }),

  // B0 clinical routes. Arrays match the handler's requireAnyPermission / requireAnyModule.
  // Kind-specific order gates stay in the handler; the row is the union that can succeed.
  entry('GET', '/api/v1/tenant/clinical/patients', {
    permission: ['patients.view', 'patients.manage'],
    module: 'patient-registration',
  }),
  entry('GET', '/api/v1/tenant/clinical/patients/:id', {
    permission: ['patients.view', 'patients.manage'],
    module: 'patient-registration',
  }),
  entry('GET', '/api/v1/tenant/clinical/patients/:id/alerts', {
    permission: ['clinical.view', 'clinical.order', 'patients.manage', 'patients.view'],
    module: 'patient-registration',
  }),
  entry('POST', '/api/v1/tenant/clinical/patients/:id/alerts', {
    permission: ['clinical.order', 'patients.manage'],
    module: 'patient-registration',
  }),
  entry('GET', '/api/v1/tenant/clinical/encounters', {
    permission: ['clinical.view', 'opd.manage', 'adt.manage'],
    module: ['opd-visit', 'adt'],
  }),
  entry('GET', '/api/v1/tenant/clinical/encounters/:id', {
    permission: ['clinical.view', 'opd.manage', 'adt.manage'],
    module: ['opd-visit', 'adt'],
  }),
  entry('GET', '/api/v1/tenant/clinical/encounters/:id/orders', {
    permission: ['clinical.view', 'clinical.order', 'opd.manage', 'nursing.manage', 'adt.manage'],
    module: ['opd-visit', 'cpoe', 'lab', 'nurse-station', 'adt'],
  }),
  entry('POST', '/api/v1/tenant/clinical/encounters/:id/orders', {
    permission: ['clinical.order', 'opd.manage', 'nursing.manage'],
    module: ['lab', 'opd-visit', 'cpoe', 'nurse-station', 'adt'],
  }),
  entry('POST', '/api/v1/tenant/clinical/orders/:id/cancel', {
    permission: ['clinical.order', 'opd.manage', 'nursing.manage'],
    module: ['lab', 'opd-visit', 'cpoe', 'nurse-station', 'adt'],
  }),
  entry('GET', '/api/v1/tenant/clinical/encounters/:id/vitals', {
    permission: ['clinical.order', 'nursing.manage', 'opd.manage', 'clinical.view'],
    module: ['opd-visit', 'nurse-station', 'cpoe'],
  }),
  entry('POST', '/api/v1/tenant/clinical/encounters/:id/vitals', {
    permission: ['clinical.order', 'nursing.manage', 'opd.manage'],
    module: ['opd-visit', 'nurse-station', 'cpoe'],
  }),
  entry('POST', '/api/v1/tenant/clinical/vitals/:id/entered-in-error', {
    permission: ['clinical.order', 'nursing.manage', 'opd.manage'],
    module: ['opd-visit', 'nurse-station', 'cpoe'],
  }),
  entry('GET', '/api/v1/tenant/clinical/encounters/:id/notes', {
    permission: ['clinical.view', 'clinical.order', 'nursing.manage'],
    module: ['opd-visit', 'cpoe', 'nurse-station'],
  }),
  entry('POST', '/api/v1/tenant/clinical/encounters/:id/notes', {
    permission: ['clinical.order', 'nursing.manage'],
    module: ['opd-visit', 'cpoe', 'nurse-station'],
  }),
  entry('GET', '/api/v1/tenant/clinical/encounters/:id/charges', {
    permission: ['billing.op.post', 'billing.ip.manage'],
    module: 'op-billing',
  }),
  entry('GET', '/api/v1/tenant/clinical/codes', { permission: AUTHENTICATED }),
  entry('GET', '/api/v1/tenant/clinical/doctors', { permission: AUTHENTICATED }),
  entry('GET', '/api/v1/tenant/clinical/services', { permission: AUTHENTICATED }),

  // B1. Permission, module and feature match each handler. Photo has no feature gate.
  ...registrationGuards(),
  ...doctorGuards(),

  // B7 pharmacy. Feature checks that depend on the body or the report key stay in the handler.
  entry('GET', '/api/v1/tenant/m/pharmacy/items', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/items', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('PATCH', '/api/v1/tenant/m/pharmacy/items/:id', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('GET', '/api/v1/tenant/m/pharmacy/suppliers', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/suppliers', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('PATCH', '/api/v1/tenant/m/pharmacy/suppliers/:id', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/grns', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.material-receipts' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/supplier-returns', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.material-returns' }),
  entry('GET', '/api/v1/tenant/m/pharmacy/stock', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.stock-register-summary-details' }),
  entry('GET', '/api/v1/tenant/m/pharmacy/prescriptions/open', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.issue-to-op-patients' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/sales', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('GET', '/api/v1/tenant/m/pharmacy/sales/:id', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/sales/:id/return', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('GET', '/api/v1/tenant/m/pharmacy/sales/:id/print', { permission: 'pharmacy.manage', module: 'pharmacy' }),
  entry('GET', '/api/v1/tenant/m/pharmacy/inpatients', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.issue-to-ip-patients-returns' }),
  entry('GET', '/api/v1/tenant/m/pharmacy/ip-issues', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.issue-to-ip-patients-returns' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/ip-issues', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.issue-to-ip-patients-returns' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/ip-issues/:id/return', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.issue-to-ip-patients-returns' }),
  entry('POST', '/api/v1/tenant/m/pharmacy/adjustments', { permission: 'pharmacy.manage', module: 'pharmacy', feature: 'pharmacy.stock-adjustments' }),
  entry('GET', '/api/v1/tenant/m/pharmacy/reports/:report', {
    permission: ['pharmacy.manage', 'reports.view'],
    module: 'pharmacy',
  }),
  // B2 appointments and OPD. Feature is set when the handler requires that one key.
  // Routes that accept any of several features keep the check in the handler.
  entry('GET', '/api/v1/tenant/m/appointments/schedules/:doctorId', {
    permission: 'appointments.manage',
    module: 'appointments',
  }),
  entry('PUT', '/api/v1/tenant/m/appointments/schedules/:doctorId', {
    permission: 'appointments.manage',
    module: 'appointments',
    feature: CLINICAL_FEATURES.appointments.takeAppointment,
  }),
  entry('GET', '/api/v1/tenant/m/appointments/slots', {
    permission: 'appointments.manage',
    module: 'appointments',
  }),
  entry('GET', '/api/v1/tenant/m/appointments/diary', {
    permission: 'appointments.manage',
    module: 'appointments',
    feature: CLINICAL_FEATURES.appointments.diary,
  }),
  entry('GET', '/api/v1/tenant/m/appointments/appointments/:id', {
    permission: ['appointments.manage', 'opd.manage'],
    module: 'appointments',
  }),
  entry('POST', '/api/v1/tenant/m/appointments/appointments', {
    permission: 'appointments.manage',
    module: 'appointments',
    feature: CLINICAL_FEATURES.appointments.takeAppointment,
  }),
  entry('POST', '/api/v1/tenant/m/appointments/appointments/:id/reschedule', {
    permission: 'appointments.manage',
    module: 'appointments',
    feature: CLINICAL_FEATURES.appointments.cancelReschedule,
  }),
  entry('POST', '/api/v1/tenant/m/appointments/appointments/:id/cancel', {
    permission: 'appointments.manage',
    module: 'appointments',
    feature: CLINICAL_FEATURES.appointments.cancelReschedule,
  }),
  entry('POST', '/api/v1/tenant/m/opd-visit/visits', {
    permission: 'opd.manage',
    module: 'opd-visit',
    feature: CLINICAL_FEATURES.opdVisit.visitRegistration,
  }),
  entry('GET', '/api/v1/tenant/m/opd-visit/queue', {
    permission: 'opd.manage',
    module: 'opd-visit',
    feature: CLINICAL_FEATURES.opdVisit.visitRegistration,
  }),
  entry('POST', '/api/v1/tenant/m/opd-visit/visits/:id/status', {
    permission: 'opd.manage',
    module: 'opd-visit',
    feature: CLINICAL_FEATURES.opdVisit.visitRegistration,
  }),
  entry('GET', '/api/v1/tenant/m/opd-visit/reports/visit-register', {
    permission: ['opd.manage', 'reports.view'],
    module: 'opd-visit',
    feature: CLINICAL_FEATURES.opdVisit.visitRegister,
  }),
  entry('GET', '/api/v1/tenant/m/opd-visit/reports/visit-detail-by-doctor', {
    permission: ['opd.manage', 'reports.view'],
    module: 'opd-visit',
    feature: CLINICAL_FEATURES.opdVisit.visitDetailByDoctor,
  }),
  entry('GET', '/api/v1/tenant/m/opd-visit/reports/visit-statistics', {
    permission: ['opd.manage', 'reports.view'],
    module: 'opd-visit',
    feature: CLINICAL_FEATURES.opdVisit.visitStatistics,
  }),

  // B4 ADT. Stickers and the discharge summary share one print URL; the handler picks the feature.
  entry('GET', '/api/v1/tenant/m/adt/wards', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admission,
  }),
  entry('POST', '/api/v1/tenant/m/adt/wards', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admission,
  }),
  entry('PATCH', '/api/v1/tenant/m/adt/wards/:id', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admission,
  }),
  entry('GET', '/api/v1/tenant/m/adt/rooms', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admission,
  }),
  entry('POST', '/api/v1/tenant/m/adt/rooms', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admission,
  }),
  entry('PATCH', '/api/v1/tenant/m/adt/rooms/:id', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admission,
  }),
  entry('GET', '/api/v1/tenant/m/adt/beds', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admission,
  }),
  entry('POST', '/api/v1/tenant/m/adt/beds', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admission,
  }),
  entry('PATCH', '/api/v1/tenant/m/adt/beds/:id', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admission,
  }),
  entry('GET', '/api/v1/tenant/m/adt/bed-board', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admission,
  }),
  entry('GET', '/api/v1/tenant/m/adt/admissions', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admission,
  }),
  entry('POST', '/api/v1/tenant/m/adt/admissions', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admission,
  }),
  entry('GET', '/api/v1/tenant/m/adt/admissions/:id', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admission,
  }),
  entry('POST', '/api/v1/tenant/m/adt/admissions/:id/transfer', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.transfer,
  }),
  entry('POST', '/api/v1/tenant/m/adt/admissions/:id/discharge', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.discharge,
  }),
  entry('GET', '/api/v1/tenant/m/adt/admissions/:id/summary', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.dischargeSummary,
  }),
  entry('PUT', '/api/v1/tenant/m/adt/admissions/:id/summary', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.dischargeSummary,
  }),
  entry('POST', '/api/v1/tenant/m/adt/admissions/:id/summary/finalise', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.dischargeSummary,
  }),
  entry('POST', '/api/v1/tenant/m/adt/bed-charges/post', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admission,
  }),
  entry('GET', '/api/v1/tenant/m/adt/admission-requests', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admission,
  }),
  entry('POST', '/api/v1/tenant/m/adt/admission-requests', {
    permission: 'adt.manage',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admission,
  }),
  entry('GET', '/api/v1/tenant/m/adt/admissions/:id/print/:kind/:format', {
    permission: 'adt.manage',
    module: 'adt',
  }),
  entry('GET', '/api/v1/tenant/m/adt/reports/admissions', {
    permission: 'reports.view',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.admissionRegister,
  }),
  entry('GET', '/api/v1/tenant/m/adt/reports/transfers', {
    permission: 'reports.view',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.transferRegister,
  }),
  entry('GET', '/api/v1/tenant/m/adt/reports/discharges', {
    permission: 'reports.view',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.dischargeRegister,
  }),
  entry('GET', '/api/v1/tenant/m/adt/reports/discharge-summaries', {
    permission: 'reports.view',
    module: 'adt',
    feature: CLINICAL_FEATURES.adt.dischargeSummaryReport,
  }),
];

const keys = ENTRIES.map(([key]) => key);
if (new Set(keys).size !== keys.length) {
  throw new Error('Duplicate tenant route guard');
}

export const TENANT_GUARDS: Readonly<Record<string, TenantRouteGuard>> = Object.fromEntries(ENTRIES);

const TENANT_AUTH = new Set([
  '/api/v1/auth/me',
  '/api/v1/auth/logout',
  '/api/v1/auth/switch-location',
  '/api/v1/auth/totp/setup',
  '/api/v1/auth/totp/enable',
]);

/** True for routes that serve a hospital session (not the public catalogue or App Admin). */
export function isTenantSurface(method: string, url: string): boolean {
  const verb = method.toUpperCase();
  if (verb === 'HEAD' || verb === 'OPTIONS') return false;
  if (url.startsWith('/api/v1/tenant/') || url === '/api/v1/tenant') return true;
  if (url.startsWith('/api/v1/billing/webhooks/')) return false;
  if (url.startsWith('/api/v1/billing/')) return true;
  if (url === '/api/v1/onboarding' || url.startsWith('/api/v1/onboarding/')) return true;
  return TENANT_AUTH.has(url);
}

export function lookupTenantGuard(method: string, url: string): TenantRouteGuard | undefined {
  const verb = method.toUpperCase();
  return TENANT_GUARDS[`${verb} ${url}`] ?? (verb === 'HEAD' ? TENANT_GUARDS[`GET ${url}`] : undefined);
}

export function resolveGuardKey(spec: GuardKeySpec, req: FastifyRequest): string {
  if (typeof spec === 'string') return spec;
  const params = req.params as Record<string, unknown>;
  const value = params[spec.param];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ApiError(400, 'validation', 'Missing route parameter');
  }
  return value;
}

export interface PrintedRoute {
  method: string;
  url: string;
}

/**
 * Split Fastify `printRoutes` output into method + full URL pairs.
 * The radix tree prints one fragment per line; a child continues its parent
 * (`/test` + `ing` → `/testing`, `/test` + `/hello` → `/test/hello`).
 */
export function parsePrintedRoutes(printed: string): PrintedRoute[] {
  const out: PrintedRoute[] = [];
  const stack: string[] = [];
  for (const raw of printed.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const marker = Math.max(raw.indexOf('├'), raw.indexOf('└'));
    if (marker < 0) continue;
    const depth = Math.floor(marker / 4);
    const content = raw.slice(marker).replace(/^[├└]──\s+/, '');
    const parsed = /^(\S+)(?:\s+\(([^)]+)\))?/.exec(content);
    if (!parsed?.[1]) continue;
    const segment = parsed[1].startsWith('(empty') ? '' : parsed[1];
    stack.length = depth;
    const parent = depth > 0 ? (stack[depth - 1] ?? '') : '';
    const url = `${parent}${segment}`;
    stack[depth] = url;
    if (!parsed[2] || !url.startsWith('/')) continue;
    for (const part of parsed[2].split(',')) {
      const method = part.trim().toUpperCase();
      if (!method) continue;
      out.push({ method, url });
    }
  }
  return out;
}
