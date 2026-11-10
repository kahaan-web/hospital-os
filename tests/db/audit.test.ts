import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbEnv } from '../../packages/db/src/env';
import { connectRoles, disconnectRoles, expectSqlState, scopePlatform, scopeTenant, type DbRoles } from './helpers';

/**
 * Audit chain from CONTRACTS.md §6 and the §10 audit bullets.
 * Single-connection checks roll back, so a tamper never stays on the shared database.
 * The 20-way concurrency test commits (each transaction must release the chain lock);
 * those rows are a fresh tenant chain and the append-only trigger will not let us delete them.
 */

const GENESIS = '0'.repeat(64);
const CONCURRENT_CHAIN_TENANT = '00000000-0000-4000-8000-000000000099';

describe.sequential('audit log', () => {
  let roles: DbRoles | null = null;

  beforeAll(async () => {
    roles = await connectRoles();
  });

  afterAll(async () => {
    await disconnectRoles(roles);
  });

  it('rejects UPDATE, DELETE and TRUNCATE for hos_app and for the table owner', async () => {
    const tenantId = randomUUID();
    await migrator().query('BEGIN');
    try {
      await scopeTenant(migrator(), tenantId);
      const inserted = await migrator().query<{ id: string }>(
        `insert into audit_log (tenant_id, actor_type, actor_label, action, entity_type, entity_id)
         values ($1, 'system', 'tests worker', 'test.reject', 'location', 'fixture')
         returning id::text`,
        [tenantId],
      );
      const id = inserted.rows[0]?.id;
      expect(id).toBeTruthy();
      const updated = await expectSqlState(migrator(), `update audit_log set action = 'tampered' where id = $1`, [id], '42501');
      expect(updated).toMatch(/append-only/i);
      const deleted = await expectSqlState(migrator(), `delete from audit_log where id = $1`, [id], '42501');
      expect(deleted).toMatch(/append-only/i);
      const truncated = await expectSqlState(migrator(), 'truncate audit_log', [], '42501');
      expect(truncated).toMatch(/append-only/i);
    } finally {
      await migrator().query('ROLLBACK');
    }

    await app().query('BEGIN');
    try {
      await scopeTenant(app(), tenantId);
      await expectSqlState(app(), `update audit_log set action = 'tampered'`, [], '42501');
      await expectSqlState(app(), 'delete from audit_log', [], '42501');
      await expectSqlState(app(), 'truncate audit_log', [], '42501');
    } finally {
      await app().query('ROLLBACK');
    }
  });

  it('overwrites client chain columns, links the hash, and hides the other tenant and the platform chain', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    await app().query('BEGIN');
    try {
      await scopeTenant(app(), tenantA);
      const first = await insertAudit(app(), tenantA, 'fixture-1', {
        chainKey: 'client-key',
        seq: 999,
        prevHash: 'a'.repeat(64),
        hash: 'b'.repeat(64),
        createdAt: '2000-01-01T00:00:00Z',
      });
      expect(first.chain_key).toBe(tenantA);
      expect(Number(first.seq)).toBe(1);
      expect(first.prev_hash).toBe(GENESIS);
      expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(first.hash).not.toBe('b'.repeat(64));
      expect(new Date(first.created_at).getUTCFullYear()).toBeGreaterThan(2020);

      const second = await insertAudit(app(), tenantA, 'fixture-2');
      expect(Number(second.seq)).toBe(2);
      expect(second.prev_hash).toBe(first.hash);
      const chain = await verifyChain(app(), tenantA);
      expect(chain).toEqual({ ok: true, entries: 2, brokenAtSeq: null });

      await expectSqlState(
        app(),
        `insert into audit_log (tenant_id, actor_type, actor_label, action, entity_type, entity_id)
         values ($1, 'system', 'tests worker', 'test.hide', 'location', 'b')`,
        [tenantB],
        '42501',
      );
      await expectSqlState(
        app(),
        `insert into audit_log (tenant_id, actor_type, actor_label, action, entity_type, entity_id)
         values (null, 'system', 'tests worker', 'test.platform', 'plan', 'x')`,
        [],
        '42501',
      );
      const foreign = await app().query<{ n: number }>(
        `select count(*)::int as n from audit_log where chain_key = $1 or tenant_id is null`,
        [tenantB],
      );
      expect(Number(foreign.rows[0]?.n)).toBe(0);

      await scopeTenant(app(), tenantB);
      const b = await insertAudit(app(), tenantB, 'fixture-b');
      expect(Number(b.seq)).toBe(1);
      expect(b.prev_hash).toBe(GENESIS);
      const hidden = await app().query<{ n: number }>(`select count(*)::int as n from audit_log where chain_key = $1`, [tenantA]);
      expect(Number(hidden.rows[0]?.n)).toBe(0);

      await scopePlatform(app(), '');
      const platform = await insertAudit(app(), null, 'platform-1', { chainKey: 'nope' });
      expect(platform.chain_key).toBe('platform');
    } finally {
      await app().query('ROLLBACK');
    }
  });

  it('detects a tampered payload and a deleted sequence number', async () => {
    const tenantId = randomUUID();
    await admin().query('BEGIN');
    try {
      for (let i = 1; i <= 3; i += 1) await insertAudit(admin(), tenantId, `row-${i}`);
      expect(await verifyChain(admin(), tenantId)).toEqual({ ok: true, entries: 3, brokenAtSeq: null });

      await admin().query('SAVEPOINT before_tamper');
      await admin().query(`set local session_replication_role = 'replica'`);
      await admin().query(`update audit_log set after = '{"tampered":true}'::jsonb where chain_key = $1 and seq = 2`, [tenantId]);
      expect(await verifyChain(admin(), tenantId)).toMatchObject({ ok: false, brokenAtSeq: 2 });

      await admin().query('ROLLBACK TO SAVEPOINT before_tamper');
      expect(await verifyChain(admin(), tenantId)).toEqual({ ok: true, entries: 3, brokenAtSeq: null });

      await admin().query(`set local session_replication_role = 'replica'`);
      await admin().query(`delete from audit_log where chain_key = $1 and seq = 2`, [tenantId]);
      expect(await verifyChain(admin(), tenantId)).toMatchObject({ ok: false, brokenAtSeq: 3 });
    } finally {
      await admin().query('ROLLBACK');
    }
  });

  it('keeps one chain contiguous when 20 transactions insert together', async () => {
    const tenantId = CONCURRENT_CHAIN_TENANT;
    await admin().query('BEGIN');
    try {
      await admin().query(`set local session_replication_role = 'replica'`);
      await admin().query(`delete from audit_log where chain_key = $1`, [tenantId]);
      await admin().query('COMMIT');
    } catch (err) {
      await admin().query('ROLLBACK').catch(() => undefined);
      throw err;
    }
    const pool = new pg.Pool({ connectionString: dbEnv().appUrl, max: 20, connectionTimeoutMillis: 8_000 });
    try {
      await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          withPooled(pool, async (client) => {
            await scopeTenant(client, tenantId);
            await insertAudit(client, tenantId, `concurrent-${index}`);
          }),
        ),
      );
      const chain = await verifyChain(admin(), tenantId);
      expect(chain).toEqual({ ok: true, entries: 20, brokenAtSeq: null });
      const seqs = await admin().query<{ seq: number }>(
        `select seq from audit_log where chain_key = $1 order by seq`,
        [tenantId],
      );
      expect(seqs.rows.map((row) => Number(row.seq))).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    } finally {
      await pool.end();
    }
  });

  function app() {
    if (!roles) throw new Error('database clients were not opened');
    return roles.app;
  }
  function migrator() {
    if (!roles) throw new Error('database clients were not opened');
    return roles.migrator;
  }
  function admin() {
    if (!roles) throw new Error('database clients were not opened');
    return roles.admin;
  }
});

