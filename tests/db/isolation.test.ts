import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeDb,
  deleteTenantPair,
  insertTenantPair,
  openDb,
  queryInSavepoint,
  scopeToTenant,
  type DbGate,
  type FixturePair,
} from './helpers';

/**
 * Proves the Phase A database contract:
 * - hos_app / hos_migrator are NOSUPERUSER and lack BYPASSRLS
 * - with app.tenant_id set, tenant A cannot read, update or delete tenant B (no WHERE clause)
 * - audit_log rejects UPDATE and DELETE, and each insert extends the hash chain
 *
 * Skips with an explicit reason when Postgres is down or the schema is not migrated yet.
 * The audit transaction is always rolled back. RLS updates are committed only when they
 * touch exactly one fixture row.
 */

describe('tenant isolation and audit log', () => {
  let gate: DbGate = { unreachable: null, schema: null, app: null, migrator: null };
  let pair: FixturePair | null = null;

  beforeAll(async () => {
    gate = await openDb();
  });

  afterAll(async () => {
    if (gate.migrator && pair) {
      await deleteTenantPair(gate.migrator, pair).catch((err: Error) => {
        console.error(`fixture cleanup failed for ${pair?.runId}: ${err.message}`);
      });
    }
    await closeDb(gate);
  });

  function bail(ctx: { skip: (note?: string) => void }, note: string): never {
    ctx.skip(note);
    throw new Error(note);
  }

  function clients(ctx: { skip: (note?: string) => void }, needSchema: boolean): { app: pg.Client; migrator: pg.Client } {
    if (gate.unreachable) bail(ctx, gate.unreachable);
    if (needSchema && gate.schema) bail(ctx, gate.schema);
    if (!gate.app || !gate.migrator) bail(ctx, 'database clients were not opened');
    return { app: gate.app, migrator: gate.migrator };
  }

  it('hos_app and hos_migrator are not superusers and cannot bypass RLS', async (ctx) => {
    const { app } = clients(ctx, false);

    const who = await app.query<{ current_user: string }>('select current_user');
    expect(who.rows[0]?.current_user).toBe('hos_app');

    const roles = await app.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `select rolname, rolsuper, rolbypassrls
         from pg_roles
        where rolname in ('hos_app', 'hos_migrator')
        order by rolname`,
    );
    expect(roles.rows).toEqual([
      { rolname: 'hos_app', rolsuper: false, rolbypassrls: false },
      { rolname: 'hos_migrator', rolsuper: false, rolbypassrls: false },
    ]);
  });

  it('returns no tenant rows when app.tenant_id is unset', async (ctx) => {
    const { app, migrator } = clients(ctx, true);
    if (!pair) pair = await insertTenantPair(migrator);
    const fixtures = pair;

    await app.query('begin');
    try {
      const locations = await queryInSavepoint<{ id: string }>(app, 'select id from locations');
      const tenants = await queryInSavepoint<{ id: string }>(app, 'select id from tenants');
      await app.query('rollback');

      // Fail closed: either the query errors, or it cannot see the fixture rows.
      if (locations.ok) {
        const ids = new Set(locations.result.rows.map((r) => r.id));
        expect(ids.has(fixtures.a.locationId)).toBe(false);
        expect(ids.has(fixtures.b.locationId)).toBe(false);
      }
      if (tenants.ok) {
        const ids = new Set(tenants.result.rows.map((r) => r.id));
        expect(ids.has(fixtures.a.id)).toBe(false);
        expect(ids.has(fixtures.b.id)).toBe(false);
      }
    } catch (err) {
      await app.query('rollback').catch(() => undefined);
      throw err;
    }
  });

  it('tenant A cannot read, update or delete tenant B rows without a WHERE clause', async (ctx) => {
    const { app, migrator } = clients(ctx, true);
    if (!pair) pair = await insertTenantPair(migrator);
    const fixtures = pair;

    await app.query('begin');
    try {
      await scopeToTenant(app, fixtures.a.id);

      const seen = await app.query<{ id: string; tenant_id: string; city: string }>('select id, tenant_id, city from locations');
      expect(seen.rows.map((r) => r.id)).toEqual([fixtures.a.locationId]);
      expect(seen.rows.every((r) => r.tenant_id === fixtures.a.id)).toBe(true);

      const seenTenants = await app.query<{ id: string }>('select id from tenants');
      expect(seenTenants.rows.map((r) => r.id)).toEqual([fixtures.a.id]);

      const hidden = await app.query('select id from locations where id = $1', [fixtures.b.locationId]);
      expect(hidden.rowCount).toBe(0);

      const updated = await app.query(`update locations set city = 'Changed by A'`);
      expect(updated.rowCount, 'UPDATE without WHERE must touch only tenant A').toBe(1);
      const deleted = await app.query('delete from locations');
      expect(deleted.rowCount, 'DELETE without WHERE must touch only tenant A').toBe(1);
      await app.query('commit');
    } catch (err) {
      await app.query('rollback').catch(() => undefined);
      throw err;
    }

    const left = await migrator.query<{ id: string; tenant_id: string; city: string }>(
      `select id, tenant_id, city from locations where id = any($1::uuid[]) order by city`,
      [[fixtures.a.locationId, fixtures.b.locationId]],
    );
    expect(left.rows).toEqual([{ id: fixtures.b.locationId, tenant_id: fixtures.b.id, city: fixtures.b.city }]);
  });

  it('rejects audit_log UPDATE and DELETE and links the hash chain', async (ctx) => {
    const { migrator } = clients(ctx, true);

    const tenantId = randomUUID();
    await migrator.query('begin');
    try {
      await scopeToTenant(migrator, tenantId);
      const first = await migrator.query<{ id: string; seq: number; prev_hash: string; hash: string; chain_key: string }>(
        `insert into audit_log (tenant_id, chain_key, actor_type, actor_label, action, entity_type, entity_id)
         values ($1, $1, 'system', 'tests worker', 'test.chain', 'location', 'fixture-1')
         returning id::text, seq, prev_hash, hash, chain_key`,
        [tenantId],
      );
      const second = await migrator.query<{ id: string; seq: number; prev_hash: string; hash: string }>(
        `insert into audit_log (tenant_id, chain_key, actor_type, actor_label, action, entity_type, entity_id)
         values ($1, $1, 'system', 'tests worker', 'test.chain', 'location', 'fixture-2')
         returning id::text, seq, prev_hash, hash`,
        [tenantId],
      );
      const row1 = first.rows[0];
      const row2 = second.rows[0];
      if (!row1 || !row2) throw new Error('audit insert did not return the hash chain columns');

      expect(row1.hash).not.toBe('');
      expect(row2.hash).not.toBe('');
      expect(row2.hash).not.toBe(row1.hash);
      expect(row2.prev_hash).toBe(row1.hash);
      expect(Number(row2.seq)).toBe(Number(row1.seq) + 1);

      const update = await queryInSavepoint(migrator, `update audit_log set action = 'tampered' where id = $1`, [row1.id]);
      expect(update.ok, update.ok ? 'UPDATE of audit_log was accepted' : update.error.message).toBe(false);

      const del = await queryInSavepoint(migrator, 'delete from audit_log where id = $1', [row2.id]);
      expect(del.ok, del.ok ? 'DELETE of audit_log was accepted' : del.error.message).toBe(false);

      const still = await migrator.query<{ action: string; hash: string }>(
        'select action, hash from audit_log where id = $1',
        [row1.id],
      );
      expect(still.rows[0]).toEqual({ action: 'test.chain', hash: row1.hash });
      await migrator.query('rollback');
    } catch (err) {
      await migrator.query('rollback').catch(() => undefined);
      throw err;
    }
  });
});
