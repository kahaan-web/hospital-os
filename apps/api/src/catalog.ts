import { schema, type Queryable } from '@hos/db';
import {
  applyGst,
  computeEntitlements,
  permissionsAt,
  STAFF_ROLES,
  SYSTEM_ROLES,
  priceSubscription,
  quoteChange,
  stateName,
  type BillingCycle,
  type Catalog,
  type CatalogModule,
  type CatalogPlan,
  type EntitlementsDto,
  type InvoiceDto,
  type InvoiceListItem,
  type LocationDto,
  type ModuleStateDto,
  type OnboardingState,
  type OnboardingStep,
  type PriceBook,
  type QuoteDto,
  type RoleDto,
  type SubscriptionConfig,
  type SubscriptionDto,
  type TenantMe,
  type TenantSummaryDto,
  type UserDto,
} from '@hos/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { ApiError } from './http';

export function iso(value: Date | string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type Settings = typeof schema.platformSettings.$inferSelect;
type Plan = typeof schema.plans.$inferSelect;
type ModuleRow = typeof schema.modules.$inferSelect;
type FeatureRow = typeof schema.moduleFeatures.$inferSelect;
type Price = typeof schema.prices.$inferSelect;

export async function settings(db: Queryable): Promise<Settings> {
  const [row] = await db.select().from(schema.platformSettings).where(eq(schema.platformSettings.id, 1));
  if (!row) throw new ApiError(500, 'internal', 'Platform settings are not seeded');
  return row;
}

export async function loadCatalog(db: Queryable, opts: { activePlansOnly: boolean; hideHidden: boolean }): Promise<Catalog> {
  const planRows = await db.select().from(schema.plans).orderBy(asc(schema.plans.sortOrder), asc(schema.plans.name));
  const plans = opts.activePlansOnly ? planRows.filter((p) => p.status === 'active') : planRows;
  const modules = (await db.select().from(schema.modules).orderBy(asc(schema.modules.sortOrder))).filter((m) => !opts.hideHidden || m.status !== 'hidden');
  const features = await db.select().from(schema.moduleFeatures).orderBy(asc(schema.moduleFeatures.sortOrder));
  const priceRows = await db.select().from(schema.prices);
  const links = plans.length
    ? await db.select().from(schema.planModuleFeatures).where(inArray(schema.planModuleFeatures.planId, plans.map((p) => p.id)))
    : [];
  const priceOf = (type: string, id: string, cycle: BillingCycle) =>
    priceRows.find((p) => p.targetType === type && p.targetId === id && p.billingCycle === cycle) ?? null;

  const catalogPlans: CatalogPlan[] = plans.map((plan) => {
    const monthly = priceOf('plan', plan.id, 'monthly');
    const annual = priceOf('plan', plan.id, 'annual');
    return {
      id: plan.id,
      key: plan.key,
      name: plan.name,
      tagline: plan.tagline,
      description: plan.description,
      highlight: plan.highlight,
      badge: plan.badge,
      sortOrder: plan.sortOrder,
      status: plan.status as CatalogPlan['status'],
      monthlyPaise: monthly?.amountPaise ?? 0,
      annualPaise: annual?.amountPaise ?? 0,
      pricePlaceholder: (monthly?.isPlaceholder ?? true) || (annual?.isPlaceholder ?? true),
      featureCount: links.filter((l) => l.planId === plan.id).length,
    };
  });

  const featuresByModule = new Map<string, FeatureRow[]>();
  for (const feature of features) {
    const list = featuresByModule.get(feature.moduleId) ?? [];
    list.push(feature);
    featuresByModule.set(feature.moduleId, list);
  }

  const catalogModules: CatalogModule[] = modules.map((mod) => toCatalogModule(mod, featuresByModule.get(mod.id) ?? [], priceOf));
  const matrix: Record<string, string[]> = {};
  for (const plan of plans) matrix[plan.id] = links.filter((l) => l.planId === plan.id).map((l) => l.featureId);
  return { plans: catalogPlans, modules: catalogModules, matrix };
}

function toCatalogModule(
  mod: ModuleRow,
  features: FeatureRow[],
  priceOf: (type: string, id: string, cycle: BillingCycle) => Price | null,
): CatalogModule {
  const monthly = mod.addonPurchasable ? priceOf('module_addon', mod.id, 'monthly') : null;
  const annual = mod.addonPurchasable ? priceOf('module_addon', mod.id, 'annual') : null;
  return {
    id: mod.id,
    key: mod.key,
    code: mod.code,
    docNo: mod.docNo,
    name: mod.name,
    docName: mod.docName,
    kind: mod.kind as CatalogModule['kind'],
    category: mod.category as CatalogModule['category'],
    description: mod.description,
    icon: mod.icon,
    phase: mod.phase,
    status: mod.status as CatalogModule['status'],
    addonPurchasable: mod.addonPurchasable,
    gstRateBp: mod.gstRateBp,
    sacCode: mod.sacCode,
    addonMonthlyPaise: monthly?.amountPaise ?? null,
    addonAnnualPaise: annual?.amountPaise ?? null,
    pricePlaceholder: monthly || annual ? (monthly?.isPlaceholder ?? true) || (annual?.isPlaceholder ?? true) : false,
    sortOrder: mod.sortOrder,
    features: features.map((f) => ({
      id: f.id,
      key: f.key,
      moduleId: f.moduleId,
      name: f.name,
      type: f.type as CatalogModule['features'][number]['type'],
      source: f.source as CatalogModule['features'][number]['source'],
      sheetStatus: f.sheetStatus,
      sortOrder: f.sortOrder,
    })),
  };
}

export async function priceBook(db: Queryable): Promise<{ book: PriceBook; plans: Plan[]; modules: ModuleRow[] }> {
  const cfg = await settings(db);
  const plans = await db.select().from(schema.plans);
  const modules = await db.select().from(schema.modules);
  const priceRows = await db.select().from(schema.prices);
  const amount = (type: string, id: string, cycle: BillingCycle) =>
    priceRows.find((p) => p.targetType === type && p.targetId === id && p.billingCycle === cycle)?.amountPaise ?? 0;
  return {
    plans,
    modules,
    book: {
      planGstRateBp: cfg.defaultGstRateBp,
      planSacCode: cfg.defaultSacCode,
      plans: plans
        .filter((p) => p.status === 'active')
        .map((p) => ({ id: p.id, name: p.name, monthlyPaise: amount('plan', p.id, 'monthly'), annualPaise: amount('plan', p.id, 'annual') })),
      addons: modules
        .filter((m) => m.addonPurchasable)
        .map((m) => ({
          moduleId: m.id,
          name: m.name,
          monthlyPaise: amount('module_addon', m.id, 'monthly'),
          annualPaise: amount('module_addon', m.id, 'annual'),
          gstRateBp: m.gstRateBp,
          sacCode: m.sacCode || cfg.defaultSacCode,
        })),
    },
  };
}

export async function locationDtos(db: Queryable): Promise<LocationDto[]> {
  const locs = await db.select().from(schema.locations).orderBy(asc(schema.locations.sortOrder), asc(schema.locations.name));
  const deps = await db.select().from(schema.departments).orderBy(asc(schema.departments.sortOrder));
  return locs.map((loc) => ({
    id: loc.id,
    name: loc.name,
    code: loc.code,
    addressLine1: loc.addressLine1,
    addressLine2: loc.addressLine2,
    city: loc.city,
    stateCode: loc.stateCode,
    pincode: loc.pincode,
    phone: loc.phone,
    isPrimary: loc.isPrimary,
    departments: deps.filter((d) => d.locationId === loc.id).map((d) => d.name),
  }));
}

export function tenantSummary(row: typeof schema.tenants.$inferSelect): TenantSummaryDto {
  return {
    id: row.id,
    slug: row.slug,
    status: row.status as TenantSummaryDto['status'],
    onboardingStep: row.onboardingStep as OnboardingStep,
    facilityType: (row.facilityType as TenantSummaryDto['facilityType']) ?? null,
    legalName: row.legalName,
    displayName: row.displayName,
    gstin: row.gstin,
    registrationNo: row.registrationNo,
    bedCount: row.bedCount,
    specialities: row.specialities,
    logoUrl: row.logoPath ? '/api/v1/onboarding/logo' : null,
    sandbox: row.sandbox,
  };
}

export async function subscriptionDto(db: Queryable): Promise<SubscriptionDto | null> {
  const [sub] = await db.select().from(schema.subscriptions);
  if (!sub) return null;
  const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, sub.planId));
  const items = await db.select().from(schema.subscriptionItems).where(eq(schema.subscriptionItems.status, 'active'));
  const modules = await db.select().from(schema.modules);
  const byId = new Map(modules.map((m) => [m.id, m]));
  return {
    id: sub.id,
    planId: sub.planId,
    planKey: plan?.key ?? '',
    planName: plan?.name ?? '',
    cycle: sub.billingCycle as BillingCycle,
    locationCount: sub.locationCount,
    status: sub.status,
    currentPeriodStart: iso(sub.currentPeriodStart)!,
    currentPeriodEnd: iso(sub.currentPeriodEnd)!,
    creditPaise: sub.creditPaise,
    addons: items
      .filter((item) => item.kind === 'addon' && item.moduleId)
      .map((item) => ({
        moduleId: item.moduleId!,
        moduleKey: byId.get(item.moduleId!)?.key ?? '',
        name: byId.get(item.moduleId!)?.name ?? '',
        unitPaise: item.unitAmountPaise,
      })),
  };
}

