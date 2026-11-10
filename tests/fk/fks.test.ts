import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbEnv } from '../../packages/db/src/env';
import { migrate } from '../../packages/db/src/migrate';
import { seed, seedDemo } from '../../packages/db/src/seed';

/**
 * Composite tenant FKs (U4). Runs on hos_u4, not the shared hos_test database.
 * Connects as hos_migrator: sessions have no hos_app grant, and FK checks ignore RLS.
 */

const DB_NAME = 'hos_u4';

interface Pair {
  tenantA: string;
  tenantB: string;
  userA: string;
  userB: string;
  locA: string;
  locB: string;
}

describe.sequential('composite foreign keys', () => {
  let client: pg.Client | null = null;
  let platformAdminId = '';

  function db(): pg.Client {
    if (!client) throw new Error('postgres client is not connected');
    return client;
  }

  beforeAll(async () => {
    process.env.HOS_DB_NAME = DB_NAME;
    const log = (m: string) => console.log(`[fk] ${m}`);
    await migrate(log);
    await seed(log);
    await seedDemo(log);
    client = new pg.Client({ connectionString: dbEnv().migrationUrl });
    await client.connect();
    const admin = await client.query<{ id: string }>('select id from platform_admins order by created_at limit 1');
    const id = admin.rows[0]?.id;
    if (!id) throw new Error('platform admin missing after seed');
    platformAdminId = id;
  }, 180_000);

  afterAll(async () => {
    await client?.end();
  });

  async function rolledBack(run: () => Promise<void>): Promise<void> {
    await db().query('BEGIN');
    try {
      await run();
    } finally {
      await db().query('ROLLBACK');
    }
  }

  async function one<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T> {
    const result = await db().query<T>(sql, params);
    const row = result.rows[0];
    if (!row) throw new Error(`expected a row from: ${sql}`);
    return row;
  }

  async function insertPair(): Promise<Pair> {
    const tag = randomUUID().slice(0, 8);
    const tenantA = (await one<{ id: string }>(
      `insert into tenants (slug, legal_name, display_name) values ($1, 'Tenant A', 'Tenant A') returning id`,
      [`u4-a-${tag}`],
    )).id;
    const tenantB = (await one<{ id: string }>(
      `insert into tenants (slug, legal_name, display_name) values ($1, 'Tenant B', 'Tenant B') returning id`,
      [`u4-b-${tag}`],
    )).id;
    const userA = (await one<{ id: string }>(
      `insert into users (tenant_id, email, name, status) values ($1, $2, 'User A', 'active') returning id`,
      [tenantA, `user-a-${tag}@sbx.hospitalos.test`],
    )).id;
    const userB = (await one<{ id: string }>(
      `insert into users (tenant_id, email, name, status) values ($1, $2, 'User B', 'active') returning id`,
      [tenantB, `user-b-${tag}@sbx.hospitalos.test`],
    )).id;
    const locA = (await one<{ id: string }>(
      `insert into locations (tenant_id, name, code, state_code) values ($1, 'Loc A', 'A', '27') returning id`,
      [tenantA],
    )).id;
    const locB = (await one<{ id: string }>(
      `insert into locations (tenant_id, name, code, state_code) values ($1, 'Loc B', 'B', '29') returning id`,
      [tenantB],
    )).id;
    return { tenantA, tenantB, userA, userB, locA, locB };
  }

  it('declares composite FKs and drops the single-column session FKs', async () => {
    const defs = await db().query<{ conname: string; def: string }>(
      `select conname, pg_get_constraintdef(oid) as def
         from pg_constraint
        where conname in (
          'sessions_user_fk',
          'sessions_location_fk',
          'data_principal_requests_created_by_fk',
          'checklist_items_done_by_fk',
          'invitations_invited_by_fk'
        )`,
    );
    const byName = new Map(defs.rows.map((row) => [row.conname, row.def]));
    expect(byName.get('sessions_user_fk')).toMatch(
      /FOREIGN KEY \(tenant_id, user_id\) REFERENCES users\(tenant_id, id\)/,
    );
    expect(byName.get('sessions_user_fk')).not.toMatch(/MATCH FULL/);
    expect(byName.get('sessions_location_fk')).toMatch(
      /FOREIGN KEY \(tenant_id, location_id\) REFERENCES locations\(tenant_id, id\)/,
    );
    expect(byName.get('sessions_location_fk')).toMatch(/ON DELETE SET NULL \(location_id\)/);
    expect(byName.get('data_principal_requests_created_by_fk')).toMatch(/ON DELETE SET NULL \(created_by\)/);
    expect(byName.get('checklist_items_done_by_fk')).toMatch(/ON DELETE SET NULL \(done_by\)/);
    expect(byName.get('invitations_invited_by_fk')).toMatch(/ON DELETE SET NULL \(invited_by\)/);

    const retired = await db().query<{ conname: string }>(
      `select conname from pg_constraint
        where conname in ('sessions_user_id_users_id_fk', 'sessions_location_id_locations_id_fk')`,
    );
    expect(retired.rows).toEqual([]);
  });

  it('accepts a same-tenant session and a platform session with null tenant_id', async () => {
    await rolledBack(async () => {
      const pair = await insertPair();
      const same = await one<{ id: string; location_id: string | null }>(
        `insert into sessions (token_hash, kind, user_id, tenant_id, location_id, expires_at)
         values ($1, 'tenant', $2, $3, $4, now() + interval '1 hour')
         returning id, location_id`,
        [randomUUID(), pair.userA, pair.tenantA, pair.locA],
      );
      expect(same.location_id).toBe(pair.locA);

      const noLocation = await one<{ location_id: string | null }>(
        `insert into sessions (token_hash, kind, user_id, tenant_id, expires_at)
         values ($1, 'tenant', $2, $3, now() + interval '1 hour')
         returning location_id`,
        [randomUUID(), pair.userA, pair.tenantA],
      );
      expect(noLocation.location_id).toBeNull();

      const platform = await one<{ id: string }>(
        `insert into sessions (token_hash, kind, platform_admin_id, expires_at)
         values ($1, 'platform', $2, now() + interval '1 hour')
         returning id`,
        [randomUUID(), platformAdminId],
      );
      expect(platform.id).toBeTruthy();
    });
  });

  it('rejects a session that points at another tenant user or location', async () => {
    await rolledBack(async () => {
      const pair = await insertPair();
      await expect(
        db().query(
          `insert into sessions (token_hash, kind, user_id, tenant_id, location_id, expires_at)
           values ($1, 'tenant', $2, $3, $4, now() + interval '1 hour')`,
          [randomUUID(), pair.userB, pair.tenantA, pair.locA],
        ),
      ).rejects.toMatchObject({ code: '23503', constraint: 'sessions_user_fk' });
    });
    await rolledBack(async () => {
      const pair = await insertPair();
      await expect(
        db().query(
          `insert into sessions (token_hash, kind, user_id, tenant_id, location_id, expires_at)
           values ($1, 'tenant', $2, $3, $4, now() + interval '1 hour')`,
          [randomUUID(), pair.userA, pair.tenantA, pair.locB],
        ),
      ).rejects.toMatchObject({ code: '23503', constraint: 'sessions_location_fk' });
    });
  });

  it('accepts same-tenant actor columns and rejects another tenant user', async () => {
    await rolledBack(async () => {
      const pair = await insertPair();
      await one(
        `insert into invitations (tenant_id, user_id, token_hash, expires_at, invited_by)
         values ($1, $2, $3, now() + interval '7 days', $2) returning id`,
        [pair.tenantA, pair.userA, randomUUID()],
      );
      await one(
        `insert into invitations (tenant_id, user_id, token_hash, expires_at)
         values ($1, $2, $3, now() + interval '7 days') returning id`,
        [pair.tenantA, pair.userA, randomUUID()],
      );
      await one(
        `insert into checklist_items (tenant_id, key, done_by) values ($1, 'u4-same', $2) returning tenant_id`,
        [pair.tenantA, pair.userA],
      );
      await one(
        `insert into checklist_items (tenant_id, key) values ($1, 'u4-open') returning tenant_id`,
        [pair.tenantA],
      );
      await one(
        `insert into data_principal_requests
           (tenant_id, type, principal_name, principal_contact, details, due_at, created_by)
         values ($1, 'access', 'Sample Principal', '9000000000', 'sample request', now() + interval '30 days', $2)
         returning id`,
        [pair.tenantA, pair.userA],
      );
      await one(
        `insert into data_principal_requests
           (tenant_id, type, principal_name, principal_contact, details, due_at)
         values ($1, 'grievance', 'Sample Principal', '9000000001', 'sample request', now() + interval '30 days')
         returning id`,
        [pair.tenantA],
      );
    });

    await rolledBack(async () => {
      const pair = await insertPair();
      await expect(
        db().query(
          `insert into invitations (tenant_id, user_id, token_hash, expires_at, invited_by)
           values ($1, $2, $3, now() + interval '7 days', $4)`,
          [pair.tenantA, pair.userA, randomUUID(), pair.userB],
        ),
      ).rejects.toMatchObject({ code: '23503', constraint: 'invitations_invited_by_fk' });
    });
    await rolledBack(async () => {
      const pair = await insertPair();
      await expect(
        db().query(`insert into checklist_items (tenant_id, key, done_by) values ($1, 'u4-cross', $2)`, [
          pair.tenantA,
          pair.userB,
        ]),
      ).rejects.toMatchObject({ code: '23503', constraint: 'checklist_items_done_by_fk' });
    });
    await rolledBack(async () => {
      const pair = await insertPair();
      await expect(
        db().query(
          `insert into data_principal_requests
             (tenant_id, type, principal_name, principal_contact, details, due_at, created_by)
           values ($1, 'erasure', 'Sample Principal', '9000000002', 'sample request', now() + interval '30 days', $2)`,
          [pair.tenantA, pair.userB],
        ),
      ).rejects.toMatchObject({ code: '23503', constraint: 'data_principal_requests_created_by_fk' });
    });
  });

  it('nulls only location_id when the location is deleted', async () => {
    await rolledBack(async () => {
      const pair = await insertPair();
      const session = await one<{ id: string }>(
        `insert into sessions (token_hash, kind, user_id, tenant_id, location_id, expires_at)
         values ($1, 'tenant', $2, $3, $4, now() + interval '1 hour')
         returning id`,
        [randomUUID(), pair.userA, pair.tenantA, pair.locA],
      );
      await db().query('delete from locations where id = $1', [pair.locA]);
      const after = await one<{ tenant_id: string; location_id: string | null; user_id: string }>(
        'select tenant_id, location_id, user_id from sessions where id = $1',
        [session.id],
      );
      expect(after.tenant_id).toBe(pair.tenantA);
      expect(after.user_id).toBe(pair.userA);
      expect(after.location_id).toBeNull();
    });
  });

  it('nulls only the actor column when that user is deleted', async () => {
    await rolledBack(async () => {
      const pair = await insertPair();
      const tag = randomUUID().slice(0, 8);
      const actor = (await one<{ id: string }>(
        `insert into users (tenant_id, email, name, status) values ($1, $2, 'Actor', 'active') returning id`,
        [pair.tenantA, `actor-${tag}@sbx.hospitalos.test`],
      )).id;
      const invitee = (await one<{ id: string }>(
        `insert into users (tenant_id, email, name, status) values ($1, $2, 'Invitee', 'active') returning id`,
        [pair.tenantA, `invitee-${tag}@sbx.hospitalos.test`],
      )).id;
      const dpr = await one<{ id: string }>(
        `insert into data_principal_requests
           (tenant_id, type, principal_name, principal_contact, details, due_at, created_by)
         values ($1, 'correction', 'Sample Principal', '9000000003', 'sample request', now() + interval '30 days', $2)
         returning id`,
        [pair.tenantA, actor],
      );
      await one(
        `insert into checklist_items (tenant_id, key, done_by) values ($1, 'u4-actor', $2) returning tenant_id`,
        [pair.tenantA, actor],
      );
      const invitation = await one<{ id: string }>(
        `insert into invitations (tenant_id, user_id, token_hash, expires_at, invited_by)
         values ($1, $2, $3, now() + interval '7 days', $4) returning id`,
        [pair.tenantA, invitee, randomUUID(), actor],
      );

      await db().query('delete from users where id = $1', [actor]);

      const request = await one<{ tenant_id: string; created_by: string | null }>(
        'select tenant_id, created_by from data_principal_requests where id = $1',
        [dpr.id],
      );
      expect(request.tenant_id).toBe(pair.tenantA);
      expect(request.created_by).toBeNull();

      const item = await one<{ done_by: string | null }>(
        `select done_by from checklist_items where tenant_id = $1 and key = 'u4-actor'`,
        [pair.tenantA],
      );
      expect(item.done_by).toBeNull();

      const invite = await one<{ tenant_id: string; user_id: string; invited_by: string | null }>(
        'select tenant_id, user_id, invited_by from invitations where id = $1',
        [invitation.id],
      );
      expect(invite.tenant_id).toBe(pair.tenantA);
      expect(invite.user_id).toBe(invitee);
      expect(invite.invited_by).toBeNull();
    });
  });
});
