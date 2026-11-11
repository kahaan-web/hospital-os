import { schema, withPlatform, withPlatformOnTenant, withTenant, type Db, type Tx } from '@hos/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { canonicalJson, sha256Hex } from './crypto';
import type { ApiEnv } from './env';

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function sendError(reply: FastifyReply, statusCode: number, code: string, message: string, extra?: { fields?: Record<string, string>; details?: unknown }) {
  return reply.status(statusCode).send({ error: { code, message, ...(extra?.fields ? { fields: extra.fields } : {}), ...(extra?.details !== undefined ? { details: extra.details } : {}) } });
}

export function installErrorHandler(app: Pick<FastifyInstance, 'setErrorHandler' | 'setNotFoundHandler'>): void {
  app.setNotFoundHandler((_req: FastifyRequest, reply: FastifyReply) => {
    sendError(reply, 404, 'not_found', 'Not found');
  });
  app.setErrorHandler((error: unknown, _req: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ApiError) return sendError(reply, error.statusCode, error.code, error.message, { fields: error.fields, details: error.details });
    if (error instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues) {
        const path = issue.path.join('.');
        if (!(path in fields)) fields[path] = issue.message;
      }
      return sendError(reply, 400, 'validation', 'Check the highlighted fields', { fields });
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      const fields: Record<string, string> = {};
      for (const issue of error.validation) {
        const path = issue.instancePath.replace(/^\//, '').replaceAll('/', '.');
        if (!(path in fields)) fields[path] = issue.message ?? 'Invalid value';
      }
      return sendError(reply, 400, 'validation', 'Check the highlighted fields', { fields });
    }
    if (isResponseSerializationError(error)) {
      reply.log.error(error);
      return sendError(reply, 500, 'internal', 'The server built a response it could not serialise');
    }
    const code = pgCode(error);
    if (code === '23505') {
      const constraint = pgConstraint(error);
      if (constraint?.includes('email')) return sendError(reply, 409, 'email_taken', 'An account with this email already exists');
      return sendError(reply, 409, 'conflict', 'That record already exists');
    }
    if (code === '23503') return sendError(reply, 422, 'invalid_reference', 'That refers to a record that does not exist');
    if (code === '42501') return sendError(reply, 403, 'forbidden', 'You cannot do that');
    if (error instanceof Error && error.message.startsWith('Invalid ')) return sendError(reply, 400, 'validation', error.message);
    const status = typeof error === 'object' && error && 'statusCode' in error ? Number((error as { statusCode: number }).statusCode) : 500;
    if (status === 429) return sendError(reply, 429, 'rate_limited', 'Too many attempts. Wait a minute and try again.');
    if (status >= 400 && status < 500 && error instanceof Error) return sendError(reply, status, 'bad_request', error.message);
    reply.log.error(error);
    return sendError(reply, 500, 'internal', 'Something went wrong');
  });
}

function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof (error as { code: unknown }).code === 'string') {
    const code = (error as { code: string }).code;
    if (/^[0-9A-Z]{5}$/.test(code)) return code;
  }
  if ('cause' in error) return pgCode((error as { cause: unknown }).cause);
  return undefined;
}

function pgConstraint(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('constraint' in error && typeof (error as { constraint: unknown }).constraint === 'string') return (error as { constraint: string }).constraint;
  if ('cause' in error) return pgConstraint((error as { cause: unknown }).cause);
  return undefined;
}

export interface Actor {
  actorType: 'user' | 'platform_admin' | 'system';
  actorId: string | null;
  actorLabel: string;
  /** Null writes the platform audit chain. */
  tenantId: string | null;
  locationId: string | null;
  ip: string | null;
  userAgent: string | null;
}

/** Thrown in dev and test when before/after still carries a patient-data key. Production strips those keys instead. */
export class AuditPhiError extends Error {
  readonly keys: string[];
  constructor(keys: string[]) {
    super(`Audit payload contains patient data keys: ${keys.join(', ')}`);
    this.name = 'AuditPhiError';
    this.keys = keys;
  }
}

/** Normalised deny-list. `name` is handled separately so plan and module names stay auditable. */
const PHI_EXACT = new Set([
  'firstname',
  'middlename',
  'lastname',
  'fullname',
  'dob',
  'mobile',
  'altmobile',
  'email',
  'abhanumber',
  'abhaaddress',
  'bloodgroup',
  'idlast4',
  'filepath',
  'photopath',
]);

const PHI_PREFIXES = ['address', 'guardian', 'emergency'];

/** Free text on a clinical note, alert, or vital sign. `reason` on a cancel or void stays — it is an operational field. */
const NARRATIVE_KEYS = new Set(['note', 'notes', 'text', 'body']);

function normalKey(key: string): string {
  return key.toLowerCase().replace(/_/g, '');
}

function isPatientEntity(entityType: string): boolean {
  return entityType === 'patient' || entityType.startsWith('patient_');
}

