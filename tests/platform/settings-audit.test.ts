import type { LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { dbEnv } from '@hos/db';
import { buildApp } from '../../apps/api/src/app';

const app = await buildApp();
const csrf = { 'x-hos-csrf': '1' };
const migrator = new pg.Client({ connectionString: dbEnv().migrationUrl });

beforeAll(async () => {
  await app.ready();
  await migrator.connect();
});

afterAll(async () => {
  await migrator.end().catch(() => undefined);
  await app.close();
});

it('audits the full platform settings before and after a GST rate change', async () => {
  const admin = await login('admin@hospitalos.test', 'Admin@12345');
  const current = await app.inject({ method: 'GET', url: '/api/v1/admin/settings', headers: { cookie: admin.cookie } });
  expect(current.statusCode, current.body).toBe(200);
  const body = current.json() as { defaultGstRateBp: number };
  const nextRate = body.defaultGstRateBp === 1800 ? 1200 : 1800;
  try {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings',
      headers: { cookie: admin.cookie, ...csrf },
      payload: { ...body, defaultGstRateBp: nextRate },
    });
    expect(put.statusCode, put.body).toBe(200);
    const row = await migrator.query<{ before: unknown; after: unknown }>(
      `select before, after from audit_log where action = 'admin.settings.update' and chain_key = 'platform' order by id desc limit 1`,
    );
    const before = jsonObject(row.rows[0]?.before);
    const after = jsonObject(row.rows[0]?.after);
    expect(before.defaultGstRateBp).toBe(body.defaultGstRateBp);
    expect(after.defaultGstRateBp).toBe(nextRate);
    expect(before.invoicePrefix).toBeTruthy();
    expect(after.supplierLegalName).toBeTruthy();
  } finally {
    const restore = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings',
      headers: { cookie: admin.cookie, ...csrf },
      payload: body,
    });
    expect(restore.statusCode, restore.body).toBe(200);
  }
}, 60_000);

function jsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return JSON.parse(value) as Record<string, unknown>;
  return (value ?? {}) as Record<string, unknown>;
}

async function login(email: string, password: string): Promise<{ cookie: string }> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: csrf, payload: { email, password } });
  expect(res.statusCode, res.body).toBe(200);
  return { cookie: cookieOf(res) };
}

function cookieOf(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  return String(header).split(';')[0] ?? '';
}
