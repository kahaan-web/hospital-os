import { afterEach, expect, it } from 'vitest';
import { apiEnv } from './env';
import { cookieOptions } from './http';

const KEYS = ['NODE_ENV', 'HOS_DEV_INSECURE', 'MOCK_GATEWAY_KEY_SECRET', 'MOCK_GATEWAY_WEBHOOK_SECRET', 'MOCK_EXPOSE_SECRETS'] as const;
const saved = new Map<string, string | undefined>();

function remember(): void {
  if (saved.size > 0) return;
  for (const key of KEYS) saved.set(key, process.env[key]);
}

function restore(): void {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  restore();
});

function setEnv(patch: Partial<Record<(typeof KEYS)[number], string | undefined>>): void {
  remember();
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

it('fails closed when NODE_ENV and HOS_DEV_INSECURE are unset', () => {
  setEnv({
    NODE_ENV: undefined,
    HOS_DEV_INSECURE: undefined,
    MOCK_GATEWAY_KEY_SECRET: 'mock_secret_change_me_dev_only',
    MOCK_GATEWAY_WEBHOOK_SECRET: 'mock_webhook_secret_dev_only',
    MOCK_EXPOSE_SECRETS: 'true',
  });
  expect(() => apiEnv()).toThrow(/non-default/);
});

it('hides secrets and sets Secure cookies unless HOS_DEV_INSECURE=1', () => {
  setEnv({
    NODE_ENV: undefined,
    HOS_DEV_INSECURE: undefined,
    MOCK_GATEWAY_KEY_SECRET: 'unit-test-gateway-secret-not-the-default',
    MOCK_GATEWAY_WEBHOOK_SECRET: 'unit-test-webhook-secret-not-the-default',
    MOCK_EXPOSE_SECRETS: 'true',
  });
  const env = apiEnv();
  expect(env.exposeSecrets).toBe(false);
  expect(env.devInsecure).toBe(false);
  expect(env.secureCookies).toBe(true);
  expect(env.csrfRequired).toBe(true);
  expect(cookieOptions(env, 60).secure).toBe(true);
});

it('ignores HOS_DEV_INSECURE when NODE_ENV is production', () => {
  setEnv({
    NODE_ENV: 'production',
    HOS_DEV_INSECURE: '1',
    MOCK_GATEWAY_KEY_SECRET: 'unit-test-gateway-secret-not-the-default',
    MOCK_GATEWAY_WEBHOOK_SECRET: 'unit-test-webhook-secret-not-the-default',
    MOCK_EXPOSE_SECRETS: 'true',
  });
  const env = apiEnv();
  expect(env.exposeSecrets).toBe(false);
  expect(env.devInsecure).toBe(false);
  expect(env.secureCookies).toBe(true);
});
