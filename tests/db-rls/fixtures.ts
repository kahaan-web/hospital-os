// Probe tenant for the RLS suite. Created as the schema owner (hos_migrator), idempotently, so reruns reuse it.
// All rows are obviously fictional sample data: "(Sample)" names, @sbx emails, +91 90000 mobiles, sandbox tenant.
//
// Tenant A = the Sunrise demo tenant (seed path: `npm run db:seed:demo`), which carries the realistic dataset and any
// rows new modules seed. Tenant B = this probe tenant, which gets one row in every Phase A tenant table so that
// (a) tables the demo seed leaves empty still have a victim row, and (b) "move my own row into tenant A" is tested.
import type pg from 'pg';

export const SUNRISE_SLUG = 'sunrise-care';
export const PROBE_SLUG = 'rls-probe';

/** Each statement gets $1 = probe tenant id and must insert nothing when the probe already has a row there. */
const FIXTURES: { table: string; sql: string }[] = [
  {
    table: 'locations',
    sql: `insert into locations (tenant_id, name, code, state_code, city, is_primary)
          select $1::uuid,'Probe Main (Sample)', 'PRB', '27', 'Pune', true
          where not exists (select 1 from locations where tenant_id = $1)`,
  },
  {
    table: 'departments',
    sql: `insert into departments (tenant_id, location_id, name)
          select $1::uuid,l.id, 'General Medicine' from locations l
          where l.tenant_id = $1 and not exists (select 1 from departments where tenant_id = $1) limit 1`,
  },
  {
    table: 'doctors',
    sql: `insert into doctors (tenant_id, location_id, name, qualification, speciality, is_sample)
          select $1::uuid,l.id, 'Dr. Kavya Probe (Sample)', 'MBBS', 'General Medicine', true from locations l
          where l.tenant_id = $1 and not exists (select 1 from doctors where tenant_id = $1) limit 1`,
  },
  {
    table: 'users',
    sql: `insert into users (tenant_id, email, mobile, name, status)
          select $1::uuid,'ira.probe.rls@sbx', '9000099001', 'Ira Probe (Sample)', 'active'
          where not exists (select 1 from users where tenant_id = $1)`,
  },
  {
    table: 'user_location_roles',
    sql: `insert into user_location_roles (tenant_id, user_id, role_id, location_id)
          select $1::uuid,u.id, r.id, null from users u, roles r
          where u.tenant_id = $1 and r.tenant_id is null and r.key = 'tenant_admin'
            and not exists (select 1 from user_location_roles where tenant_id = $1) limit 1`,
  },
  {
    table: 'roles',
    sql: `insert into roles (tenant_id, key, name, is_system)
          select $1::uuid,'probe_custom', 'Probe custom role (Sample)', false
          where not exists (select 1 from roles where tenant_id = $1)`,
  },
  {
    table: 'invitations',
    sql: `insert into invitations (tenant_id, user_id, token_hash, invited_by, expires_at)
          select $1::uuid,u.id, 'rls-probe-invite-' || $1::uuid::text, u.id, now() + interval '7 days' from users u
          where u.tenant_id = $1 and not exists (select 1 from invitations where tenant_id = $1) limit 1`,
  },
  {
    table: 'otp_challenges',
    sql: `insert into otp_challenges (tenant_id, user_id, purpose, destination, code_hash, expires_at)
          select $1::uuid,u.id, 'login', '9000099001', 'rls-probe-not-a-real-hash', now() + interval '5 minutes' from users u
          where u.tenant_id = $1 and not exists (select 1 from otp_challenges where tenant_id = $1) limit 1`,
  },
  {
    table: 'subscriptions',
    sql: `insert into subscriptions (tenant_id, plan_id, billing_cycle, location_count, current_period_start, current_period_end)
          select $1::uuid,p.id, 'monthly', 1, now(), now() + interval '1 month' from plans p
          where p.key = 'basic' and not exists (select 1 from subscriptions where tenant_id = $1)`,
  },
  {
    table: 'subscription_items',
    sql: `insert into subscription_items (tenant_id, subscription_id, kind, plan_id, unit_amount_paise, quantity)
          select $1::uuid,s.id, 'plan', s.plan_id, 100000, 1 from subscriptions s
          where s.tenant_id = $1 and not exists (select 1 from subscription_items where tenant_id = $1)`,
  },
  {
    table: 'orders',
    sql: `insert into orders (tenant_id, public_id, purpose, status, amount_paise, quote, idempotency_key)
          select $1::uuid,'order_rlsprobe_' || replace($1::uuid::text, '-', ''), 'onboarding', 'paid', 118000,
                 '{"sample": true}'::jsonb, 'rls-probe-order'
          where not exists (select 1 from orders where tenant_id = $1)`,
  },
  {
    table: 'payments',
    sql: `insert into payments (tenant_id, order_id, public_id, method, status, amount_paise, signature_verified, captured_at)
          select $1::uuid,o.id, 'pay_rlsprobe_' || replace($1::uuid::text, '-', ''), 'upi', 'captured', 118000, true, now()
          from orders o where o.tenant_id = $1 and not exists (select 1 from payments where tenant_id = $1) limit 1`,
  },
  {
    table: 'invoices',
    sql: `insert into invoices (tenant_id, number, fy, order_id, payment_id, issue_date, supplier, customer,
                                place_of_supply_state_code, inter_state, taxable_paise, cgst_paise, sgst_paise,
                                igst_paise, total_paise, notes)
          select $1::uuid,'PRB/RLS/0001', '2026-27', o.id, p.id, current_date, '{"sample": true}'::jsonb,
                 '{"sample": true}'::jsonb, '27', false, 100000, 9000, 9000, 0, 118000, 'Sample probe invoice'
          from orders o join payments p on p.order_id = o.id
          where o.tenant_id = $1 and not exists (select 1 from invoices where tenant_id = $1) limit 1`,
  },
  {
    table: 'invoice_lines',
    sql: `insert into invoice_lines (tenant_id, invoice_id, description, unit_paise, amount_paise, gst_rate_bp,
                                     cgst_paise, sgst_paise)
          select $1::uuid,i.id, 'Sample probe line', 100000, 100000, 1800, 9000, 9000 from invoices i
          where i.tenant_id = $1 and not exists (select 1 from invoice_lines where tenant_id = $1) limit 1`,
  },
  {
    table: 'tenant_entitlement_overrides',
    sql: `insert into tenant_entitlement_overrides (tenant_id, target, module_id, effect, reason)
          select $1::uuid,'module', m.id, 'grant', 'RLS probe (sample)' from modules m
          where not exists (select 1 from tenant_entitlement_overrides where tenant_id = $1)
          order by m.sort_order limit 1`,
  },
  {
    table: 'consents',
    sql: `insert into consents (tenant_id, user_id, notice_id, notice_version, purposes, terms_accepted)
          select $1::uuid,u.id, n.id, n.version, '["service"]'::jsonb, true
          from users u, privacy_notices n
          where u.tenant_id = $1 and not exists (select 1 from consents where tenant_id = $1)
          order by n.created_at desc limit 1`,
  },
  {
    table: 'data_principal_requests',
    sql: `insert into data_principal_requests (tenant_id, type, principal_name, principal_contact, details, due_at)
          select $1::uuid,'access', 'Ravi Probe (Sample)', '9000099002', 'Sample access request', now() + interval '30 days'
          where not exists (select 1 from data_principal_requests where tenant_id = $1)`,
  },
  {
    table: 'checklist_items',
    sql: `insert into checklist_items (tenant_id, key, done_at)
          select $1::uuid,'staff', now()
          where not exists (select 1 from checklist_items where tenant_id = $1)`,
  },
  {
    table: 'outbox_messages',
    sql: `insert into outbox_messages (tenant_id, channel, recipient, body, template)
          select $1::uuid,'sms', '9000099001', 'Sample probe message', 'probe'
          where not exists (select 1 from outbox_messages where tenant_id = $1)`,
  },
  {
    table: 'idempotency_keys',
    sql: `insert into idempotency_keys (tenant_id, scope, key, request_hash, expires_at)
          select $1::uuid,'probe', 'rls-probe-key-0001', 'sample', now() + interval '1 day'
          where not exists (select 1 from idempotency_keys where tenant_id = $1)`,
  },
  {
    table: 'sessions',
    sql: `insert into sessions (token_hash, kind, user_id, tenant_id, expires_at)
          select 'rls-probe-session-' || $1::uuid::text, 'tenant', u.id, $1, now() + interval '1 day' from users u
          where u.tenant_id = $1 and not exists (select 1 from sessions where tenant_id = $1) limit 1`,
  },
  {
    table: 'audit_log',
    sql: `insert into audit_log (tenant_id, actor_type, actor_label, action, entity_type, entity_id, after)
          select $1::uuid,'system', 'RLS probe', 'rls.probe.seed', 'tenant', $1::uuid::text, '{"sample": true}'::jsonb
          where not exists (select 1 from audit_log where tenant_id = $1)`,
  },
];