export async function moduleStates(db: Queryable, planId: string | null, addonModuleIds: string[]): Promise<{ states: ModuleStateDto[]; features: string[] }> {
  const modules = await db.select().from(schema.modules).orderBy(asc(schema.modules.sortOrder));
  const features = await db.select().from(schema.moduleFeatures);
  const plans = await db.select().from(schema.plans).orderBy(asc(schema.plans.sortOrder));
  const links = await db.select().from(schema.planModuleFeatures);
  const overrides = await db.select().from(schema.tenantEntitlementOverrides);
  const planFeatureKeys = new Set<string>();
  if (planId) {
    const ids = new Set(links.filter((l) => l.planId === planId).map((l) => l.featureId));
    for (const feature of features) if (ids.has(feature.id)) planFeatureKeys.add(feature.key);
  }
  const moduleById = new Map(modules.map((m) => [m.id, m]));
  const featureById = new Map(features.map((f) => [f.id, f]));
  const featuresByModule = new Map<string, string[]>();
  for (const feature of features) {
    const mod = moduleById.get(feature.moduleId);
    if (!mod) continue;
    const list = featuresByModule.get(mod.key) ?? [];
    list.push(feature.key);
    featuresByModule.set(mod.key, list);
  }
  const computed = computeEntitlements({
    modules: modules.map((m) => ({ key: m.key, status: m.status as 'available' | 'coming_soon' | 'hidden', featureKeys: featuresByModule.get(m.key) ?? [] })),
    planFeatureKeys: [...planFeatureKeys],
    addonModuleKeys: addonModuleIds.map((id) => moduleById.get(id)?.key).filter((k): k is string => !!k),
    overrides: overrides.map((o) => ({
      target: o.target as 'module' | 'feature',
      key: o.target === 'module' ? (moduleById.get(o.moduleId ?? '')?.key ?? '') : (featureById.get(o.featureId ?? '')?.key ?? ''),
      effect: o.effect as 'grant' | 'revoke',
    })),
  });

  const planName = new Map(plans.map((p) => [p.id, p]));
  const featuresOfPlan = new Map<string, Set<string>>();
  for (const link of links) {
    const set = featuresOfPlan.get(link.planId) ?? new Set<string>();
    const feature = featureById.get(link.featureId);
    if (feature) set.add(feature.id);
    featuresOfPlan.set(link.planId, set);
  }

  const priceRows = await db.select().from(schema.prices);
  const states: ModuleStateDto[] = modules.map((mod) => {
    const ent = computed.modules.get(mod.key)!;
    const featureIds = new Set(features.filter((f) => f.moduleId === mod.id).map((f) => f.id));
    let lowest: { id: string; name: string } | null = null;
    for (const plan of plans) {
      const included = featuresOfPlan.get(plan.id);
      if (!included) continue;
      if ([...featureIds].some((id) => included.has(id))) {
        lowest = { id: plan.id, name: plan.name };
        break;
      }
    }
    const monthly = priceRows.find((p) => p.targetType === 'module_addon' && p.targetId === mod.id && p.billingCycle === 'monthly');
    const annual = priceRows.find((p) => p.targetType === 'module_addon' && p.targetId === mod.id && p.billingCycle === 'annual');
    return {
      id: mod.id,
      key: mod.key,
      code: mod.code,
      name: mod.name,
      kind: mod.kind as ModuleStateDto['kind'],
      category: mod.category as ModuleStateDto['category'],
      description: mod.description,
      icon: mod.icon,
      phase: mod.phase,
      access: ent.access,
      source: ent.source,
      featureCount: ent.featureCount,
      entitledFeatureCount: ent.entitledFeatureCount,
      addonPurchasable: mod.addonPurchasable,
      addonMonthlyPaise: monthly?.amountPaise ?? null,
      addonAnnualPaise: annual?.amountPaise ?? null,
      lowestPlan: lowest,
    };
  });
  return { states, features: [...computed.features] };
}

