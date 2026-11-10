import { schema, type Tx } from '@hos/db';
import {
  featureCreateSchema,
  featureKey,
  matrixUpdateSchema,
  moduleUpdateSchema,
  overrideSchema,
  planCreateSchema,
  planPriceSchema,
  planReorderSchema,
  planUpdateSchema,
  platformSettingsSchema,
  suspendSchema,
  type AdminOverviewDto,
  type AdminTenantDetailDto,
  type AdminTenantListItem,
  type AuditEntryDto,
  type OverrideDto,
  type PageDto,
} from '@hos/shared';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { invoiceListItem, iso, loadCatalog, locationDtos, methodLabel, moduleStates, subscriptionDto, tenantSummary, userDtos } from '../catalog';
import { openPlatform, openPlatformTenant, verifyChain, type Deps } from '../guard';
import { ApiError, routeTemplate, rows } from '../http';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().optional(),
  status: z.string().optional(),
  sort: z.string().optional(),
});

const idParam = z.object({ id: z.uuid() });

export function registerAdmin(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/admin/overview', async (req) =>
    openPlatform(deps, req, async (gate) => {
      const [row] = await rows<{ overview: AdminOverviewDto }>(gate.tx, sql`select hos_admin_overview() as overview`);
      const overview = row?.overview ?? emptyOverview();
      await auditPlatformRead(gate, req, 'overview', null, { tenantTotal: overview.tenants.total });
      return overview;
    }),
  );

  r.get('/api/v1/admin/plans', async (req) => openPlatform(deps, req, async (gate) => (await loadCatalog(gate.tx, { activePlansOnly: false, hideHidden: false })).plans));

  r.post('/api/v1/admin/plans', { schema: { body: planCreateSchema } }, async (req) =>
    openPlatform(deps, req, async (gate) => {
      const existing = await gate.tx.select({ sortOrder: schema.plans.sortOrder }).from(schema.plans).orderBy(desc(schema.plans.sortOrder)).limit(1);
      const [plan] = await gate.tx
        .insert(schema.plans)
        .values({
          key: req.body.key,
          name: req.body.name,
          tagline: req.body.tagline,
          description: req.body.description,
          highlight: req.body.highlight,
          badge: req.body.badge,
          status: req.body.status,
          sortOrder: (existing[0]?.sortOrder ?? 0) + 1,
        })
        .returning();
      await gate.tx.insert(schema.prices).values([
        { targetType: 'plan', targetId: plan!.id, billingCycle: 'monthly', amountPaise: req.body.monthlyPaise, isPlaceholder: false },
        { targetType: 'plan', targetId: plan!.id, billingCycle: 'annual', amountPaise: req.body.annualPaise, isPlaceholder: false },
      ]);
      if (req.body.copyFromPlanId) {
        const links = await gate.tx.select().from(schema.planModuleFeatures).where(eq(schema.planModuleFeatures.planId, req.body.copyFromPlanId));
        if (links.length > 0) await gate.tx.insert(schema.planModuleFeatures).values(links.map((link) => ({ planId: plan!.id, featureId: link.featureId }))).onConflictDoNothing();
      }
      await gate.audit('admin.plan.create', 'plan', plan!.id, null, { key: plan!.key });
      return (await loadCatalog(gate.tx, { activePlansOnly: false, hideHidden: false })).plans.find((p) => p.id === plan!.id)!;
    }),
  );

  r.patch('/api/v1/admin/plans/:id', { schema: { params: idParam, body: planUpdateSchema } }, async (req) =>
    openPlatform(deps, req, async (gate) => {
      const [plan] = await gate.tx.select().from(schema.plans).where(eq(schema.plans.id, req.params.id));
      if (!plan) throw new ApiError(404, 'not_found', 'Plan not found');
      await gate.tx.update(schema.plans).set(req.body).where(eq(schema.plans.id, plan.id));
      await gate.audit('admin.plan.update', 'plan', plan.id, { name: plan.name, status: plan.status }, req.body);
      return (await loadCatalog(gate.tx, { activePlansOnly: false, hideHidden: false })).plans.find((p) => p.id === plan.id)!;
    }),
  );

  r.post('/api/v1/admin/plans/reorder', { schema: { body: planReorderSchema } }, async (req) =>
    openPlatform(deps, req, async (gate) => {
      for (const [index, id] of req.body.planIds.entries()) {
        await gate.tx.update(schema.plans).set({ sortOrder: index }).where(eq(schema.plans.id, id));
      }
      await gate.audit('admin.plan.reorder', 'plan', null, null, { planIds: req.body.planIds });
      return (await loadCatalog(gate.tx, { activePlansOnly: false, hideHidden: false })).plans;
    }),
  );

  r.put('/api/v1/admin/plans/:id/price', { schema: { params: idParam, body: planPriceSchema } }, async (req) =>
    openPlatform(deps, req, async (gate) => {
      const [plan] = await gate.tx.select().from(schema.plans).where(eq(schema.plans.id, req.params.id));
      if (!plan) throw new ApiError(404, 'not_found', 'Plan not found');
      for (const [cycle, amount] of [['monthly', req.body.monthlyPaise], ['annual', req.body.annualPaise]] as const) {
        const [price] = await gate.tx
          .select()
          .from(schema.prices)
          .where(and(eq(schema.prices.targetType, 'plan'), eq(schema.prices.targetId, plan.id), eq(schema.prices.billingCycle, cycle)));
        if (price) await gate.tx.update(schema.prices).set({ amountPaise: amount, isPlaceholder: false }).where(eq(schema.prices.id, price.id));
        else await gate.tx.insert(schema.prices).values({ targetType: 'plan', targetId: plan.id, billingCycle: cycle, amountPaise: amount, isPlaceholder: false });
      }
      await gate.audit('admin.plan.price', 'plan', plan.id, null, req.body);
      return (await loadCatalog(gate.tx, { activePlansOnly: false, hideHidden: false })).plans.find((p) => p.id === plan.id)!;
    }),
  );

  r.get('/api/v1/admin/matrix', async (req) =>
    openPlatform(deps, req, async (gate) => {
      const catalog = await loadCatalog(gate.tx, { activePlansOnly: false, hideHidden: false });
      return { plans: catalog.plans, modules: catalog.modules, features: catalog.modules.flatMap((mod) => mod.features), included: catalog.matrix };
    }),
  );

  r.patch('/api/v1/admin/matrix', { schema: { body: matrixUpdateSchema } }, async (req) =>
    openPlatform(deps, req, async (gate) => {
      for (const change of req.body.changes) {
        if (change.included) await gate.tx.insert(schema.planModuleFeatures).values({ planId: change.planId, featureId: change.featureId }).onConflictDoNothing();
        else await gate.tx.delete(schema.planModuleFeatures).where(and(eq(schema.planModuleFeatures.planId, change.planId), eq(schema.planModuleFeatures.featureId, change.featureId)));
      }
      await gate.audit('admin.matrix.update', 'plan_module_feature', null, null, { changes: req.body.changes.length });
      const catalog = await loadCatalog(gate.tx, { activePlansOnly: false, hideHidden: false });
      return { plans: catalog.plans, modules: catalog.modules, features: catalog.modules.flatMap((mod) => mod.features), included: catalog.matrix };
    }),
  );

  r.get('/api/v1/admin/modules', async (req) => openPlatform(deps, req, async (gate) => (await loadCatalog(gate.tx, { activePlansOnly: false, hideHidden: false })).modules));

  r.patch('/api/v1/admin/modules/:id', { schema: { params: idParam, body: moduleUpdateSchema } }, async (req) =>
    openPlatform(deps, req, async (gate) => {
      const [mod] = await gate.tx.select().from(schema.modules).where(eq(schema.modules.id, req.params.id));
      if (!mod) throw new ApiError(404, 'not_found', 'Module not found');
      const { addonMonthlyPaise, addonAnnualPaise, ...rest } = req.body;
      if (Object.keys(rest).length > 0) await gate.tx.update(schema.modules).set(rest).where(eq(schema.modules.id, mod.id));
      await upsertAddonPrice(gate.tx, mod.id, 'monthly', addonMonthlyPaise);
      await upsertAddonPrice(gate.tx, mod.id, 'annual', addonAnnualPaise);
      await gate.audit('admin.module.update', 'module', mod.id, { name: mod.name, status: mod.status }, req.body);
      return (await loadCatalog(gate.tx, { activePlansOnly: false, hideHidden: false })).modules.find((item) => item.id === mod.id)!;
    }),
  );

  r.post('/api/v1/admin/modules/:id/features', { schema: { params: idParam, body: featureCreateSchema } }, async (req) =>
    openPlatform(deps, req, async (gate) => {
      const [mod] = await gate.tx.select().from(schema.modules).where(eq(schema.modules.id, req.params.id));
      if (!mod) throw new ApiError(404, 'not_found', 'Module not found');
      let key = featureKey(mod.key, req.body.name);
      const taken = new Set((await gate.tx.select({ key: schema.moduleFeatures.key }).from(schema.moduleFeatures)).map((row) => row.key));
      let n = 2;
      while (taken.has(key)) key = `${featureKey(mod.key, req.body.name)}-${n++}`;
      const sort = (await gate.tx.select({ sortOrder: schema.moduleFeatures.sortOrder }).from(schema.moduleFeatures).where(eq(schema.moduleFeatures.moduleId, mod.id)).orderBy(desc(schema.moduleFeatures.sortOrder)).limit(1))[0];
      const [feature] = await gate.tx
        .insert(schema.moduleFeatures)
        .values({ moduleId: mod.id, key, name: req.body.name, sourceName: req.body.name, type: req.body.type, source: 'admin', sortOrder: (sort?.sortOrder ?? 0) + 1 })
        .returning();
      await gate.audit('admin.feature.create', 'module_feature', feature!.id, null, { key });
      return (await loadCatalog(gate.tx, { activePlansOnly: false, hideHidden: false })).modules.find((item) => item.id === mod.id)!.features.find((item) => item.id === feature!.id)!;
    }),
  );

  r.get('/api/v1/admin/tenants', { schema: { querystring: listQuery } }, async (req) =>
    openPlatform(deps, req, async (gate) => {
      const offset = (req.query.page - 1) * req.query.pageSize;
      const listed = await rows<Record<string, unknown>>(gate.tx, sql`select * from hos_admin_tenant_list(${req.query.q ?? ''}, ${req.query.status ?? ''}, ${req.query.pageSize}, ${offset})`);
      const items = listed.map(mapTenant);
      await auditPlatformRead(gate, req, 'tenants', null, { page: req.query.page, returned: items.length });
      return { items, total: Number(listed[0]?.total_count ?? 0), page: req.query.page, pageSize: req.query.pageSize } satisfies PageDto<AdminTenantListItem>;
    }),
  );

  r.get('/api/v1/admin/tenants/:id', { schema: { params: idParam } }, async (req) =>
    openPlatformTenant(deps, req, req.params.id, async (gate) => {
      const [hospital] = await gate.tx.select().from(schema.tenants).where(eq(schema.tenants.id, req.params.id));
      if (!hospital) throw new ApiError(404, 'not_found', 'Hospital not found');
      const subscription = await subscriptionDto(gate.tx);
      const access = await moduleStates(gate.tx, subscription?.planId ?? null, subscription?.addons.map((a) => a.moduleId) ?? []);
      const invoices = (await gate.tx.select().from(schema.invoices).orderBy(desc(schema.invoices.createdAt))).map(invoiceListItem);
      const payments = await gate.tx.select().from(schema.payments).orderBy(desc(schema.payments.createdAt));
      const orders = await gate.tx.select().from(schema.orders);
      const orderPublic = new Map(orders.map((order) => [order.id, order.publicId]));
      const overrides = await overrideDtos(gate.tx);
      const detail: AdminTenantDetailDto = {
        tenant: { ...tenantSummary(hospital), createdAt: iso(hospital.createdAt)!, suspendedReason: hospital.suspendedReason },
        locations: await locationDtos(gate.tx),
        users: await userDtos(gate.tx),
        subscription,
        modules: access.states,
        invoices,
        payments: payments.map((pay) => ({
          id: pay.publicId,
          orderId: orderPublic.get(pay.orderId) ?? pay.orderId,
          status: pay.status as AdminTenantDetailDto['payments'][number]['status'],
          method: pay.method as AdminTenantDetailDto['payments'][number]['method'],
          methodLabel: methodLabel(pay.method),
          amountPaise: pay.amountPaise,
          failureReason: pay.failureReason,
          createdAt: iso(pay.createdAt)!,
          capturedAt: iso(pay.capturedAt),
        })),
        overrides,
      };
      await auditPlatformRead(gate, req, 'tenant', hospital.id, {
        locations: detail.locations.length,
        users: detail.users.length,
        invoices: invoices.length,
        payments: payments.length,
        orders: orders.length,
        overrides: overrides.length,
      });
      return detail;
    }),
  );

  r.post('/api/v1/admin/tenants/:id/overrides', { schema: { params: idParam, body: overrideSchema } }, async (req) =>
    openPlatformTenant(deps, req, req.params.id, async (gate) => {
      const [row] = await gate.tx
        .insert(schema.tenantEntitlementOverrides)
        .values({
          tenantId: req.params.id,
          target: req.body.target,
          moduleId: req.body.target === 'module' ? req.body.moduleId! : null,
          featureId: req.body.target === 'feature' ? req.body.featureId! : null,
          effect: req.body.effect,
          reason: req.body.reason,
          createdByAdminId: gate.admin.id,
        })
        .returning();
      await gate.audit('admin.override.create', 'entitlement_override', row!.id, null, req.body);
      return (await overrideDtos(gate.tx)).find((item) => item.id === row!.id)!;
    }),
  );

  r.delete('/api/v1/admin/tenants/:id/overrides/:overrideId', { schema: { params: z.object({ id: z.uuid(), overrideId: z.uuid() }) } }, async (req, reply) =>
    openPlatformTenant(deps, req, req.params.id, async (gate) => {
      const [row] = await gate.tx.select().from(schema.tenantEntitlementOverrides).where(eq(schema.tenantEntitlementOverrides.id, req.params.overrideId));
      if (!row) throw new ApiError(404, 'not_found', 'Override not found');
      await gate.tx.delete(schema.tenantEntitlementOverrides).where(eq(schema.tenantEntitlementOverrides.id, row.id));
      await gate.audit('admin.override.delete', 'entitlement_override', row.id, { effect: row.effect }, null);
      return reply.status(204).send();
    }),
  );

  r.post('/api/v1/admin/tenants/:id/suspend', { schema: { params: idParam, body: suspendSchema } }, async (req, reply) =>
    openPlatformTenant(deps, req, req.params.id, async (gate) => {
      const [hospital] = await gate.tx.select().from(schema.tenants).where(eq(schema.tenants.id, req.params.id));
      if (!hospital) throw new ApiError(404, 'not_found', 'Hospital not found');
      const previous = hospital.status === 'suspended' ? hospital.statusBeforeSuspend : hospital.status;
      await gate.tx
        .update(schema.tenants)
        .set({
          status: 'suspended',
          statusBeforeSuspend: previous === 'onboarding' ? 'onboarding' : 'active',
          suspendedAt: hospital.suspendedAt ?? new Date(),
          suspendedReason: req.body.reason,
        })
        .where(eq(schema.tenants.id, hospital.id));
      await gate.audit('admin.tenant.suspend', 'tenant', hospital.id, { status: hospital.status }, { status: 'suspended', reason: req.body.reason, restore: previous });
      return reply.status(204).send();
    }),
  );

  r.post('/api/v1/admin/tenants/:id/reactivate', { schema: { params: idParam } }, async (req, reply) =>
    openPlatformTenant(deps, req, req.params.id, async (gate) => {
      const [hospital] = await gate.tx.select().from(schema.tenants).where(eq(schema.tenants.id, req.params.id));
      if (!hospital) throw new ApiError(404, 'not_found', 'Hospital not found');
      if (hospital.status !== 'suspended') throw new ApiError(409, 'not_suspended', 'Only a suspended hospital can be reactivated');
      const restore = hospital.statusBeforeSuspend === 'onboarding' ? 'onboarding' : 'active';
      await gate.tx
        .update(schema.tenants)
        .set({ status: restore, statusBeforeSuspend: null, suspendedAt: null, suspendedReason: null })
        .where(eq(schema.tenants.id, hospital.id));
      await gate.audit('admin.tenant.reactivate', 'tenant', hospital.id, { status: 'suspended' }, { status: restore });
      return reply.status(204).send();
    }),
  );

  r.get('/api/v1/admin/settings', async (req) =>
    openPlatform(deps, req, async (gate) => {
      const [row] = await gate.tx.select().from(schema.platformSettings).where(eq(schema.platformSettings.id, 1));
      if (!row) throw new ApiError(500, 'internal', 'Platform settings are not seeded');
      return settingsDto(row);
    }),
  );

  r.put('/api/v1/admin/settings', { schema: { body: platformSettingsSchema } }, async (req) =>
    openPlatform(deps, req, async (gate) => {
      await gate.tx.update(schema.platformSettings).set(req.body).where(eq(schema.platformSettings.id, 1));
      await gate.audit('admin.settings.update', 'platform_settings', '1', null, { invoicePrefix: req.body.invoicePrefix, supplierGstin: req.body.supplierGstin });
      const [row] = await gate.tx.select().from(schema.platformSettings).where(eq(schema.platformSettings.id, 1));
      return settingsDto(row!);
    }),
  );

  r.get('/api/v1/admin/audit', { schema: { querystring: listQuery } }, async (req) =>
    openPlatform(deps, req, async (gate) => {
      const offset = (req.query.page - 1) * req.query.pageSize;
      const listed = await gate.tx.select().from(schema.auditLog).orderBy(desc(schema.auditLog.seq)).limit(req.query.pageSize).offset(offset);
      const counted = await gate.tx.select({ n: sql<number>`count(*)::int` }).from(schema.auditLog);
      const n = counted[0]?.n ?? 0;
      const items: AuditEntryDto[] = listed.map((row) => ({
        id: String(row.id),
        seq: row.seq,
        createdAt: iso(row.createdAt)!,
        actorType: row.actorType,
        actorLabel: row.actorLabel,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        locationId: row.locationId,
        ip: row.ip,
        before: row.before,
        after: row.after,
        hash: row.hash,
        tenantId: row.tenantId,
      }));
      await auditPlatformRead(gate, req, 'audit', null, { page: req.query.page, returned: items.length });
      return { items, total: Number(n), page: req.query.page, pageSize: req.query.pageSize };
    }),
  );

  r.get('/api/v1/admin/audit/verify', async (req) => openPlatform(deps, req, (gate) => verifyChain(gate.tx, 'platform')));
}