/** Patient and clinical rows. Audit readers without patients.view do not receive these payloads. */
export function isClinicalAuditEntity(entityType: string): boolean {
  return (
    isPatientEntity(entityType) ||
    entityType.startsWith('clinical_') ||
    entityType === 'encounter' ||
    entityType === 'vital_signs' ||
    entityType === 'mlc_case' ||
    entityType === 'appointment' ||
    entityType === 'opd_queue'
  );
}

function isNarrativeEntity(entityType: string): boolean {
  return entityType === 'clinical_note' || entityType === 'patient_alert' || entityType === 'vital_signs';
}

function isPhiKey(key: string, entityType: string): boolean {
  const normal = normalKey(key);
  if (PHI_EXACT.has(normal)) return true;
  if (PHI_PREFIXES.some((prefix) => normal.startsWith(prefix))) return true;
  if (normal === 'name' && isPatientEntity(entityType)) return true;
  if (NARRATIVE_KEYS.has(normal) && isNarrativeEntity(entityType)) return true;
  return false;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

/** Copy `value` without deny-listed keys. Key names are collected; values are never returned. */
function scrubPhi(value: unknown, entityType: string, found: string[]): unknown {
  if (Array.isArray(value)) return value.map((item) => scrubPhi(item, entityType, found));
  if (!isPlainRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isPhiKey(key, entityType)) {
      found.push(key);
      continue;
    }
    out[key] = scrubPhi(child, entityType, found);
  }
  return out;
}

function guardAuditPayload(action: string, entityType: string, before: unknown, after: unknown): { before: unknown; after: unknown } {
  const found: string[] = [];
  const safeBefore = scrubPhi(before, entityType, found);
  const safeAfter = scrubPhi(after, entityType, found);
  if (found.length === 0) return { before, after };
  const keys = [...new Set(found)];
  if (process.env.NODE_ENV === 'production') {
    console.error(`audit PHI keys stripped action=${action} entity=${entityType} keys=${keys.join(',')}`);
    return { before: safeBefore, after: safeAfter };
  }
  throw new AuditPhiError(keys);
}

export async function writeAudit(
  tx: Tx,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
): Promise<void> {
  const payload = guardAuditPayload(action, entityType, before, after);
  await tx.insert(schema.auditLog).values({
    tenantId: actor.tenantId,
    locationId: actor.locationId,
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    ip: actor.ip,
    userAgent: actor.userAgent,
    action,
    entityType,
    entityId: entityId,
    before: (payload.before ?? null) as never,
    after: (payload.after ?? null) as never,
  });
}

export function requestMeta(req: FastifyRequest): { ip: string | null; userAgent: string | null } {
  const ua = req.headers['user-agent'];
  return { ip: req.ip || null, userAgent: typeof ua === 'string' ? ua.slice(0, 400) : null };
}

export const SESSION_COOKIE = 'hos_session';

/** Cookie or `x-hos-session`. Both at once is a 400 — native apps send the header, browsers send the cookie. */
export function readSessionToken(req: FastifyRequest): string | undefined {
  const header = req.headers['x-hos-session'];
  const headerToken = typeof header === 'string' && header.length > 0 ? header : undefined;
  const cookieToken = req.cookies[SESSION_COOKIE];
  if (headerToken && cookieToken) throw new ApiError(400, 'validation', 'Send the session cookie or the x-hos-session header, not both');
  return headerToken ?? (cookieToken || undefined);
}

export function cookieOptions(env: ApiEnv, maxAgeSeconds: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: env.production, path: '/', maxAge: maxAgeSeconds };
}

export interface ResolvedSession {
  id: string;
  kind: 'tenant' | 'platform';
  userId: string | null;
  platformAdminId: string | null;
  tenantId: string | null;
  locationId: string | null;
  expiresAt: Date;
}

export async function resolveSession(db: Db, token: string | undefined): Promise<{ token: string; hash: string; session: ResolvedSession } | null> {
  if (!token) return null;
  const hash = sha256Hex(token);
  const found = await db.execute<{
    id: string;
    kind: 'tenant' | 'platform';
    user_id: string | null;
    platform_admin_id: string | null;
    tenant_id: string | null;
    location_id: string | null;
    expires_at: Date;
  }>(sql`select id, kind, user_id, platform_admin_id, tenant_id, location_id, expires_at from hos_session_resolve(${hash})`);
  const row = found.rows[0];
  if (!row) return null;
  return {
    token,
    hash,
    session: {
      id: row.id,
      kind: row.kind,
      userId: row.user_id,
      platformAdminId: row.platform_admin_id,
      tenantId: row.tenant_id,
      locationId: row.location_id,
      expiresAt: row.expires_at,
    },
  };
}

const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,128}$/;

