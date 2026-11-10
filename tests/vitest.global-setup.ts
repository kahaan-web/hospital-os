import { seed, seedDemo } from '../packages/db/src/seed';
import { migrate } from '../packages/db/src/migrate';

// Override per worktree with HOS_TEST_DB (e.g. hos_b1) so parallel workers never share a test database.
const TEST_DB = process.env.HOS_TEST_DB ?? 'hos_test';

/**
 * Isolated Postgres database for the full vitest run (migrate + seed + seed:demo).
 * Sets HOS_DB_NAME so packages/db env helpers and the API tests never touch hospital_os.
 */
export default async function globalSetup(): Promise<void> {
  process.env.HOS_DB_NAME = TEST_DB;
  const log = (m: string) => console.log(`[vitest:globalSetup] ${m}`);
  await migrate(log);
  await seed(log);
  await seedDemo(log);
  log(`ready on database ${TEST_DB}`);
}
