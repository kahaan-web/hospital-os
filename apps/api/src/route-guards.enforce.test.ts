import { createDb, dbEnv, withTenant } from '@hos/db';
import { sql } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from './app';
import { routeSchemaBag } from './route-schemas';
import { AUTHENTICATED, TENANT_GUARDS, type TenantRouteGuard } from './route-guards';

const app = await buildApp();
const csrf = { 'x-hos-csrf': '1' };
const UUID = '00000000-0000-4000-8000-000000000001';

let cookie = '';

beforeAll(async () => {
  await app.ready();
  const owner = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: csrf,
    payload: { email: 'owner@sunrise.demo', password: 'Demo@12345' },
  });
  expect(owner.statusCode, owner.body).toBe(200);
  const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: cookieOf(owner) } });
  expect(me.statusCode, me.body).toBe(200);
  const tenantId = me.json().tenant.id as string;
  const email = `noperm.${Date.now()}@sbx.hospitalos.test`;
  const handle = createDb(dbEnv().appUrl, { max: 1 });
  try {
    await withTenant(handle.db, tenantId, async (tx) => {
      const inserted = await tx.execute(sql`
        insert into users (tenant_id, email, name, password_hash, status, mobile_verified_at)
        select ${tenantId}::uuid, ${email}, 'No Permission Sample', password_hash, 'active', now()
        from users
        where lower(email) = 'owner@sunrise.demo'
        returning id
      `);
      expect(inserted.rows.length).toBe(1);
    });
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
  const session = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: csrf,
    payload: { email, password: 'Demo@12345' },
  });
  expect(session.statusCode, session.body).toBe(200);
  cookie = cookieOf(session);
}, 60_000);

afterAll(async () => {
  await app.close();
});

it('rejects every permission-guarded tenant route for a user who lacks that permission', async () => {
  const failures: string[] = [];
  let checked = 0;
  for (const [key, guard] of Object.entries(TENANT_GUARDS)) {
    if (!guardedPermission(guard)) continue;
    checked += 1;
    const space = key.indexOf(' ');
    const method = key.slice(0, space);
    const template = key.slice(space + 1);
    const bag = routeSchemaBag(method, template);
    const params = satisfy(bag?.params);
    const query = satisfy(bag?.querystring);
    const body = satisfy(bag?.body);
    const url = `${fillUrl(template, params)}${toQuery(query)}`;
    const mutating = method !== 'GET' && method !== 'HEAD';
    const res = await app.inject({
      method: method as 'GET',
      url,
      ...(mutating ? { payload: body ?? {} } : {}),
      headers: {
        ...(mutating ? csrf : {}),
        cookie,
        'idempotency-key': `guard-${checked}-${Date.now()}`,
      },
    });
    const parsedBody = parseBody(res);
    const code = parsedBody?.error?.code;
    const routeMissing = res.statusCode === 404 && !code && /not found/i.test(parsedBody?.message ?? res.body);
    const allowed = res.statusCode === 401 || (res.statusCode === 404 && !routeMissing) || (res.statusCode === 403 && code === 'forbidden');
    if (!allowed || res.statusCode < 300) {
      failures.push(`${key} -> ${res.statusCode} ${code ?? ''} ${res.body.slice(0, 300)}`);
    }
  }
  expect(checked).toBeGreaterThan(20);
  expect(failures, failures.join('\n')).toEqual([]);
});

function guardedPermission(guard: TenantRouteGuard): boolean {
  if (guard.permission == null) return false;
  const list = Array.isArray(guard.permission) ? guard.permission : [guard.permission];
  return list.some((permission) => permission !== AUTHENTICATED);
}

interface ParseIssue {
  code?: string;
  message?: string;
  path?: PropertyKey[];
  expected?: unknown;
  values?: unknown[];
  format?: string;
  pattern?: string;
  origin?: string;
  minimum?: number;
  inclusive?: boolean;
  maximum?: number;
  discriminator?: string;
  options?: unknown[];
  errors?: ParseIssue[][];
}

