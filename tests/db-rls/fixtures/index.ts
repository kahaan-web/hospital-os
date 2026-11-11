// Probe tenants for the RLS suite. Created as the schema owner (hos_migrator), idempotently.
// Modules register here. A new area adds `fixtures/<module>.ts` exporting a seed function and one line
// in `fixtureModules`. every new tenant table must add a fixture here or the suite fails.
import type pg from 'pg';
import { seedAdt } from './adt';
import { seedAppointments } from './appointments';
import { seedClinicalFoundation } from './clinical-foundation';
import { seedCore } from './core';
import { seedCreditNotes } from './credit-notes';
import { seedRegistration } from './registration';
import type { FixtureModule, ProbeSpec, TenantFixture } from './types';

export const fixtureModules: FixtureModule[] = [
  { name: 'core', seed: seedCore },
  { name: 'clinical-foundation', seed: seedClinicalFoundation },
  // No-op until feat/mt-hardening creates the table. Then it inserts one row per tenant.
  { name: 'credit-notes', seed: seedCreditNotes },
  { name: 'registration', seed: seedRegistration },
  { name: 'adt', seed: seedAdt },
  { name: 'appointments', seed: seedAppointments },
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
    for (const mod of fixtureModules) {
      try {
        await mod.seed(owner, id, spec);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`probe fixture ${spec.slug}.${mod.name} failed: ${message}`, { cause: err });
      }
    }
    // Time-limited rows are refreshed so a later run is not tripped by the idle / expiry windows.
    // Append-only clinical tables are not updated here.
    await owner.query(`update users set status = 'active' where tenant_id = $1`, [id]);
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

export { TENANT_A, TENANT_B } from './types';
export type { ProbeSpec, TenantFixture };
