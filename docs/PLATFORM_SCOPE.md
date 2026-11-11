# Platform scope at the database layer (audit P0-2)

Status: **implemented** (option C).

Migration is `0026_platform_scope.sql`, not 0023: 0023 is taken on main by mt-hardening. Tests live in
`tests/platform/scope.test.ts` (this branch does not edit `tests/db-rls`, which another branch owns). Existing
`tests/db` cases that need a real platform scope connect as `hos_platform`. `hos_platform` gets the same
`statement_timeout` (10s) and `idle_in_transaction_session_timeout` (15s) as `hos_app`, because it is a runtime login.

Platform read audit (the P1 gap: App Admin reads of tenant data were not logged) is included:

- `GET /admin/overview`, `GET /admin/tenants` and `GET /admin/audit` each append one `platform.read.*` row on the
  platform chain (one row per request, not per tenant). `tenant_id` is null.
- `GET /admin/tenants/:id` appends one `platform.read.tenant` row on that tenant's chain (`tenant_id` = the target),
  the same place other App Admin actions on a hospital already go. The payload is the route plus counts of locations,
  users, invoices, payments, orders and overrides. No names, emails, mobiles or clinical fields.
- Catalogue reads (`/admin/plans` and the rest) and tenant-scope reads do not write `platform.read.*` rows.
- `GET /admin/audit/verify` is an integrity check of the platform chain, not a read of tenant rows, so it is not logged.

## Problem

