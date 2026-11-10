# Multitenancy audit — main @ 59ea193 (read-only)

Date: 2026-11-11 (IST). Scope: current `main` (59ea193). Method: code read plus catalog queries against a DB migrated to the same migrations (`hospital_os_handson`), plus `npx vitest run apps/api/src`.
Nothing was changed by this audit. Line numbers are approximate to ±3 lines.

## Verdict

Data-layer isolation is **solid for a demo and close to production-grade**. Every tenant table has RLS **enabled and FORCED**, the app role is non-owner and has no BYPASSRLS, and the tenant GUC is transaction-local.
The weak points are **above** the RLS layer:

- **Billing trusts the client.** The client chooses the payment outcome, and the tenant can resolve its own pending payment.
- **The platform scope is self-asserted at the DB level.** `hos_app` can set `app.scope`.
- **Entitlements are enforced on a single placeholder route only.**
- **There are no DB-level isolation tests.**

The system is not production-ready for real money or real PHI until the P0s below are closed.

## 1. RLS coverage

- **Tables:** 34 of 34 application tables have `relrowsecurity = true` and `relforcerowsecurity = true` (catalog query on pg_class).
  - The only table without RLS is `_migrations`. `hos_app` has no grants on it, which is acceptable.
- **Policies:** `packages/db/migrations/0001_rls.sql`.
  - Global/catalogue loop: lines 41-60.
  - Tenant loop `tenant_id = hos_tenant_id()`: lines 86-105.
  - `tenants`: 117-124. `roles`: 127-142. Overrides: 174-184. `audit_log`: 187-196.
- **`sessions` and `invoice_sequences`:** these have an owner-only policy and no `hos_app` grants (73-83). They are reached only via SECURITY DEFINER functions.
- **Table lacking FORCE:** none of the tenant tables; only `_migrations` (no RLS at all, no app grant).

## 2. Database roles

- **Attributes:** `hos_migrator` (owner) and `hos_app` (API) are both NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE and NOINHERIT (`packages/db/src/migrate.ts:51`).
- **Ownership:** `hos_migrator` owns every table and function; `hos_app` owns nothing.
- **Gap (P1):** `hos_app` has UPDATE/DELETE on `invoices`, `invoice_lines`, `payments`, `orders`, `consents`, `subscriptions` and `subscription_items`. As a result:
  - Financial records are mutable from the app role.
  - `subscriptions` and `subscription_items` are writable in tenant scope. A SQL-injection or logic bug could self-upgrade a plan, and there is no DB defence-in-depth against that.

## 3. How tenant context is set

- **Mechanism:** `packages/db/src/client.ts` provides `withTenant`, `withPlatform` and `withPlatformOnTenant`. Each opens `db.transaction` and calls `set_config('app.tenant_id', $1, true)` and `set_config('app.scope', …, true)`.
  - The `true` flag makes the setting transaction-local (SET LOCAL semantics).
  - Ids pass through `assertUuid`.
- **Pooled-connection leakage:** none found. Settings die at COMMIT/ROLLBACK, and no code path uses a session-level `SET`.
- **Callers:** `apps/api/src/http.ts:239-249` and `apps/api/src/guard.ts` `openTenant` (~45-100).
- **Gap (P0 before production):** `hos_scope()` and `hos_tenant_id()` simply read GUCs that `hos_app` itself is allowed to set.
  - So at the DB level, "platform scope" is **not authentication**. Any code running as `hos_app` (for example via SQL injection) can `set_config('app.scope','platform')`.
  - The `hos_admin_*` SECURITY DEFINER checks rely on that same GUC.
  - **Fix:** use a separate `hos_platform` role, entered via `SET LOCAL ROLE` from a role the app cannot assume freely, or a signed/verified scope token checked in a definer function. At minimum, run platform paths on a different DB login.

## 4. Composite (tenant_id, id) foreign keys