export interface Assignment {
  roleKey: string;
  roleName: string;
  locationId: string | null;
  permissions: string[];
}

export async function loadAssignments(db: Queryable, userId: string): Promise<Assignment[]> {
  const rows = await db
    .select({
      roleKey: schema.roles.key,
      roleName: schema.roles.name,
      locationId: schema.userLocationRoles.locationId,
      permissionKey: schema.rolePermissions.permissionKey,
    })
    .from(schema.userLocationRoles)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userLocationRoles.roleId))
    .innerJoin(schema.rolePermissions, eq(schema.rolePermissions.roleId, schema.roles.id))
    .where(eq(schema.userLocationRoles.userId, userId));
  const grouped = new Map<string, Assignment>();
  for (const row of rows) {
    const key = `${row.roleKey}:${row.locationId ?? ''}`;
    const current = grouped.get(key) ?? { roleKey: row.roleKey, roleName: row.roleName, locationId: row.locationId, permissions: [] };
    current.permissions.push(row.permissionKey);
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

export async function tenantMe(db: Queryable, userId: string, locationId: string | null): Promise<TenantMe> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user || user.status !== 'active') throw new ApiError(401, 'unauthenticated', 'Sign in again');
  const [tenant] = await db.select().from(schema.tenants);
  if (!tenant) throw new ApiError(401, 'unauthenticated', 'Sign in again');
  const locations = await locationDtos(db);
  const assignments = await loadAssignments(db, userId);
  const subscription = await subscriptionDto(db);
  const addonIds = subscription?.addons.map((a) => a.moduleId) ?? [];
  const access = await moduleStates(db, subscription?.planId ?? null, addonIds);
  return {
    kind: 'tenant',
    user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile, designation: user.designation, totpEnabled: user.totpEnabled },
    tenant: tenantSummary(tenant),
    locations,
    currentLocationId: locationId,
    roles: assignments.map((a) => ({ roleKey: a.roleKey, roleName: a.roleName, locationId: a.locationId })),
    permissions: [...permissionsAt(assignments, locationId)],
    subscription,
    modules: access.states,
    features: access.features,
  };
}

