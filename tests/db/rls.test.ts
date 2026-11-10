import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDb, withTenant } from '../../packages/db/src/client';
import { dbEnv } from '../../packages/db/src/env';
import {
  connectRoles,
  deletePair,
  disconnectRoles,
  expectSqlState,
  insertPair,
  scopePlatform,
  scopeTenant,
  type DbRoles,
  type FixturePair,
} from './helpers';

/**
 * Contract §10 catalog guard and tenant isolation.
 * sessions is platform-internal (§2 PI): hos_app has no grants, so a policy that names
 * hos_tenant_id() still cannot be used to read it.
 */

const TABLES = [
  'tenants',
  'locations',
  'departments',
  'doctors',
  'users',
  'user_location_roles',
  'invitations',
  'otp_challenges',
  'subscriptions',
  'subscription_items',
  'orders',
  'payments',
  'invoices',
  'invoice_lines',
  'tenant_entitlement_overrides',
  'consents',
  'data_principal_requests',
  'checklist_items',
  'outbox_messages',
  'idempotency_keys',
] as const;

type TableName = (typeof TABLES)[number];

interface IsoSpec {
  table: TableName;
  /** Identifies B's row. Invisible to A, so a filtered write matches nothing. */
  hidden: string;
  bParam: string;
  setSql: string;
  untouched: string;
  insertSql: string;
  insertParams: unknown[];
  retargetSql: string;
  retargetParams: unknown[];
  /** tenants has no DELETE grant. */
  denyDelete: boolean;
  /** T-ro overrides: tenant scope can read but not write. */
  writes: 'own' | 'none';
  /** Child deletes, rolled back with the mass delete, so a parent delete is not blocked by A's own invoice. */
  beforeMassDelete: string[];
}

