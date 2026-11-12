import { randomUUID } from 'node:crypto';
import { dbEnv } from '@hos/db';
import pg from 'pg';
import { expect } from 'vitest';
import type { buildApp } from '../../app';
import type { ClinicalFixture } from '../testkit';

type App = Awaited<ReturnType<typeof buildApp>>;

export async function login(app: App, fx: ClinicalFixture, email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'x-hos-csrf': '1' },
    payload: { email, password: fx.password },
  });
  expect(res.statusCode).toBe(200);
  const setCookie = res.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return String(cookie).split(';')[0] ?? '';
}

export function headers(cookie: string) {
  return { cookie, 'x-hos-csrf': '1', 'idempotency-key': randomUUID() };
}

/** Run SQL as the schema owner (RLS owner policy), for planting the other tenant's row. */
export async function asOwner<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: dbEnv().migrationUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
