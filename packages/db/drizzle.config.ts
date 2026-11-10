import { defineConfig } from 'drizzle-kit';

// Used only to *generate* SQL from src/schema.ts (`npm run generate -w @hos/db -- --name <change>`).
// Migrations are applied by src/cli/migrate.ts so that hand-written SQL (RLS, triggers, grants) sits in the same series.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
});
