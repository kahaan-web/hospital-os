// Two fixture tenants for the RLS suite. Created as the schema owner (hos_migrator), idempotently.
// All rows are fictional sample data: "(Sample)" names, @sbx emails, 90000 mobiles, sandbox tenants.
//
// Tenant A = rls-alpha, tenant B = rls-beta. Each gets one row in every tenant-owned table so a missing
// fixture fails the suite instead of silently skipping that table. The demo seed (sunrise-care) is not used.
import type pg from 'pg';

export interface ProbeSpec {
  slug: string;
  tag: string;
  legalName: string;
  displayName: string;
  userName: string;
  email: string;
  mobile: string;
  doctorName: string;
  contactName: string;
  contactMobile: string;
  /** Globally unique, at most 16 characters (invoices_number_len_chk). */
  invoiceNumber: string;
}

export const TENANT_A: ProbeSpec = {
  slug: 'rls-alpha',
  tag: 'alpha',
  legalName: 'RLS Alpha Clinic (Sample)',
  displayName: 'RLS Alpha Clinic (Sample)',
  userName: 'Meera Kulkarni (Sample)',
  email: 'meera.kulkarni.rls@sbx',
  mobile: '9000011001',
  doctorName: 'Dr. Meera Kulkarni (Sample)',
  contactName: 'Arjun Kulkarni (Sample)',
  contactMobile: '9000011002',
  invoiceNumber: 'RLSA/2627/000001',
};

export const TENANT_B: ProbeSpec = {
  slug: 'rls-beta',
  tag: 'beta',
  legalName: 'RLS Beta Clinic (Sample)',
  displayName: 'RLS Beta Clinic (Sample)',
  userName: 'Dev Sharma (Sample)',
  email: 'dev.sharma.rls@sbx',
  mobile: '9000012001',
  doctorName: 'Dr. Dev Sharma (Sample)',
  contactName: 'Nisha Sharma (Sample)',
  contactMobile: '9000012002',
  invoiceNumber: 'RLSB/2627/000001',
};

export interface TenantFixture {
  id: string;
  spec: ProbeSpec;
  userId: string;
  locationId: string;
  otpId: string;
  inviteToken: string;
  /** Unexpired, unrevoked session. Refreshed on every run so idle timeout does not rot the row. */
  sessionToken: string;
  expiredSessionToken: string;
  revokedSessionToken: string;
}

type Fixture = {
  table: string;
  sql: string;
  params: (id: string, spec: ProbeSpec) => unknown[];
};

const idOnly = (id: string): unknown[] => [id];

