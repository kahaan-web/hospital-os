import { schema, type Db, type Tx } from '@hos/db';
import type { AuditVerifyDto } from '@hos/shared';
import { desc, eq, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { assertPermission, loadAssignments, moduleStates, subscriptionDto, type Assignment } from './catalog';
import { sha256Hex } from './crypto';
import type { ApiEnv } from './env';
import type { EmailSender, PaymentGateway, SmsSender } from './providers';
import {
  ApiError,
  idempotencyKey,
  idempotencyRequired,
  idempotencyScope,
  requestHash,
  requestMeta,
  readSessionToken,
  resolveSession,
  routeTemplate,
  tenant,
  withIdempotency,
  writeAudit,
  type Actor,
} from './http';
import { AUTHENTICATED, lookupTenantGuard, resolveGuardKey } from './route-guards';

export interface Deps {
  db: Db;
  env: ApiEnv;
  sms: SmsSender;
  email: EmailSender;
  gateway: PaymentGateway;
}

export interface TenantGate {
  tx: Tx;
  actor: Actor;
  user: typeof schema.users.$inferSelect;
  hospital: typeof schema.tenants.$inferSelect;
  locationId: string | null;
  assignments: Assignment[];
  tokenHash: string;
  audit: (action: string, entityType: string, entityId: string | null, before: unknown, after: unknown) => Promise<void>;
  requirePermission: (key: string) => void;
  requireAnyPermission: (keys: string[]) => void;
  requireModule: (key: string) => Promise<void>;
  requireAnyModule: (keys: string[]) => Promise<void>;
  /**
   * 403 `not_entitled` unless this request's entitlement set contains `featureKey`.
   * The module and feature load is memoised for this request and recomputed on the next one,
   * so a plan change, add-on purchase, or App Admin override is visible immediately.
   */
  requireFeature: (featureKey: string) => Promise<void>;
}

/** `Array.isArray` does not narrow `readonly T[]` out of a union with `T`. */
function isList<T>(value: T | readonly T[] | null | undefined): value is readonly T[] {
  return Array.isArray(value);
}

export async function openTenant<T>(deps: Deps, req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>): Promise<T> {
  const resolved = await resolveSession(deps.db, readSessionToken(req));
  if (!resolved || resolved.session.kind !== 'tenant' || !resolved.session.tenantId || !resolved.session.userId) {
    throw new ApiError(401, 'unauthenticated', 'Sign in to continue');
  }
  const tenantId = resolved.session.tenantId;
  const userId = resolved.session.userId;
  return tenant(deps.db, tenantId, async (tx) => {
    const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, userId));
    if (!user || user.status !== 'active') throw new ApiError(401, 'unauthenticated', 'Sign in again');
    const [hospital] = await tx.select().from(schema.tenants);
    if (!hospital) throw new ApiError(401, 'unauthenticated', 'Sign in again');
    const path = (req.routeOptions.url ?? req.url).split('?')[0] ?? req.url;
    const policy = lookupTenantGuard(req.method, path);
    if (!policy) throw new ApiError(500, 'guard_missing', `No tenant guard for ${req.method} ${path}`);
    if (hospital.status === 'suspended' && !policy.allowWhenSuspended) {
      throw new ApiError(403, 'tenant_suspended', 'This hospital account is suspended');
    }
    if (hospital.status === 'onboarding' && !path.includes('/auth/') && !path.includes('/onboarding') && !path.includes('/billing/')) {
      throw new ApiError(403, 'onboarding_incomplete', 'Finish setup before using the hospital workspace');
    }
    const assignments = await loadAssignments(tx, userId);
    const locations = await tx.select().from(schema.locations).orderBy(desc(schema.locations.isPrimary), desc(schema.locations.sortOrder));
    const allowed = (id: string) => assignments.some((a) => a.locationId === null || a.locationId === id);
    let locationId = resolved.session.locationId;
    if (locationId && !allowed(locationId)) locationId = null;
    if (!locationId) {
      locationId = locations.find((loc) => allowed(loc.id))?.id ?? null;
      if (locationId && locationId !== resolved.session.locationId) {
        await tx.execute(sql`select hos_session_set_location(${resolved.hash}, ${locationId}::uuid)`);
      }
    }
    const meta = requestMeta(req);
    const actor: Actor = {
      actorType: 'user',
      actorId: user.id,
      actorLabel: user.email,
      tenantId,
      locationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    };
    let entitlements: Promise<{ features: Set<string>; accessByModule: Map<string, string> }> | null = null;
    const loadEntitlements = () => {
      if (!entitlements) {
        entitlements = (async () => {
          const subscription = await subscriptionDto(tx);
          const access = await moduleStates(tx, subscription?.planId ?? null, subscription?.addons.map((addon) => addon.moduleId) ?? []);
          return {
            features: new Set(access.features),
            accessByModule: new Map(access.states.map((state) => [state.key, state.access])),
          };
        })();
      }
      return entitlements;
    };
    const notEntitled = (moduleKey: string) => new ApiError(403, 'not_entitled', 'This module is not included in your plan', undefined, { moduleKey });
    const gate: TenantGate = {
      tx,
      actor,
      user,
      hospital,
      locationId,
      assignments,
      tokenHash: resolved.hash,
      audit: (action, entityType, entityId, before, after) => writeAudit(tx, actor, action, entityType, entityId, before, after),
      requirePermission: (key) => {
        if (key === AUTHENTICATED) return;
        assertPermission(assignments, locationId, key);
      },
      requireAnyPermission: (keys) => {
        if (keys.includes(AUTHENTICATED)) return;
        if (!keys.some((key) => {
          try {
            assertPermission(assignments, locationId, key);
            return true;
          } catch {
            return false;
          }
        })) {
          throw new ApiError(403, 'forbidden', 'You do not have permission to do that', undefined, { permission: keys[0] });
        }
      },
      requireModule: async (key) => {
        const loaded = await loadEntitlements();
        if (loaded.accessByModule.get(key) !== 'enabled') throw notEntitled(key);
      },
      requireAnyModule: async (keys) => {
        const loaded = await loadEntitlements();
        if (!keys.some((key) => loaded.accessByModule.get(key) === 'enabled')) throw notEntitled(keys[0] ?? '');
      },
      requireFeature: async (featureKey) => {
        const loaded = await loadEntitlements();
        if (!loaded.features.has(featureKey)) {
          throw new ApiError(403, 'not_entitled', 'This feature is not included in your plan', undefined, { featureKey });
        }
      },
    };
    if (isList(policy.permission)) gate.requireAnyPermission([...policy.permission]);
    else if (policy.permission) gate.requirePermission(policy.permission);
    const moduleSpec = policy.module;
    if (moduleSpec && policy.feature && !isList(moduleSpec)) {
      const moduleKey = resolveGuardKey(moduleSpec, req);
      const featureKey = resolveGuardKey(policy.feature, req);
      if (!featureKey.startsWith(`${moduleKey}.`)) {
        throw new ApiError(403, 'not_entitled', 'This feature is not included in your plan', undefined, { moduleKey, featureKey });
      }
      await gate.requireModule(moduleKey);
      await gate.requireFeature(featureKey);
    } else {
      if (isList(moduleSpec)) await gate.requireAnyModule(moduleSpec.map((item) => resolveGuardKey(item, req)));
      else if (moduleSpec) await gate.requireModule(resolveGuardKey(moduleSpec, req));
      if (policy.feature) await gate.requireFeature(resolveGuardKey(policy.feature, req));
    }
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return fn(gate);
    return withIdempotency(
      tx,
      reply,
      tenantId,
      idempotencyScope(routeTemplate(req), actor.actorId),
      idempotencyKey(req),
      idempotencyRequired(req),
      requestHash(req),
      () => fn(gate),
    );
  });
}

