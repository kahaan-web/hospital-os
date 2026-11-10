import { seedDemo } from '../seed';

seedDemo((m) => console.log(`[db:seed:demo] ${m}`))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[db:seed:demo] failed: ${(err as Error).message}`);
    process.exit(1);
  });