/** Each statement inserts nothing when this tenant already has a row in that table. */
const FIXTURES: Fixture[] = [
  {
    table: 'locations',
    sql: `insert into locations (tenant_id, name, code, state_code, city, is_primary)
          select $1::uuid, $2 || ' Main (Sample)', upper(left($2, 3)), '27', 'Pune', true
          where not exists (select 1 from locations where tenant_id = $1)`,
    params: (id, spec) => [id, spec.tag],
  },
  {
    table: 'departments',
    sql: `insert into departments (tenant_id, location_id, name)
          select $1::uuid, l.id, 'General Medicine' from locations l
          where l.tenant_id = $1 and not exists (select 1 from departments where tenant_id = $1) limit 1`,
    params: idOnly,
  },
  {
    table: 'doctors',
    sql: `insert into doctors (tenant_id, location_id, name, qualification, speciality, is_sample)
          select $1::uuid, l.id, $2, 'MBBS', 'General Medicine', true from locations l
          where l.tenant_id = $1 and not exists (select 1 from doctors where tenant_id = $1) limit 1`,
    params: (id, spec) => [id, spec.doctorName],
  },
  {
    table: 'users',
    sql: `insert into users (tenant_id, email, mobile, name, status, designation)
          select $1::uuid, $2, $3, $4, 'active', 'owner'
          where not exists (select 1 from users where tenant_id = $1)`,
    params: (id, spec) => [id, spec.email, spec.mobile, spec.userName],
  },
  {
    table: 'user_location_roles',
    sql: `insert into user_location_roles (tenant_id, user_id, role_id, location_id)
          select $1::uuid, u.id, r.id, null from users u, roles r
          where u.tenant_id = $1 and r.tenant_id is null and r.key = 'tenant_admin'
            and not exists (select 1 from user_location_roles where tenant_id = $1) limit 1`,
    params: idOnly,
  },
  {
    table: 'roles',
    sql: `insert into roles (tenant_id, key, name, is_system)
          select $1::uuid, 'probe_custom', $2 || ' custom role (Sample)', false
          where not exists (select 1 from roles where tenant_id = $1)`,
    params: (id, spec) => [id, spec.tag],
  },
  {
    table: 'invitations',
    sql: `insert into invitations (tenant_id, user_id, token_hash, invited_by, expires_at)
          select $1::uuid, u.id, 'rls-' || $2 || '-invite', u.id, now() + interval '7 days' from users u
          where u.tenant_id = $1 and not exists (select 1 from invitations where tenant_id = $1) limit 1`,
    params: (id, spec) => [id, spec.tag],
  },
  {
    table: 'otp_challenges',
    sql: `insert into otp_challenges (tenant_id, user_id, purpose, destination, code_hash, expires_at)
          select $1::uuid, u.id, 'login', $2, 'rls-probe-not-a-real-hash', now() + interval '1 day' from users u
          where u.tenant_id = $1 and not exists (select 1 from otp_challenges where tenant_id = $1) limit 1`,
    params: (id, spec) => [id, spec.mobile],
  },
  {
    table: 'subscriptions',
    sql: `insert into subscriptions (tenant_id, plan_id, billing_cycle, location_count, current_period_start, current_period_end)
          select $1::uuid, p.id, 'monthly', 1, now(), now() + interval '1 month' from plans p
          where p.key = 'basic' and not exists (select 1 from subscriptions where tenant_id = $1)`,
    params: idOnly,
  },
  {
    table: 'subscription_items',
    sql: `insert into subscription_items (tenant_id, subscription_id, kind, plan_id, unit_amount_paise, quantity)
          select $1::uuid, s.id, 'plan', s.plan_id, 100000, 1 from subscriptions s
          where s.tenant_id = $1 and not exists (select 1 from subscription_items where tenant_id = $1)`,
    params: idOnly,
  },
  {
    table: 'orders',
    sql: `insert into orders (tenant_id, public_id, purpose, status, amount_paise, quote, idempotency_key)
          select $1::uuid, 'order_rls_' || $2 || '_0001', 'onboarding', 'paid', 118000,
                 '{"sample": true}'::jsonb, 'rls-' || $2 || '-order'
          where not exists (select 1 from orders where tenant_id = $1)`,
    params: (id, spec) => [id, spec.tag],
  },
  {
    table: 'payments',
    sql: `insert into payments (tenant_id, order_id, public_id, method, status, amount_paise, signature_verified, captured_at)
          select $1::uuid, o.id, 'pay_rls_' || $2 || '_0001', 'upi', 'captured', 118000, true, now()
          from orders o where o.tenant_id = $1 and not exists (select 1 from payments where tenant_id = $1) limit 1`,
    params: (id, spec) => [id, spec.tag],
  },
  {
    table: 'invoices',
    sql: `insert into invoices (tenant_id, number, fy, order_id, payment_id, issue_date, supplier, customer,
                                place_of_supply_state_code, inter_state, taxable_paise, cgst_paise, sgst_paise,
                                igst_paise, total_paise, notes)
          select $1::uuid, $2, '2026-27', o.id, p.id, current_date, '{"sample": true}'::jsonb,
                 '{"sample": true}'::jsonb, '27', false, 100000, 9000, 9000, 0, 118000, 'Sample probe invoice'
          from orders o join payments p on p.order_id = o.id
          where o.tenant_id = $1 and not exists (select 1 from invoices where tenant_id = $1) limit 1`,
    params: (id, spec) => [id, spec.invoiceNumber],
  },
  {
    table: 'invoice_lines',
    sql: `insert into invoice_lines (tenant_id, invoice_id, description, unit_paise, amount_paise, gst_rate_bp,
                                     cgst_paise, sgst_paise)
          select $1::uuid, i.id, 'Sample probe line', 100000, 100000, 1800, 9000, 9000 from invoices i
          where i.tenant_id = $1 and not exists (select 1 from invoice_lines where tenant_id = $1) limit 1`,
    params: idOnly,
  },
  {
    table: 'tenant_entitlement_overrides',
    sql: `insert into tenant_entitlement_overrides (tenant_id, target, module_id, effect, reason)
          select $1::uuid, 'module', m.id, 'grant', 'RLS probe (sample)' from modules m
          where not exists (select 1 from tenant_entitlement_overrides where tenant_id = $1)
          order by m.sort_order limit 1`,
    params: idOnly,
  },
  {
    table: 'consents',
    sql: `insert into consents (tenant_id, user_id, notice_id, notice_version, purposes, terms_accepted)
          select $1::uuid, u.id, n.id, n.version, '["service"]'::jsonb, true
          from users u, privacy_notices n
          where u.tenant_id = $1 and not exists (select 1 from consents where tenant_id = $1)
          order by n.created_at desc limit 1`,
    params: idOnly,
  },
  {
    table: 'data_principal_requests',
    sql: `insert into data_principal_requests (tenant_id, type, principal_name, principal_contact, details, due_at)
          select $1::uuid, 'access', $2, $3, 'Sample access request', now() + interval '30 days'
          where not exists (select 1 from data_principal_requests where tenant_id = $1)`,
    params: (id, spec) => [id, spec.contactName, spec.contactMobile],
  },
  {
    table: 'checklist_items',
    sql: `insert into checklist_items (tenant_id, key, done_at)
          select $1::uuid, 'staff', now()
          where not exists (select 1 from checklist_items where tenant_id = $1)`,
    params: idOnly,
  },
  {
    table: 'outbox_messages',
    sql: `insert into outbox_messages (tenant_id, channel, recipient, body, template)
          select $1::uuid, 'sms', $2, 'Sample probe message', 'probe'
          where not exists (select 1 from outbox_messages where tenant_id = $1)`,
    params: (id, spec) => [id, spec.mobile],
  },
  {
    table: 'idempotency_keys',
    sql: `insert into idempotency_keys (tenant_id, scope, key, request_hash, expires_at)
          select $1::uuid, 'probe', 'rls-' || $2 || '-key1', 'sample', now() + interval '1 day'
          where not exists (select 1 from idempotency_keys where tenant_id = $1)`,
    params: (id, spec) => [id, spec.tag],
  },
  {
    table: 'sessions',
    sql: `insert into sessions (token_hash, kind, user_id, tenant_id, expires_at, last_seen_at)
          select 'rls-' || $2 || '-live', 'tenant', u.id, $1::uuid, now() + interval '1 day', now() from users u
          where u.tenant_id = $1 and not exists (select 1 from sessions where token_hash = 'rls-' || $2 || '-live')
          limit 1`,
    params: (id, spec) => [id, spec.tag],
  },
  {
    table: 'audit_log',
    sql: `insert into audit_log (tenant_id, actor_type, actor_label, action, entity_type, entity_id, after)
          select $1::uuid, 'system', 'RLS probe', 'rls.probe.seed', 'tenant', $1::uuid::text, '{"sample": true}'::jsonb
          where not exists (select 1 from audit_log where tenant_id = $1 and action = 'rls.probe.seed')`,
    params: idOnly,
  },
];

