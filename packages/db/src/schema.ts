// Drizzle schema. Tables are created from this file (drizzle-kit generate → migrations/0000_*.sql);
// row-level security, triggers, grants and the audit hash chain are hand-written in migrations/0001_rls.sql.
//
// Conventions
// - Tenant-owned tables carry `tenant_id` and are protected by RLS (`tenants` is keyed on its own `id`).
// - Children reference parents by composite (tenant_id, parent_id) so a tenant cannot point at another tenant's row.
// - Platform tables (catalogue, plans, prices…) are readable by everyone and writable only in platform scope.
// - Money is integer paise; GST rates are basis points (1800 = 18%).
// - `updated_at` defaults to now() on insert; a trigger in 0001_rls.sql bumps it on update.
// - audit_log chain columns are placeholders; the chain trigger overwrites them.
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const paise = (name: string) => bigint(name, { mode: 'number' });

// =====================================================================================================================
// Platform
// =====================================================================================================================

export const platformAdmins = pgTable(
  'platform_admins',
  {
    id: id(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    totpSecret: text('totp_secret'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    status: text('status').notNull().default('active'),
    lastLoginAt: ts('last_login_at'),
    createdAt: createdAt(),
  },
  () => [check('platform_admins_status_chk', sql`status in ('active', 'disabled')`)],
);

/** Singleton row (id = 1): supplier details printed on subscription tax invoices. */
export const platformSettings = pgTable(
  'platform_settings',
  {
    id: integer('id').primaryKey().default(1),
    supplierLegalName: text('supplier_legal_name').notNull(),
    supplierTradeName: text('supplier_trade_name').notNull(),
    supplierGstin: text('supplier_gstin').notNull(),
    supplierStateCode: text('supplier_state_code').notNull(),
    supplierAddress: text('supplier_address').notNull(),
    defaultSacCode: text('default_sac_code').notNull(),
    defaultGstRateBp: integer('default_gst_rate_bp').notNull().default(1800),
    invoicePrefix: text('invoice_prefix').notNull().default('HOS'),
    /** When true, and NODE_ENV is not production, pay attempts honour a client outcome. */
    mockPaymentSimulator: boolean('mock_payment_simulator').notNull().default(false),
    updatedAt: updatedAt(),
  },
  () => [
    check('platform_settings_singleton_chk', sql`id = 1`),
    check('platform_settings_prefix_chk', sql`invoice_prefix ~ '^[A-Z0-9]{2,4}$'`),
  ],
);

export const plans = pgTable(
  'plans',
  {
    id: id(),
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    tagline: text('tagline').notNull().default(''),
    description: text('description').notNull().default(''),
    highlight: boolean('highlight').notNull().default(false),
    badge: text('badge').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [check('plans_status_chk', sql`status in ('active', 'draft', 'archived')`)],
);

export const modules = pgTable(
  'modules',
  {
    id: id(),
    key: text('key').notNull().unique(),
    code: text('code').notNull(),
    docNo: integer('doc_no'),
    name: text('name').notNull(),
    docName: text('doc_name').notNull(),
    kind: text('kind').notNull(),
    category: text('category').notNull(),
    description: text('description').notNull().default(''),
    icon: text('icon').notNull().default('Box'),
    phase: text('phase').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status').notNull().default('coming_soon'),
    addonPurchasable: boolean('addon_purchasable').notNull().default(false),
    gstRateBp: integer('gst_rate_bp').notNull().default(1800),
    sacCode: text('sac_code').notNull().default(''),
    updatedAt: updatedAt(),
  },
  () => [
    check('modules_kind_chk', sql`kind in ('hmis', 'android')`),
    check('modules_status_chk', sql`status in ('available', 'coming_soon', 'hidden')`),
    check(
      'modules_category_chk',
      sql`category in ('front_office', 'inpatient', 'clinical', 'finance', 'inventory', 'back_office', 'platform', 'mobile')`,
    ),
  ],
);

export const moduleFeatures = pgTable(
  'module_features',
  {
    id: id(),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id),
    /** Entitlement key, e.g. `op-billing.accept-deposit`. */
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    sourceName: text('source_name').notNull(),
    type: text('type').notNull(),
    source: text('source').notNull(),
    sheetModule: text('sheet_module'),
    sheetStatus: text('sheet_status'),
    sheetRow: integer('sheet_row'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('module_features_module_idx').on(t.moduleId),
    check('module_features_type_chk', sql`type in ('function', 'report', 'interface', 'app_feature')`),
    check('module_features_source_chk', sql`source in ('sheet', 'doc', 'platform', 'admin')`),
  ],
);

export const planModuleFeatures = pgTable(
  'plan_module_features',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    featureId: uuid('feature_id')
      .notNull()
      .references(() => moduleFeatures.id),
  },
  (t) => [primaryKey({ columns: [t.planId, t.featureId] })],
);

export const prices = pgTable(
  'prices',
  {
    id: id(),
    targetType: text('target_type').notNull(),
    /** plans.id or modules.id depending on target_type. */
    targetId: uuid('target_id').notNull(),
    billingCycle: text('billing_cycle').notNull(),
    amountPaise: paise('amount_paise').notNull(),
    per: text('per').notNull().default('location'),
    currency: text('currency').notNull().default('INR'),
    /** True until the App Admin sets a real price. */
    isPlaceholder: boolean('is_placeholder').notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('prices_target_cycle_uq').on(t.targetType, t.targetId, t.billingCycle),
    check('prices_target_type_chk', sql`target_type in ('plan', 'module_addon')`),
    check('prices_cycle_chk', sql`billing_cycle in ('monthly', 'annual')`),
    check('prices_per_chk', sql`per = 'location'`),
    check('prices_currency_chk', sql`currency = 'INR'`),
    check('prices_amount_chk', sql`amount_paise >= 0`),
  ],
);

export const privacyNotices = pgTable('privacy_notices', {
  id: id(),
  version: text('version').notNull().unique(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  body: text('body').notNull(),
  purposes: jsonb('purposes').$type<{ key: string; label: string; description: string; required: boolean }[]>().notNull(),
  effectiveFrom: date('effective_from').notNull(),
  isCurrent: boolean('is_current').notNull().default(false),
  createdAt: createdAt(),
});

export const permissions = pgTable('permissions', {
  key: text('key').primaryKey(),
  description: text('description').notNull(),
});

/** System roles have tenant_id NULL; tenant-defined roles carry the tenant id. */
export const roles = pgTable(
  'roles',
  {
    id: id(),
    tenantId: uuid('tenant_id'),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    isSystem: boolean('is_system').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [unique('roles_tenant_key_uq').on(t.tenantId, t.key).nullsNotDistinct()],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    permissionKey: text('permission_key')
      .notNull()
      .references(() => permissions.key),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionKey] })],
);