export interface PlatformGate {
  tx: Tx;
  admin: typeof schema.platformAdmins.$inferSelect;
  actor: Actor;
  audit: (action: string, entityType: string, entityId: string | null, before: unknown, after: unknown) => Promise<void>;
}

async function requirePlatformSession(deps: Deps, req: FastifyRequest) {
  const resolved = await resolveSession(deps.db, readSessionToken(req));
  if (!resolved || resolved.session.kind !== 'platform' || !resolved.session.platformAdminId) {
    throw new ApiError(resolved?.session.kind === 'tenant' ? 403 : 401, resolved ? 'forbidden' : 'unauthenticated', resolved ? 'App Admin access only' : 'Sign in to continue');
  }
  return resolved;
}

export async function openPlatform<T>(deps: Deps, req: FastifyRequest, fn: (gate: PlatformGate) => Promise<T>): Promise<T> {
  const resolved = await requirePlatformSession(deps, req);
  const { platform } = await import('./http');
  return platform(deps.db, async (tx) => {
    const [admin] = await tx.select().from(schema.platformAdmins).where(eq(schema.platformAdmins.id, resolved.session.platformAdminId!));
    if (!admin || admin.status !== 'active') throw new ApiError(401, 'unauthenticated', 'Sign in again');
    const meta = requestMeta(req);
    const actor: Actor = { actorType: 'platform_admin', actorId: admin.id, actorLabel: admin.email, tenantId: null, locationId: null, ip: meta.ip, userAgent: meta.userAgent };
    return fn({
      tx,
      admin,
      actor,
      audit: (action, entityType, entityId, before, after) => writeAudit(tx, actor, action, entityType, entityId, before, after),
    });
  });
}