export function assertPermission(assignments: Assignment[], locationId: string | null, permission: string): void {
  if (!permissionsAt(assignments, locationId).has(permission)) {
    throw new ApiError(403, 'forbidden', 'You do not have permission to do that', undefined, { permission });
  }
}

export async function assertModule(db: Queryable, moduleKey: string): Promise<void> {
  const subscription = await subscriptionDto(db);
  const access = await moduleStates(db, subscription?.planId ?? null, subscription?.addons.map((a) => a.moduleId) ?? []);
  const mod = access.states.find((m) => m.key === moduleKey);
  if (!mod || mod.access !== 'enabled') throw new ApiError(403, 'not_entitled', 'This module is not included in your plan', undefined, { moduleKey });
}

export async function entitlementsDto(db: Queryable): Promise<EntitlementsDto> {
  const subscription = await subscriptionDto(db);
  const access = await moduleStates(db, subscription?.planId ?? null, subscription?.addons.map((a) => a.moduleId) ?? []);
  return { features: access.features, modules: access.states };
}

export async function onboardingState(db: Queryable): Promise<OnboardingState> {
  const [tenant] = await db.select().from(schema.tenants);
  if (!tenant) throw new ApiError(404, 'not_found', 'Hospital not found');
  const locations = await locationDtos(db);
  const [paid] = await db
    .select({ id: schema.invoices.id })
    .from(schema.invoices)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.invoices.orderId))
    .where(eq(schema.orders.purpose, 'onboarding'))
    .limit(1);
  const [openPaid] = await db.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.status, 'paid')).limit(1);
  return {
    step: tenant.onboardingStep as OnboardingStep,
    tenant: tenantSummary(tenant),
    locations,
    draft: tenant.onboardingDraft,
    invoiceId: paid?.id ?? null,
    paid: !!openPaid,
  };
}

