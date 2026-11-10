// API contract types (DTOs) shared by the API, the web app and, later, the Android apps.
import type { BillingCycle, OrderStatus, PaymentMethod, PaymentStatus, TaxedLine, TaxTotals } from './billing';
import type { FeatureSource, FeatureType } from './catalog';
import type { ModuleCategory, ModuleKind, ModuleStatus } from './catalog/modules';
import type { EntitlementSource, ModuleAccess } from './entitlements';
import type { FacilityType } from './schemas';

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string>; details?: unknown };
}

// ---- Catalogue ------------------------------------------------------------------------------------------------------
export interface CatalogPlan {
  id: string;
  key: string;
  name: string;
  tagline: string;
  description: string;
  highlight: boolean;
  badge: string;
  sortOrder: number;
  status: 'active' | 'draft' | 'archived';
  monthlyPaise: number;
  annualPaise: number;
  pricePlaceholder: boolean;
  featureCount: number;
}

export interface CatalogFeature {
  id: string;
  key: string;
  moduleId: string;
  name: string;
  type: FeatureType;
  source: FeatureSource;
  sheetStatus: string | null;
  sortOrder: number;
}

export interface CatalogModule {
  id: string;
  key: string;
  code: string;
  docNo: number | null;
  name: string;
  docName: string;
  kind: ModuleKind;
  category: ModuleCategory;
  description: string;
  icon: string;
  phase: string;
  status: ModuleStatus;
  addonPurchasable: boolean;
  gstRateBp: number;
  sacCode: string;
  addonMonthlyPaise: number | null;
  addonAnnualPaise: number | null;
  pricePlaceholder: boolean;
  sortOrder: number;
  features: CatalogFeature[];
}

export interface CatalogBillingMeta {
  supplierStateCode: string;
  planGstRateBp: number;
  planSacCode: string;
}

export interface Catalog {
  plans: CatalogPlan[];
  modules: CatalogModule[];
  /** planId → feature ids included in that plan. */
  matrix: Record<string, string[]>;
  /** Populated when the catalogue is built with platform billing defaults. */
  billing?: CatalogBillingMeta;
}

export interface AdminMatrixDto {
  plans: CatalogPlan[];
  modules: CatalogModule[];
  features: CatalogFeature[];
  included: Record<string, string[]>;
}

export interface PrivacyNoticeDto {
  id: string;
  version: string;
  title: string;
  summary: string;
  body: string;
  purposes: { key: string; label: string; description: string; required: boolean }[];
  effectiveFrom: string;
}

// ---- Session --------------------------------------------------------------------------------------------------------
export interface LocationDto {
  id: string;
  name: string;
  code: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateCode: string;
  pincode: string;
  phone: string;
  isPrimary: boolean;
  departments: string[];
}

export interface ModuleStateDto {
  id: string;
  key: string;
  code: string;
  name: string;
  kind: ModuleKind;
  category: ModuleCategory;
  description: string;
  icon: string;
  phase: string;
  access: ModuleAccess;
  source: EntitlementSource | null;
  featureCount: number;
  entitledFeatureCount: number;
  addonPurchasable: boolean;
  addonMonthlyPaise: number | null;
  addonAnnualPaise: number | null;
  /** Lowest plan (by sort order) that includes at least one feature of this module. */
  lowestPlan: { id: string; name: string } | null;
}

export interface SubscriptionDto {
  id: string;
  planId: string;
  planKey: string;
  planName: string;
  cycle: BillingCycle;
  locationCount: number;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  creditPaise: number;
  addons: { moduleId: string; moduleKey: string; name: string; unitPaise: number }[];
}

export interface TenantSummaryDto {
  id: string;
  slug: string;
  status: 'onboarding' | 'active' | 'suspended';
  onboardingStep: OnboardingStep;
  facilityType: FacilityType | null;
  legalName: string;
  displayName: string;
  gstin: string;
  registrationNo: string;
  bedCount: number | null;
  specialities: string[];
  logoUrl: string | null;
  sandbox: boolean;
}

export interface TenantMe {
  kind: 'tenant';
  user: { id: string; name: string; email: string; mobile: string; designation: string | null; totpEnabled: boolean };
  tenant: TenantSummaryDto;
  locations: LocationDto[];
  currentLocationId: string | null;
  roles: { roleKey: string; roleName: string; locationId: string | null }[];
  permissions: string[];
  subscription: SubscriptionDto | null;
  modules: ModuleStateDto[];
  features: string[];
}

export interface PlatformMe {
  kind: 'platform';
  admin: { id: string; name: string; email: string; totpEnabled: boolean };
}

export type Me = TenantMe | PlatformMe;

