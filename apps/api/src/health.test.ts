import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from './app';

const app = await buildApp();

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

it('GET /api/v1/health returns ok', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ ok: true });
});

it('rejects a mutation that omits the CSRF header', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'a@b.test', password: 'not-used' } });
  expect(res.statusCode).toBe(403);
  expect(res.json().error.code).toBe('csrf');
});