export async function tenantIdBySlug(owner: pg.Client, slug: string): Promise<string | null> {
  const r = await owner.query<{ id: string }>('select id from tenants where slug = $1', [slug]);
  return r.rows[0]?.id ?? null;
}

/** Create (or reuse) the probe tenant and top up one row per Phase A tenant table. Returns its id. */
export async function ensureProbeTenant(owner: pg.Client): Promise<string> {
  await owner.query('begin');
  try {
    await owner.query(
      `insert into tenants (slug, status, onboarding_step, onboarding_completed_at, facility_type, legal_name,
                            display_name, sandbox)
       values ($1, 'active', 'done', now(), 'clinic', 'RLS Probe Clinic (Sample)', 'RLS Probe Clinic (Sample)', true)
       on conflict (slug) do nothing`,
      [PROBE_SLUG],
    );
    const id = await tenantIdBySlug(owner, PROBE_SLUG);
    if (!id) throw new Error('probe tenant was not created');
    for (const f of FIXTURES) {
      try {
        await owner.query(f.sql, [id]);
      } catch (err) {
        throw new Error(`probe fixture for ${f.table} failed: ${(err as Error).message}`, { cause: err });
      }
    }
    await owner.query('commit');
    return id;
  } catch (err) {
    await owner.query('rollback');
    throw err;
  }
}
