import { migrate } from '../migrate';

migrate((m) => console.log(`[db:migrate] ${m}`))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[db:migrate] failed: ${(err as Error).message}`);
    console.error('Is Postgres running? Try `npm run db:up` first.');
    process.exit(1);
  });
