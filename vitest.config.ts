import { defineConfig } from 'vitest/config';

// One config for the three Phase A suites. `npm test` is `vitest run`.
// Uses database `hos_test` (see tests/vitest.global-setup.ts); demo DB hospital_os is not written.
export default defineConfig({
  test: {
    globalSetup: ['./tests/vitest.global-setup.ts'],
    env: {
      HOS_DB_NAME: 'hos_test',
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