/** One platform-audit row per read. Counts and the route only — no names, emails, or clinical fields. */
function auditPlatformRead(
  gate: { audit: (action: string, entityType: string, entityId: string | null, before: unknown, after: unknown) => Promise<void> },
  req: Parameters<typeof routeTemplate>[0],
  thing: string,
  targetTenantId: string | null,
  facts: Record<string, number | string | null>,
): Promise<void> {
  return gate.audit(`platform.read.${thing}`, thing, targetTenantId, null, {
    route: routeTemplate(req),
    targetTenantId,
    ...facts,
  });
}

function settingsDto(row: typeof schema.platformSettings.$inferSelect) {
  return {
    supplierLegalName: row.supplierLegalName,
    supplierTradeName: row.supplierTradeName,
    supplierGstin: row.supplierGstin,
    supplierStateCode: row.supplierStateCode,
    supplierAddress: row.supplierAddress,
    defaultSacCode: row.defaultSacCode,
    defaultGstRateBp: row.defaultGstRateBp,
    invoicePrefix: row.invoicePrefix,
  };
}

async function upsertAddonPrice(tx: Tx, moduleId: string, cycle: 'monthly' | 'annual', amount: number | null | undefined) {
  if (amount === undefined) return;
  const [price] = await tx.select().from(schema.prices).where(and(eq(schema.prices.targetType, 'module_addon'), eq(schema.prices.targetId, moduleId), eq(schema.prices.billingCycle, cycle)));
  if (amount === null) {
    if (price) await tx.delete(schema.prices).where(eq(schema.prices.id, price.id));
    return;
  }
  if (price) await tx.update(schema.prices).set({ amountPaise: amount, isPlaceholder: false }).where(eq(schema.prices.id, price.id));
  else await tx.insert(schema.prices).values({ targetType: 'module_addon', targetId: moduleId, billingCycle: cycle, amountPaise: amount, isPlaceholder: false });
}

