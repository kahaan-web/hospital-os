import { defineConfig } from 'vitest/config';

// One config for the three Phase A suites. `npm test` is `vitest run`.
// Files run one at a time: the DB suite shares hospital-os-postgres with other workers,
// and this machine is tight on RAM.
export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/api/src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    sequence: { concurrent: false },
    // Wizard signup hashes passwords, and the RLS file shares one Postgres session.
    testTimeout: 180_000,
    hookTimeout: 120_000,
  },
});
