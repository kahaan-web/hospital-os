import { seed } from '../seed';

seed((m) => console.log(`[db:seed] ${m}`))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[db:seed] failed: ${(err as Error).message}`);
    process.exit(1);
  });
