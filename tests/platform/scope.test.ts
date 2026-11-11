import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectRoles, disconnectRoles, expectSqlState, type DbRoles } from '../db/helpers';

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
});
