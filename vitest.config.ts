import { defineConfig } from 'vitest/config';

// Dedicated database so API tests do not write the shared `hospital_os` database.
process.env.HOS_DB_NAME = 'hos_mt';

export default defineConfig({
  test: {
    env: { HOS_DB_NAME: 'hos_mt' },
    globalSetup: ['./tests/mt/global-setup.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
