import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbEnv } from '../../packages/db/src/env';
import { connectRoles, disconnectRoles, scopePlatform, type DbRoles } from './helpers';

/**
 * Invoice numbers from CONTRACTS.md §8 and the §10 invoice bullets.
 * A rolled-back call must not consume a number. Twenty committed calls on the shared
 * counter come out contiguous; they are real numbers (the series is never rewound).
 */

describe.sequential('invoice numbers', () => {
  let roles: DbRoles | null = null;

  beforeAll(async () => {
    roles = await connectRoles();
  });

  afterAll(async () => {
    await disconnectRoles(roles);
  });

  it('does not consume a number when the transaction rolls back', async () => {
    const first = await allocate(app(), true);
    const second = await allocate(app(), true);
    expect(second).toBe(first);
  });

  it('uses the Indian financial year around midnight IST and stays within 16 characters', async () => {
    await app().query('BEGIN');
    try {
      await scopePlatform(app());
      const march = await app().query<{ fy: string; number: string }>(
        `select fy, number from hos_next_invoice_number($1::timestamptz)`,
        ['2026-03-31T18:29:00.000Z'],
      );
      const april = await app().query<{ fy: string; number: string }>(
        `select fy, number from hos_next_invoice_number($1::timestamptz)`,
        ['2026-03-31T18:30:00.000Z'],
      );
      expect(march.rows[0]?.fy).toBe('2025-26');
      expect(april.rows[0]?.fy).toBe('2026-27');
      for (const row of [march.rows[0], april.rows[0]]) {
        expect(row?.number.length).toBeLessThanOrEqual(16);
        expect(row?.number).toMatch(/^[A-Z0-9]{2,4}\/\d{4}\/\d{6}$/);
      }
      expect(march.rows[0]?.number).toContain('/2526/');
      expect(april.rows[0]?.number).toContain('/2627/');
    } finally {
      await app().query('ROLLBACK');
    }
  });

  it('allocates 20 contiguous numbers under concurrent fulfilments', async () => {
    const pool = new pg.Pool({ connectionString: dbEnv().appUrl, max: 20, connectionTimeoutMillis: 8_000 });
    try {
      const numbers = await Promise.all(
        Array.from({ length: 20 }, () =>
          withPooled(pool, async (client) => {
            await scopePlatform(client);
            const row = await client.query<{ number: string }>(`select number from hos_next_invoice_number(now())`);
            const number = row.rows[0]?.number;
            if (!number) throw new Error('invoice function returned no number');
            return number;
          }),
        ),
      );
      expect(new Set(numbers).size).toBe(20);
      const seqs = numbers.map(suffix).sort((a, b) => a - b);
      expect(seqs[19]! - seqs[0]! + 1).toBe(20);
      for (const number of numbers) {
        expect(number.length).toBeLessThanOrEqual(16);
        expect(number).toMatch(/^[A-Z0-9]{2,4}\/\d{4}\/\d{6}$/);
      }
    } finally {
      await pool.end();
    }
  });

  function app() {
    if (!roles) throw new Error('database clients were not opened');
    return roles.app;
  }
});

async function allocate(client: pg.Client, rollback: boolean): Promise<string> {
  await client.query('BEGIN');
  try {
    await scopePlatform(client);
    const row = await client.query<{ number: string }>(`select number from hos_next_invoice_number(now())`);
    const number = row.rows[0]?.number;
    if (!number) throw new Error('invoice function returned no number');
    if (rollback) await client.query('ROLLBACK');
    else await client.query('COMMIT');
    return number;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

function suffix(number: string): number {
  const seq = number.split('/').at(-1);
  if (!seq) throw new Error(`invoice number ${number} has no sequence`);
  return Number(seq);
}

async function withPooled<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