describe.sequential('row level security', () => {
  let roles: DbRoles | null = null;
  let pair: FixturePair | null = null;

  beforeAll(async () => {
    roles = await connectRoles();
    pair = await insertPair(roles.migrator);
  });

  afterEach(async () => {
    await roles?.app.query('ROLLBACK').catch(() => undefined);
  });

  afterAll(async () => {
    if (roles && pair) await deletePair(roles.admin, pair).catch((err: Error) => {
      console.error(`fixture cleanup failed for ${pair?.runId}: ${err.message}`);
    });
    await disconnectRoles(roles);
  });

  it('hos_app and hos_migrator are not superusers and cannot bypass RLS', async () => {
    const who = await app().query<{ current_user: string }>('select current_user');
    expect(who.rows[0]?.current_user).toBe('hos_app');
    const found = await app().query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `select rolname, rolsuper, rolbypassrls
         from pg_roles
        where rolname in ('hos_app', 'hos_migrator')
        order by rolname`,
    );
    expect(found.rows).toEqual([
      { rolname: 'hos_app', rolsuper: false, rolbypassrls: false },
      { rolname: 'hos_migrator', rolsuper: false, rolbypassrls: false },
    ]);
  });

  it('forces RLS on every public table except the migration ledger', async () => {
    const missing = await app().query<{ relname: string }>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relname <> '_migrations'
          and not (c.relrowsecurity and c.relforcerowsecurity)
        order by 1`,
    );
    expect(missing.rows).toEqual([]);
  });

  it('puts hos_tenant_id() on every tenant table policy, and grants hos_app nothing on sessions', async () => {
    const bare = await app().query<{ relname: string }>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and exists (
            select 1 from information_schema.columns col
             where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'tenant_id'
          )
          and not exists (
            select 1 from pg_policies p
             where p.schemaname = 'public' and p.tablename = c.relname
               and (coalesce(p.qual, '') || coalesce(p.with_check, '')) ilike '%hos_tenant_id%'
          )
        order by 1`,
    );
    expect(bare.rows.map((row) => row.relname)).toEqual([]);
    const grants = await app().query(
      `select privilege_type from information_schema.role_table_grants
        where grantee = 'hos_app' and table_schema = 'public' and table_name = 'sessions'`,
    );
    expect(grants.rows).toEqual([]);
  });

  it('seeds the sheet matrix as 66 / 82 / 112', async () => {
    const counts = await app().query<{ key: string; n: number }>(
      `select p.key, count(*)::int as n
         from plan_module_features pmf
         join plans p on p.id = pmf.plan_id
         join module_features f on f.id = pmf.feature_id and f.source = 'sheet'
        group by p.key
        order by p.key`,
    );
    const byKey = new Map(counts.rows.map((row) => [row.key, Number(row.n)]));
    expect(byKey.get('basic')).toBe(66);
    expect(byKey.get('medium')).toBe(82);
    expect(byKey.get('premium')).toBe(112);
    const features = await app().query<{ n: number }>(
      `select count(*)::int as n from module_features where source = 'sheet'`,
    );
    expect(Number(features.rows[0]?.n)).toBe(112);
  });

  it.each(TABLES)('tenant A cannot see, change or remove tenant B rows in %s', async (table) => {
    const spec = specFor(table, pair!);
    await app().query('BEGIN');
    try {
      await scopeTenant(app(), pair!.a.id);
      const seen = await app().query<{ n: number }>(`select count(*)::int as n from ${spec.table}`);
      expect(Number(seen.rows[0]?.n)).toBe(1);
      const hidden = await app().query<{ n: number }>(
        `select count(*)::int as n from ${spec.table} where ${spec.hidden}`,
        [spec.bParam],
      );
      expect(Number(hidden.rows[0]?.n)).toBe(0);

      const updated = await app().query(`update ${spec.table} set ${spec.setSql}`);
      expect(updated.rowCount).toBe(spec.writes === 'none' ? 0 : 1);
      const updatedB = await app().query(`update ${spec.table} set ${spec.setSql} where ${spec.hidden}`, [spec.bParam]);
      expect(updatedB.rowCount).toBe(0);
      if (spec.denyDelete) {
        await expectSqlState(app(), `delete from ${spec.table} where ${spec.hidden}`, [spec.bParam], '42501');
      } else {
        const deletedB = await app().query(`delete from ${spec.table} where ${spec.hidden}`, [spec.bParam]);
        expect(deletedB.rowCount).toBe(0);
      }
      await expectSqlState(app(), spec.insertSql, spec.insertParams, '42501');
      if (spec.writes === 'none') {
        const moved = await app().query(spec.retargetSql, spec.retargetParams);
        expect(moved.rowCount).toBe(0);
      } else {
        await expectSqlState(app(), spec.retargetSql, spec.retargetParams, '42501');
      }
      await app().query('COMMIT');
    } catch (err) {
      await app().query('ROLLBACK').catch(() => undefined);
      throw err;
    }

    const check = await admin().query<{ touched: boolean }>(spec.untouched, [spec.bParam]);
    expect(check.rows[0]?.touched).toBe(false);

    await app().query('BEGIN');
    try {
      await scopeTenant(app(), pair!.a.id);
      if (spec.denyDelete) {
        await expectSqlState(app(), `delete from ${spec.table}`, [], '42501');
      } else if (spec.writes === 'none') {
        const deleted = await app().query(`delete from ${spec.table}`);
        expect(deleted.rowCount).toBe(0);
      } else {
        for (const text of spec.beforeMassDelete) await app().query(text);
        const deleted = await app().query(`delete from ${spec.table}`);
        expect(deleted.rowCount, 'DELETE without WHERE must touch only tenant A').toBe(1);
      }
    } finally {
      await app().query('ROLLBACK');
    }
  });

  it('returns no tenant rows with no context, an empty tenant id, or platform scope without a target', async () => {
    await app().query('BEGIN');
    try {
      const bare = await app().query<{ n: number }>('select count(*)::int as n from locations');
      expect(Number(bare.rows[0]?.n)).toBe(0);
      await scopePlatform(app(), '');
      const platform = await app().query<{ n: number }>('select count(*)::int as n from tenants');
      expect(Number(platform.rows[0]?.n)).toBe(0);
      await expectSqlState(
        app(),
        `insert into locations (tenant_id, name, code, state_code) values ($1, 'Nope', 'ZZ', '27')`,
        [pair!.a.id],
        '42501',
      );
    } finally {
      await app().query('ROLLBACK');
    }

    await app().query('BEGIN');
    try {
      await app().query(`select set_config('app.tenant_id', '', true)`);
      const empty = await app().query<{ n: number }>('select count(*)::int as n from locations');
      expect(Number(empty.rows[0]?.n)).toBe(0);
    } finally {
      await app().query('ROLLBACK');
    }
  });

  it('rejects a garbage tenant id, SET ROLE, disabling RLS, and reading platform-internal tables', async () => {
    const handle = createDb(dbEnv().appUrl, { max: 1 });
    try {
      await expect(withTenant(handle.db, 'not-a-uuid', async () => 1)).rejects.toThrow(/invalid tenant id/i);
    } finally {
      await handle.close();
    }

    await app().query('BEGIN');
    try {
      await app().query(`select set_config('app.tenant_id', 'not-a-uuid', true)`);
      await expectSqlState(app(), 'select hos_tenant_id()', [], '22P02');
    } finally {
      await app().query('ROLLBACK');
    }

    await app().query('BEGIN');
    try {
      await expectSqlState(app(), 'set role hos_migrator', [], '42501');
      await expectSqlState(app(), 'alter table locations disable row level security', [], '42501');
      await expectSqlState(app(), 'select 1 from sessions limit 1', [], '42501');
      await expectSqlState(app(), 'select 1 from invoice_sequences limit 1', [], '42501');
      await expectSqlState(app(), 'select 1 from _migrations limit 1', [], '42501');
      // row_security=off does not reveal rows: a policy that would filter makes the query fail.
      await app().query('set local row_security = off');
      await expectSqlState(app(), 'select count(*) from locations', [], '42501');
    } finally {
      await app().query('ROLLBACK');
    }
    const who = await app().query<{ current_user: string }>('select current_user');
    expect(who.rows[0]?.current_user).toBe('hos_app');
  });

  it('rejects a cross-tenant location reference and a tenant-scoped override or suspension', async () => {
    await app().query('BEGIN');
    try {
      await scopeTenant(app(), pair!.a.id);
      await expectSqlState(
        app(),
        `insert into departments (tenant_id, location_id, name) values ($1, $2, 'Cross')`,
        [pair!.a.id, pair!.b.locationId],
        '23503',
      );
      await expectSqlState(
        app(),
        `insert into tenant_entitlement_overrides (tenant_id, target, module_id, effect, reason)
         values ($1, 'module', $2, 'grant', 'should fail')`,
        [pair!.a.id, pair!.moduleId],
        '42501',
      );
      const suspended = await expectSqlState(app(), `update tenants set status = 'suspended'`, [], '42501');
      expect(suspended).toMatch(/platform scope/i);
    } finally {
      await app().query('ROLLBACK');
    }

    await app().query('BEGIN');
    try {
      await scopePlatform(app(), pair!.a.id);
      const other = await app().query<{ id: string }>(`select id from modules where id <> $1 limit 1`, [pair!.moduleId]);
      const moduleId = other.rows[0]?.id;
      expect(moduleId, 'catalogue has a second module').toBeTruthy();
      await app().query(
        `insert into tenant_entitlement_overrides (tenant_id, target, module_id, effect, reason)
         values ($1, 'module', $2, 'revoke', 'platform on tenant')`,
        [pair!.a.id, moduleId],
      );
      const seen = await app().query<{ n: number }>(
        `select count(*)::int as n from tenant_entitlement_overrides where reason = 'platform on tenant'`,
      );
      expect(Number(seen.rows[0]?.n)).toBe(1);
    } finally {
      await app().query('ROLLBACK');
    }
  });

  it('refuses admin aggregates and a session for the other tenant, and hides expired sessions', async () => {
    await app().query('BEGIN');
    try {
      await scopeTenant(app(), pair!.a.id);
      await expectSqlState(app(), 'select hos_admin_overview()', [], '42501');
      await expectSqlState(app(), 'select * from hos_admin_tenant_list(null, null, 10, 0)', [], '42501');
      await expectSqlState(
        app(),
        `select hos_session_create($1, 'tenant', $2, null, null, null, null)`,
        [randomUUID(), pair!.b.userId],
        '42501',
      );
    } finally {
      await app().query('ROLLBACK');
    }

    await app().query('BEGIN');
    try {
      await scopePlatform(app(), pair!.a.id);
      await expectSqlState(app(), 'select hos_admin_overview()', [], '42501');
    } finally {
      await app().query('ROLLBACK');
    }

    const live = randomUUID().replace(/-/g, '');
    await app().query('BEGIN');
    try {
      await scopeTenant(app(), pair!.a.id);
      await app().query(`select hos_session_create($1, 'tenant', $2, null, null, null, null)`, [live, pair!.a.userId]);
      await app().query('COMMIT');
    } catch (err) {
      await app().query('ROLLBACK').catch(() => undefined);
      throw err;
    }
    const resolved = await app().query(`select id from hos_session_resolve($1)`, [live]);
    expect(resolved.rowCount).toBe(1);

    await admin().query(`update sessions set expires_at = now() - interval '1 minute' where token_hash = $1`, [live]);
    const expired = await app().query(`select id from hos_session_resolve($1)`, [live]);
    expect(expired.rowCount).toBe(0);

    const revoked = randomUUID().replace(/-/g, '');
    await app().query('BEGIN');
    try {
      await scopeTenant(app(), pair!.a.id);
      await app().query(`select hos_session_create($1, 'tenant', $2, null, null, null, null)`, [revoked, pair!.a.userId]);
      await app().query('COMMIT');
    } catch (err) {
      await app().query('ROLLBACK').catch(() => undefined);
      throw err;
    }
    await admin().query(`update sessions set revoked_at = now() where token_hash = $1`, [revoked]);
    const gone = await app().query(`select id from hos_session_resolve($1)`, [revoked]);
    expect(gone.rowCount).toBe(0);
    const unknown = await app().query(`select id from hos_session_resolve($1)`, [randomUUID()]);
    expect(unknown.rowCount).toBe(0);
  });

  it('does not leak app.tenant_id out of withTenant on a one-connection pool', async () => {
    const handle = createDb(dbEnv().appUrl, { max: 1 });
    try {
      const inside = await withTenant(handle.db, pair!.a.id, async (tx) => {
        const result = await tx.execute<{ t: string | null }>(sql`select current_setting('app.tenant_id', true) as t`);
        return result.rows[0]?.t ?? '';
      });
      expect(inside).toBe(pair!.a.id);
      const outside = await handle.pool.query<{ t: string | null }>(`select current_setting('app.tenant_id', true) as t`);
      expect(outside.rows[0]?.t ?? '').toBe('');
    } finally {
      await handle.close();
    }
  });

  function app() {
    if (!roles) throw new Error('database clients were not opened');
    return roles.app;
  }
  function admin() {
    if (!roles) throw new Error('database clients were not opened');
    return roles.admin;
  }
});