/** Supplier invoice number series, one counter per financial year (GST rule 46). No grants to hos_app. */
export const invoiceSequences = pgTable('invoice_sequences', {
  fy: text('fy').primaryKey(),
  lastNo: integer('last_no').notNull().default(0),
});

// =====================================================================================================================
// Tenant-owned (RLS)
// =====================================================================================================================

export const tenants = pgTable(
  'tenants',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    status: text('status').notNull().default('onboarding'),
    onboardingStep: text('onboarding_step').notNull().default('facility'),
    onboardingDraft: jsonb('onboarding_draft')
      .$type<{ planId: string | null; cycle: 'monthly' | 'annual'; locationCount: number; addonModuleIds: string[] }>()
      .notNull()
      .default({ planId: null, cycle: 'monthly', locationCount: 1, addonModuleIds: [] }),
    onboardingCompletedAt: ts('onboarding_completed_at'),
    facilityType: text('facility_type'),
    legalName: text('legal_name').notNull().default(''),
    displayName: text('display_name').notNull().default(''),
    gstin: text('gstin').notNull().default(''),
    registrationNo: text('registration_no').notNull().default(''),
    bedCount: integer('bed_count'),
    specialities: jsonb('specialities').$type<string[]>().notNull().default([]),
    logoPath: text('logo_path'),
    /** Sandbox = sample data only; flipped at go-live by the platform. */
    sandbox: boolean('sandbox').notNull().default(true),
    suspendedAt: ts('suspended_at'),
    suspendedReason: text('suspended_reason'),
    /** Status to restore on reactivate. Null for hospitals that were never suspended. */
    statusBeforeSuspend: text('status_before_suspend'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [
    check('tenants_status_chk', sql`status in ('onboarding', 'active', 'suspended')`),
    check('tenants_status_before_chk', sql`status_before_suspend is null or status_before_suspend in ('onboarding', 'active')`),
    check(
      'tenants_step_chk',
      sql`onboarding_step in ('facility', 'locations', 'plan', 'addons', 'payment', 'invoice', 'provisioning', 'done')`,
    ),
    check('tenants_facility_chk', sql`facility_type is null or facility_type in ('nursing_home', 'clinic', 'hospital')`),
  ],
);

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id);

