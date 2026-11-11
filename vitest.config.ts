import { defineConfig } from 'vitest/config';

// One config for the Phase A suites plus tests/db-rls. `npm test` is `vitest run`.
// The API suites use database `hos_test` (see tests/vitest.global-setup.ts). Demo DB hospital_os is not written.
// tests/db-rls ignores HOS_DB_NAME and uses hos_u1 (override with HOS_RLS_DATABASE_URL). It skips only when that
// Postgres is unreachable.
export default defineConfig({
  test: {
    globalSetup: ['./tests/vitest.global-setup.ts'],
    env: {
      HOS_DB_NAME: process.env.HOS_TEST_DB ?? 'hos_test',
      MOCK_EXPOSE_SECRETS: 'true',
      MOCK_GATEWAY_KEY_SECRET: 'mock_secret_change_me_dev_only',
    },
    include: ['packages/**/src/**/*.test.ts', 'apps/api/src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    sequence: { concurrent: false },
    // Wizard signup hashes passwords, and the RLS file shares one Postgres session.
    testTimeout: 180_000,
    hookTimeout: 120_000,
  },
});