export async function placeOfSupply(db: Queryable): Promise<string> {
  const locs = await db.select().from(schema.locations).orderBy(desc(schema.locations.isPrimary), asc(schema.locations.sortOrder));
  const first = locs[0];
  if (!first) throw new ApiError(422, 'locations_required', 'Add a location before asking for a price');
  return first.stateCode;
}

export async function quoteFor(db: Queryable, cfg: SubscriptionConfig, purpose: 'onboarding' | 'change'): Promise<QuoteDto> {
  const { book } = await priceBook(db);
  const cfgRow = await settings(db);
  const place = await placeOfSupply(db);
  let lines;
  try {
    lines = priceSubscription(book, cfg);
  } catch (error) {
    throw new ApiError(422, 'invalid_config', error instanceof Error ? error.message : 'That plan or add-on is not available');
  }
  const taxed = applyGst(lines, cfgRow.supplierStateCode, place);
  const start = new Date();
  if (purpose === 'onboarding') {
    const { addCycle } = await import('@hos/shared');
    const end = addCycle(start, cfg.cycle);
    const plan = book.plans.find((p) => p.id === cfg.planId);
    return {
      purpose,
      config: { planId: cfg.planId, planName: plan?.name ?? '', cycle: cfg.cycle, locationCount: cfg.locationCount, addonModuleIds: [...cfg.addonModuleIds] },
      lines: taxed.lines,
      totals: taxed.totals,
      supplierStateCode: cfgRow.supplierStateCode,
      placeOfSupplyStateCode: place,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      change: null,
    };
  }
  const sub = await subscriptionDto(db);
  if (!sub) throw new ApiError(422, 'no_subscription', 'There is no subscription to change');
  const [row] = await db.select().from(schema.subscriptions);
  const current: SubscriptionConfig = { planId: sub.planId, cycle: sub.cycle, locationCount: sub.locationCount, addonModuleIds: sub.addons.map((a) => a.moduleId) };
  let change;
  try {
    change = quoteChange(book, current, { ...cfg, cycle: sub.cycle }, { start: row!.currentPeriodStart, end: row!.currentPeriodEnd }, start, sub.creditPaise);
  } catch (error) {
    throw new ApiError(422, 'invalid_config', error instanceof Error ? error.message : 'That change is not available');
  }
  const changed = applyGst(change.lines, cfgRow.supplierStateCode, place);
  const plan = book.plans.find((p) => p.id === cfg.planId);
  return {
    purpose,
    config: { planId: cfg.planId, planName: plan?.name ?? '', cycle: sub.cycle, locationCount: cfg.locationCount, addonModuleIds: [...cfg.addonModuleIds] },
    lines: changed.lines,
    totals: changed.totals,
    supplierStateCode: cfgRow.supplierStateCode,
    placeOfSupplyStateCode: place,
    periodStart: iso(row!.currentPeriodStart)!,
    periodEnd: iso(row!.currentPeriodEnd)!,
    change: {
      remainingDays: change.remainingDays,
      totalDays: change.totalDays,
      netPaise: change.netPaise,
      creditAppliedPaise: change.creditAppliedPaise,
      creditBalanceAfterPaise: change.creditBalanceAfterPaise,
      noPayment: change.taxablePaise === 0,
    },
  };
}

export async function userDtos(db: Queryable): Promise<UserDto[]> {
  const users = await db.select().from(schema.users).orderBy(asc(schema.users.createdAt));
  const out: UserDto[] = [];
  for (const user of users) {
    const assignments = await loadAssignments(db, user.id);
    out.push({
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      status: user.status as UserDto['status'],
      designation: user.designation,
      totpEnabled: user.totpEnabled,
      lastLoginAt: iso(user.lastLoginAt),
      createdAt: iso(user.createdAt)!,
      roles: assignments.map((a) => ({ roleKey: a.roleKey, roleName: a.roleName, locationId: a.locationId })),
    });
  }
  return out;
}

export async function roleDtos(db: Queryable): Promise<RoleDto[]> {
  const roles = await db.select().from(schema.roles).orderBy(asc(schema.roles.sortOrder));
  const perms = await db.select().from(schema.rolePermissions);
  const staff = new Set<string>(STAFF_ROLES.map((role) => role.key));
  const system = new Set<string>(SYSTEM_ROLES.map((role) => role.key));
  return roles.filter((role) => staff.has(role.key) || !system.has(role.key)).map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    permissions: perms.filter((p) => p.roleId === role.id).map((p) => p.permissionKey),
  }));
}

