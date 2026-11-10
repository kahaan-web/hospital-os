import { migrate, seed, seedDemo } from '@hos/db';

/** Create `hos_mt` from DATABASE_ADMIN_URL, then migrate, seed the catalogue, and seed the demo tenant. */
export default async function setup(): Promise<void> {
  process.env.HOS_DB_NAME = 'hos_mt';
  const log = (message: string) => console.log(`[hos_mt] ${message}`);
  await migrate(log);
  await seed(log);
  await seedDemo(log);
}
