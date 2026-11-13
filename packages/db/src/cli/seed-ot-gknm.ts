import { seedOtGknm } from '../seed-clinical/ot-gknm';

seedOtGknm((m) => console.log(`[db:seed:ot-gknm] ${m}`))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[db:seed:ot-gknm] failed: ${(err as Error).message}`);
    process.exit(1);
  });
