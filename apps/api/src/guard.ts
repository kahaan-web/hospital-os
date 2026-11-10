import { schema, type Db, type Tx } from '@hos/db';
import type { AuditVerifyDto } from '@hos/shared';
import { desc, eq, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { assertModule, assertPermission, loadAssignments, type Assignment } from './catalog';
import { sha256Hex } from './crypto';
import type { ApiEnv } from './env';
import {
  ApiError,
  idempotencyKey,
  idempotencyRequired,
  requestHash,
  requestMeta,
  resolveSession,
  routeTemplate,
  SESSION_COOKIE,
  tenant,
  withIdempotency,
  writeAudit,
  type Actor,
} from './http';

export interface Deps {
  db: Db;
  env: ApiEnv;
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
  requireModule: (key: string) => Promise<void>;
}

export async function openTenant<T>(deps: Deps, req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>): Promise<T> {
  const resolved = await resolveSession(deps.db, req.cookies[SESSION_COOKIE]);
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
    const path = req.routeOptions.url ?? req.url;
    if (hospital.status === 'suspended' && !path.includes('/auth/me') && !path.includes('/auth/logout')) {
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
    const gate: TenantGate = {
      tx,
      actor,
      user,
      hospital,
      locationId,
      assignments,
      tokenHash: resolved.hash,
      audit: (action, entityType, entityId, before, after) => writeAudit(tx, actor, action, entityType, entityId, before, after),
      requirePermission: (key) => assertPermission(assignments, locationId, key),
      requireModule: (key) => assertModule(tx, key),
    };
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return fn(gate);
    return withIdempotency(tx, reply, tenantId, routeTemplate(req), idempotencyKey(req), idempotencyRequired(req), requestHash(req), () => fn(gate));
  });
}

export interface PlatformGate {
  tx: Tx;
  admin: typeof schema.platformAdmins.$inferSelect;
  actor: Actor;
  audit: (action: string, entityType: string, entityId: string | null, before: unknown, after: unknown) => Promise<void>;
}

async function requirePlatformSession(deps: Deps, req: FastifyRequest) {
  const resolved = await resolveSession(deps.db, req.cookies[SESSION_COOKIE]);
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