RLS has two kinds of access: tenant scope (one hospital's rows) and platform scope (the App Admin). Both rest on GUCs
that the API sets in each transaction:

- `hos_tenant_id()` reads `app.tenant_id`.
- `hos_scope()` reads `app.scope`.

The API connects as `hos_app`, and `hos_app` may call `set_config` on both GUCs. So any SQL that runs as `hos_app`
can claim platform scope with `select set_config('app.scope', 'platform', true)`. Examples of such SQL:

- a SQL-injection bug,
- a raw `sql\`\`` fragment built from user input,
- a compromised dependency that issues queries on the app pool.

Once it has claimed platform scope, it can:

- write the global catalogue (plans, prices, modules, platform_settings) and system roles;
- read and update `platform_admins`, including password hashes and TOTP secrets;
- write `tenant_entitlement_overrides` for any tenant, which grants itself modules (combined with `app.tenant_id`);
- lift a suspension, or flip `sandbox`, through the `tenants_guard` trigger;
- call `hos_admin_tenant_list` / `hos_admin_overview`, the cross-tenant directory;
- create platform sessions through `hos_session_create(kind = 'platform')`;
- read and append to the platform audit chain.

Tenant isolation itself does not depend on `app.scope`, because every tenant policy keys on `app.tenant_id`. But
`app.tenant_id` is self-asserted in the same way. That residual is discussed under "Not solved" below.

## Options considered

| Option | Stops SQL running on the hos_app pool from claiming platform? | Cost |
|---|---|---|
| A. NOLOGIN role `hos_platform`, granted to `hos_app`; `withPlatform` runs `SET LOCAL ROLE hos_platform` | **No.** Anything that runs as `hos_app` can run the same `SET ROLE`. Membership is not authentication. | Small |
| B. Signed scope token: `withPlatform` sets `app.platform_token = HMAC(secret, txid)`; a definer `hos_scope()` verifies it against a secret only the owner can read | Yes, as long as the secret never reaches the DB session as plain text | The HMAC runs on every policy evaluation (`hos_scope()` is called per row in several policies). Introduces secret rotation and txid binding. |
| C. **Separate login role `hos_platform`** with its own password and pool; `hos_scope()` returns `'platform'` only when `session_user` is that role | **Yes.** A `hos_app` session cannot become `hos_platform`: no membership, no password. `session_user` cannot be changed by `SET ROLE` / `SET SESSION AUTHORIZATION` without superuser. | One more role, one more URL, one more small pool |

## Decision: option C

### Roles

The roles are created by `bootstrapRoles` in `packages/db/src/migrate.ts`, which runs as the superuser. In
production they come from infrastructure.

- `hos_platform`: LOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, **INHERIT**.
  - It is granted `hos_app` (`GRANT hos_app TO hos_platform`), so it inherits exactly `hos_app`'s table privileges.
  - Every existing `TO hos_app` policy applies to it, because policy role checks follow privilege inheritance.
- `hos_app` is unchanged: NOINHERIT, and a member of nothing. The membership goes one way only: `hos_platform`
  contains `hos_app`, and `hos_app` cannot assume `hos_platform`.

### Migration 0023: one function changes

```sql
CREATE OR REPLACE FUNCTION hos_scope() RETURNS text LANGUAGE sql STABLE
SET search_path = pg_catalog, public AS $$
  SELECT CASE
    WHEN coalesce(nullif(current_setting('app.scope', true), ''), 'none') <> 'platform'
      THEN coalesce(nullif(current_setting('app.scope', true), ''), 'none')
    WHEN session_user IN ('hos_platform', 'hos_migrator') THEN 'platform'
    ELSE 'none'          -- hos_app claimed platform: treat as no scope at all
  END $$;
```

- **Why `session_user`:** it is the authenticated login role. It is unchanged inside SECURITY DEFINER functions (where
  `current_user` is the owner) and unchanged by `SET ROLE`. So the same check works in policies, in the
  `tenants_guard` trigger, and in `hos_session_create` / `hos_admin_*` / `hos_next_invoice_number`.
- **No other changes:** every policy and definer function already funnels through `hos_scope()`, so none of them needs
  to change.
- **Why `hos_migrator` is allowed:** the seeds run as the owner and set platform scope so that triggers such as
  `tenants_guard` accept their writes. The owner already bypasses policies through its `_owner` policies, so allowing
  it adds no privilege.
- **Downgrade, not error:** a `hos_app` session that claims platform gets `'none'`, which is the least-privileged
  scope. It sees no tenant rows (unless it also set `app.tenant_id`, see below) and cannot write anything gated on
  platform.

### Application wiring

- **Environment:** `DATABASE_PLATFORM_URL` (dev default `postgres://hos_platform:hos_dev_platform@127.0.0.1:55432/hospital_os`) is
  added to `.env.example` and `env.ts`. `HOS_DB_NAME` swaps its database name like the other URLs.
- **`packages/db/src/client.ts`:**
  - `attachPlatformDb(appDb, platformDb)` registers the platform pool for an app pool (WeakMap).
  - `withPlatform` / `withPlatformOnTenant` run on the attached platform pool when one exists, and otherwise on the
    db they were given.
  - Call sites stay unchanged, including `apps/api/src/http.ts` and `guard.ts`.
  - Without an attached pool, platform scope is silently `'none'`, so admin routes fail closed (403/404), never open.
- **`apps/api/src/app.ts`:** creates the second pool with `max: 2`, since admin traffic is small, calls
  `attachPlatformDb`, and closes the pool on shutdown.

### Tests (implemented in tests/platform/scope.test.ts)

- As `hos_app`, `set_config('app.scope','platform')` makes `hos_scope()` return `'none'`. Platform writes to
  plans / prices / platform_settings / roles (system) / overrides fail. `platform_admins` returns 0 rows.
  `hos_admin_overview()` raises.
- As `hos_platform`, the same operations succeed (inside a rolled-back transaction).
- `hos_app` is not a member of `hos_platform`, and `SET ROLE hos_platform` from `hos_app` fails with 42501.
- The existing apps/api suite still passes, because admin routes run on the platform pool.

## Not solved here (stated, so nobody assumes otherwise)

1. **`app.tenant_id` is still self-asserted by `hos_app`.**
   - SQL running on the app pool can still read another tenant by setting `app.tenant_id`. RLS stops application
     bugs (a missing WHERE, a wrong join), not an attacker who can run arbitrary SQL as `hos_app`.
   - Closing this needs the tenant id bound to something the session cannot forge, for example a definer
     `hos_enter_tenant(session_token_hash)` that resolves the session and sets a GUC the app cannot set. Postgres has
     no GUC that only a definer function can write, so this would need a protected table keyed on
     `pg_backend_pid()` plus txid, and that is a larger change.
   - Recommended later step: keep request-level SQL parameterised (as it is now), and add this when real PHI arrives.
2. **A compromised API process holds both passwords.** Option C separates the pools, not the process. To separate the
   processes, run admin routes as their own service, which is the only one that holds `DATABASE_PLATFORM_URL`.
3. **Owner powers.** `hos_migrator` can still disable triggers and rewrite rows (audit P2-9). Split the runtime owner
   from the migration role, and anchor audit chain heads externally.