export const locations = pgTable(
  'locations',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    addressLine1: text('address_line1').notNull().default(''),
    addressLine2: text('address_line2').notNull().default(''),
    city: text('city').notNull().default(''),
    /** GST state code; drives CGST+SGST vs IGST. */
    stateCode: text('state_code').notNull(),
    pincode: text('pincode').notNull().default(''),
    phone: text('phone').notNull().default(''),
    isPrimary: boolean('is_primary').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique('locations_tenant_code_uq').on(t.tenantId, t.code),
    unique('locations_tenant_id_uq').on(t.tenantId, t.id),
    uniqueIndex('locations_one_primary_uq').on(t.tenantId).where(sql`${t.isPrimary} = true`),
    index('locations_tenant_idx').on(t.tenantId),
  ],
);

export const departments = pgTable(
  'departments',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('departments_tenant_idx').on(t.tenantId, t.locationId),
    foreignKey({
      columns: [t.tenantId, t.locationId],
      foreignColumns: [locations.tenantId, locations.id],
      name: 'departments_location_fk',
    }).onDelete('cascade'),
  ],
);

export const doctors = pgTable(
  'doctors',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: uuid('location_id').notNull(),
    name: text('name').notNull(),
    qualification: text('qualification').notNull().default(''),
    speciality: text('speciality').notNull().default(''),
    /** Seeded sample master — obviously fictional, removable at go-live. */
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('doctors_tenant_idx').on(t.tenantId, t.locationId),
    foreignKey({
      columns: [t.tenantId, t.locationId],
      foreignColumns: [locations.tenantId, locations.id],
      name: 'doctors_location_fk',
    }).onDelete('cascade'),
  ],
);