async function overrideDtos(tx: Tx): Promise<OverrideDto[]> {
  const rows = await tx.select().from(schema.tenantEntitlementOverrides).orderBy(asc(schema.tenantEntitlementOverrides.createdAt));
  const modules = await tx.select().from(schema.modules);
  const features = await tx.select().from(schema.moduleFeatures);
  return rows.map((row) => ({
    id: row.id,
    target: row.target as 'module' | 'feature',
    moduleId: row.moduleId,
    featureId: row.featureId,
    label: row.target === 'module' ? modules.find((m) => m.id === row.moduleId)?.name ?? '' : features.find((f) => f.id === row.featureId)?.name ?? '',
    effect: row.effect as 'grant' | 'revoke',
    reason: row.reason,
    createdAt: iso(row.createdAt)!,
  }));
}

function mapTenant(row: Record<string, unknown>): AdminTenantListItem {
  return {
    id: String(row.id),
    displayName: String(row.display_name ?? ''),
    legalName: String(row.legal_name ?? ''),
    status: row.status as AdminTenantListItem['status'],
    facilityType: (row.facility_type as string | null) ?? null,
    planName: (row.plan_name as string | null) ?? null,
    cycle: (row.cycle as AdminTenantListItem['cycle']) ?? null,
    locationCount: Number(row.location_count ?? 0),
    userCount: Number(row.user_count ?? 0),
    createdAt: iso(row.created_at as string)!,
    ownerEmail: (row.owner_email as string | null) ?? null,
  };
}

function emptyOverview(): AdminOverviewDto {
  return { tenants: { total: 0, active: 0, onboarding: 0, suspended: 0 }, mrrPaise: 0, invoicedPaise: 0, planMix: [], recentTenants: [], catalogue: { modules: 0, available: 0, comingSoon: 0, hidden: 0, features: 0 } };
}