- **Present:** composite FKs are declared in `packages/db/src/schema.ts` for tenant child tables, so a child cannot point at another tenant's parent.
- **Missing (P1):**
  - `sessions` uses single-column FKs.
  - `data_principal_requests.created_by` has no FK.
  - `checklist_items.done_by` has no FK.
  - `invitations.invited_by` has no FK.

## 5. Platform-admin cross-tenant path

- **Entry points:** `guard.ts` `openPlatform` and `openPlatformTenant` (~117-157) use `withPlatform` / `withPlatformOnTenant`.
- **Writes:** audited (`apps/api/src/routes/admin.ts` ~75-287, with a hash-chained audit insert per action).
- **Gap (P1): reads are not audited.**
  - `GET /admin/tenants/:id` (admin.ts:178), the tenant list and the admin audit view write no access record.
  - Cross-tenant reads of PHI must be logged (DPDP/HIPAA-style "break-glass").
- **Gap (P1):** admin TOTP is optional. It should be mandatory for platform admins.

## 6. Entitlements: server-side or UI-only?

- **Engine:** `computeEntitlements` and `assertModule` live at `packages/shared/src/catalog.ts:367`.
- **Usage:** `assertModule` is called only from `apps/api/src/routes/tenant.ts:236` (`/tenant/m/:moduleKey`, a placeholder).
  - No `requireFeature` exists.
  - No module business routes exist yet. The first one (B0 clinical/patients) must be guarded.
- **Status gates:** suspended and onboarding-incomplete tenants are blocked in `guard.ts:58-63`.
- **Verdict (P1):** enforcement is server-side *where it exists*, but it is not systematic. Needed:
  - A route-inventory test that fails when a `/tenant/**` route has no entitlement declaration.
  - Seat/usage limits are not enforced anywhere.

## 7. Onboarding to provisioning atomicity

- **Signup:** tenant, owner user, membership and session are created in one transaction (`apps/api/src/routes/auth.ts:41-77`).
- **Provisioning:** one transaction (`apps/api/src/routes/onboarding.ts:167-189`), and it requires a paid, fulfilled order.
- **The steps in between are separate requests:** pay, verify, fulfil and provision.
  - A crash between them leaves a consistent but incomplete state that can be resumed.
  - This is acceptable, but there is no reconciliation job (P2).

## 8. Billing

- **Signature:** HMAC verification of the mock gateway callback (`apps/api/src/billing.ts:120-135`) uses a server secret. This is fine for a mock.
- **P0 (before real money):** the client chooses the outcome.
  - `payOrder` accepts `outcome: 'success'` from the request body (billing.ts:75-117).
  - `resolvePending` (billing.ts:~137) lets the tenant mark its own pending payment as captured.
  - Payment state must come only from a server-side gateway webhook or server-to-server verification.
- **Idempotency:** `Idempotency-Key` is required only on `POST /billing/orders` and `/pay` (http.ts:233-236). Verify, fulfil, provision and admin writes are not covered (P1).
- **Concurrency (P1):** there is no `SELECT … FOR UPDATE` on the order or payment.
  - Two concurrent verifies can both pass the status check.
  - The second one is stopped only by the unique `invoices_order_uq` and then surfaces as a 500.
  - **Fix:** lock the order row and treat the duplicate as an idempotent success.
- **Invoice numbering:** `0002_invoice_fn.sql` uses `INSERT … ON CONFLICT DO UPDATE … RETURNING`.
  - This takes a row lock held until commit, so there is no number race. It is gapless provided it is called last in the transaction, which it is (billing.ts:178, 273).
  - It is SECURITY DEFINER and scope-checked.
  - Note: the series is a single platform series per financial year, which is correct for the platform's own GST invoices.

## 9. Audit-log immutability

