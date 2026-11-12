import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectRoles, disconnectRoles, expectSqlState, scopePlatform, scopeTenant, type DbRoles } from '../db/helpers';

/**
 * Option C: platform scope is the login role, not a GUC hos_app can set.
 * Successful writes are rolled back. Nothing here stays on the shared test database.
 */

describe.sequential('platform scope login', () => {
  let roles: DbRoles | null = null;
  let tenantId = '';
  let moduleId = '';

  beforeAll(async () => {
    roles = await connectRoles();
    const found = await roles.admin.query<{ tenant_id: string; module_id: string }>(`
      select t.id as tenant_id, m.id as module_id
      from tenants t
      cross join lateral (
        select id from modules
        where not exists (
          select 1 from tenant_entitlement_overrides o
          where o.tenant_id = t.id and o.module_id = modules.id and o.feature_id is null
        )
        limit 1
      ) m
      limit 1
    `);
    const row = found.rows[0];
    if (!row) throw new Error('seed is missing a tenant and a free module for the override check');
    tenantId = row.tenant_id;
    moduleId = row.module_id;
  });

  afterAll(async () => {
    await disconnectRoles(roles);
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

  it('records hos_platform as a login that inherits hos_app and cannot be assumed by it', async () => {
    const role = await admin().query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolinherit: boolean;
      rolcanlogin: boolean;
    }>(
      `select rolsuper, rolbypassrls, rolinherit, rolcanlogin from pg_roles where rolname = 'hos_platform'`,
    );
    expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, rolinherit: true, rolcanlogin: true });
    const member = await admin().query<{ forward: boolean; reverse: boolean }>(
      `select pg_has_role('hos_platform', 'hos_app', 'member') as forward,
              pg_has_role('hos_app', 'hos_platform', 'member') as reverse`,
    );
    expect(member.rows[0]).toEqual({ forward: true, reverse: false });
  });

  it('downgrades a hos_app platform claim and rejects platform writes', async () => {
    await app().query('BEGIN');
    try {
      await app().query(`select set_config('app.scope', 'platform', true), set_config('app.tenant_id', '', true)`);
      const scope = await app().query<{ s: string }>(`select hos_scope() as s`);
      expect(scope.rows[0]?.s).toBe('none');

      const key = `zz-scope-${randomUUID().slice(0, 8)}`;
      await expectSqlState(app(), `insert into plans (key, name) values ($1, 'Nope plan')`, [key], '42501');
      await expectSqlState(
        app(),
        `insert into prices (target_type, target_id, billing_cycle, amount_paise) values ('plan', $1, 'monthly', 1)`,
        [randomUUID()],
        '42501',
      );
      const settings = await app().query(`update platform_settings set invoice_prefix = 'NOPE' where id = 1`);
      expect(settings.rowCount).toBe(0);
      const prefix = await app().query<{ invoice_prefix: string }>(`select invoice_prefix from platform_settings where id = 1`);
      expect(prefix.rows[0]?.invoice_prefix).not.toBe('NOPE');
      await expectSqlState(app(), `insert into roles (key, name, is_system) values ($1, 'Nope role', true)`, [key], '42501');

      await app().query(`select set_config('app.tenant_id', $1, true)`, [tenantId]);
      await expectSqlState(
        app(),
        `insert into tenant_entitlement_overrides (tenant_id, target, module_id, effect, reason)
         values ($1, 'module', $2, 'grant', 'hos_app platform claim')`,
        [tenantId, moduleId],
        '42501',
      );

      await app().query(`select set_config('app.tenant_id', '', true)`);
      const admins = await app().query<{ n: number }>(`select count(*)::int as n from platform_admins`);
      expect(Number(admins.rows[0]?.n)).toBe(0);
      await expectSqlState(app(), `select hos_admin_overview()`, [], '42501');
      await expectSqlState(app(), `select * from hos_admin_tenant_list('', '', 5, 0)`, [], '42501');
      await expectSqlState(app(), `set role hos_platform`, [], '42501');
      const who = await app().query<{ current_user: string }>(`select current_user`);
      expect(who.rows[0]?.current_user).toBe('hos_app');
    } finally {
      await app().query('ROLLBACK');
    }
  });

  it('lets hos_platform do those writes and reads, then rolls them back', async () => {
    await platform().query('BEGIN');
    try {
      await platform().query(`select set_config('app.scope', 'platform', true), set_config('app.tenant_id', '', true)`);
      const scope = await platform().query<{ s: string; who: string }>(`select hos_scope() as s, session_user::text as who`);
      expect(scope.rows[0]).toEqual({ s: 'platform', who: 'hos_platform' });

      const key = `zz-scope-${randomUUID().slice(0, 8)}`;
      const plan = await platform().query<{ id: string }>(
        `insert into plans (key, name, status, sort_order) values ($1, 'Scope plan', 'draft', 999) returning id`,
        [key],
      );
      const planId = plan.rows[0]?.id;
      expect(planId).toBeTruthy();
      const price = await platform().query(
        `insert into prices (target_type, target_id, billing_cycle, amount_paise) values ('plan', $1, 'monthly', 100)`,
        [planId],
      );
      expect(price.rowCount).toBe(1);
      const settings = await platform().query(`update platform_settings set invoice_prefix = 'HOS' where id = 1`);
      expect(settings.rowCount).toBe(1);
      const role = await platform().query(
        `insert into roles (key, name, is_system) values ($1, 'Scope role', true) returning id`,
        [key],
      );
      expect(role.rows[0]?.id).toBeTruthy();

      const admins = await platform().query<{ n: number }>(`select count(*)::int as n from platform_admins`);
      expect(Number(admins.rows[0]?.n)).toBeGreaterThan(0);
      const overview = await platform().query(`select hos_admin_overview() as overview`);
      expect(overview.rows[0]?.overview).toBeTruthy();
      const listed = await platform().query(`select * from hos_admin_tenant_list('', '', 5, 0)`);
      expect((listed.rowCount ?? 0) > 0).toBe(true);

      await platform().query(`select set_config('app.tenant_id', $1, true)`, [tenantId]);
      await platform().query(
        `insert into tenant_entitlement_overrides (tenant_id, target, module_id, effect, reason)
         values ($1, 'module', $2, 'grant', 'hos_platform scope')`,
        [tenantId, moduleId],
      );
      const seen = await platform().query<{ n: number }>(
        `select count(*)::int as n from tenant_entitlement_overrides where reason = 'hos_platform scope'`,
      );
      expect(Number(seen.rows[0]?.n)).toBe(1);
    } finally {
      await platform().query('ROLLBACK');
    }
  });

  it('hides billing, lab and nursing rows from platform scope and still shows masters', async () => {
    const phi = [
      'bills',
      'bill_lines',
      'deposits',
      'bill_settlements',
      'concessions',
      'refunds',
      'bill_credit_notes',
      'cash_ledger',
      'lab_accessions',
      'lab_results',
      'mar_schedules',
      'medication_administrations',
    ];
    const masters = ['services', 'tariffs', 'wards', 'lab_tests', 'lab_test_params', 'lab_interfaces', 'lab_settings'];
    const sunrise = await admin().query<{ id: string }>(`select id from tenants where slug = 'sunrise-care'`);
    const tenantId = sunrise.rows[0]?.id;
    expect(tenantId).toBeTruthy();

    let probe: string | null = null;
    const mar = await admin().query<{ n: number }>(`select count(*)::int as n from mar_schedules`);
    if (Number(mar.rows[0]?.n) === 0) {
      const inserted = await admin().query<{ mar_schedule_id: string }>(
        `with src as (
           select i.tenant_id, i.id as item_id, o.encounter_id
             from clinical_order_items i
             join clinical_orders o on o.tenant_id = i.tenant_id and o.id = i.order_id
            where i.tenant_id = $1
            limit 1
         ), ins as (
           insert into mar_schedules (tenant_id, order_item_id, encounter_id, scheduled_at)
           select tenant_id, item_id, encounter_id, timestamptz '2099-11-11+00' from src
           returning id, tenant_id
         )
         insert into medication_administrations (tenant_id, mar_schedule_id, status)
         select tenant_id, id, 'given' from ins
         returning mar_schedule_id`,
        [tenantId],
      );
      probe = inserted.rows[0]?.mar_schedule_id ?? null;
      expect(probe, 'sunrise has no clinical order to probe the MAR').toBeTruthy();
    }

    try {
      const policies = await admin().query<{ tablename: string; qual: string | null; with_check: string | null }>(
        `select tablename, qual, with_check
           from pg_policies
          where schemaname = 'public' and policyname = tablename || '_tenant' and tablename = any($1::text[])`,
        [phi],
      );
      expect(policies.rows.map((row) => row.tablename).sort()).toEqual([...phi].sort());
      for (const row of policies.rows) {
        expect(row.qual ?? '', row.tablename).toContain('hos_scope()');
        expect(row.with_check ?? '', row.tablename).toContain('hos_scope()');
      }
      const masterPolicies = await admin().query<{ tablename: string; qual: string | null }>(
        `select tablename, qual from pg_policies
          where schemaname = 'public' and policyname = tablename || '_tenant' and tablename = any($1::text[])`,
        [masters],
      );
      expect(masterPolicies.rows).toHaveLength(masters.length);
      for (const row of masterPolicies.rows) {
        expect(row.qual ?? '', row.tablename).not.toContain('hos_scope()');
      }

      for (const table of phi) {
        const held = await admin().query<{ tenant_id: string }>(`select tenant_id from ${table} limit 1`);
        const ownerId = held.rows[0]?.tenant_id;
        expect(ownerId, `${table} has no sample row`).toBeTruthy();

        await platform().query('BEGIN');
        try {
          await scopePlatform(platform(), ownerId!);
          const hidden = await platform().query<{ n: number }>(`select count(*)::int as n from ${table}`);
          expect(Number(hidden.rows[0]?.n), table).toBe(0);
        } finally {
          await platform().query('ROLLBACK');
        }

        await app().query('BEGIN');
        try {
          await scopeTenant(app(), ownerId!);
          const visible = await app().query<{ n: number }>(`select count(*)::int as n from ${table}`);
          expect(Number(visible.rows[0]?.n), table).toBeGreaterThan(0);
        } finally {
          await app().query('ROLLBACK');
        }
      }

      await platform().query('BEGIN');
      try {
        await scopePlatform(platform(), tenantId!);
        for (const table of ['services', 'tariffs', 'wards', 'lab_tests']) {
          const seen = await platform().query<{ n: number }>(`select count(*)::int as n from ${table}`);
          expect(Number(seen.rows[0]?.n), table).toBeGreaterThan(0);
        }
      } finally {
        await platform().query('ROLLBACK');
      }
    } finally {
      if (probe) {
        await admin().query(`delete from medication_administrations where mar_schedule_id = $1`, [probe]);
        await admin().query(`delete from mar_schedules where id = $1`, [probe]);
      }
    }
  });
});