export function invoiceListItem(row: typeof schema.invoices.$inferSelect): InvoiceListItem {
  return { id: row.id, number: row.number, issueDate: String(row.issueDate).slice(0, 10), totalPaise: row.totalPaise, status: row.status, description: row.description };
}

export async function invoiceDto(db: Queryable, id: string): Promise<InvoiceDto> {
  const { amountInWords } = await import('@hos/shared');
  const [invoice] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
  if (!invoice) throw new ApiError(404, 'not_found', 'Invoice not found');
  const lines = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, id)).orderBy(asc(schema.invoiceLines.sortOrder));
  let payment: InvoiceDto['payment'] = null;
  if (invoice.paymentId) {
    const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.id, invoice.paymentId));
    if (pay) payment = { id: pay.publicId, method: pay.method, methodLabel: methodLabel(pay.method), capturedAt: iso(pay.capturedAt) };
  }
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    issueDate: String(invoice.issueDate).slice(0, 10),
    supplier: invoice.supplier as InvoiceDto['supplier'],
    customer: invoice.customer as InvoiceDto['customer'],
    placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
    interState: invoice.interState,
    lines: lines.map((line) => ({
      description: line.description,
      sacCode: line.sacCode,
      quantity: line.quantity,
      unitPaise: line.unitPaise,
      amountPaise: line.amountPaise,
      gstRateBp: line.gstRateBp,
      cgstPaise: line.cgstPaise,
      sgstPaise: line.sgstPaise,
      igstPaise: line.igstPaise,
    })),
    taxablePaise: invoice.taxablePaise,
    cgstPaise: invoice.cgstPaise,
    sgstPaise: invoice.sgstPaise,
    igstPaise: invoice.igstPaise,
    totalPaise: invoice.totalPaise,
    amountInWords: amountInWords(invoice.totalPaise),
    periodStart: iso(invoice.periodStart),
    periodEnd: iso(invoice.periodEnd),
    payment,
    notes: invoice.notes,
  };
}

export function methodLabel(method: string): string {
  if (method === 'upi') return 'UPI';
  if (method === 'card') return 'Card';
  if (method === 'netbanking') return 'Netbanking';
  return method;
}

export async function orderDto(db: Queryable, orderId: string, keyId: string): Promise<import('@hos/shared').OrderDto> {
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) throw new ApiError(404, 'not_found', 'Order not found');
  const payments = await db.select().from(schema.payments).where(eq(schema.payments.orderId, order.id)).orderBy(asc(schema.payments.createdAt));
  const [invoice] = order.id ? await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.orderId, order.id)) : [];
  return {
    id: order.publicId,
    purpose: order.purpose as 'onboarding' | 'change',
    status: order.status as import('@hos/shared').OrderDto['status'],
    amountPaise: order.amountPaise,
    currency: 'INR',
    keyId,
    createdAt: iso(order.createdAt)!,
    paidAt: iso(order.paidAt),
    invoiceId: invoice?.id ?? null,
    payments: payments.map((pay) => ({
      id: pay.publicId,
      status: pay.status as import('@hos/shared').PaymentDto['status'],
      method: pay.method as import('@hos/shared').PaymentDto['method'],
      methodLabel: methodLabel(pay.method),
      amountPaise: pay.amountPaise,
      failureReason: pay.failureReason,
      createdAt: iso(pay.createdAt)!,
      capturedAt: iso(pay.capturedAt),
    })),
    quote: order.quote as QuoteDto,
  };
}

export function partyFromSettings(row: Settings) {
  return {
    legalName: row.supplierLegalName,
    tradeName: row.supplierTradeName,
    gstin: row.supplierGstin,
    address: row.supplierAddress,
    stateCode: row.supplierStateCode,
    stateName: stateName(row.supplierStateCode),
  };
}

export function advanceStep(current: string, next: OnboardingStep): OnboardingStep {
  const order = ['facility', 'locations', 'plan', 'addons', 'payment', 'invoice', 'provisioning', 'done'];
  const cur = order.indexOf(current);
  const nxt = order.indexOf(next);
  return cur >= 0 && cur > nxt ? (current as OnboardingStep) : next;
}