interface AuditRow {
  chain_key: string;
  seq: number;
  prev_hash: string;
  hash: string;
  created_at: string;
}

async function insertAudit(
  client: pg.Client,
  tenantId: string | null,
  entityId: string,
  overrides: { chainKey?: string; seq?: number; prevHash?: string; hash?: string; createdAt?: string } = {},
): Promise<AuditRow> {
  const result = await client.query<AuditRow>(
    `insert into audit_log (tenant_id, chain_key, seq, prev_hash, hash, created_at, actor_type, actor_label, action, entity_type, entity_id)
     values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), 'system', 'tests worker', 'test.chain', 'location', $7)
     returning chain_key, seq, prev_hash, hash, created_at`,
    [
      tenantId,
      overrides.chainKey ?? '',
      overrides.seq ?? 0,
      overrides.prevHash ?? '',
      overrides.hash ?? '',
      overrides.createdAt ?? null,
      entityId,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('audit insert did not return the chain columns');
  return row;
}

async function verifyChain(client: pg.Client, chainKey: string): Promise<{ ok: boolean; entries: number; brokenAtSeq: number | null }> {
  const rows = await client.query<{ seq: number; prev_hash: string; hash: string; c: string }>(
    `select seq, prev_hash, hash, hos_audit_canonical(a) as c
       from audit_log a
      where chain_key = $1
      order by seq`,
    [chainKey],
  );
  let prev = GENESIS;
  let expectSeq = 1;
  let entries = 0;
  for (const row of rows.rows) {
    entries += 1;
    const seq = Number(row.seq);
    const digest = createHash('sha256').update(row.c, 'utf8').digest('hex');
    if (seq !== expectSeq || row.prev_hash !== prev || digest !== row.hash) {
      return { ok: false, entries, brokenAtSeq: seq };
    }
    prev = row.hash;
    expectSeq += 1;
  }
  return { ok: true, entries, brokenAtSeq: null };
}

async function withPooled(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await fn(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