export async function withIdempotency<T>(
  tx: Tx,
  reply: FastifyReply,
  tenantId: string,
  scope: string,
  key: string | undefined,
  required: boolean,
  requestHash: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!key) {
    if (required) throw new ApiError(400, 'idempotency_key_required', 'Send an Idempotency-Key header (8–128 letters, numbers, _ or -)');
    return fn();
  }
  if (!IDEMPOTENCY_RE.test(key)) throw new ApiError(400, 'validation', 'Idempotency-Key must be 8–128 letters, numbers, _ or -');
  const inserted = await tx.execute<{ key: string }>(sql`
    insert into idempotency_keys (tenant_id, scope, key, request_hash, expires_at)
    values (${tenantId}, ${scope}, ${key}, ${requestHash}, now() + interval '24 hours')
    on conflict (tenant_id, scope, key) do nothing
    returning key
  `);
  if (inserted.rows.length === 0) {
    const [existing] = await tx
      .select()
      .from(schema.idempotencyKeys)
      .where(and(eq(schema.idempotencyKeys.tenantId, tenantId), eq(schema.idempotencyKeys.scope, scope), eq(schema.idempotencyKeys.key, key)));
    if (!existing || existing.responseStatus == null) throw new ApiError(409, 'idempotency_in_progress', 'That idempotency key is still in progress');
    if (existing.requestHash !== requestHash) throw new ApiError(409, 'idempotency_mismatch', 'This idempotency key was already used with a different request');
    reply.header('Idempotent-Replayed', 'true');
    reply.status(existing.responseStatus);
    return existing.responseBody as T;
  }
  const body = await fn();
  const status = reply.statusCode || 200;
  if (status >= 200 && status < 300) {
    await tx
      .update(schema.idempotencyKeys)
      .set({ responseStatus: status, responseBody: (body ?? null) as never })
      .where(and(eq(schema.idempotencyKeys.tenantId, tenantId), eq(schema.idempotencyKeys.scope, scope), eq(schema.idempotencyKeys.key, key)));
  } else {
    await tx
      .delete(schema.idempotencyKeys)
      .where(and(eq(schema.idempotencyKeys.tenantId, tenantId), eq(schema.idempotencyKeys.scope, scope), eq(schema.idempotencyKeys.key, key)));
  }
  return body;
}

export function idempotencyKey(req: FastifyRequest): string | undefined {
  const raw = req.headers['idempotency-key'];
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

export function requestHash(req: FastifyRequest): string {
  return sha256Hex(canonicalJson({ params: req.params ?? {}, body: req.body ?? {} }));
}

export function routeTemplate(req: FastifyRequest): string {
  return `${req.method} ${req.routeOptions.url ?? req.url}`;
}

/**
 * Money routes, ADT admit / transfer / discharge / bed-day posting, appointment / OPD visit
 * creates, and pharmacy stock postings. Quote is a read of a price, so it does not require a key.
 * Bed-day posting inserts clinical charges (INSERT is still granted). It does not
 * update invoices, payments, or subscriptions.
 * Visit registration posts the consultation charge. Appointment create takes a seat.
 * Cancel, reschedule and queue status are not creates, so they stay optional.
 * Pharmacy sale, goods receipt, IP issue, return and adjustment replay through the same key
 * instead of a second check inside the handler.
 */
const IDEMPOTENT_POSTS = new Set([
  '/api/v1/billing/orders',
  '/api/v1/billing/orders/:orderId/pay',
  '/api/v1/billing/verify',
  '/api/v1/billing/change-apply',
  '/api/v1/billing/webhooks/mock',
  '/api/v1/tenant/clinical/encounters/:id/orders',
  '/api/v1/tenant/m/adt/admissions',
  '/api/v1/tenant/m/adt/admissions/:id/transfer',
  '/api/v1/tenant/m/adt/admissions/:id/discharge',
  '/api/v1/tenant/m/adt/bed-charges/post',
  '/api/v1/tenant/m/appointments/appointments',
  '/api/v1/tenant/m/opd-visit/visits',
  '/api/v1/tenant/m/pharmacy/sales',
  '/api/v1/tenant/m/pharmacy/sales/:id/return',
  '/api/v1/tenant/m/pharmacy/grns',
  '/api/v1/tenant/m/pharmacy/supplier-returns',
  '/api/v1/tenant/m/pharmacy/ip-issues',
  '/api/v1/tenant/m/pharmacy/ip-issues/:id/return',
  '/api/v1/tenant/m/pharmacy/adjustments',
]);

export function idempotencyRequired(req: FastifyRequest): boolean {
  if (req.method !== 'POST') return false;
  const url = req.routeOptions.url ?? req.url.split('?')[0] ?? '';
  return IDEMPOTENT_POSTS.has(url);
}

/** Platform scope sees no tenant rows. */
export async function platform<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withPlatform(db, fn);
}

export async function platformOnTenant<T>(db: Db, tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withPlatformOnTenant(db, tenantId, fn);
}

export async function tenant<T>(db: Db, tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant(db, tenantId, fn);
}

export async function rows<T extends Record<string, unknown>>(tx: { execute: Db['execute'] }, query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await tx.execute(query);
  return result.rows as T[];
}
