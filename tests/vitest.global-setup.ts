import { sql } from 'drizzle-orm';
import { createDb } from '../packages/db/src/client';
import { dbEnv } from '../packages/db/src/env';
import { migrate } from '../packages/db/src/migrate';
import { seed, seedDemo } from '../packages/db/src/seed';

// Override per worktree with HOS_TEST_DB (e.g. hos_b1) so parallel workers never share a test database.
const TEST_DB = process.env.HOS_TEST_DB ?? 'hos_test';

/**
 * Isolated Postgres database for the full vitest run (migrate + seed + seed:demo).
 * Sets HOS_DB_NAME so packages/db env helpers and the API tests never touch hospital_os.
 */
export default async function globalSetup(): Promise<void> {
  process.env.HOS_DB_NAME = TEST_DB;
  // Keep DATABASE_* URLs aligned with HOS_DB_NAME for tests that read them directly (e.g. nursing isolation).
  const urls = dbEnv();
  process.env.DATABASE_ADMIN_URL = urls.adminUrl;
  process.env.DATABASE_MIGRATION_URL = urls.migrationUrl;
  process.env.DATABASE_URL = urls.appUrl;
  process.env.DATABASE_PLATFORM_URL = urls.platformUrl;
  const log = (m: string) => console.log(`[vitest:globalSetup] ${m}`);
  await migrate(log);
  await seed(log);
  await seedDemo(log);
  // seedDemo turns the simulator on for the demo checkout. This suite's default is
  // off (the server captures). The wizard file turns it on for the outcome flow.
  const handle = createDb(dbEnv().migrationUrl, { max: 1 });
  try {
    await handle.db.execute(sql`update platform_settings set mock_payment_simulator = false where id = 1`);
    log('mock payment simulator off for this test database');
  } finally {
    await Promise.race([handle.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
  log(`ready on database ${TEST_DB}`);
}