export async function openPlatformTenant<T>(deps: Deps, req: FastifyRequest, tenantId: string, fn: (gate: PlatformGate) => Promise<T>): Promise<T> {
  const resolved = await requirePlatformSession(deps, req);
  const { platformOnTenant } = await import('./http');
  return platformOnTenant(deps.db, tenantId, async (tx) => {
    const [admin] = await tx.select().from(schema.platformAdmins).where(eq(schema.platformAdmins.id, resolved.session.platformAdminId!));
    if (!admin || admin.status !== 'active') throw new ApiError(401, 'unauthenticated', 'Sign in again');
    const meta = requestMeta(req);
    const actor: Actor = {
      actorType: 'platform_admin',
      actorId: admin.id,
      actorLabel: admin.email,
      tenantId,
      locationId: null,
      ip: meta.ip,
      userAgent: meta.userAgent,
    };
    return fn({
      tx,
      admin,
      actor,
      audit: (action, entityType, entityId, before, after) => writeAudit(tx, actor, action, entityType, entityId, before, after),
    });
  });
}

export async function verifyChain(tx: Tx, chainKey: string): Promise<AuditVerifyDto> {
  let prev = '0'.repeat(64);
  let expect = 1;
  let entries = 0;
  let after = 0;
  for (;;) {
    const batch = await tx.execute<{ seq: string | number; prev_hash: string; hash: string; c: string }>(sql`
      select seq, prev_hash, hash, hos_audit_canonical(a) as c
      from audit_log a
      where chain_key = ${chainKey} and seq > ${after}
      order by seq
      limit 1000
    `);
    if (batch.rows.length === 0) break;
    for (const row of batch.rows) {
      entries += 1;
      const seq = Number(row.seq);
      if (seq !== expect || row.prev_hash !== prev || sha256Hex(row.c) !== row.hash) return { ok: false, entries, brokenAtSeq: seq };
      prev = row.hash;
      expect += 1;
      after = seq;
    }
    if (batch.rows.length < 1000) break;
  }
  return { ok: true, entries, brokenAtSeq: null };
}
