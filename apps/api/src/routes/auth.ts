import { hashPassword, schema, verifyPassword } from '@hos/db';
import {
  acceptInviteSchema,
  loginSchema,
  normaliseMobile,
  otpResendSchema,
  otpVerifySchema,
  signupSchema,
  switchLocationSchema,
  totpCodeSchema,
} from '@hos/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { tenantMe } from '../catalog';
import { generateTotpSecret, otpauthUrl, otpCode, randomToken, safeEqual, sha256Hex, verifyTotp } from '../crypto';
import { openTenant, type Deps } from '../guard';
import { ApiError, cookieOptions, platform, readSessionToken, requestMeta, resolveSession, SESSION_COOKIE, tenant, writeAudit } from '../http';

const limit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

/** Verified when no account matches, so a missing email costs the same argon2 check as a wrong password. */
const DUMMY_PASSWORD_HASH = await hashPassword('not-a-real-account');

export function registerAuth(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post('/api/v1/auth/signup', { ...limit, schema: { body: signupSchema } }, async (req) => {
    const body = req.body;
    const notice = await platform(deps.db, async (tx) => {
      const [row] = await tx.select().from(schema.privacyNotices).where(eq(schema.privacyNotices.isCurrent, true));
      return row ?? null;
    });
    if (!notice || notice.version !== body.noticeVersion) throw new ApiError(422, 'notice_mismatch', 'The privacy notice has changed. Refresh and try again.');
    const tenantId = crypto.randomUUID();
    const code = otpCode();
    const mobile = normaliseMobile(body.mobile)!;
    const meta = requestMeta(req);
    const email = body.email.toLowerCase();
    let challengeId = '';
    await tenant(deps.db, tenantId, async (tx) => {
      await tx.insert(schema.tenants).values({ id: tenantId, slug: `t-${crypto.randomUUID().slice(0, 8)}`, status: 'onboarding', onboardingStep: 'facility' });
      const [user] = await tx
        .insert(schema.users)
        .values({ tenantId, email, mobile, name: body.name, passwordHash: await hashPassword(body.password), status: 'pending', designation: body.designation })
        .returning();
      const [role] = await tx.select().from(schema.roles).where(and(isNull(schema.roles.tenantId), eq(schema.roles.key, 'tenant_admin')));
      if (!role) throw new ApiError(500, 'internal', 'Tenant Admin role is not seeded');
      await tx.insert(schema.userLocationRoles).values({ tenantId, userId: user!.id, roleId: role.id, locationId: null });
      const purposes = ['account_management', 'service_delivery', 'billing_invoicing', 'security_audit'];
      if (body.productUpdates) purposes.push('product_updates');
      await tx.insert(schema.consents).values({
        tenantId,
        userId: user!.id,
        noticeId: notice.id,
        noticeVersion: notice.version,
        purposes,
        termsAccepted: true,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      const [challenge] = await tx
        .insert(schema.otpChallenges)
        .values({
          tenantId,
          userId: user!.id,
          purpose: 'signup',
          channel: 'sms',
          destination: mobile,
          codeHash: sha256Hex(code),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        })
        .returning();
      challengeId = challenge!.id;
      await deps.sms.send(tx, { tenantId, to: mobile, template: 'signup_otp', body: `Hospital OS code ${code}` });
      await writeAudit(tx, { actorType: 'user', actorId: user!.id, actorLabel: email, tenantId, locationId: null, ...meta }, 'auth.user.signup', 'user', user!.id, null, { email });
    });
    return { challengeId, ...(deps.env.exposeSecrets ? { devCode: code } : {}) };
  });

  r.post('/api/v1/auth/otp/verify', { ...limit, schema: { body: otpVerifySchema } }, async (req, reply) => {
    const tenantId = await otpTenant(deps, req.body.challengeId);
    const meta = requestMeta(req);
    const outcome = await tenant(deps.db, tenantId, async (tx) => {
      const [challenge] = await tx.select().from(schema.otpChallenges).where(eq(schema.otpChallenges.id, req.body.challengeId));
      if (!challenge || challenge.consumedAt) return { kind: 'expired' as const };
      const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, challenge.userId));
      if (!user) return { kind: 'expired' as const };
      const actor = { actorType: 'user' as const, actorId: user.id, actorLabel: user.email, tenantId, locationId: null, ...meta };
      if (challenge.attempts >= 5) {
        await writeAudit(tx, actor, 'auth.otp.locked', 'otp_challenge', challenge.id, null, {});
        return { kind: 'locked' as const };
      }
      if (!safeEqual(challenge.codeHash, sha256Hex(req.body.code))) {
        await tx.update(schema.otpChallenges).set({ attempts: challenge.attempts + 1 }).where(eq(schema.otpChallenges.id, challenge.id));
        await writeAudit(tx, actor, 'auth.otp.failed', 'otp_challenge', challenge.id, null, { attempts: challenge.attempts + 1 });
        return { kind: 'invalid' as const };
      }
      await tx.update(schema.otpChallenges).set({ consumedAt: new Date() }).where(eq(schema.otpChallenges.id, challenge.id));
      await tx.update(schema.users).set({ status: 'active', mobileVerifiedAt: new Date() }).where(eq(schema.users.id, user.id));
      const token = randomToken();
      await tx.execute(sql`select hos_session_create(${sha256Hex(token)}, 'tenant', ${user.id}::uuid, null, null, ${meta.ip}, ${meta.userAgent})`);
      await writeAudit(tx, actor, 'auth.otp.verify', 'user', user.id, null, { email: user.email });
      return { kind: 'ok' as const, token, userId: user.id };
    });
    if (outcome.kind === 'expired') throw new ApiError(400, 'otp_expired', 'That code has expired. Request a new one.');
    if (outcome.kind === 'locked') throw new ApiError(401, 'otp_locked', 'Too many attempts. Request a new code.');
    if (outcome.kind === 'invalid') throw new ApiError(401, 'otp_invalid', 'That code is not right');
    reply.setCookie(SESSION_COOKIE, outcome.token, cookieOptions(deps.env, 12 * 60 * 60));
    return tenant(deps.db, tenantId, (tx) => tenantMe(tx, outcome.userId, null));
  });

  r.post('/api/v1/auth/otp/resend', { ...limit, schema: { body: otpResendSchema } }, async (req) => {
    const tenantId = await otpTenant(deps, req.body.challengeId);
    const code = otpCode();
    const meta = requestMeta(req);
    const challengeId = await tenant(deps.db, tenantId, async (tx) => {
      const [old] = await tx.select().from(schema.otpChallenges).where(eq(schema.otpChallenges.id, req.body.challengeId));
      if (!old || old.consumedAt) throw new ApiError(400, 'otp_expired', 'That code has expired. Start again.');
      if (old.attempts >= 5) throw new ApiError(401, 'otp_locked', 'Too many attempts. Start again.');
      const counted = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.otpChallenges)
        .where(and(eq(schema.otpChallenges.userId, old.userId), sql`${schema.otpChallenges.createdAt} > now() - interval '1 hour'`));
      if ((counted[0]?.n ?? 0) >= 5) throw new ApiError(429, 'rate_limited', 'Too many codes. Wait an hour and try again.');
      await tx.update(schema.otpChallenges).set({ consumedAt: new Date() }).where(eq(schema.otpChallenges.id, old.id));
      const [created] = await tx
        .insert(schema.otpChallenges)
        .values({
          tenantId,
          userId: old.userId,
          purpose: old.purpose,
          channel: old.channel,
          destination: old.destination,
          codeHash: sha256Hex(code),
          // Keep the spent guesses so a resend does not grant five fresh attempts.
          attempts: old.attempts,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        })
        .returning();
      await deps.sms.send(tx, { tenantId, to: old.destination, template: 'otp_resend', body: `Hospital OS code ${code}` });
      await writeAudit(tx, { actorType: 'user', actorId: old.userId, actorLabel: old.destination, tenantId, locationId: null, ...meta }, 'auth.otp.resend', 'otp_challenge', created!.id, null, {});
      return created!.id;
    });
    return { challengeId, ...(deps.env.exposeSecrets ? { devCode: code } : {}) };
  });

  r.post('/api/v1/auth/login', { ...limit, schema: { body: loginSchema } }, async (req, reply) => {
    const email = req.body.email.toLowerCase();
    const meta = requestMeta(req);
    const admin = await platform(deps.db, async (tx) => {
      const [row] = await tx.select().from(schema.platformAdmins).where(eq(schema.platformAdmins.email, email));
      return row ?? null;
    });
    if (admin) {
      if (!(await verifyPassword(admin.passwordHash, req.body.password))) {
        await platform(deps.db, (tx) => writeAudit(tx, platformActor(admin.id, email, meta), 'auth.login.failed', 'platform_admin', admin.id, null, {}));
        throw new ApiError(401, 'invalid_credentials', 'Email or password is not right');
      }
      if (admin.totpEnabled) {
        if (!req.body.totp) throw new ApiError(401, 'totp_required', 'Enter the 6-digit authenticator code');
        if (!admin.totpSecret || !verifyTotp(admin.totpSecret, req.body.totp)) {
          await platform(deps.db, (tx) => writeAudit(tx, platformActor(admin.id, email, meta), 'auth.login.totp_failed', 'platform_admin', admin.id, null, {}));
          throw new ApiError(401, 'totp_invalid', 'That authenticator code is not right');
        }
      }
      const token = randomToken();
      await platform(deps.db, async (tx) => {
        await tx.update(schema.platformAdmins).set({ lastLoginAt: new Date() }).where(eq(schema.platformAdmins.id, admin.id));
        await tx.execute(sql`select hos_session_create(${sha256Hex(token)}, 'platform', null, ${admin.id}::uuid, null, ${meta.ip}, ${meta.userAgent})`);
        await writeAudit(tx, platformActor(admin.id, email, meta), 'auth.session.login', 'platform_admin', admin.id, null, {});
      });
      reply.setCookie(SESSION_COOKIE, token, cookieOptions(deps.env, 8 * 60 * 60));
      const platformMe = { kind: 'platform' as const, admin: { id: admin.id, name: admin.name, email: admin.email, totpEnabled: admin.totpEnabled } };
      return req.headers['x-hos-client'] === 'native' ? { ...platformMe, sessionToken: token } : platformMe;
    }

    const lookup = await deps.db.execute<{ tenant_id: string; user_id: string }>(sql`select tenant_id, user_id from hos_login_lookup(${email})`);
    const hit = lookup.rows[0];
    if (!hit) {
      await verifyPassword(DUMMY_PASSWORD_HASH, req.body.password);
      await platform(deps.db, (tx) => writeAudit(tx, { actorType: 'system', actorId: null, actorLabel: email, tenantId: null, locationId: null, ...meta }, 'auth.login.failed', 'user', null, null, {}));
      throw new ApiError(401, 'invalid_credentials', 'Email or password is not right');
    }
    const token = randomToken();
    const outcome = await tenant(deps.db, hit.tenant_id, async (tx) => {
      const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, hit.user_id));
      const actor = { actorType: 'user' as const, actorId: user?.id ?? null, actorLabel: email, tenantId: hit.tenant_id, locationId: null, ...meta };
      if (!user || !(await verifyPassword(user.passwordHash, req.body.password))) {
        await writeAudit(tx, actor, 'auth.login.failed', 'user', user?.id ?? null, null, {});
        return { kind: 'invalid' as const };
      }
      if (user.status === 'pending') return { kind: 'pending' as const };
      if (user.status !== 'active') {
        await writeAudit(tx, actor, 'auth.login.disabled', 'user', user.id, null, {});
        return { kind: 'disabled' as const };
      }
      if (user.totpEnabled) {
        if (!req.body.totp) return { kind: 'totp_required' as const };
        if (!user.totpSecret || !verifyTotp(user.totpSecret, req.body.totp)) {
          await writeAudit(tx, actor, 'auth.login.totp_failed', 'user', user.id, null, {});
          return { kind: 'totp_invalid' as const };
        }
      }
      await tx.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
      await tx.execute(sql`select hos_session_create(${sha256Hex(token)}, 'tenant', ${user.id}::uuid, null, null, ${meta.ip}, ${meta.userAgent})`);
      await writeAudit(tx, actor, 'auth.session.login', 'user', user.id, null, {});
      return { kind: 'ok' as const, userId: user.id };
    });
    if (outcome.kind === 'invalid') throw new ApiError(401, 'invalid_credentials', 'Email or password is not right');
    if (outcome.kind === 'pending') throw new ApiError(401, 'account_pending', 'Enter the code we sent to your mobile to finish sign-up');
    if (outcome.kind === 'disabled') throw new ApiError(401, 'account_disabled', 'This account is disabled');
    if (outcome.kind === 'totp_required') throw new ApiError(401, 'totp_required', 'Enter the 6-digit authenticator code');
    if (outcome.kind === 'totp_invalid') throw new ApiError(401, 'totp_invalid', 'That authenticator code is not right');
    reply.setCookie(SESSION_COOKIE, token, cookieOptions(deps.env, 12 * 60 * 60));
    const me = await tenant(deps.db, hit.tenant_id, (tx) => tenantMe(tx, outcome.userId, null));
    return req.headers['x-hos-client'] === 'native' ? { ...me, sessionToken: token } : me;
  });

  r.post('/api/v1/auth/logout', async (req, reply) => {
    const resolved = await resolveSession(deps.db, readSessionToken(req));
    const meta = requestMeta(req);
    if (resolved?.session.kind === 'tenant' && resolved.session.tenantId) {
      await tenant(deps.db, resolved.session.tenantId, async (tx) => {
        await tx.execute(sql`select hos_session_revoke(${resolved.hash})`);
        await writeAudit(tx, { actorType: 'user', actorId: resolved.session.userId, actorLabel: '', tenantId: resolved.session.tenantId, locationId: resolved.session.locationId, ...meta }, 'auth.session.logout', 'session', resolved.session.id, null, {});
      });
    } else if (resolved?.session.kind === 'platform') {
      await platform(deps.db, async (tx) => {
        await tx.execute(sql`select hos_session_revoke(${resolved.hash})`);
        await writeAudit(tx, platformActor(resolved.session.platformAdminId, 'app admin', meta), 'auth.session.logout', 'session', resolved.session.id, null, {});
      });
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  r.get('/api/v1/auth/me', async (req, reply) => {
    const resolved = await resolveSession(deps.db, readSessionToken(req));
    if (!resolved) throw new ApiError(401, 'unauthenticated', 'Sign in to continue');
    if (resolved.session.kind === 'platform' && resolved.session.platformAdminId) {
      return platform(deps.db, async (tx) => {
        const [admin] = await tx.select().from(schema.platformAdmins).where(eq(schema.platformAdmins.id, resolved.session.platformAdminId!));
        if (!admin || admin.status !== 'active') throw new ApiError(401, 'unauthenticated', 'Sign in again');
        return { kind: 'platform' as const, admin: { id: admin.id, name: admin.name, email: admin.email, totpEnabled: admin.totpEnabled } };
      });
    }
    return openTenant(deps, req, reply, async (gate) => tenantMe(gate.tx, gate.user.id, gate.locationId));
  });

  r.post('/api/v1/auth/switch-location', { schema: { body: switchLocationSchema } }, async (req, reply) => {
    return openTenant(deps, req, reply, async (gate) => {
      const allowed = gate.assignments.some((a) => a.locationId === null || a.locationId === req.body.locationId);
      if (!allowed) throw new ApiError(403, 'forbidden', 'You do not have a role at that location');
      await gate.tx.execute(sql`select hos_session_set_location(${gate.tokenHash}, ${req.body.locationId}::uuid)`);
      await gate.audit('auth.location.switch', 'location', req.body.locationId, null, { locationId: req.body.locationId });
      return tenantMe(gate.tx, gate.user.id, req.body.locationId);
    });
  });

  r.post('/api/v1/auth/totp/setup', async (req, reply) => {
    const resolved = await resolveSession(deps.db, readSessionToken(req));
    if (!resolved) throw new ApiError(401, 'unauthenticated', 'Sign in to continue');
    const secret = generateTotpSecret();
    if (resolved.session.kind === 'platform' && resolved.session.platformAdminId) {
      const admin = await platform(deps.db, async (tx) => {
        const [row] = await tx.select().from(schema.platformAdmins).where(eq(schema.platformAdmins.id, resolved.session.platformAdminId!));
        if (!row) throw new ApiError(401, 'unauthenticated', 'Sign in again');
        if (row.totpEnabled) throw new ApiError(409, 'totp_enabled', 'Authenticator is already on');
        await tx.update(schema.platformAdmins).set({ totpSecret: secret, totpEnabled: false }).where(eq(schema.platformAdmins.id, row.id));
        await writeAudit(tx, platformActor(row.id, row.email, requestMeta(req)), 'auth.totp.setup', 'platform_admin', row.id, null, {});
        return row;
      });
      return { otpauthUrl: otpauthUrl(admin.email, secret), secret };
    }
    return openTenant(deps, req, reply, async (gate) => {
      gate.requirePermission('tenant.manage');
      if (gate.user.totpEnabled) throw new ApiError(409, 'totp_enabled', 'Authenticator is already on');
      await gate.tx.update(schema.users).set({ totpSecret: secret, totpEnabled: false }).where(eq(schema.users.id, gate.user.id));
      await gate.audit('auth.totp.setup', 'user', gate.user.id, null, {});
      return { otpauthUrl: otpauthUrl(gate.user.email, secret), secret };
    });
  });

  r.post('/api/v1/auth/totp/enable', { schema: { body: totpCodeSchema } }, async (req, reply) => {
    const resolved = await resolveSession(deps.db, readSessionToken(req));
    if (!resolved) throw new ApiError(401, 'unauthenticated', 'Sign in to continue');
    if (resolved.session.kind === 'platform' && resolved.session.platformAdminId) {
      await platform(deps.db, async (tx) => {
        const [row] = await tx.select().from(schema.platformAdmins).where(eq(schema.platformAdmins.id, resolved.session.platformAdminId!));
        if (!row?.totpSecret || !verifyTotp(row.totpSecret, req.body.code)) throw new ApiError(401, 'totp_invalid', 'That authenticator code is not right');
        await tx.update(schema.platformAdmins).set({ totpEnabled: true }).where(eq(schema.platformAdmins.id, row.id));
        await writeAudit(tx, platformActor(row.id, row.email, requestMeta(req)), 'auth.totp.enable', 'platform_admin', row.id, null, {});
      });
      return reply.status(204).send();
    }
    await openTenant(deps, req, reply, async (gate) => {
      gate.requirePermission('tenant.manage');
      if (!gate.user.totpSecret || !verifyTotp(gate.user.totpSecret, req.body.code)) throw new ApiError(401, 'totp_invalid', 'That authenticator code is not right');
      await gate.tx.update(schema.users).set({ totpEnabled: true }).where(eq(schema.users.id, gate.user.id));
      await gate.audit('auth.totp.enable', 'user', gate.user.id, null, {});
    });
    return reply.status(204).send();
  });

  r.post('/api/v1/auth/accept-invite', { ...limit, schema: { body: acceptInviteSchema } }, async (req, reply) => {
    const hash = sha256Hex(req.body.token);
    const found = await deps.db.execute<{ hos_invite_tenant: string | null }>(sql`select hos_invite_tenant(${hash}) as hos_invite_tenant`);
    const tenantId = found.rows[0]?.hos_invite_tenant;
    if (!tenantId) throw new ApiError(400, 'invite_invalid', 'This invite has expired or was already used');
    const meta = requestMeta(req);
    const token = randomToken();
    const userId = await tenant(deps.db, tenantId, async (tx) => {
      const [invite] = await tx.select().from(schema.invitations).where(eq(schema.invitations.tokenHash, hash));
      if (!invite || invite.status !== 'pending') throw new ApiError(400, 'invite_invalid', 'This invite has expired or was already used');
      const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, invite.userId));
      if (!user) throw new ApiError(400, 'invite_invalid', 'This invite has expired or was already used');
      await tx.update(schema.users).set({ passwordHash: await hashPassword(req.body.password), status: 'active' }).where(eq(schema.users.id, user.id));
      await tx.update(schema.invitations).set({ status: 'accepted', acceptedAt: new Date() }).where(eq(schema.invitations.id, invite.id));
      await tx.execute(sql`select hos_session_create(${sha256Hex(token)}, 'tenant', ${user.id}::uuid, null, null, ${meta.ip}, ${meta.userAgent})`);
      await writeAudit(tx, { actorType: 'user', actorId: user.id, actorLabel: user.email, tenantId, locationId: null, ...meta }, 'auth.invite.accept', 'user', user.id, null, {});
      return user.id;
    });
    reply.setCookie(SESSION_COOKIE, token, cookieOptions(deps.env, 12 * 60 * 60));
    return tenant(deps.db, tenantId, (tx) => tenantMe(tx, userId, null));
  });
}

function platformActor(id: string | null, label: string, meta: { ip: string | null; userAgent: string | null }) {
  return { actorType: 'platform_admin' as const, actorId: id, actorLabel: label, tenantId: null, locationId: null, ...meta };
}

async function otpTenant(deps: Deps, challengeId: string): Promise<string> {
  const found = await deps.db.execute<{ hos_otp_tenant: string | null }>(sql`select hos_otp_tenant(${challengeId}::uuid) as hos_otp_tenant`);
  const tenantId = found.rows[0]?.hos_otp_tenant;
  if (!tenantId) throw new ApiError(400, 'otp_expired', 'That code has expired. Request a new one.');
  return tenantId;
}