// ---- Onboarding -----------------------------------------------------------------------------------------------------
export const ONBOARDING_STEPS = ['facility', 'locations', 'plan', 'addons', 'payment', 'invoice', 'provisioning', 'done'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingDraft {
  planId: string | null;
  cycle: BillingCycle;
  locationCount: number;
  addonModuleIds: string[];
}

export interface OnboardingState {
  step: OnboardingStep;
  tenant: TenantSummaryDto;
  locations: LocationDto[];
  draft: OnboardingDraft;
  /** Set once the onboarding order is paid. */
  invoiceId: string | null;
  paid: boolean;
}

export interface ProvisioningResult {
  steps: { key: string; label: string; detail: string }[];
  tenant: TenantSummaryDto;
}

// ---- Billing --------------------------------------------------------------------------------------------------------
export interface QuoteDto {
  purpose: 'onboarding' | 'change';
  config: { planId: string; planName: string; cycle: BillingCycle; locationCount: number; addonModuleIds: string[] };
  lines: TaxedLine[];
  totals: TaxTotals;
  supplierStateCode: string;
  placeOfSupplyStateCode: string;
  periodStart: string;
  periodEnd: string;
  change: {
    remainingDays: number;
    totalDays: number;
    netPaise: number;
    creditAppliedPaise: number;
    creditBalanceAfterPaise: number;
    /** True when nothing is payable: the change applies immediately without checkout. */
    noPayment: boolean;
  } | null;
}

export interface PaymentDto {
  id: string;
  status: PaymentStatus;
  method: PaymentMethod;
  methodLabel: string;
  amountPaise: number;
  failureReason: string | null;
  createdAt: string;
  capturedAt: string | null;
}

export interface OrderDto {
  id: string;
  purpose: 'onboarding' | 'change';
  status: OrderStatus;
  amountPaise: number;
  currency: 'INR';
  /** Mock gateway public key id, as a real gateway checkout would need. */
  keyId: string;
  createdAt: string;
  paidAt: string | null;
  invoiceId: string | null;
  payments: PaymentDto[];
  quote: QuoteDto;
}

export interface PayAttemptResult {
  order: OrderDto;
  payment: PaymentDto;
  /** Present when the mock gateway captured the payment: the client must send these to /billing/verify. */
  checkout: { orderId: string; paymentId: string; signature: string } | null;
}

export interface InvoiceParty {
  legalName: string;
  tradeName: string;
  gstin: string;
  address: string;
  stateCode: string;
  stateName: string;
}

export interface InvoiceDto {
  id: string;
  number: string;
  status: string;
  issueDate: string;
  supplier: InvoiceParty;
  customer: InvoiceParty;
  placeOfSupplyStateCode: string;
  interState: boolean;
  lines: {
    description: string;
    sacCode: string;
    quantity: number;
    unitPaise: number;
    amountPaise: number;
    gstRateBp: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
  }[];
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  amountInWords: string;
  periodStart: string | null;
  periodEnd: string | null;
  payment: { id: string; method: string; methodLabel: string; capturedAt: string | null } | null;
  notes: string;
}

export interface InvoiceListItem {
  id: string;
  number: string;
  issueDate: string;
  totalPaise: number;
  status: string;
  description: string;
}

// ---- Tenant ---------------------------------------------------------------------------------------------------------
export interface ChecklistItemDto {
  key: string;
  title: string;
  description: string;
  done: boolean;
  doneAt: string | null;
  /** Derived automatically from data (cannot be toggled by hand). */
  auto: boolean;
  href: string | null;
  optional: boolean;
}

export interface DashboardDto {
  checklist: ChecklistItemDto[];
  counts: { users: number; locations: number; doctors: number; departments: number };
  latestInvoice: InvoiceListItem | null;
  doctors: { id: string; name: string; qualification: string; speciality: string; locationId: string; isSample: boolean }[];
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  mobile: string;
  status: 'pending' | 'active' | 'disabled';
  designation: string | null;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: { roleKey: string; roleName: string; locationId: string | null }[];
}

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

export interface AuditEntryDto {
  id: string;
  seq: number;
  createdAt: string;
  actorType: string;
  actorLabel: string;
  action: string;
  entityType: string;
  entityId: string | null;
  locationId: string | null;
  ip: string | null;
  before: unknown;
  after: unknown;
  hash: string;
  tenantId: string | null;
}

export interface AuditVerifyDto {
  ok: boolean;
  entries: number;
  brokenAtSeq: number | null;
}

export interface DprDto {
  id: string;
  type: string;
  principalName: string;
  principalContact: string;
  reference: string;
  details: string;
  status: string;
  dueAt: string;
  resolutionNotes: string;
  createdAt: string;
  closedAt: string | null;
}

export interface ConsentDto {
  id: string;
  userName: string;
  noticeVersion: string;
  purposes: string[];
  grantedAt: string;
  withdrawnAt: string | null;
}

// ---- App Admin ------------------------------------------------------------------------------------------------------
export interface AdminOverviewDto {
  tenants: { total: number; active: number; onboarding: number; suspended: number };
  /** Normalised monthly recurring revenue across active subscriptions (pre-tax). */
  mrrPaise: number;
  invoicedPaise: number;
  planMix: { planId: string; planName: string; tenants: number }[];
  recentTenants: AdminTenantListItem[];
  catalogue: { modules: number; available: number; comingSoon: number; hidden: number; features: number };
}

export interface AdminTenantListItem {
  id: string;
  displayName: string;
  legalName: string;
  status: 'onboarding' | 'active' | 'suspended';
  facilityType: string | null;
  planName: string | null;
  cycle: BillingCycle | null;
  locationCount: number;
  userCount: number;
  createdAt: string;
  ownerEmail: string | null;
}

export interface OverrideDto {
  id: string;
  target: 'module' | 'feature';
  moduleId: string | null;
  featureId: string | null;
  label: string;
  effect: 'grant' | 'revoke';
  reason: string;
  createdAt: string;
}

export interface AdminTenantDetailDto {
  tenant: TenantSummaryDto & { createdAt: string; suspendedReason: string | null };
  locations: LocationDto[];
  users: UserDto[];
  subscription: SubscriptionDto | null;
  modules: ModuleStateDto[];
  invoices: InvoiceListItem[];
  payments: (PaymentDto & { orderId: string })[];
  overrides: OverrideDto[];
}

export interface PageDto<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** JSON form of `Entitlements` (sets and maps do not survive the wire). */
export interface EntitlementsDto {
  features: string[];
  modules: ModuleStateDto[];
}

export interface PlatformSettingsDto {
  supplierLegalName: string;
  supplierTradeName: string;
  supplierGstin: string;
  supplierStateCode: string;
  supplierAddress: string;
  defaultSacCode: string;
  defaultGstRateBp: number;
  invoicePrefix: string;
}
