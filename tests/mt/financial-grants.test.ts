import { createDb, dbEnv } from '@hos/db';
import { sql } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app';

const handle = createDb(dbEnv().appUrl, { max: 1 });
const app = await buildApp();
const csrf = { 'x-hos-csrf': '1' };

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  if (typeof record.code === 'string' && /^[0-9A-Z]{5}$/.test(record.code)) return record.code;
  return pgCode(record.cause);
}

async function expectDenied(label: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
    throw new Error(`expected 42501 for ${label}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('expected 42501')) throw error;
    expect(pgCode(error), error instanceof Error ? error.message : String(error)).toBe('42501');
  }
}

it('refuses hos_app updates and deletes on issued billing rows', async () => {
  await expectDenied('invoices update', () => handle.db.execute(sql`update invoices set notes = notes`));
  await expectDenied('invoices delete', () => handle.db.execute(sql`delete from invoices`));
  await expectDenied('invoice_lines update', () => handle.db.execute(sql`update invoice_lines set description = description`));
  await expectDenied('invoice_lines delete', () => handle.db.execute(sql`delete from invoice_lines`));
  await expectDenied('payments update', () => handle.db.execute(sql`update payments set status = 'failed'`));
  await expectDenied('payments delete', () => handle.db.execute(sql`delete from payments`));
  await expectDenied('credit_notes delete', () => handle.db.execute(sql`delete from credit_notes`));
  await expectDenied('credit_notes update', () => handle.db.execute(sql`update credit_notes set reason = reason`));
});

it('refuses direct subscription writes and order or consent columns that must not change', async () => {
  await expectDenied('subscriptions insert', () => handle.db.execute(sql`insert into subscriptions default values`));
  await expectDenied('subscriptions update', () => handle.db.execute(sql`update subscriptions set credit_paise = 0`));
  await expectDenied('subscriptions delete', () => handle.db.execute(sql`delete from subscriptions`));
  await expectDenied('subscription_items insert', () => handle.db.execute(sql`insert into subscription_items default values`));
  await expectDenied('subscription_items update', () => handle.db.execute(sql`update subscription_items set status = 'removed'`));
  await expectDenied('subscription_items delete', () => handle.db.execute(sql`delete from subscription_items`));
  await expectDenied('orders delete', () => handle.db.execute(sql`delete from orders`));
  await expectDenied('orders quote', () => handle.db.execute(sql`update orders set quote = quote`));
  await expectDenied('consents delete', () => handle.db.execute(sql`delete from consents`));
  await expectDenied('consents purposes', () => handle.db.execute(sql`update consents set purposes = purposes`));

  await handle.db.execute(sql`update orders set status = status where false`);
  await handle.db.execute(sql`update consents set withdrawn_at = withdrawn_at where false`);
});

it('grants the narrow billing functions and keeps the replace helper private', async () => {
  const rows = await handle.db.execute<{ proname: string; ok: boolean }>(sql`
    select p.proname, has_function_privilege(p.oid, 'execute') as ok
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'hos_payment_transition',
        'hos_order_mark_paid',
        'hos_order_transition',
        'hos_payment_tenant',
        'hos_subscription_apply_order',
        'hos_subscription_admin_change',
        'hos_subscription_replace'
      )
  `);
  const privilege = new Map(rows.rows.map((row) => [row.proname, row.ok]));
  expect(privilege.get('hos_payment_transition')).toBe(true);
  expect(privilege.get('hos_order_mark_paid')).toBe(true);
  expect(privilege.get('hos_subscription_apply_order')).toBe(true);
  expect(privilege.get('hos_subscription_admin_change')).toBe(true);
  expect(privilege.get('hos_subscription_replace')).toBe(false);
});

it('rejects a tenant-scope no-payment change that moves the period, inflates credit, or raises the price', async () => {
  const found = await handle.db.execute<{ tenant_id: string }>(sql`select tenant_id from hos_login_lookup('owner@sunrise.demo')`);
  const tenantId = found.rows[0]?.tenant_id;
  expect(tenantId).toBeTruthy();
  const plans = await handle.db.execute<{ id: string; key: string }>(sql`select id, key from plans where status = 'active'`);
  const planId = (key: string) => {
    const id = plans.rows.find((plan) => plan.key === key)?.id;
    if (!id) throw new Error(`missing plan ${key}`);
    return id;
  };
  const before = await readSubscription(tenantId!);
  const samePlan = before.plan_id;
  const locations = before.location_count;

  const farEnd = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  await expectHos('period_change', () =>
    callAdminChange(tenantId!, {
      planId: samePlan,
      locationCount: locations,
      credit: before.credit_paise,
      setPeriod: true,
      periodEnd: farEnd,
    }),
  );
  await expectHos('credit_above', () =>
    callAdminChange(tenantId!, {
      planId: samePlan,
      locationCount: locations,
      credit: before.credit_paise + 10_000_000,
      setPeriod: false,
      periodEnd: nowIso,
    }),
  );
  await expectHos('price_increase', () =>
    callAdminChange(tenantId!, {
      planId: planId('premium'),
      locationCount: locations,
      credit: before.credit_paise,
      setPeriod: false,
      periodEnd: nowIso,
    }),
  );

  const after = await readSubscription(tenantId!);
  expect(after.plan_id).toBe(before.plan_id);
  expect(after.credit_paise).toBe(before.credit_paise);
  expect(after.location_count).toBe(before.location_count);
  expect(after.period_end).toBe(before.period_end);
});

it('applies a genuine downgrade through the API', async () => {
  const catalog = await app.inject({ method: 'GET', url: '/api/v1/catalog' });
  expect(catalog.statusCode, catalog.body).toBe(200);
  const plans = catalog.json().plans as { id: string; key: string }[];
  const basicPlanId = plans.find((plan) => plan.key === 'basic')!.id;
  const mediumPlanId = plans.find((plan) => plan.key === 'medium')!.id;
  const stamp = Date.now();
  const cookie = await provision(stamp, `downgrade.${stamp}@sbx.hospitalos.test`, mediumPlanId);
  const before = await app.inject({ method: 'GET', url: '/api/v1/billing/subscription', headers: { cookie } });
  expect(before.statusCode, before.body).toBe(200);
  expect(before.json().planKey).toBe('medium');
  const creditBefore = before.json().creditPaise as number;
  const periodEnd = before.json().currentPeriodEnd as string;

  const downgrade = await send(cookie, 'POST', '/api/v1/billing/change-apply', {
    planId: basicPlanId,
    locationCount: 1,
    addonModuleIds: [],
  }, { 'idempotency-key': `apply-${stamp}` });
  expect(downgrade.statusCode, downgrade.body).toBe(200);
  expect(downgrade.json().change.noPayment).toBe(true);

  const after = await app.inject({ method: 'GET', url: '/api/v1/billing/subscription', headers: { cookie } });
  expect(after.statusCode, after.body).toBe(200);
  expect(after.json().planKey).toBe('basic');
  expect(after.json().creditPaise).toBeGreaterThanOrEqual(creditBefore);
  expect(after.json().currentPeriodEnd).toBe(periodEnd);
});

function errorText(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const record = error as { message?: unknown; cause?: unknown };
  const own = typeof record.message === 'string' ? record.message : '';
  return `${own} ${errorText(record.cause)}`;
}

async function expectHos(code: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    expect(errorText(error)).toContain(`hos:${code}`);
    return;
  }
  throw new Error(`expected hos:${code}`);
}

async function readSubscription(tenantId: string) {
  const rows = await handle.db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.scope', 'tenant', true), set_config('app.tenant_id', ${tenantId}, true)`);
    return tx.execute<{ plan_id: string; credit_paise: number; location_count: number; period_end: string }>(sql`
      select plan_id, credit_paise::int as credit_paise, location_count, current_period_end::text as period_end
      from subscriptions
    `);
  });
  const row = rows.rows[0];
  if (!row) throw new Error('subscription missing');
  return row;
}