export const users = pgTable(
  'users',
  {
    id: id(),
    tenantId: tenantId(),
    /** Globally unique, case-insensitive: one login identifies one hospital account. */
    email: text('email').notNull(),
    mobile: text('mobile').notNull().default(''),
    name: text('name').notNull(),
    passwordHash: text('password_hash'),
    status: text('status').notNull().default('pending'),
    designation: text('designation'),
    mobileVerifiedAt: ts('mobile_verified_at'),
    totpSecret: text('totp_secret'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    lastLoginAt: ts('last_login_at'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('users_tenant_id_uq').on(t.tenantId, t.id),
    uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
    index('users_tenant_idx').on(t.tenantId),
    check('users_status_chk', sql`status in ('pending', 'active', 'disabled')`),
    check('users_designation_chk', sql`designation is null or designation in ('owner', 'manager')`),
  ],
);

export const userLocationRoles = pgTable(
  'user_location_roles',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    /** NULL = the role applies at every location. */
    locationId: uuid('location_id'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('user_location_roles_uq').on(t.userId, t.roleId, t.locationId).nullsNotDistinct(),
    index('user_location_roles_tenant_idx').on(t.tenantId, t.userId),
    foreignKey({
      columns: [t.tenantId, t.userId],
      foreignColumns: [users.tenantId, users.id],
      name: 'user_location_roles_user_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.tenantId, t.locationId],
      foreignColumns: [locations.tenantId, locations.id],
      name: 'user_location_roles_location_fk',
    }).onDelete('cascade'),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    status: text('status').notNull().default('pending'),
    invitedBy: uuid('invited_by'),
    expiresAt: ts('expires_at').notNull(),
    acceptedAt: ts('accepted_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('invitations_tenant_idx').on(t.tenantId),
    foreignKey({
      columns: [t.tenantId, t.userId],
      foreignColumns: [users.tenantId, users.id],
      name: 'invitations_user_fk',
    }).onDelete('cascade'),
    check('invitations_status_chk', sql`status in ('pending', 'accepted', 'revoked')`),
  ],
);

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull(),
    purpose: text('purpose').notNull(),
    channel: text('channel').notNull().default('sms'),
    destination: text('destination').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: ts('expires_at').notNull(),
    consumedAt: ts('consumed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('otp_challenges_tenant_idx').on(t.tenantId),
    foreignKey({
      columns: [t.tenantId, t.userId],
      foreignColumns: [users.tenantId, users.id],
      name: 'otp_challenges_user_fk',
    }).onDelete('cascade'),
    check('otp_purpose_chk', sql`purpose in ('signup', 'login')`),
    check('otp_channel_chk', sql`channel in ('sms', 'email')`),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    tenantId: tenantId().unique(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    billingCycle: text('billing_cycle').notNull(),
    locationCount: integer('location_count').notNull().default(1),
    status: text('status').notNull().default('active'),
    currentPeriodStart: ts('current_period_start').notNull(),
    currentPeriodEnd: ts('current_period_end').notNull(),
    /** Pre-tax account credit from downgrades, applied to later charges. */
    creditPaise: paise('credit_paise').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('subscriptions_tenant_id_uq').on(t.tenantId, t.id),
    check('subscriptions_cycle_chk', sql`billing_cycle in ('monthly', 'annual')`),
    check('subscriptions_status_chk', sql`status in ('active', 'cancelled')`),
  ],
);

export const subscriptionItems = pgTable(
  'subscription_items',
  {
    id: id(),
    tenantId: tenantId(),
    subscriptionId: uuid('subscription_id').notNull(),
    kind: text('kind').notNull(),
    planId: uuid('plan_id').references(() => plans.id),
    moduleId: uuid('module_id').references(() => modules.id),
    unitAmountPaise: paise('unit_amount_paise').notNull(),
    quantity: integer('quantity').notNull().default(1),
    status: text('status').notNull().default('active'),
    addedAt: ts('added_at').notNull().defaultNow(),
    removedAt: ts('removed_at'),
  },
  (t) => [
    index('subscription_items_tenant_idx').on(t.tenantId, t.subscriptionId),
    foreignKey({
      columns: [t.tenantId, t.subscriptionId],
      foreignColumns: [subscriptions.tenantId, subscriptions.id],
      name: 'subscription_items_subscription_fk',
    }).onDelete('cascade'),
    check('subscription_items_kind_chk', sql`kind in ('plan', 'addon')`),
    check('subscription_items_status_chk', sql`status in ('active', 'removed')`),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: id(),
    tenantId: tenantId(),
    /** Gateway-style public id (order_…). */
    publicId: text('public_id').notNull().unique(),
    purpose: text('purpose').notNull(),
    status: text('status').notNull().default('created'),
    amountPaise: paise('amount_paise').notNull(),
    currency: text('currency').notNull().default('INR'),
    /** Priced snapshot (config, taxed lines, totals) — what the customer agreed to pay. */
    quote: jsonb('quote').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    paidAt: ts('paid_at'),
    fulfilledAt: ts('fulfilled_at'),
  },
  (t) => [
    unique('orders_tenant_idem_uq').on(t.tenantId, t.idempotencyKey),
    unique('orders_tenant_id_uq').on(t.tenantId, t.id),
    index('orders_tenant_idx').on(t.tenantId),
    check('orders_purpose_chk', sql`purpose in ('onboarding', 'change')`),
    check('orders_status_chk', sql`status in ('created', 'attempted', 'paid', 'cancelled')`),
    check('orders_amount_chk', sql`amount_paise > 0`),
    check('orders_currency_chk', sql`currency = 'INR'`),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    tenantId: tenantId(),
    orderId: uuid('order_id').notNull(),
    publicId: text('public_id').notNull().unique(),
    gateway: text('gateway').notNull().default('mock'),
    method: text('method').notNull(),
    methodDetails: jsonb('method_details').$type<Record<string, string>>().notNull().default({}),
    status: text('status').notNull().default('created'),
    amountPaise: paise('amount_paise').notNull(),
    failureCode: text('failure_code'),
    failureReason: text('failure_reason'),
    signatureVerified: boolean('signature_verified').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    capturedAt: ts('captured_at'),
  },
  (t) => [
    unique('payments_tenant_id_uq').on(t.tenantId, t.id),
    index('payments_tenant_idx').on(t.tenantId, t.orderId),
    uniqueIndex('payments_one_captured_uq').on(t.orderId).where(sql`${t.status} = 'captured'`),
    uniqueIndex('payments_one_pending_uq').on(t.orderId).where(sql`${t.status} = 'pending'`),
    foreignKey({
      columns: [t.tenantId, t.orderId],
      foreignColumns: [orders.tenantId, orders.id],
      name: 'payments_order_fk',
    }),
    check('payments_method_chk', sql`method in ('upi', 'card', 'netbanking')`),
    check('payments_status_chk', sql`status in ('created', 'pending', 'captured', 'failed')`),
    check('payments_amount_chk', sql`amount_paise > 0`),
    check('payments_gateway_chk', sql`gateway = 'mock'`),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    tenantId: tenantId(),
    number: text('number').notNull().unique(),
    fy: text('fy').notNull(),
    orderId: uuid('order_id'),
    paymentId: uuid('payment_id'),
    status: text('status').notNull().default('paid'),
    issueDate: date('issue_date').notNull(),
    description: text('description').notNull().default(''),
    supplier: jsonb('supplier').notNull(),
    customer: jsonb('customer').notNull(),
    placeOfSupplyStateCode: text('place_of_supply_state_code').notNull(),
    interState: boolean('inter_state').notNull(),
    taxablePaise: paise('taxable_paise').notNull(),
    cgstPaise: paise('cgst_paise').notNull(),
    sgstPaise: paise('sgst_paise').notNull(),
    igstPaise: paise('igst_paise').notNull(),
    totalPaise: paise('total_paise').notNull(),
    periodStart: ts('period_start'),
    periodEnd: ts('period_end'),
    notes: text('notes').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [
    unique('invoices_tenant_id_uq').on(t.tenantId, t.id),
    unique('invoices_order_uq').on(t.orderId),
    index('invoices_tenant_idx').on(t.tenantId),
    foreignKey({
      columns: [t.tenantId, t.orderId],
      foreignColumns: [orders.tenantId, orders.id],
      name: 'invoices_order_fk',
    }),
    foreignKey({
      columns: [t.tenantId, t.paymentId],
      foreignColumns: [payments.tenantId, payments.id],
      name: 'invoices_payment_fk',
    }),
    check('invoices_number_len_chk', sql`char_length(number) <= 16`),
    check('invoices_status_chk', sql`status in ('paid', 'void')`),
  ],
);

/** GST credit note for an issued invoice. Model only — downgrades do not issue one. Immutable after insert. */
export const creditNotes = pgTable(
  'credit_notes',
  {
    id: id(),
    tenantId: tenantId(),
    invoiceId: uuid('invoice_id').notNull(),
    number: text('number').notNull().unique(),
    reason: text('reason').notNull().default(''),
    taxablePaise: paise('taxable_paise').notNull(),
    cgstPaise: paise('cgst_paise').notNull().default(0),
    sgstPaise: paise('sgst_paise').notNull().default(0),
    igstPaise: paise('igst_paise').notNull().default(0),
    totalPaise: paise('total_paise').notNull(),
    issuedAt: ts('issued_at').notNull().defaultNow(),
  },
  (t) => [
    unique('credit_notes_tenant_id_uq').on(t.tenantId, t.id),
    index('credit_notes_tenant_idx').on(t.tenantId),
    foreignKey({
      columns: [t.tenantId, t.invoiceId],
      foreignColumns: [invoices.tenantId, invoices.id],
      name: 'credit_notes_invoice_fk',
    }),
    check('credit_notes_number_len_chk', sql`char_length(number) <= 16`),
    check('credit_notes_total_chk', sql`total_paise >= 0`),
  ],
);

export const invoiceLines = pgTable(
  'invoice_lines',
  {
    id: id(),
    tenantId: tenantId(),
    invoiceId: uuid('invoice_id').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    description: text('description').notNull(),
    sacCode: text('sac_code').notNull().default(''),
    quantity: integer('quantity').notNull().default(1),
    unitPaise: paise('unit_paise').notNull(),
    amountPaise: paise('amount_paise').notNull(),
    gstRateBp: integer('gst_rate_bp').notNull(),
    cgstPaise: paise('cgst_paise').notNull().default(0),
    sgstPaise: paise('sgst_paise').notNull().default(0),
    igstPaise: paise('igst_paise').notNull().default(0),
  },
  (t) => [
    index('invoice_lines_tenant_idx').on(t.tenantId, t.invoiceId),
    foreignKey({
      columns: [t.tenantId, t.invoiceId],
      foreignColumns: [invoices.tenantId, invoices.id],
      name: 'invoice_lines_invoice_fk',
    }).onDelete('cascade'),
  ],
);

/** Per-tenant grants/revocations set by the App Admin. Tenants can read their own; only platform scope writes. */
export const tenantEntitlementOverrides = pgTable(
  'tenant_entitlement_overrides',
  {
    id: id(),
    tenantId: tenantId(),
    target: text('target').notNull(),
    moduleId: uuid('module_id').references(() => modules.id),
    featureId: uuid('feature_id').references(() => moduleFeatures.id),
    effect: text('effect').notNull(),
    reason: text('reason').notNull().default(''),
    createdByAdminId: uuid('created_by_admin_id'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('tenant_overrides_uq').on(t.tenantId, t.moduleId, t.featureId).nullsNotDistinct(),
    check('overrides_target_chk', sql`target in ('module', 'feature')`),
    check('overrides_effect_chk', sql`effect in ('grant', 'revoke')`),
    check(
      'overrides_shape_chk',
      sql`(target = 'module' and module_id is not null and feature_id is null) or (target = 'feature' and feature_id is not null and module_id is null)`,
    ),
  ],
);

export const consents = pgTable(
  'consents',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull(),
    noticeId: uuid('notice_id')
      .notNull()
      .references(() => privacyNotices.id),
    noticeVersion: text('notice_version').notNull(),
    /** Purpose tags consented to (DPDP purpose limitation). */
    purposes: jsonb('purposes').$type<string[]>().notNull(),
    termsAccepted: boolean('terms_accepted').notNull().default(false),
    ip: text('ip'),
    userAgent: text('user_agent'),
    grantedAt: ts('granted_at').notNull().defaultNow(),
    withdrawnAt: ts('withdrawn_at'),
  },
  (t) => [
    index('consents_tenant_idx').on(t.tenantId, t.userId),
    foreignKey({
      columns: [t.tenantId, t.userId],
      foreignColumns: [users.tenantId, users.id],
      name: 'consents_user_fk',
    }).onDelete('cascade'),
  ],
);

export const dataPrincipalRequests = pgTable(
  'data_principal_requests',
  {
    id: id(),
    tenantId: tenantId(),
    type: text('type').notNull(),
    principalName: text('principal_name').notNull(),
    principalContact: text('principal_contact').notNull(),
    reference: text('reference').notNull().default(''),
    details: text('details').notNull(),
    status: text('status').notNull().default('open'),
    dueAt: ts('due_at').notNull(),
    resolutionNotes: text('resolution_notes').notNull().default(''),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    closedAt: ts('closed_at'),
  },
  (t) => [
    index('dpr_tenant_idx').on(t.tenantId),
    check('dpr_type_chk', sql`type in ('access', 'correction', 'erasure', 'grievance')`),
    check('dpr_status_chk', sql`status in ('open', 'in_progress', 'completed', 'rejected')`),
  ],
);

export const checklistItems = pgTable(
  'checklist_items',
  {
    tenantId: tenantId(),
    key: text('key').notNull(),
    doneAt: ts('done_at'),
    doneBy: uuid('done_by'),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);

/** Mock notification outbox (SMS / email are never really sent in Phase A). */
export const outboxMessages = pgTable(
  'outbox_messages',
  {
    id: id(),
    tenantId: tenantId(),
    channel: text('channel').notNull(),
    recipient: text('recipient').notNull(),
    subject: text('subject').notNull().default(''),
    body: text('body').notNull(),
    template: text('template').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('outbox_tenant_idx').on(t.tenantId),
    check('outbox_channel_chk', sql`channel in ('sms', 'email')`),
  ],
);

/**
 * Replay store for Idempotency-Key. Template T. The request transaction inserts the row, fills the 2xx body
 * before commit, and rolls the row back on any non-2xx.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    tenantId: tenantId(),
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: createdAt(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.scope, t.key] }),
    index('idempotency_keys_tenant_idx').on(t.tenantId),
    check('idempotency_key_chk', sql`key ~ '^[A-Za-z0-9_-]{8,128}$'`),
  ],
);

/** Opaque server-side sessions (token stored hashed). No grants to hos_app — only definer functions. */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    tokenHash: text('token_hash').notNull().unique(),
    kind: text('kind').notNull(),
    userId: uuid('user_id').references(() => users.id),
    platformAdminId: uuid('platform_admin_id').references(() => platformAdmins.id),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
    check(
      'sessions_kind_chk',
      sql`(kind = 'tenant' and user_id is not null and tenant_id is not null and platform_admin_id is null) or (kind = 'platform' and platform_admin_id is not null and user_id is null and tenant_id is null)`,
    ),
  ],
);

/**
 * Append-only, hash-chained audit log. One chain per tenant (`chain_key` = tenant id) plus a `platform` chain.
 * `seq`, `prev_hash`, `hash`, `chain_key` and `created_at` are overwritten by the BEFORE INSERT trigger.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    chainKey: text('chain_key').notNull().default(''),
    seq: bigint('seq', { mode: 'number' }).notNull().default(0),
    tenantId: uuid('tenant_id'),
    locationId: uuid('location_id'),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id'),
    actorLabel: text('actor_label').notNull().default(''),
    ip: text('ip'),
    userAgent: text('user_agent'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: ts('created_at').notNull().defaultNow(),
    prevHash: text('prev_hash').notNull().default(''),
    hash: text('hash').notNull().default(''),
  },
  (t) => [
    uniqueIndex('audit_log_chain_seq_uq').on(t.chainKey, t.seq),
    index('audit_log_tenant_idx').on(t.tenantId, t.id),
    check('audit_actor_chk', sql`actor_type in ('user', 'platform_admin', 'system')`),
  ],
);
