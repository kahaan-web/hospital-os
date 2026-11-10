import type { LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { dbEnv } from '@hos/db';
import { buildApp } from '../../apps/api/src/app';

/**
 * App Admin reads of tenant data write one platform.read.* row each.
 * Tenant-scope reads and catalogue reads do not.
 */

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

it('writes one platform read audit row per tenant-data admin route and none for tenant reads', async () => {
  const admin = await login('admin@hospitalos.test', 'Admin@12345');
  const owner = await login('owner@sunrise.demo', 'Demo@12345');
  const hospital = await migrator.query<{ id: string }>(`select id from tenants where slug = 'sunrise-care'`);
  const tenantId = hospital.rows[0]?.id;
  expect(tenantId, 'sunrise-care was not seeded').toBeTruthy();

  const reads: { url: string; action: string; tenantId: string | null }[] = [
    { url: '/api/v1/admin/overview', action: 'platform.read.overview', tenantId: null },
    { url: '/api/v1/admin/tenants?page=1&pageSize=25', action: 'platform.read.tenants', tenantId: null },
    { url: `/api/v1/admin/tenants/${tenantId}`, action: 'platform.read.tenant', tenantId: tenantId! },
    { url: '/api/v1/admin/audit?page=1&pageSize=25', action: 'platform.read.audit', tenantId: null },
  ];

  let mark = await maxReadId();

  for (const read of reads) {
    const res = await app.inject({ method: 'GET', url: read.url, headers: { cookie: admin.cookie } });
    expect(res.statusCode, `${read.url} ${res.body}`).toBe(200);
    const rows = await readRowsAfter(mark);
    expect(rows, read.action).toHaveLength(1);
    const row = rows[0]!;
    expect(row.action).toBe(read.action);
    expect(row.actor_type).toBe('platform_admin');
    expect(row.actor_id).toBe(admin.id);
    expect(row.tenant_id).toBe(read.tenantId);
    expect(row.chain_key).toBe(read.tenantId ?? 'platform');
    const after = typeof row.after === 'string' ? JSON.parse(row.after) : row.after;
    expect(after.route).toBe(routeOf(read.url));
    expect(after.targetTenantId).toBe(read.tenantId);
    const payload = JSON.stringify(after);
    expect(payload).not.toMatch(/@/);
    expect(payload.toLowerCase()).not.toMatch(/uhid|abha|patient|email|mobile|gstin/);
    mark = Number(row.id);
  }

  const quiet: { cookie: string; url: string }[] = [
    { cookie: admin.cookie, url: '/api/v1/admin/plans' },
    { cookie: owner.cookie, url: '/api/v1/tenant/dashboard' },
    { cookie: owner.cookie, url: '/api/v1/tenant/users?page=1&pageSize=25' },
    { cookie: owner.cookie, url: '/api/v1/billing/invoices' },
    { cookie: owner.cookie, url: '/api/v1/tenant/audit?page=1&pageSize=25' },
  ];
  for (const call of quiet) {
    const res = await app.inject({ method: 'GET', url: call.url, headers: { cookie: call.cookie } });
    expect(res.statusCode, `${call.url} ${res.body}`).toBe(200);
    expect(await readRowsAfter(mark), call.url).toHaveLength(0);
  }
}, 60_000);

function routeOf(url: string): string {
  const path = url.split('?')[0] ?? url;
  if (path.startsWith('/api/v1/admin/tenants/') && path !== '/api/v1/admin/tenants/') return 'GET /api/v1/admin/tenants/:id';
  return `GET ${path}`;
}

async function maxReadId(): Promise<number> {
  const result = await migrator.query<{ id: string | number | null }>(
    `select coalesce(max(id), 0) as id from audit_log where action like 'platform.read.%'`,
  );
  return Number(result.rows[0]?.id ?? 0);
}

interface ReadRow {
  id: string | number;
  action: string;
  actor_type: string;
  actor_id: string;
  tenant_id: string | null;
  chain_key: string;
  after: unknown;
}

async function readRowsAfter(id: number): Promise<ReadRow[]> {
  const result = await migrator.query<ReadRow>(
    `select id, action, actor_type, actor_id, tenant_id, chain_key, after
     from audit_log
     where action like 'platform.read.%' and id > $1
     order by id`,
    [id],
  );
  return result.rows;
}

async function login(email: string, password: string): Promise<{ cookie: string; id: string }> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: csrf, payload: { email, password } });
  expect(res.statusCode, res.body).toBe(200);
  const body = res.json() as { admin?: { id: string }; user?: { id: string } };
  const id = body.admin?.id ?? body.user?.id;
  if (!id) throw new Error('login response has no actor id');
  return { cookie: cookieOf(res), id };
}

function cookieOf(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie'];
  const line = Array.isArray(raw) ? raw.join(';') : (raw ?? '');
  const match = /hos_session=([^;]+)/.exec(line);
  if (!match) throw new Error('session cookie missing');
  return `hos_session=${match[1]}`;
}
