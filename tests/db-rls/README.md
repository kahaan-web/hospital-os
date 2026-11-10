# DB-level tenant isolation tests (`tests/db-rls`)

These tests connect to Postgres **as `hos_app`** (the role the API uses) and prove the database itself keeps tenants
apart. They do not go through the API, so they catch a missing policy, a missing `FORCE ROW LEVEL SECURITY`, or an
over-broad GRANT, even when application code happens to filter correctly.

They are part of `npm test`. They use their own database, so they do not write into `hos_test` or `hospital_os`.

## Run

Postgres must be the hospital-os container on `127.0.0.1:55432`. From the repo root:

```bash
npm test
```

That migrates and catalogue-seeds `hos_u1` itself (plans, modules, the system `tenant_admin` role, the privacy notice).
It does not need `db:seed:demo`. To run only this suite:

```bash
npm run test:rls
```

Override the database with a full URL (the database name is what gets created and migrated):

```bash
# PowerShell
$env:HOS_RLS_DATABASE_URL = 'postgres://hos_app:hos_dev_app@127.0.0.1:55432/hos_u1'
npm run test:rls
```

`HOS_DB_NAME` (set to `hos_test` by the rest of the vitest run) is ignored here. The suite sets it only while it calls
the repo `migrate` and catalogue `seed`, then restores it.

If Postgres is not accepting connections, this file **skips** with a message that names the database. Any other
failure (migration SQL, a missing policy, a missing fixture row) fails the run.

Typecheck: `npx tsc -p tests/db-rls/tsconfig.json`. This is also part of `npm run typecheck`.

## What is tested

The suite discovers, from `pg_catalog`, every ordinary table in `public` that has a `tenant_id` column, plus `tenants`
(the tenant key is `id`, so it has no `tenant_id` column). `tenants` is included because it is tenant-owned. A new
table with `tenant_id` is covered without editing the test. It fails until `fixtures.ts` inserts a row for both tenants.

| Check | Pass condition |
|---|---|
| RLS enabled **and** forced | Required for tables. A view readable by `hos_app` must be `security_invoker`. Materialized views and foreign tables must not be readable by `hos_app`. |
| Both fixtures have a row | Tenant A (`rls-alpha`) and tenant B (`rls-beta`) each have at least one row. |
| SELECT the other tenant | 0 rows, or `42501` when `hos_app` has no SELECT grant (`sessions`). |
| INSERT a copy of the other tenant's row | `42501` (RLS or missing GRANT). |
| UPDATE / DELETE the other tenant's rows | 0 rows, or `42501`. Then, still inside that transaction, the victim tenant reads its own rows and they match the pre-attack fingerprint. |
| Move own row onto the other tenant's id | `42501`, or 0 rows when the policy hides the row before `WITH CHECK` (`tenant_entitlement_overrides` outside platform scope). The other tenant's fingerprint is unchanged either way. |
| No tenant context | With no settings, with `app.tenant_id` empty, or with platform scope and no tenant id: 0 rows (or a clean privilege error). A non-uuid tenant id errors with `22P02` on tables `hos_app` can read. |
| Role | `hos_app` is not superuser, has no `BYPASSRLS`, owns nothing, and belongs to no role. `SET ROLE hos_migrator` and `DISABLE ROW LEVEL SECURITY` are `42501`. `row_security=off` makes the next read error instead of returning rows. |
| Audit log | `UPDATE` / `DELETE` / `TRUNCATE` as `hos_app` are `42501` (no grant). The append-only triggers are present and enabled. An insert's client-supplied `seq`, `hash`, `prev_hash`, `chain_key` and `created_at` are overwritten by `audit_log_chain`. |
| Definer functions | See below. |

**Permission denied counts as a pass** for a read or write the role was never granted. Grant-level denials:

- `sessions`: no `hos_app` grants. Reached only through `SECURITY DEFINER` functions. The victim cannot `SELECT` its own session rows, so the "unchanged" check is the rejection itself.
- `audit_log`: no `UPDATE` or `DELETE`. `hos_app` therefore never reaches `audit_log_reject`; that trigger is what stops the owner. The chain trigger is what `hos_app` does hit, on `INSERT`.
- `tenants`: no `DELETE`.
- `invoice_sequences` and `_migrations`: no grants.

## Tenants

Both tenants are created by `fixtures.ts` (not by the Sunrise demo seed):

- **A** — `rls-alpha`, Meera Kulkarni (Sample), `meera.kulkarni.rls@sbx`, mobile `9000011001`
- **B** — `rls-beta`, Dev Sharma (Sample), `dev.sharma.rls@sbx`, mobile `9000012001`

Sample names, `@sbx` mail, `90000` mobiles, `sandbox` tenants. Re-running refreshes expiry on OTP, invitations and sessions so the definer checks stay valid.

**Adding a tenant table:** if it has no row for either fixture tenant, its test fails and names the table. Add a probe insert in `fixtures.ts`.

## Security definer functions

Documented in `docs/CONTRACTS.md` §4 and `docs/PLATFORM_SCOPE.md`. The tests assert `hos_app` cannot see more than those contracts allow:

| Function | What hos_app gets |
|---|---|
| `hos_login_lookup(email)` | One row `(tenant_id, user_id)` for that exact email, or no row. Not a wildcard, not the rest of the user. |
| `hos_otp_tenant(id)` / `hos_invite_tenant(token)` | The `tenant_id` for that exact unexpired secret, or null. |
| `hos_session_resolve(token_hash)` | One session's documented columns when the hash is exact, unexpired and unrevoked. A prefix, an unknown hash, an expired session or a revoked session returns no row. |
| `hos_session_create` | Creates a session for the current tenant's user. The other tenant's user is `42501`. |
| `hos_session_set_location` | A location in the current tenant only. |
| `hos_session_revoke_user` | A user in the current tenant only. The other tenant's session still resolves. |
| `hos_session_revoke` | Void. An unknown hash does not revoke the other tenant's session. |
| `hos_admin_tenant_list` / `hos_admin_overview` | `42501` in tenant scope and with no scope. |
| `hos_next_invoice_number` | `(fy, number)` in tenant scope. `42501` with no scope. Does not reveal the other tenant's invoices. `invoice_sequences` itself is not readable. |

`hos_login_lookup`, `hos_otp_tenant`, `hos_invite_tenant` and `hos_session_resolve` are allowed to name the other tenant when the caller already holds the exact email, challenge id, invite token or session hash. That is the documented pre-login / secret lookup. The tests pin the returned columns to that contract.

## Findings

### `hos_app` can self-assert platform scope and read every tenant

`hos_scope()` in `packages/db/migrations/0001_rls.sql` returns `current_setting('app.scope')` unchanged. `docs/PLATFORM_SCOPE.md` decides that a `hos_app` session which sets `app.scope` to `platform` must be treated as scope `none` (separate login role `hos_platform`, migration 0023). That migration is not on this branch.

As `hos_app`, `set_config('app.scope','platform', true)` with an empty `app.tenant_id` makes `hos_scope()` return `platform`. `hos_admin_overview()` and `hos_admin_tenant_list()` then succeed and return every tenant (display name, legal name, owner email, counts). They do not return password hashes, session tokens or OTP hashes.

Tenant-table RLS does not depend on this. With scope left as `tenant`, those functions raise `42501`, and a tenant still cannot read another tenant's rows. Claiming platform scope without a tenant id also leaves tenant tables empty, because those policies key on `app.tenant_id`.

The test `hos_app cannot self-assert platform scope and read every tenant via hos_admin_overview` is `it.fails` until migration 0023 (or the equivalent `hos_scope()` change) lands. When that lands, `it.fails` will fail the run because the assertion started passing — delete `it.fails` and keep the assertion. Not fixed in this branch: this work is tests only.

This is audit P0-2. It is the documented limit in `docs/CONTRACTS.md` ("`hos_app` sets its own GUCs") and the open design in `docs/PLATFORM_SCOPE.md`.