function satisfy(schema: unknown): Record<string, unknown> | null {
  if (!isZod(schema)) return null;
  let value: unknown = {};
  for (let i = 0; i < 16; i++) {
    const parsed = schema.safeParse(value);
    if (parsed.success) return (parsed.data ?? value) as Record<string, unknown>;
    const issues = parsed.error.issues as ParseIssue[];
    if (issues.length === 0) break;
    const next = issues.reduce((current, issue) => applyIssue(current, issue), value);
    if (JSON.stringify(next) === JSON.stringify(value)) break;
    value = next;
  }
  return (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
}

function applyIssue(root: unknown, issue: ParseIssue): unknown {
  const path = issue.path ?? [];
  if (issue.code === 'invalid_union') {
    const option = issue.options?.[0];
    if (option !== undefined) return setPath(root, path, option);
    const nested = issue.errors?.[0] ?? [];
    return nested.reduce((current, item) => applyIssue(current, item), root);
  }
  if (issue.code === 'unrecognized_keys') return root;
  if (/start and an end/i.test(issue.message ?? '')) {
    const parent = path.slice(0, -1);
    return setPath(setPath(root, [...parent, 'start'], '09:00'), [...parent, 'end'], '18:00');
  }
  if (issue.code === 'too_small' && issue.origin === 'array') {
    const current = getPath(root, path);
    const arr = Array.isArray(current) ? [...current] : [];
    const minimum = Number(issue.minimum ?? 1);
    while (arr.length < minimum) arr.push({});
    return setPath(root, path, arr);
  }
  return setPath(root, path, guess(issue, path));
}

function isZod(schema: unknown): schema is {
  safeParse: (value: unknown) => { success: true; data: unknown } | { success: false; error: { issues: ParseIssue[] } };
} {
  return !!schema && typeof schema === 'object' && typeof (schema as { safeParse?: unknown }).safeParse === 'function';
}

function guess(issue: ParseIssue, path: PropertyKey[]): unknown {
  if (Array.isArray(issue.values) && issue.values.length > 0) return issue.values[0];
  const format = issue.format ?? '';
  const expected = String(issue.expected ?? '');
  const message = issue.message ?? '';
  const pattern = issue.pattern ?? '';
  const leaf = String(path[path.length - 1] ?? '');
  if (/end time must be after/i.test(message)) return '18:00';
  if (/caller/i.test(message)) return 'Sample Caller';
  if (/mobile|10-digit/i.test(message) || /mobile|phone/i.test(leaf)) return '9000000000';
  if (/letters and at least one number/i.test(message) || leaf === 'password') return 'Sample12345';
  if (message === 'Choose a state' || leaf === 'stateCode') return '27';
  if (message === 'Enter a 6-digit PIN code' || leaf === 'pincode' || pattern.includes('[1-9][0-9]{5}')) return '400001';
  if (/GSTIN/i.test(message)) return '';
  if (/last 4/i.test(message) || pattern.includes('\\d{4}$')) return '1234';
  if (/ABHA/i.test(message)) return '00-0000-0000-0000';
  if (/cannot be zero/i.test(message)) return 1;
  if (/HH:mm|\\d\{2\}:\\d\{2\}/.test(message) || pattern.includes('\\d{2}:\\d{2}') || /^(start|end|slotStart)$/.test(leaf)) {
    return leaf === 'end' ? '18:00' : '09:00';
  }
  if (format === 'uuid' || format === 'guid' || expected === 'uuid' || /uuid/i.test(message)) return UUID;
  if (format === 'email' || expected === 'email' || /email/i.test(message)) return 'noperm@sbx.hospitalos.test';
  if (
    format === 'date' ||
    /YYYY-MM-DD|calendar date/.test(message) ||
    pattern.includes('\\d{4}-\\d{2}-\\d{2}') ||
    /^(date|dob|from|to|expiry|visitDate)$/i.test(leaf)
  ) {
    return '2026-01-15';
  }
  if (format === 'datetime' || format === 'date-time' || /datetime/i.test(message)) return '2026-01-15T00:00:00.000Z';
  if (/6-digit|\[0-9\]\{6\}/.test(message) || pattern.includes('[0-9]{6}') || pattern.includes('\\d{6}')) return '123456';
  if (issue.code === 'too_small') {
    const minimum = Number(issue.minimum ?? 1);
    if (issue.origin === 'string' || /character|string/i.test(message)) return 'a'.repeat(Math.min(Math.max(minimum, 1), 32));
    if (issue.inclusive === false && minimum === 0) return 1;
    return minimum === 0 ? 1 : minimum;
  }
  if (issue.code === 'too_big' && typeof issue.maximum === 'number') return issue.maximum;
  if (expected === 'number' || expected === 'int' || issue.origin === 'number') return 1;
  if (expected === 'boolean') return true;
  if (expected === 'array') return [];
  if (expected === 'object') return {};
  const quoted = /"([^"]+)"/.exec(message);
  if (quoted && issue.code === 'invalid_value') return quoted[1];
  return 'sample';
}

function parseBody(res: LightMyRequestResponse): { error?: { code?: string }; message?: string } | null {
  try {
    return res.json();
  } catch {
    return null;
  }
}

function getPath(root: unknown, path: PropertyKey[]): unknown {
  let current = root;
  for (const part of path) {
    if (Array.isArray(current) && (typeof part === 'number' || (typeof part === 'string' && /^\d+$/.test(part)))) {
      current = current[Number(part)];
    } else if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[String(part)];
    } else {
      return undefined;
    }
  }
  return current;
}

function setPath(root: unknown, path: PropertyKey[], value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const index = typeof head === 'number' ? head : typeof head === 'string' && /^\d+$/.test(head) ? Number(head) : null;
  if (index !== null) {
    const arr = Array.isArray(root) ? [...root] : [];
    arr[index] = setPath(arr[index], rest, value);
    return arr;
  }
  const obj = root && typeof root === 'object' && !Array.isArray(root) ? { ...(root as Record<string, unknown>) } : {};
  const key = String(head);
  obj[key] = setPath(obj[key], rest, value);
  return obj;
}

function fillUrl(template: string, params: Record<string, unknown> | null): string {
  return template.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => {
    const value = params?.[name];
    if (typeof value === 'string' || typeof value === 'number') return encodeURIComponent(String(value));
    if (name === 'kind') return 'case-paper';
    if (name === 'format') return 'pdf';
    if (name === 'report') return 'stock-register';
    if (name === 'moduleKey') return 'patient-registration';
    if (name === 'key') return 'staff';
    return UUID;
  });
}

function toQuery(value: Record<string, unknown> | null): string {
  if (!value) return '';
  const params = new URLSearchParams();
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null || typeof item === 'object') continue;
    params.set(key, String(item));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

function cookieOf(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie'];
  const line = Array.isArray(raw) ? raw.join(';') : (raw ?? '');
  const match = /hos_session=([^;]+)/.exec(line);
  if (!match) throw new Error('session cookie missing');
  return `hos_session=${match[1]}`;
}
