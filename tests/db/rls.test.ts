import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDb, withTenant } from '../../packages/db/src/client';
import { dbEnv } from '../../packages/db/src/env';
import {
  connectRoles,
  deletePair,
  disconnectRoles,
  expectHiddenWrite,
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
  'credit_notes',
  'tenant_entitlement_overrides',
  'consents',
  'data_principal_requests',
  'checklist_items',
  'outbox_messages',
  'idempotency_keys',
  'number_series',
  'patients',
  'patient_alerts',
  'patient_documents',
  'encounters',
  'services',
  'tariffs',
  'clinical_orders',
  'clinical_order_items',
  'vital_signs',
  'clinical_notes',
  'charges',
  'cash_ledger',
  'doctor_schedules',
  'schedule_exceptions',
  'appointments',
  'opd_queue',
  'mlc_cases',
  'pharmacy_items',
  'pharmacy_suppliers',
  'pharmacy_batches',
  'pharmacy_stock',
  'pharmacy_stock_moves',
  'pharmacy_grns',
  'pharmacy_grn_lines',
  'pharmacy_sales',
  'pharmacy_sale_lines',
  'pharmacy_sale_returns',
  'pharmacy_sale_return_lines',
  'pharmacy_ip_issues',
  'pharmacy_ip_issue_lines',
  'pharmacy_adjustments',
  'pharmacy_adjustment_lines',
  'pharmacy_supplier_returns',
  'pharmacy_supplier_return_lines',
  'wards',
  'rooms',
  'beds',
  'admissions',
  'bed_assignments',
  'admission_requests',
  'discharge_summaries',
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
  /** No DELETE grant, or a trigger rejects the delete. Cross-tenant and mass DELETE must be 42501. */
  denyDelete: boolean;
  /** No UPDATE grant on the column this check writes. Own-row UPDATE must be 42501. */
  denyUpdate: boolean;
  /** T-ro overrides: tenant scope can read but not write. */
  writes: 'own' | 'none';
  /** Append-only trigger rejects UPDATE of a visible row (clinical_notes). */
  updateGuard?: boolean;
  /**
   * Mass DELETE. `forbidden` when a trigger rejects it (vitals, notes).
   * `skip` when an append-only child makes a plain DELETE impossible (patients, encounters).
   */
  massDelete?: 'one' | 'forbidden' | 'skip';
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
    await roles?.platform.query('ROLLBACK').catch(() => undefined);
  });

  afterAll(async () => {
    try {
      if (roles && pair) await deletePair(roles.admin, pair);
    } finally {
      await disconnectRoles(roles);
    }
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

  it('lists the same tenant-owned tables as the isolation matrix', async () => {
    const withTenantId = await app().query<{ relname: string }>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and exists (
            select 1
              from pg_attribute a
             where a.attrelid = c.oid
               and a.attname = 'tenant_id'
               and a.attnum > 0
               and not a.attisdropped
          )
        order by 1`,
    );
    const excluded = new Set(['audit_log', 'roles', 'sessions']);
    const discovered = [
      ...withTenantId.rows.map((row) => row.relname).filter((name) => !excluded.has(name)),
      'tenants',
    ].sort();
    const expected = [...TABLES].sort();
    const missing = expected.filter((name) => !discovered.includes(name));
    expect(missing, 'tenant tables missing from the database').toEqual([]);
    const extra = discovered.filter((name) => !expected.includes(name));
    if (extra.length === 0) return;
    // A shared hos_test can contain tenant tables from migrations this worktree does not have
    // (other worktrees apply 0100+ clinical migrations to the same database). Those must not
    // hide a table this matrix forgot. A database migrated only from this repo still fails.
    const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../../packages/db/migrations');
    const shipped = new Set(readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')));
    const applied = await admin().query<{ name: string }>('select name from _migrations');
    const foreign = applied.rows.map((row) => row.name).filter((name) => !shipped.has(name));
    expect(
      foreign.length,
      `tenant tables not in this matrix (${extra.join(', ')}) but the database has only this repo's migrations`,
    ).toBeGreaterThan(0);
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

      if (spec.denyUpdate || spec.updateGuard) {
        await expectSqlState(app(), `update ${spec.table} set ${spec.setSql}`, [], '42501');
      } else {
        const updated = await app().query(`update ${spec.table} set ${spec.setSql}`);
        expect(updated.rowCount).toBe(spec.writes === 'none' ? 0 : 1);
      }
      // B is invisible. 0 rows (RLS) or 42501 (no privilege, or the immutability trigger) both pass.
      await expectHiddenWrite(app(), `update ${spec.table} set ${spec.setSql} where ${spec.hidden}`, [spec.bParam]);
      if (spec.denyDelete) {
        await expectSqlState(app(), `delete from ${spec.table} where ${spec.hidden}`, [spec.bParam], '42501');
      } else {
        await expectHiddenWrite(app(), `delete from ${spec.table} where ${spec.hidden}`, [spec.bParam]);
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

    if (spec.massDelete === 'skip') return;

    await app().query('BEGIN');
    try {
      await scopeTenant(app(), pair!.a.id);
      if (spec.denyDelete || spec.massDelete === 'forbidden') {
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

  it('hides another tenant custom roles and blocks cross-tenant role assignment', async () => {
    const customB = await admin().query<{ id: string }>(
      `insert into roles (tenant_id, key, name, is_system)
       values ($1, $2, 'Custom role B', false) returning id`,
      [pair!.b.id, `zz-custom-${pair!.runId}`],
    );
    const roleB = customB.rows[0]?.id;
    expect(roleB).toBeTruthy();
    await app().query('BEGIN');
    try {
      await scopeTenant(app(), pair!.a.id);
      const hidden = await app().query<{ n: number }>(`select count(*)::int as n from roles where id = $1`, [roleB]);
      expect(Number(hidden.rows[0]?.n)).toBe(0);
      await expectSqlState(
        app(),
        `insert into user_location_roles (tenant_id, user_id, role_id, location_id) values ($1, $2, $3, $4)`,
        [pair!.a.id, pair!.a.userId, roleB, pair!.a.locationId],
        '42501',
      );
    } finally {
      await app().query('ROLLBACK');
    }
    await admin().query('delete from roles where id = $1', [roleB]);
  });

  it('rejects catalogue writes in tenant scope and tenant inserts with no session context', async () => {
    await app().query('BEGIN');
    try {
      await scopeTenant(app(), pair!.a.id);
      await expectSqlState(
        app(),
        `insert into plans (key, name, status, sort_order) values ($1, 'Nope plan', 'active', 999)`,
        [`zz-plan-${pair!.runId}`],
        '42501',
      );
    } finally {
      await app().query('ROLLBACK');
    }

    await app().query('BEGIN');
    try {
      await expectSqlState(
        app(),
        `insert into locations (tenant_id, name, code, state_code) values ($1, 'No ctx', 'NC', '27')`,
        [pair!.a.id],
        '42501',
      );
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

    await platform().query('BEGIN');
    try {
      await scopePlatform(platform(), pair!.a.id);
      const other = await platform().query<{ id: string }>(`select id from modules where id <> $1 limit 1`, [pair!.moduleId]);
      const moduleId = other.rows[0]?.id;
      expect(moduleId, 'catalogue has a second module').toBeTruthy();
      await platform().query(
        `insert into tenant_entitlement_overrides (tenant_id, target, module_id, effect, reason)
         values ($1, 'module', $2, 'revoke', 'platform on tenant')`,
        [pair!.a.id, moduleId],
      );
      const seen = await platform().query<{ n: number }>(
        `select count(*)::int as n from tenant_entitlement_overrides where reason = 'platform on tenant'`,
      );
      expect(Number(seen.rows[0]?.n)).toBe(1);
    } finally {
      await platform().query('ROLLBACK');
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

    await platform().query('BEGIN');
    try {
      await scopePlatform(platform(), pair!.a.id);
      await expectSqlState(platform(), 'select hos_admin_overview()', [], '42501');
    } finally {
      await platform().query('ROLLBACK');
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
  function platform() {
    if (!roles) throw new Error('database clients were not opened');
    return roles.platform;
  }
  function admin() {
    if (!roles) throw new Error('database clients were not opened');
    return roles.admin;
  }
});

function specFor(table: TableName, pair: FixturePair): IsoSpec {
  const b = pair.b;
  const common = {
    table,
    insertParams: [b.id] as unknown[],
    retargetParams: [b.id] as unknown[],
    denyDelete: false,
    denyUpdate: false,
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
      return {
        ...row(common, 'id = $1', b.locationId, `city = 'Touched by A'`, 'city',
          `insert into locations (tenant_id, name, code, state_code) values ($1, 'Nope', 'ZZNO', '27')`),
        // Encounters and vitals reference this location. Vitals are append-only, so hos_app cannot clear them first.
        massDelete: 'skip',
      };
    case 'departments':
      return row(common, 'id = $1', b.departmentId, `name = 'Touched by A'`, 'name',
        `insert into departments (tenant_id, location_id, name) values ($1, '${b.locationId}', 'Nope')`);
    case 'doctors':
      return {
        ...row(common, 'id = $1', b.doctorId, `name = 'Touched by A'`, 'name',
          `insert into doctors (tenant_id, location_id, name) values ($1, '${b.locationId}', 'Nope')`),
        beforeMassDelete: [
          'delete from discharge_summaries',
          'delete from bed_assignments',
          'delete from admission_requests',
          'delete from admissions',
          'delete from opd_queue',
          'delete from appointments',
          'delete from schedule_exceptions',
          'delete from doctor_schedules',
        ],
      };
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
        denyUpdate: true,
        denyDelete: true,
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
        denyUpdate: true,
        denyDelete: true,
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
        denyDelete: true,
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
        denyUpdate: true,
        denyDelete: true,
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
        denyUpdate: true,
        denyDelete: true,
      };
    case 'invoice_lines':
      return {
        ...row(common, 'id = $1', b.lineId, `description = 'Touched by A'`, 'description',
          `insert into invoice_lines (tenant_id, invoice_id, description, unit_paise, amount_paise, gst_rate_bp) values ($1, '${b.invoiceId}', 'Nope', 100, 100, 1800)`),
        denyUpdate: true,
        denyDelete: true,
      };
    case 'credit_notes':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.creditNoteId,
        setSql: `reason = 'Touched by A'`,
        untouched: `select coalesce(reason = 'Touched by A', false) as touched from credit_notes where id = $1`,
        insertSql: `insert into credit_notes (tenant_id, invoice_id, number, taxable_paise, total_paise) values ($1, '${b.invoiceId}', 'N${pair.runId}C', 100, 118)`,
        retargetSql: `update credit_notes set tenant_id = $1`,
        denyUpdate: true,
        denyDelete: true,
      };
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
        denyDelete: true,
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
    case 'number_series':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.seriesId,
        setSql: `last_no = 9`,
        untouched: `select coalesce(last_no = 9, false) as touched from number_series where id = $1`,
        insertSql: `insert into number_series (tenant_id, series_key, period, last_no) values ($1, 'nope', '', 1)`,
        retargetSql: `update number_series set tenant_id = $1, series_key = 'moved'`,
      };
    case 'patients':
      return {
        ...row(common, 'id = $1', b.patientId, `city = 'Touched by A'`, 'city',
          `insert into patients (tenant_id, uhid, first_name, gender) values ($1, 'DEMO-nope-${pair.runId}', 'Nope', 'other')`),
        // Vitals and notes are append-only and reference this patient, so hos_app cannot clear them first.
        massDelete: 'skip',
      };
    case 'patient_alerts':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.alertId,
        setSql: `"text" = 'Touched by A'`,
        untouched: `select coalesce("text" = 'Touched by A', false) as touched from patient_alerts where id = $1`,
        insertSql: `insert into patient_alerts (tenant_id, patient_id, kind, text) values ($1, '${b.patientId}', 'alert', 'Nope')`,
        retargetSql: `update patient_alerts set tenant_id = $1`,
      };
    case 'patient_documents':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.documentId,
        setSql: `kind = 'Touched by A'`,
        untouched: `select coalesce(kind = 'Touched by A', false) as touched from patient_documents where id = $1`,
        insertSql: `insert into patient_documents (tenant_id, patient_id, kind, file_path, mime, size) values ($1, '${b.patientId}', 'nope', 'nope.pdf', 'application/pdf', 1)`,
        retargetSql: `update patient_documents set tenant_id = $1`,
      };
    case 'encounters':
      return {
        ...row(common, 'id = $1', b.encounterId, `referred_by = 'Touched by A'`, 'referred_by',
          `insert into encounters (tenant_id, location_id, patient_id, kind, number) values ($1, '${b.locationId}', '${b.patientId}', 'opd', 'ZNOPE${pair.runId}')`),
        massDelete: 'skip',
      };
    case 'services':
      return {
        ...row(common, 'id = $1', b.serviceId, `name = 'Touched by A'`, 'name',
          `insert into services (tenant_id, code, name, category) values ($1, 'NO${pair.runId}', 'Nope', 'misc')`),
        beforeMassDelete: ['delete from charges', 'delete from tariffs'],
      };
    case 'tariffs':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.tariffId,
        setSql: `price_paise = 9`,
        untouched: `select coalesce(price_paise = 9, false) as touched from tariffs where id = $1`,
        insertSql: `insert into tariffs (tenant_id, service_id, price_paise, effective_from) values ($1, '${b.serviceId}', 50, current_date)`,
        retargetSql: `update tariffs set tenant_id = $1`,
      };
    case 'clinical_orders':
      return {
        ...row(common, 'id = $1', b.clinicalOrderId, `notes = 'Touched by A'`, 'notes',
          `insert into clinical_orders (tenant_id, location_id, encounter_id, patient_id, kind, number, source) values ($1, '${b.locationId}', '${b.encounterId}', '${b.patientId}', 'lab', 'ZNOPE${pair.runId}', 'opd')`),
        beforeMassDelete: ['delete from clinical_order_items'],
      };
    case 'clinical_order_items':
      return row(common, 'id = $1', b.orderItemId, `drug_name = 'Touched by A'`, 'drug_name',
        `insert into clinical_order_items (tenant_id, order_id, line_no) values ($1, '${b.clinicalOrderId}', 2)`);
    case 'vital_signs':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.vitalId,
        setSql: `entered_in_error_at = timestamptz '2020-01-01+00', error_reason = 'Touched by A'`,
        untouched: `select coalesce(error_reason = 'Touched by A', false) as touched from vital_signs where id = $1`,
        insertSql: `insert into vital_signs (tenant_id, location_id, encounter_id, patient_id) values ($1, '${b.locationId}', '${b.encounterId}', '${b.patientId}')`,
        retargetSql: `update vital_signs set tenant_id = $1`,
        massDelete: 'forbidden',
      };
    case 'clinical_notes':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.noteId,
        setSql: `body = 'Touched by A'`,
        untouched: `select coalesce(body = 'Touched by A', false) as touched from clinical_notes where id = $1`,
        insertSql: `insert into clinical_notes (tenant_id, encounter_id, patient_id, kind, body) values ($1, '${b.encounterId}', '${b.patientId}', 'plan', 'Nope')`,
        retargetSql: `update clinical_notes set tenant_id = $1`,
        updateGuard: true,
        massDelete: 'forbidden',
      };
    case 'charges':
      return row(common, 'id = $1', b.chargeId, `description = 'Touched by A'`, 'description',
        `insert into charges (tenant_id, location_id, encounter_id, patient_id, description, qty, unit_price_paise, amount_paise, gst_treatment, service_date, source_module, source_type, source_id, source_line) values ($1, '${b.locationId}', '${b.encounterId}', '${b.patientId}', 'Nope', 1, 100, 100, 'exempt_healthcare', current_date, 'opd', 'fixture', '${b.encounterId}', 'nope')`);
    case 'cash_ledger':
      return row(common, 'id = $1', b.cashId, `void_reason = 'Touched by A'`, 'void_reason',
        `insert into cash_ledger (tenant_id, location_id, entry_type, direction, mode, amount_paise, number, ref_type, ref_id) values ($1, '${b.locationId}', 'receipt', 'in', 'cash', 100, 'ZNOPE${pair.runId}', 'bill', '${b.encounterId}')`);
    case 'doctor_schedules':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.scheduleId,
        setSql: 'slot_minutes = 20',
        untouched: 'select coalesce(slot_minutes = 20, false) as touched from doctor_schedules where id = $1',
        insertSql: `insert into doctor_schedules (tenant_id, doctor_id, location_id, weekday, start_time, end_time, slot_minutes, max_per_slot) values ($1, '${b.doctorId}', '${b.locationId}', 1, '14:00', '15:00', 15, 1)`,
        retargetSql: 'update doctor_schedules set tenant_id = $1',
      };
    case 'schedule_exceptions':
      return row(common, 'id = $1', b.exceptionId, `reason = 'Touched by A'`, 'reason',
        `insert into schedule_exceptions (tenant_id, doctor_id, location_id, on_date, kind, reason) values ($1, '${b.doctorId}', '${b.locationId}', '2026-02-02', 'closed', 'Nope')`);
    case 'appointments':
      return row(common, 'id = $1', b.appointmentId, `reason = 'Touched by A'`, 'reason',
        `insert into appointments (tenant_id, location_id, patient_id, doctor_id, date, slot_start, slot_end, seq, channel, reason) values ($1, '${b.locationId}', '${b.patientId}', '${b.doctorId}', '2026-06-02', '10:00', '10:15', 1, 'counter', 'Nope')`);
    case 'opd_queue':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.queueId,
        setSql: 'token = 9',
        untouched: 'select coalesce(token = 9, false) as touched from opd_queue where id = $1',
        insertSql: `insert into opd_queue (tenant_id, location_id, encounter_id, patient_id, doctor_id, token, visit_date) values ($1, '${b.locationId}', '${b.spareEncounterId}', '${b.patientId}', '${b.doctorId}', 2, current_date)`,
        retargetSql: 'update opd_queue set tenant_id = $1',
      };
    case 'mlc_cases':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.mlcId,
        setSql: `injury_summary = 'Touched by A'`,
        untouched: `select coalesce(injury_summary = 'Touched by A', false) as touched from mlc_cases where id = $1`,
        insertSql: `insert into mlc_cases (tenant_id, patient_id, encounter_id, number, injury_summary) values ($1, '${b.patientId}', '${b.encounterId}', 'ZML${pair.runId}', 'Nope')`,
        retargetSql: `update mlc_cases set tenant_id = $1`,
      };
    case 'pharmacy_items':
      return {
        ...row(common, 'id = $1', b.pharmacyItemId, `brand = 'Touched by A'`, 'brand',
          `insert into pharmacy_items (tenant_id, generic_code, brand, form, strength, hsn, gst_rate_bp, schedule) values ($1, 'PARACETAMOL', 'Nope', 'tablet', '500 mg', '3004', 0, 'OTC')`),
        massDelete: 'skip',
      };
    case 'pharmacy_suppliers':
      return {
        ...row(common, 'id = $1', b.pharmacySupplierId, `name = 'Touched by A'`, 'name',
          `insert into pharmacy_suppliers (tenant_id, name) values ($1, 'Nope Pharma')`),
        massDelete: 'skip',
      };
    case 'pharmacy_batches':
      return {
        ...row(common, 'id = $1', b.pharmacyBatchId, `batch_no = 'Touched by A'`, 'batch_no',
          `insert into pharmacy_batches (tenant_id, item_id, batch_no, expiry, mrp_paise, purchase_rate_paise) values ($1, '${b.pharmacyItemId}', 'NOPE', current_date + 30, 100, 50)`),
        massDelete: 'skip',
      };
    case 'pharmacy_stock':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.pharmacyStockId,
        setSql: `qty = 7`,
        untouched: `select coalesce(qty = 7, false) as touched from pharmacy_stock where id = $1`,
        insertSql: `insert into pharmacy_stock (tenant_id, batch_id, location_id, qty) values ($1, '${b.pharmacyBatchId}', '${b.locationId}', 1)`,
        retargetSql: `update pharmacy_stock set tenant_id = $1`,
      };
    case 'pharmacy_stock_moves':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.pharmacyMoveId,
        setSql: `reason = 'Touched by A'`,
        untouched: `select coalesce(reason = 'Touched by A', false) as touched from pharmacy_stock_moves where id = $1`,
        insertSql: `insert into pharmacy_stock_moves (tenant_id, batch_id, location_id, qty, move_type, ref_type, ref_id) values ($1, '${b.pharmacyBatchId}', '${b.locationId}', 1, 'adjustment', 'fixture', '${b.pharmacyBatchId}')`,
        retargetSql: `update pharmacy_stock_moves set tenant_id = $1`,
        updateGuard: true,
        massDelete: 'forbidden',
      };
    case 'pharmacy_grns':
      return {
        ...row(common, 'id = $1', b.pharmacyGrnId, `notes = 'Touched by A'`, 'notes',
          `insert into pharmacy_grns (tenant_id, location_id, supplier_id, number) values ($1, '${b.locationId}', '${b.pharmacySupplierId}', 'ZGR${pair.runId}')`),
        massDelete: 'skip',
      };
    case 'pharmacy_grn_lines':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.pharmacyGrnLineId,
        setSql: `qty = 9`,
        untouched: `select coalesce(qty = 9, false) as touched from pharmacy_grn_lines where id = $1`,
        insertSql: `insert into pharmacy_grn_lines (tenant_id, grn_id, line_no, item_id, batch_id, qty, mrp_paise, purchase_rate_paise, gst_rate_bp) values ($1, '${b.pharmacyGrnId}', 2, '${b.pharmacyItemId}', '${b.pharmacyBatchId}', 1, 100, 50, 0)`,
        retargetSql: `update pharmacy_grn_lines set tenant_id = $1`,
      };
    case 'pharmacy_sales':
      return {
        ...row(common, 'id = $1', b.pharmacySaleId, `walkin_name = 'Touched by A'`, 'walkin_name',
          `insert into pharmacy_sales (tenant_id, location_id, kind, number, mode, doc_type, gross_paise, taxable_paise, cgst_paise, sgst_paise, total_paise) values ($1, '${b.locationId}', 'outside', 'ZPS${pair.runId}', 'cash', 'tax_invoice', 100, 100, 0, 0, 100)`),
        massDelete: 'skip',
      };
    case 'pharmacy_sale_lines':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.pharmacySaleLineId,
        setSql: `qty = 9`,
        untouched: `select coalesce(qty = 9, false) as touched from pharmacy_sale_lines where id = $1`,
        insertSql: `insert into pharmacy_sale_lines (tenant_id, sale_id, line_no, item_id, batch_id, qty, mrp_paise, gst_rate_bp, gross_paise, taxable_paise, tax_paise) values ($1, '${b.pharmacySaleId}', 2, '${b.pharmacyItemId}', '${b.pharmacyBatchId}', 1, 100, 0, 100, 100, 0)`,
        retargetSql: `update pharmacy_sale_lines set tenant_id = $1`,
        massDelete: 'skip',
      };
    case 'pharmacy_sale_returns':
      return {
        ...row(common, 'id = $1', b.pharmacySaleReturnId, `reason = 'Touched by A'`, 'reason',
          `insert into pharmacy_sale_returns (tenant_id, location_id, sale_id, number, reason, gross_paise, taxable_paise, tax_paise) values ($1, '${b.locationId}', '${b.pharmacySaleId}', 'ZPR${pair.runId}', 'Nope', 0, 0, 0)`),
        massDelete: 'skip',
      };
    case 'pharmacy_sale_return_lines':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.pharmacySaleReturnLineId,
        setSql: `qty = 9`,
        untouched: `select coalesce(qty = 9, false) as touched from pharmacy_sale_return_lines where id = $1`,
        insertSql: `insert into pharmacy_sale_return_lines (tenant_id, return_id, line_no, sale_line_id, batch_id, qty, gross_paise, taxable_paise, tax_paise) values ($1, '${b.pharmacySaleReturnId}', 2, '${b.pharmacySaleLineId}', '${b.pharmacyBatchId}', 1, 0, 0, 0)`,
        retargetSql: `update pharmacy_sale_return_lines set tenant_id = $1`,
      };
    case 'pharmacy_ip_issues':
      return {
        ...row(common, 'id = $1', b.pharmacyIpIssueId, `notes = 'Touched by A'`, 'notes',
          `insert into pharmacy_ip_issues (tenant_id, location_id, encounter_id, patient_id, number) values ($1, '${b.locationId}', '${b.encounterId}', '${b.patientId}', 'ZPI${pair.runId}')`),
        massDelete: 'skip',
      };
    case 'pharmacy_ip_issue_lines':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.pharmacyIpIssueLineId,
        setSql: `qty = 9`,
        untouched: `select coalesce(qty = 9, false) as touched from pharmacy_ip_issue_lines where id = $1`,
        insertSql: `insert into pharmacy_ip_issue_lines (tenant_id, issue_id, line_no, item_id, batch_id, qty, mrp_paise) values ($1, '${b.pharmacyIpIssueId}', 2, '${b.pharmacyItemId}', '${b.pharmacyBatchId}', 1, 100)`,
        retargetSql: `update pharmacy_ip_issue_lines set tenant_id = $1`,
      };
    case 'pharmacy_adjustments':
      return {
        ...row(common, 'id = $1', b.pharmacyAdjustmentId, `reason = 'Touched by A'`, 'reason',
          `insert into pharmacy_adjustments (tenant_id, location_id, number, reason) values ($1, '${b.locationId}', 'ZAJ${pair.runId}', 'Nope')`),
        massDelete: 'skip',
      };
    case 'pharmacy_adjustment_lines':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.pharmacyAdjustmentLineId,
        setSql: `qty_delta = 2`,
        untouched: `select coalesce(qty_delta = 2, false) as touched from pharmacy_adjustment_lines where id = $1`,
        insertSql: `insert into pharmacy_adjustment_lines (tenant_id, adjustment_id, line_no, batch_id, qty_delta) values ($1, '${b.pharmacyAdjustmentId}', 2, '${b.pharmacyBatchId}', 1)`,
        retargetSql: `update pharmacy_adjustment_lines set tenant_id = $1`,
      };
    case 'pharmacy_supplier_returns':
      return {
        ...row(common, 'id = $1', b.pharmacySupplierReturnId, `reason = 'Touched by A'`, 'reason',
          `insert into pharmacy_supplier_returns (tenant_id, location_id, supplier_id, number, reason) values ($1, '${b.locationId}', '${b.pharmacySupplierId}', 'ZSR${pair.runId}', 'Nope')`),
        massDelete: 'skip',
      };
    case 'pharmacy_supplier_return_lines':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.pharmacySupplierReturnLineId,
        setSql: `qty = 9`,
        untouched: `select coalesce(qty = 9, false) as touched from pharmacy_supplier_return_lines where id = $1`,
        insertSql: `insert into pharmacy_supplier_return_lines (tenant_id, return_id, line_no, batch_id, qty) values ($1, '${b.pharmacySupplierReturnId}', 2, '${b.pharmacyBatchId}', 1)`,
        retargetSql: `update pharmacy_supplier_return_lines set tenant_id = $1`,
      };
    case 'wards':
      return {
        ...row(common, 'id = $1', b.wardId, `name = 'Touched by A'`, 'name',
          `insert into wards (tenant_id, location_id, code, name, ward_type) values ($1, '${b.locationId}', 'ZZ', 'Nope', 'general')`),
        beforeMassDelete: ['delete from bed_assignments', 'delete from beds', 'delete from rooms'],
      };
    case 'rooms':
      return {
        ...row(common, 'id = $1', b.roomId, `name = 'Touched by A'`, 'name',
          `insert into rooms (tenant_id, ward_id, code, name) values ($1, '${b.wardId}', 'ZZ', 'Nope')`),
        beforeMassDelete: ['delete from bed_assignments', 'delete from beds'],
      };
    case 'beds':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.bedId,
        setSql: `status = 'maintenance'`,
        untouched: `select coalesce(status = 'maintenance', false) as touched from beds where id = $1`,
        insertSql: `insert into beds (tenant_id, room_id, label, ward_class) values ($1, '${b.roomId}', 'ZZ', 'general')`,
        retargetSql: `update beds set tenant_id = $1`,
        beforeMassDelete: ['delete from bed_assignments'],
      };
    case 'admissions':
      return {
        ...row(common, 'id = $1', b.admissionId, `attendant = 'Touched by A'`, 'attendant',
          `insert into admissions (tenant_id, location_id, encounter_id, patient_id, number, admission_type) values ($1, '${b.locationId}', '${b.encounterId}', '${b.patientId}', 'ZN${pair.runId}', 'elective')`),
        beforeMassDelete: ['delete from discharge_summaries', 'delete from bed_assignments', 'delete from admission_requests'],
      };
    case 'bed_assignments':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.bedAssignmentId,
        setSql: `from_at = timestamptz '2020-01-01+00'`,
        untouched: `select coalesce(from_at = timestamptz '2020-01-01+00', false) as touched from bed_assignments where id = $1`,
        insertSql: `insert into bed_assignments (tenant_id, admission_id, bed_id, to_at) values ($1, '${b.admissionId}', '${b.bedId}', now())`,
        retargetSql: `update bed_assignments set tenant_id = $1`,
      };
    case 'admission_requests':
      return row(common, 'id = $1', b.admissionRequestId, `reason = 'Touched by A'`, 'reason',
        `insert into admission_requests (tenant_id, location_id, patient_id, from_encounter_id, doctor_id, reason, planned_on) values ($1, '${b.locationId}', '${b.patientId}', '${b.encounterId}', '${b.doctorId}', 'Nope', current_date)`);
    case 'discharge_summaries':
      return {
        ...common,
        hidden: 'id = $1',
        bParam: b.summaryId,
        setSql: `sections = '{"diagnosis":"Touched by A"}'::jsonb`,
        untouched: `select coalesce(sections->>'diagnosis' = 'Touched by A', false) as touched from discharge_summaries where id = $1`,
        insertSql: `insert into discharge_summaries (tenant_id, admission_id, sections) values ($1, '${b.admissionId}', '{}'::jsonb)`,
        retargetSql: `update discharge_summaries set tenant_id = $1`,
      };
    default:
      return assertNever(table);
  }
}

function row(
  common: Pick<IsoSpec, 'table' | 'insertParams' | 'retargetParams' | 'denyDelete' | 'denyUpdate' | 'writes' | 'beforeMassDelete'>,
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
