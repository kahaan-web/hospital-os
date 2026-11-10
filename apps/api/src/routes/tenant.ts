import { schema } from '@hos/db';
import {
  checklistToggleSchema,
  dprCreateSchema,
  dprUpdateSchema,
  inviteUserSchema,
  updateUserSchema,
  type AuditEntryDto,
  type ChecklistItemDto,
  type ConsentDto,
  type DashboardDto,
  type DprDto,
  type PageDto,
} from '@hos/shared';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { entitlementsDto, invoiceListItem, loadAssignments, locationDtos, roleDtos, userDtos, type Assignment } from '../catalog';
import { randomToken, sha256Hex } from '../crypto';
import { openTenant, verifyChain, type Deps, type TenantGate } from '../guard';
import { ApiError } from '../http';
import { assertSeatAvailable } from '../seats';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().optional(),
  sort: z.string().optional(),
});

const CHECKLIST: { key: string; title: string; description: string; auto: boolean; optional: boolean; href: string | null }[] = [
  { key: 'profile', title: 'Facility profile', description: 'Legal name, registration and bed count are saved.', auto: true, optional: false, href: '/app' },
  { key: 'locations', title: 'Locations', description: 'Each branch has an address.', auto: true, optional: false, href: null },
  { key: 'billing', title: 'Plan and invoice', description: 'A sample-price subscription invoice is on file.', auto: true, optional: false, href: '/app/settings/billing' },
  { key: 'departments', title: 'Departments', description: 'Each location has at least one department.', auto: true, optional: false, href: null },
  { key: 'staff', title: 'Invite your team', description: 'Add front desk, doctors and cashiers.', auto: false, optional: true, href: '/app/settings/users' },
  { key: 'go-live', title: 'Ready to leave the sandbox', description: 'Sample doctors stay until you go live. The platform switches the sandbox off.', auto: false, optional: true, href: null },
];