- **Triggers:** `audit_log_no_update`, `audit_log_no_truncate` and `audit_log_chain` (per-tenant hash chain) are enabled.
- **Grants:** `hos_app` has INSERT and SELECT only.
- **Verification:** `verifyChain` exists in `guard.ts`.
- **Gap (P2):** the owner `hos_migrator` can disable triggers or rewrite rows. There is no external anchoring (for example a periodic chain-head export to WORM storage).

## 10. Which isolation tests run, and which skip

Run on 2026-11-11 01:09 IST with `npx vitest run apps/api/src` (HOS_DB_NAME=hospital_os_handson). Result: **2 files, 7 tests, 7 passed, 0 skipped**.

| File | Tests | What it covers |
|---|---|---|
| `apps/api/src/health.test.ts` | 2 | Health check. |
| `apps/api/src/security.test.ts` | 5 | Cross-tenant invoice and user return 404 (not 403); `not_entitled` for an unlicensed module; onboarding routes rejected after go-live; idempotency replay; payment-signature rejection. |

- **Setup:** both files use `buildApp()` plus `inject`.
- **Database:** they run against the **env database** (default `hospital_os`), which needs the seeded demo. It is **not** a throwaway database; `docs/SECURITY_AND_COMPLIANCE.md` was corrected in this branch.
- **Missing:** any **DB-level RLS test**. Nothing connects as `hos_app` and checks SELECT, INSERT, UPDATE and DELETE denial per table across two tenants.
  - `scripts/smoke.mjs --db` does a partial check, but it is a script, not a CI test.
  - `feat/tests` is not merged yet.

## 11. Other findings

- `hos_login_lookup` (SECURITY DEFINER) has no scope or rate check, so it enables email enumeration (P2).
- There are no security headers (helmet/CSP/HSTS) (P2).
- The session cookie is `Secure` only when `NODE_ENV=production` (P2; acceptable for local dev).

## Gaps ranked

### P0 (block production, real money, or real PHI)

1. **Payment outcome is client-controlled.** `payOrder outcome` and tenant `resolvePending` must be replaced by server-side webhook or verification only (billing.ts:75-137).
2. **DB platform scope is self-asserted.** `hos_app` can set `app.scope='platform'`. Platform access needs a separate DB role or a verified mechanism (client.ts, 0001_rls.sql, `hos_admin_*`).
3. **No DB-level cross-tenant tests.** Two tenants, every tenant table, SELECT, INSERT, UPDATE and DELETE denial, running in CI against a throwaway DB.

### P1

4. Revoke UPDATE/DELETE on `invoices`, `invoice_lines` and `payments` (append-only plus credit notes). Move `subscriptions` and `subscription_items` writes to definer functions or the platform role.
5. Make entitlement enforcement systematic: a `requireFeature` route guard, a route-inventory test, and seat/usage limits.
6. Lock the order row (`FOR UPDATE`) in verify/fulfil and map duplicates to idempotent success. Extend Idempotency-Key to verify, fulfil and provision.
7. Audit platform-admin **reads** of tenant data, and make TOTP mandatory for platform admins.
8. Add composite FKs to `sessions`. Add FKs (tenant, user) to `data_principal_requests.created_by`, `checklist_items.done_by` and `invitations.invited_by`.

### P2

9. Audit-log anchoring outside the owner role's reach (export chain heads; split migrator from runtime owner).
10. Add scope or rate limiting to `hos_login_lookup`.
11. Add security headers (helmet, CSP, HSTS); always use `Secure` cookies behind TLS.
12. Add a reconciliation job for orders that are paid but not provisioned.

### Ownership note

- The `feat/mt-hardening` worker owns `guard.ts`, `billing.ts`, `routes/{billing,tenant,admin}.ts`, migrations 0010-0019 and the API-level two-tenant tests. That covers P0-1, P1-5, P1-6 and P1-7.
- The Claude MT session (`feat/claude-mt`) should take P0-2, P0-3, P1-4 and P1-8 at the DB layer, using migrations **0020-0029**.