function callAdminChange(
  tenantId: string,
  change: { planId: string; locationCount: number; credit: number; setPeriod: boolean; periodEnd: string },
): Promise<unknown> {
  return handle.db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.scope', 'tenant', true), set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`
      select hos_subscription_admin_change(
        ${change.planId}::uuid,
        ${change.locationCount}::int,
        '[]'::jsonb,
        ${change.credit}::bigint,
        now(),
        ${change.periodEnd}::timestamptz,
        ${change.setPeriod}::boolean,
        'no_payment_change'
      )
    `);
    throw new Error('function did not reject');
  });
}

async function provision(stamp: number, email: string, planId: string): Promise<string> {
  const notice = await app.inject({ method: 'GET', url: '/api/v1/privacy-notice/current' });
  expect(notice.statusCode, notice.body).toBe(200);
  const signup = await send('', 'POST', '/api/v1/auth/signup', {
    name: 'Lotus Sample Owner',
    email,
    mobile: `9${String(stamp).slice(-9)}`,
    password: 'Demo@12345',
    designation: 'owner',
    acceptTerms: true,
    acceptPrivacy: true,
    productUpdates: false,
    noticeVersion: notice.json().version,
  });
  expect(signup.statusCode, signup.body).toBe(200);
  const verified = await send('', 'POST', '/api/v1/auth/otp/verify', { challengeId: signup.json().challengeId, code: signup.json().devCode });
  expect(verified.statusCode, verified.body).toBe(200);
  const cookie = cookieOf(verified);
  expect((await send(cookie, 'PUT', '/api/v1/onboarding/facility', {
    facilityType: 'clinic',
    legalName: 'Lotus Demo Clinic',
    displayName: 'Lotus Demo Clinic',
    gstin: '',
    registrationNo: 'DEMO-MH-LOTUS',
    bedCount: 8,
    specialities: ['General Medicine'],
  })).statusCode).toBe(200);
  expect((await send(cookie, 'PUT', '/api/v1/onboarding/locations', {
    locations: [{ name: 'Lotus Sample Ward', addressLine1: '1 Sample Road', city: 'Mumbai', stateCode: '27', pincode: '400001', departments: ['OPD'] }],
  })).statusCode).toBe(200);
  expect((await send(cookie, 'PUT', '/api/v1/onboarding/plan', { planId, cycle: 'monthly', locationCount: 1 })).statusCode).toBe(200);
  expect((await send(cookie, 'PUT', '/api/v1/onboarding/addons', { moduleIds: [] })).statusCode).toBe(200);
  const order = await send(cookie, 'POST', '/api/v1/billing/orders', { purpose: 'onboarding' }, { 'idempotency-key': `onb-${stamp}` });
  expect(order.statusCode, order.body).toBe(200);
  const paid = await send(cookie, 'POST', `/api/v1/billing/orders/${order.json().id}/pay`, { method: 'upi', outcome: 'success', details: {} }, { 'idempotency-key': `onbpay-${stamp}` });
  expect(paid.statusCode, paid.body).toBe(200);
  expect((await send(cookie, 'POST', '/api/v1/billing/verify', paid.json().checkout, { 'idempotency-key': `onbver-${stamp}` })).statusCode).toBe(200);
  expect((await send(cookie, 'POST', '/api/v1/onboarding/provision', {})).statusCode).toBe(200);
  return cookie;
}

function send(
  cookie: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload: Record<string, unknown>,
  extra: Record<string, string> = {},
): Promise<LightMyRequestResponse> {
  return app.inject({
    method,
    url,
    payload,
    headers: { ...csrf, ...(cookie ? { cookie } : {}), ...extra },
  });
}

function cookieOf(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie'];
  const line = Array.isArray(raw) ? raw.join(';') : (raw ?? '');
  const match = /hos_session=([^;]+)/.exec(line);
  if (!match?.[1]) throw new Error('session cookie missing');
  return `hos_session=${match[1]}`;
}