function specFor(table: TableName, pair: FixturePair): IsoSpec {
  const a = pair.a;
  const b = pair.b;
  const common = {
    table,
    insertParams: [b.id] as unknown[],
    retargetParams: [b.id] as unknown[],
    denyDelete: false,
    writes: 'own' as const,
    beforeMassDelete: [] as string[],
  };
  switch (table) {
    case 'tenants':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.id,
        setSql: `display_name = 'Touched by A'`,
        untouched: `select coalesce(display_name = 'Touched by A', false) as touched from tenants where id = $1`,
        insertSql: `insert into tenants (id, slug, legal_name, display_name) values (gen_random_uuid(), $1, 'Nope', 'Nope')`,
        insertParams: [`zz-nope-${pair.runId}`],
        retargetSql: `update tenants set id = gen_random_uuid()`,
        retargetParams: [],
        denyDelete: true,
      };
    case 'locations':
      return row(common, 'id = $1', b.locationId, `city = 'Touched by A'`, 'city', 
        `insert into locations (tenant_id, name, code, state_code) values ($1, 'Nope', 'ZZNO', '27')`);
    case 'departments':
      return row(common, 'id = $1', b.departmentId, `name = 'Touched by A'`, 'name',
        `insert into departments (tenant_id, location_id, name) values ($1, '${b.locationId}', 'Nope')`);
    case 'doctors':
      return row(common, 'id = $1', b.doctorId, `name = 'Touched by A'`, 'name',
        `insert into doctors (tenant_id, location_id, name) values ($1, '${b.locationId}', 'Nope')`);
    case 'users':
      return row(common, 'id = $1', b.userId, `name = 'Touched by A'`, 'name',
        `insert into users (tenant_id, email, name) values ($1, 'nope.${pair.runId}@zz-test.example', 'Nope')`);
    case 'user_location_roles':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.assignmentId,
        setSql: `created_at = timestamptz '2020-01-01+00'`,
        untouched: `select coalesce(created_at = timestamptz '2020-01-01+00', false) as touched from user_location_roles where id = $1`,
        insertSql: `insert into user_location_roles (tenant_id, user_id, role_id, location_id) values ($1, '${b.userId}', '${pair.roleId}', '${b.locationId}')`,
        retargetSql: `update user_location_roles set tenant_id = $1`,
      };
    case 'invitations':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.invitationId,
        setSql: `accepted_at = timestamptz '2020-01-01+00'`,
        untouched: `select coalesce(accepted_at is not null, false) as touched from invitations where id = $1`,
        insertSql: `insert into invitations (tenant_id, user_id, token_hash, expires_at) values ($1, '${b.userId}', 'nope-${pair.runId}', now() + interval '1 day')`,
        retargetSql: `update invitations set tenant_id = $1`,
      };
    case 'otp_challenges':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.otpId,
        setSql: `attempts = 9`,
        untouched: `select coalesce(attempts = 9, false) as touched from otp_challenges where id = $1`,
        insertSql: `insert into otp_challenges (tenant_id, user_id, purpose, destination, code_hash, expires_at) values ($1, '${b.userId}', 'signup', '9000000099', 'nope', now() + interval '1 hour')`,
        retargetSql: `update otp_challenges set tenant_id = $1`,
      };
    case 'subscriptions':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.subscriptionId,
        setSql: `location_count = 9`,
        untouched: `select coalesce(location_count = 9, false) as touched from subscriptions where id = $1`,
        insertSql: `insert into subscriptions (tenant_id, plan_id, billing_cycle, current_period_start, current_period_end) values ($1, '${pair.planId}', 'annual', now(), now() + interval '1 year')`,
        retargetSql: `update subscriptions set tenant_id = $1`,
      };
    case 'subscription_items':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.itemId,
        setSql: `quantity = 9`,
        untouched: `select coalesce(quantity = 9, false) as touched from subscription_items where id = $1`,
        insertSql: `insert into subscription_items (tenant_id, subscription_id, kind, unit_amount_paise) values ($1, '${b.subscriptionId}', 'plan', 100)`,
        retargetSql: `update subscription_items set tenant_id = $1`,
      };
    case 'orders':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.orderId,
        setSql: `paid_at = timestamptz '2020-01-01+00'`,
        untouched: `select coalesce(paid_at is not null, false) as touched from orders where id = $1`,
        insertSql: `insert into orders (tenant_id, public_id, purpose, amount_paise, quote, idempotency_key) values ($1, 'order_nope${pair.runId}', 'onboarding', 100, '{}'::jsonb, 'zz${pair.runId}nopeord')`,
        retargetSql: `update orders set tenant_id = $1`,
        beforeMassDelete: ['delete from invoice_lines', 'delete from invoices', 'delete from payments'],
      };
    case 'payments':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.paymentId,
        setSql: `failure_reason = 'Touched by A'`,
        untouched: `select coalesce(failure_reason = 'Touched by A', false) as touched from payments where id = $1`,
        insertSql: `insert into payments (tenant_id, order_id, public_id, method, amount_paise) values ($1, '${b.orderId}', 'pay_nope${pair.runId}', 'upi', 100)`,
        retargetSql: `update payments set tenant_id = $1`,
        beforeMassDelete: ['delete from invoice_lines', 'delete from invoices'],
      };
    case 'invoices':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.invoiceId,
        setSql: `notes = 'Touched by A'`,
        untouched: `select coalesce(notes = 'Touched by A', false) as touched from invoices where id = $1`,
        insertSql: `insert into invoices (tenant_id, number, fy, issue_date, supplier, customer, place_of_supply_state_code, inter_state, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise) values ($1, 'N${pair.runId}X', '2026-27', current_date, '{}'::jsonb, '{}'::jsonb, '27', false, 100, 9, 9, 0, 118)`,
        retargetSql: `update invoices set tenant_id = $1`,
      };
    case 'invoice_lines':
      return row(common, 'id = $1', b.lineId, `description = 'Touched by A'`, 'description',
        `insert into invoice_lines (tenant_id, invoice_id, description, unit_paise, amount_paise, gst_rate_bp) values ($1, '${b.invoiceId}', 'Nope', 100, 100, 1800)`);
    case 'tenant_entitlement_overrides':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.overrideId,
        setSql: `reason = 'Touched by A'`,
        untouched: `select coalesce(reason = 'Touched by A', false) as touched from tenant_entitlement_overrides where id = $1`,
        insertSql: `insert into tenant_entitlement_overrides (tenant_id, target, feature_id, effect, reason) values ($1, 'feature', (select id from module_features limit 1), 'grant', 'nope')`,
        retargetSql: `update tenant_entitlement_overrides set tenant_id = $1`,
        writes: 'none',
      };
    case 'consents':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.consentId,
        setSql: `withdrawn_at = timestamptz '2020-01-01+00'`,
        untouched: `select coalesce(withdrawn_at is not null, false) as touched from consents where id = $1`,
        insertSql: `insert into consents (tenant_id, user_id, notice_id, notice_version, purposes) values ($1, '${b.userId}', '${pair.noticeId}', 'v', '[]'::jsonb)`,
        retargetSql: `update consents set tenant_id = $1`,
      };
    case 'data_principal_requests':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.requestId,
        setSql: `resolution_notes = 'Touched by A'`,
        untouched: `select coalesce(resolution_notes = 'Touched by A', false) as touched from data_principal_requests where id = $1`,
        insertSql: `insert into data_principal_requests (tenant_id, type, principal_name, principal_contact, details, due_at) values ($1, 'access', 'Nope', 'nope@zz-test.example', 'Nope request', now() + interval '1 day')`,
        retargetSql: `update data_principal_requests set tenant_id = $1`,
      };
    case 'checklist_items':
      return {
        ...common,
        hidden: 'key = $1',
        bParam: b.checklistKey,
        setSql: `done_at = timestamptz '2020-01-01+00'`,
        untouched: `select coalesce(done_at is not null, false) as touched from checklist_items where key = $1`,
        insertSql: `insert into checklist_items (tenant_id, key) values ($1, 'nope${pair.runId}')`,
        retargetSql: `update checklist_items set tenant_id = $1`,
      };
    case 'outbox_messages':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.outboxId,
        setSql: `subject = 'Touched by A'`,
        untouched: `select coalesce(subject = 'Touched by A', false) as touched from outbox_messages where id = $1`,
        insertSql: `insert into outbox_messages (tenant_id, channel, recipient, body, template) values ($1, 'email', 'nope@zz-test.example', 'Nope', 'test')`,
        retargetSql: `update outbox_messages set tenant_id = $1`,
      };
    case 'idempotency_keys':
      return {
        ...common,
        hidden: 'key = $1',
        bParam: b.idemKey,
        setSql: `request_hash = 'touched-by-a'`,
        untouched: `select coalesce(request_hash = 'touched-by-a', false) as touched from idempotency_keys where key = $1`,
        insertSql: `insert into idempotency_keys (tenant_id, scope, key, request_hash, expires_at) values ($1, 'POST /test', 'zz${pair.runId}nopekey', 'nope', now() + interval '1 day')`,
        retargetSql: `update idempotency_keys set tenant_id = $1`,
      };
    default:
      return assertNever(table);
  }
}

function row(
  common: Pick<IsoSpec, 'table' | 'insertParams' | 'retargetParams' | 'denyDelete' | 'writes' | 'beforeMassDelete'>,
  hidden: string,
  bParam: string,
  setSql: string,
  column: string,
  insertSql: string,
): IsoSpec {
  return {
    ...common,
    hidden,
    bParam,
    setSql,
    untouched: `select coalesce(${column} = 'Touched by A', false) as touched from ${common.table} where ${hidden}`,
    insertSql,
    retargetSql: `update ${common.table} set tenant_id = $1`,
  };
}

function assertNever(table: never): never {
  throw new Error(`unknown table ${String(table)}`);
}