export async function tenantIdBySlug(owner: pg.Client, slug: string): Promise<string | null> {
  const r = await owner.query<{ id: string }>('select id from tenants where slug = $1', [slug]);
  return r.rows[0]?.id ?? null;
}

/** Create (or reuse) one probe tenant and top up one row per tenant table. Returns ids the definer tests need. */
export async function ensureTenant(owner: pg.Client, spec: ProbeSpec): Promise<TenantFixture> {
  await owner.query('begin');
  try {
    await owner.query(
      `insert into tenants (slug, status, onboarding_step, onboarding_completed_at, facility_type, legal_name,
                            display_name, sandbox)
       values ($1, 'active', 'done', now(), 'clinic', $2, $3, true)
       on conflict (slug) do nothing`,
      [spec.slug, spec.legalName, spec.displayName],
    );
    const id = await tenantIdBySlug(owner, spec.slug);
    if (!id) throw new Error(`tenant ${spec.slug} was not created`);
    for (const f of FIXTURES) {
      try {
        await owner.query(f.sql, f.params(id, spec));
      } catch (err) {
        throw new Error(`probe fixture ${spec.slug}.${f.table} failed: ${(err as Error).message}`, { cause: err });
      }
    }
    // Time-limited rows are refreshed so a later run is not tripped by the idle / expiry windows.
    await owner.query(
      `update users set status = 'active' where tenant_id = $1`,
      [id],
    );
    await owner.query(
      `update otp_challenges set expires_at = now() + interval '1 day', consumed_at = null where tenant_id = $1`,
      [id],
    );
    await owner.query(
      `update invitations set expires_at = now() + interval '7 days', status = 'pending' where tenant_id = $1`,
      [id],
    );
    await owner.query(
      `insert into sessions (token_hash, kind, user_id, tenant_id, expires_at, last_seen_at)
       select 'rls-' || $2 || '-live', 'tenant', u.id, $1::uuid, now() + interval '1 day', now() from users u
       where u.tenant_id = $1
       on conflict (token_hash) do update
         set last_seen_at = now(), expires_at = now() + interval '1 day', revoked_at = null`,
      [id, spec.tag],
    );
    await owner.query(
      `insert into sessions (token_hash, kind, user_id, tenant_id, expires_at, last_seen_at)
       select 'rls-' || $2 || '-expired', 'tenant', u.id, $1::uuid, now() - interval '1 minute', now() from users u
       where u.tenant_id = $1
       on conflict (token_hash) do update
         set expires_at = now() - interval '1 minute', revoked_at = null, last_seen_at = now()`,
      [id, spec.tag],
    );
    await owner.query(
      `insert into sessions (token_hash, kind, user_id, tenant_id, expires_at, last_seen_at, revoked_at)
       select 'rls-' || $2 || '-revoked', 'tenant', u.id, $1::uuid, now() + interval '1 day', now(), now() from users u
       where u.tenant_id = $1
       on conflict (token_hash) do update
         set revoked_at = now(), expires_at = now() + interval '1 day', last_seen_at = now()`,
      [id, spec.tag],
    );
    const handles = await owner.query<{
      userId: string;
      locationId: string;
      otpId: string;
      inviteToken: string;
    }>(
      `select u.id as "userId", l.id as "locationId", o.id as "otpId", i.token_hash as "inviteToken"
         from users u
         join locations l on l.tenant_id = u.tenant_id and l.is_primary
         join otp_challenges o on o.tenant_id = u.tenant_id
         join invitations i on i.tenant_id = u.tenant_id
        where u.tenant_id = $1
        limit 1`,
      [id],
    );
    const row = handles.rows[0];
    if (!row) throw new Error(`probe fixture ${spec.slug} did not produce user, location, otp and invitation rows`);
    await owner.query('commit');
    return {
      id,
      spec,
      userId: row.userId,
      locationId: row.locationId,
      otpId: row.otpId,
      inviteToken: row.inviteToken,
      sessionToken: `rls-${spec.tag}-live`,
      expiredSessionToken: `rls-${spec.tag}-expired`,
      revokedSessionToken: `rls-${spec.tag}-revoked`,
    };
  } catch (err) {
    await owner.query('rollback');
    throw err;
  }
}
