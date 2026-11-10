# DB-level tenant isolation tests (`tests/db-rls`)

These tests connect to Postgres **as `hos_app`** (the role the API uses) and prove the database itself keeps tenants
apart. They do not go through the API, so they catch a missing policy, a missing `FORCE ROW LEVEL SECURITY`, or an
over-broad GRANT, even when application code happens to filter correctly.

## Run

Use a throwaway database (never the shared `hospital_os`). From the repo root, with Postgres on 127.0.0.1:55432:

```bash
export HOS_DB_NAME=hospital_os_rls     # any name; created on first migrate
npm run db:migrate
npm run db:seed
npm run db:seed:demo
npm run test:rls
```

PowerShell: `$env:HOS_DB_NAME = 'hospital_os_rls'` instead of `export`.

The connection URLs come from `packages/db/src/env.ts` (`DATABASE_MIGRATION_URL`, `DATABASE_URL`, dev defaults
otherwise). `HOS_DB_NAME` swaps the database name in both. Alternatively, point the three `DATABASE_*` URLs in a local
`.env` at your own database. `.env` is git-ignored.

Typecheck: `npx tsc -p tests/db-rls/tsconfig.json`. This is also part of `npm run typecheck`.

## What is tested

The suite discovers, from `pg_catalog` at run time, every relation in `public` that has a `tenant_id` column, plus
`tenants` (keyed on `id`). New tables are covered automatically. For each one:

| Check | Pass condition |
|---|---|
| RLS enabled **and** forced | Required for tables. Views must be `security_invoker` or not readable by `hos_app`. Materialized views and foreign tables must not be readable by `hos_app`. |
| SELECT from tenant B | 0 rows of any other tenant. |
| INSERT a copy of a tenant A row (tenant_id = A) | `42501`: RLS violation or permission denied. |
| UPDATE / DELETE tenant A rows | 0 rows affected, or permission denied. |
| UPDATE own row to tenant_id = A | `42501`. |
| No tenant context (none / tenant scope with empty id / platform scope with no tenant) | 0 tenant rows readable; UPDATE and DELETE affect 0 rows. |
| Role sanity | `hos_app` is not superuser, has no BYPASSRLS, owns nothing, and is not a member of any role. |

The test also checks that tenant A can see its own rows. Without that, a "0 rows" result could just mean a broken query.

**Permission denied counts as a pass.** The run prints a table showing which operations were stopped by RLS and which
by a missing GRANT. Grant-level denials at the time of writing:

- `sessions`: no `hos_app` grants at all. It is reached only through SECURITY DEFINER functions.
- `audit_log`: no UPDATE or DELETE.
- `tenants`: no DELETE.

## Tenants

- **Tenant A** is `sunrise-care`, created by the demo seed (`db:seed:demo`). It holds the realistic sample dataset, so
  rows that new modules seed are exercised automatically.
- **Tenant B** is `rls-probe`, created by the test as the schema owner. It is created idempotently and reused across
  runs. It gets one sample row in every Phase A tenant table (`fixtures.ts`).

For each table, the victim is whichever tenant has rows there, and the attacker is the other tenant.

**Adding a tenant table:** if a new table has no rows for either tenant, its test fails with a message. To fix it,
seed sample rows for Sunrise (preferred) or add a probe fixture in `fixtures.ts`.

All fixture data is fictional and flagged as sample:

- `(Sample)` names
- `@sbx` emails
- `90000` mobiles
- a sandbox tenant