export function registerTenant(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  r.get('/api/v1/tenant/dashboard', async (req, reply) => run(req, reply, (gate) => dashboard(gate)));
  r.get('/api/v1/tenant/entitlements', async (req, reply) => run(req, reply, (gate) => entitlementsDto(gate.tx)));
  r.get('/api/v1/tenant/locations', async (req, reply) => run(req, reply, (gate) => locationDtos(gate.tx)));
  r.get('/api/v1/tenant/roles', async (req, reply) => run(req, reply, async (gate) => {
    gate.requirePermission('users.view');
    return roleDtos(gate.tx);
  }));

  r.get('/api/v1/tenant/users', { schema: { querystring: listQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('users.view');
      let items = await userDtos(gate.tx);
      const q = req.query.q?.trim().toLowerCase();
      if (q) items = items.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q));
      const [field, dir] = (req.query.sort ?? 'createdAt:desc').split(':');
      items.sort((a, b) => {
        const av = field === 'name' ? a.name : field === 'email' ? a.email : a.createdAt;
        const bv = field === 'name' ? b.name : field === 'email' ? b.email : b.createdAt;
        return dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
      return page(items, req.query.page, req.query.pageSize);
    }),
  );

  r.post('/api/v1/tenant/users/invite', { schema: { body: inviteUserSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('users.manage');
      const roles = await roleDtos(gate.tx);
      const role = roles.find((item) => item.key === req.body.roleKey);
      if (!role) throw new ApiError(422, 'invalid_role', 'Choose a role from the list');
      const locationIds = req.body.locationIds;
      const targets = locationIds === null ? [null] : locationIds;
      assertMayGrant(gate, role.key, targets);
      await assertLocationsExist(gate, targets);
      await assertSeatAvailable(gate.tx, 1);
      const email = req.body.email.toLowerCase();
      const [user] = await gate.tx
        .insert(schema.users)
        .values({ tenantId: gate.hospital.id, email, name: req.body.name, status: 'pending' })
        .returning();
      await gate.tx.insert(schema.userLocationRoles).values(targets.map((locationId) => ({ tenantId: gate.hospital.id, userId: user!.id, roleId: role.id, locationId })));
      const token = randomToken();
      await gate.tx.insert(schema.invitations).values({
        tenantId: gate.hospital.id,
        userId: user!.id,
        tokenHash: sha256Hex(token),
        invitedBy: gate.user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      const devInviteUrl = `${deps.env.webOrigin}/login?invite=${token}`;
      await deps.email.send(gate.tx, {
        tenantId: gate.hospital.id,
        to: email,
        subject: 'You are invited to Hospital OS',
        template: 'user_invite',
        body: `Open ${devInviteUrl} to set a password.`,
      });
      await gate.audit('tenant.user.invite', 'user', user!.id, null, { email, role: role.key });
      const [dto] = (await userDtos(gate.tx)).filter((u) => u.id === user!.id);
      return { user: dto!, ...(deps.env.exposeSecrets ? { devInviteUrl } : {}) };
    }),
  );

  r.patch('/api/v1/tenant/users/:id', { schema: { params: z.object({ id: z.uuid() }), body: updateUserSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('users.manage');
      const [user] = await gate.tx.select().from(schema.users).where(eq(schema.users.id, req.params.id));
      if (!user) throw new ApiError(404, 'not_found', 'User not found');
      const currentAssignments = await loadAssignments(gate.tx, user.id);
      assertMayEdit(gate, currentAssignments);
      if (req.body.status === 'active' && user.status === 'disabled') await assertSeatAvailable(gate.tx, 1);
      if (req.body.status) await gate.tx.update(schema.users).set({ status: req.body.status }).where(eq(schema.users.id, user.id));
      if (req.body.status === 'disabled') await gate.tx.execute(sql`select hos_session_revoke_user(${user.id}::uuid)`);
      if (req.body.roleKey || req.body.locationIds !== undefined) {
        const roles = await roleDtos(gate.tx);
        const current = (await userDtos(gate.tx)).find((u) => u.id === user.id);
        const roleKey = req.body.roleKey ?? current?.roles[0]?.roleKey;
        const role = roles.find((item) => item.key === roleKey);
        if (!role) throw new ApiError(422, 'invalid_role', 'Choose a role from the list');
        const locationIds = req.body.locationIds === undefined ? current?.roles.map((item) => item.locationId) ?? [null] : req.body.locationIds === null ? [null] : req.body.locationIds;
        assertMayGrant(gate, role.key, locationIds);
        await assertLocationsExist(gate, locationIds);
        await gate.tx.delete(schema.userLocationRoles).where(eq(schema.userLocationRoles.userId, user.id));
        await gate.tx.insert(schema.userLocationRoles).values(locationIds.map((locationId) => ({ tenantId: gate.hospital.id, userId: user.id, roleId: role.id, locationId })));
      }
      await gate.audit('tenant.user.update', 'user', user.id, { status: user.status }, req.body);
      return (await userDtos(gate.tx)).find((u) => u.id === user.id)!;
    }),
  );

  r.patch('/api/v1/tenant/checklist/:key', { schema: { params: z.object({ key: z.string() }), body: checklistToggleSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('tenant.manage');
      const def = CHECKLIST.find((item) => item.key === req.params.key);
      if (!def) throw new ApiError(404, 'not_found', 'Checklist item not found');
      if (def.auto) throw new ApiError(422, 'checklist_auto', 'This item updates itself from your data');
      if (req.body.done) {
        await gate.tx
          .insert(schema.checklistItems)
          .values({ tenantId: gate.hospital.id, key: def.key, doneAt: new Date(), doneBy: gate.user.id })
          .onConflictDoUpdate({ target: [schema.checklistItems.tenantId, schema.checklistItems.key], set: { doneAt: new Date(), doneBy: gate.user.id } });
      } else {
        await gate.tx.delete(schema.checklistItems).where(and(eq(schema.checklistItems.tenantId, gate.hospital.id), eq(schema.checklistItems.key, def.key)));
      }
      await gate.audit('tenant.checklist.update', 'checklist', def.key, null, { done: req.body.done });
      const items = await checklist(gate);
      return items.find((item) => item.key === def.key)!;
    }),
  );

  r.get('/api/v1/tenant/audit', { schema: { querystring: listQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('audit.view');
      const offset = (req.query.page - 1) * req.query.pageSize;
      const rows = await gate.tx.select().from(schema.auditLog).orderBy(desc(schema.auditLog.seq)).limit(req.query.pageSize).offset(offset);
      const counted = await gate.tx.select({ n: sql<number>`count(*)::int` }).from(schema.auditLog);
      const n = counted[0]?.n ?? 0;
      return { items: rows.map(auditDto), total: Number(n), page: req.query.page, pageSize: req.query.pageSize } satisfies PageDto<AuditEntryDto>;
    }),
  );

  r.get('/api/v1/tenant/audit/verify', async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('audit.view');
      return verifyChain(gate.tx, gate.hospital.id);
    }),
  );

  r.get('/api/v1/tenant/privacy/requests', async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('privacy.manage');
      const rows = await gate.tx.select().from(schema.dataPrincipalRequests).orderBy(desc(schema.dataPrincipalRequests.createdAt));
      return rows.map(dprDto);
    }),
  );

  r.post('/api/v1/tenant/privacy/requests', { schema: { body: dprCreateSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('privacy.manage');
      const [row] = await gate.tx
        .insert(schema.dataPrincipalRequests)
        .values({
          tenantId: gate.hospital.id,
          type: req.body.type,
          principalName: req.body.principalName,
          principalContact: req.body.principalContact,
          reference: req.body.reference,
          details: req.body.details,
          dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdBy: gate.user.id,
        })
        .returning();
      await gate.audit('privacy.request.create', 'data_principal_request', row!.id, null, { type: req.body.type });
      return dprDto(row!);
    }),
  );

  r.patch('/api/v1/tenant/privacy/requests/:id', { schema: { params: z.object({ id: z.uuid() }), body: dprUpdateSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('privacy.manage');
      const [existing] = await gate.tx.select().from(schema.dataPrincipalRequests).where(eq(schema.dataPrincipalRequests.id, req.params.id));
      if (!existing) throw new ApiError(404, 'not_found', 'Request not found');
      const closed = req.body.status === 'completed' || req.body.status === 'rejected' ? new Date() : null;
      const [row] = await gate.tx
        .update(schema.dataPrincipalRequests)
        .set({ status: req.body.status, resolutionNotes: req.body.resolutionNotes, closedAt: closed })
        .where(eq(schema.dataPrincipalRequests.id, existing.id))
        .returning();
      await gate.audit('privacy.request.update', 'data_principal_request', existing.id, { status: existing.status }, { status: req.body.status });
      return dprDto(row!);
    }),
  );

  r.get('/api/v1/tenant/consents', async (req, reply) =>
    run(req, reply, async (gate) => {
      gate.requirePermission('privacy.manage');
      const rows = await gate.tx
        .select({ consent: schema.consents, name: schema.users.name })
        .from(schema.consents)
        .innerJoin(schema.users, eq(schema.users.id, schema.consents.userId))
        .orderBy(desc(schema.consents.grantedAt));
      return rows.map((row): ConsentDto => ({
        id: row.consent.id,
        userName: row.name,
        noticeVersion: row.consent.noticeVersion,
        purposes: row.consent.purposes,
        grantedAt: row.consent.grantedAt!.toISOString(),
        withdrawnAt: row.consent.withdrawnAt ? row.consent.withdrawnAt.toISOString() : null,
      }));
    }),
  );

  r.get('/api/v1/tenant/m/:moduleKey', { schema: { params: z.object({ moduleKey: z.string() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await gate.requireModule(req.params.moduleKey);
      return { key: req.params.moduleKey, access: 'enabled' as const };
    }),
  );

  // Generic feature probe for Phase B. Register a dedicated path in route-guards.ts
  // (permission + module + feature) when a module grows its own routes; this handler
  // is the reference for requireFeature(featureKey) → 403 not_entitled.
  r.get(
    '/api/v1/tenant/m/:moduleKey/features/:featureKey',
    { schema: { params: z.object({ moduleKey: z.string().min(1), featureKey: z.string().min(1) }) } },
    async (req, reply) =>
      run(req, reply, async (gate) => {
        await gate.requireModule(req.params.moduleKey);
        await gate.requireFeature(req.params.featureKey);
        return { moduleKey: req.params.moduleKey, featureKey: req.params.featureKey, access: 'enabled' as const };
      }),
  );
}

function page<T>(items: T[], pageNo: number, pageSize: number): PageDto<T> {
  const start = (pageNo - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page: pageNo, pageSize };
}

function auditDto(row: typeof schema.auditLog.$inferSelect): AuditEntryDto {
  return {
    id: String(row.id),
    seq: row.seq,
    createdAt: row.createdAt.toISOString(),
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
  };
}

function dprDto(row: typeof schema.dataPrincipalRequests.$inferSelect): DprDto {
  return {
    id: row.id,
    type: row.type,
    principalName: row.principalName,
    principalContact: row.principalContact,
    reference: row.reference,
    details: row.details,
    status: row.status,
    dueAt: row.dueAt.toISOString(),
    resolutionNotes: row.resolutionNotes,
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  };
}

async function checklist(gate: TenantGate): Promise<ChecklistItemDto[]> {
  const [hospital] = await gate.tx.select().from(schema.tenants);
  const locations = await gate.tx.select({ id: schema.locations.id }).from(schema.locations);
  const departments = await gate.tx.select({ id: schema.departments.id }).from(schema.departments);
  const invoices = await gate.tx.select({ id: schema.invoices.id }).from(schema.invoices);
  const saved = await gate.tx.select().from(schema.checklistItems);
  const auto: Record<string, boolean> = {
    profile: !!hospital?.legalName,
    locations: locations.length > 0,
    billing: invoices.length > 0,
    departments: departments.length > 0,
  };
  return CHECKLIST.map((def) => {
    const row = saved.find((item) => item.key === def.key);
    const done = def.auto ? !!auto[def.key] : !!row?.doneAt;
    return { ...def, done, doneAt: def.auto ? null : row?.doneAt ? row.doneAt.toISOString() : null };
  });
}

async function dashboard(gate: TenantGate): Promise<DashboardDto> {
  const items = await checklist(gate);
  const users = await gate.tx.select({ id: schema.users.id }).from(schema.users);
  const locations = await gate.tx.select({ id: schema.locations.id }).from(schema.locations);
  const doctors = await gate.tx.select().from(schema.doctors).orderBy(asc(schema.doctors.name));
  const departments = await gate.tx.select({ id: schema.departments.id }).from(schema.departments);
  const [latest] = await gate.tx.select().from(schema.invoices).orderBy(desc(schema.invoices.createdAt)).limit(1);
  return {
    checklist: items,
    counts: { users: users.length, locations: locations.length, doctors: doctors.length, departments: departments.length },
    latestInvoice: latest ? invoiceListItem(latest) : null,
    doctors: doctors.slice(0, 30).map((doc) => ({ id: doc.id, name: doc.name, qualification: doc.qualification, speciality: doc.speciality, locationId: doc.locationId, isSample: doc.isSample })),
  };
}

/** Tenant Admin outranks Location Admin, who outranks every other system role. */
function roleRank(key: string): number {
  if (key === 'tenant_admin') return 100;
  if (key === 'location_admin') return 50;
  return 10;
}

function callerRank(assignments: Assignment[]): number {
  return assignments.reduce((max, item) => Math.max(max, roleRank(item.roleKey)), 0);
}

function isTenantAdmin(assignments: Assignment[]): boolean {
  return assignments.some((item) => item.roleKey === 'tenant_admin');
}

function managedLocationIds(assignments: Assignment[]): Set<string> {
  return new Set(assignments.map((item) => item.locationId).filter((id): id is string => id !== null));
}

function assertMayGrant(gate: TenantGate, roleKey: string, locationIds: (string | null)[]): void {
  if (roleRank(roleKey) > callerRank(gate.assignments)) {
    throw new ApiError(403, 'forbidden', 'You cannot grant a role above your own');
  }
  if (isTenantAdmin(gate.assignments)) return;
  const mine = managedLocationIds(gate.assignments);
  for (const id of locationIds) {
    if (id === null || !mine.has(id)) throw new ApiError(403, 'forbidden', 'You can only assign locations you manage');
  }
}

function assertMayEdit(gate: TenantGate, target: Assignment[]): void {
  if (isTenantAdmin(gate.assignments)) return;
  if (target.some((item) => item.roleKey === 'tenant_admin')) {
    throw new ApiError(403, 'forbidden', 'Only a Tenant Admin can change a Tenant Admin');
  }
  const mine = managedLocationIds(gate.assignments);
  for (const item of target) {
    if (item.locationId === null || !mine.has(item.locationId)) {
      throw new ApiError(403, 'forbidden', 'You can only change staff at your locations');
    }
  }
}

async function assertLocationsExist(gate: TenantGate, locationIds: (string | null)[]): Promise<void> {
  const wanted = locationIds.filter((id): id is string => id !== null);
  if (wanted.length === 0) return;
  const rows = await gate.tx.select({ id: schema.locations.id }).from(schema.locations);
  const known = new Set(rows.map((row) => row.id));
  if (wanted.some((id) => !known.has(id))) throw new ApiError(422, 'invalid_reference', 'That location does not exist');
}
