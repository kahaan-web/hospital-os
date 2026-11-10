# Hospital OS - Parallel work contracts (Phase A)

Read with `CLAUDE.md` (rules), `docs/PHASE_A_BRIEF.md` (spec), `docs/PLAN.md`. Shared types/schemas live in
`packages/shared` and are the contract: **request bodies = zod schemas in `packages/shared/src/schemas.ts`; response
bodies = DTOs in `packages/shared/src/types.ts`.** Do not redefine them locally. If a DTO is missing a field, add it
to `types.ts` in your branch with a short note in your commit message (additive changes only, never rename/remove).

Cursor workers: ignore the "Model for this project" line in CLAUDE.md; everything else applies. Branches are reviewed (Opus) and merged in order ui-shell, api, admin-wizard, tests.

## Conventions
- API base: `http://127.0.0.1:4400/api/v1`. JSON only (except PDF/HTML invoice + multipart logo upload).
- Auth: httpOnly cookie `hos_session` (opaque session id, server-side `sessions` table). Two session kinds:
  `platform` (App Admin) and `tenant` (carries tenantId + active locationId). CSRF: require header `x-hos-csrf: 1`
  on mutations.
- Errors: `ApiErrorBody` `{ error: { code, message, fields? } }`. 400 validation (fields from `fieldErrors`), 401
  unauthenticated, 403 forbidden / not entitled (`code: 'not_entitled'`), 404, 409 conflict/idempotency, 422 business rule.
- Money: integer paise everywhere (`*Paise`). GST rates in basis points (`gstRateBp`, 1800 = 18%).
- Mutations accept optional `Idempotency-Key` header (required on order create + pay).
- Every mutation writes one `audit_log` row (actor, tenant, location, ip, action, entity, before/after).
- Tenant-scoped requests run inside a transaction with `SET LOCAL app.tenant_id = '<uuid>'` (RLS).
- Lists: `?page=1&pageSize=25&q=&sort=field:asc` -> `{ items, total, page, pageSize }`.

## Routes (api worker owns implementation; web workers code against these)
### Public / catalogue
- `GET  /health` -> `{ ok: true }`
- `GET  /catalog` -> `Catalog` (active plans with prices, modules incl. status, features, plan-feature matrix)
- `GET  /privacy-notice/current` -> `PrivacyNoticeDto`
### Auth (tenant users + platform admins)
- `POST /auth/signup` body `signupSchema` -> `{ challengeId, devCode? }` (mock OTP; devCode only if MOCK_EXPOSE_SECRETS)
- `POST /auth/otp/verify` `otpVerifySchema` -> `TenantMe` (creates session; user + draft tenant in `onboarding` state)
- `POST /auth/otp/resend` `otpResendSchema` -> `{ challengeId, devCode? }`
- `POST /auth/login` `loginSchema` -> `Me`;  `POST /auth/logout` -> 204;  `GET /auth/me` -> `Me`
- `POST /auth/switch-location` `switchLocationSchema` -> `TenantMe`
- `POST /auth/totp/setup` -> `{ otpauthUrl, secret }`; `POST /auth/totp/enable` `totpCodeSchema` -> 204 (admins)
- `POST /auth/accept-invite` `acceptInviteSchema` -> `TenantMe`
### Onboarding wizard (tenant session, tenant status `onboarding`)
- `GET  /onboarding` -> `OnboardingState` (current step + `OnboardingDraft`; resumable)
- `PUT  /onboarding/facility` `facilitySchema` -> `OnboardingState`
- `POST /onboarding/logo` multipart `file` (png/jpg/svg <= 1 MB) -> `{ logoUrl }`
- `PUT  /onboarding/locations` `locationsSchema` -> `OnboardingState`
- `PUT  /onboarding/plan` `planSelectionSchema` -> `OnboardingState`
- `PUT  /onboarding/addons` `addonSelectionSchema` -> `OnboardingState`
- `GET  /onboarding/quote` -> `QuoteDto` (lines, CGST/SGST or IGST by supplier vs first-location state, total)
- `POST /onboarding/provision` -> `ProvisioningResult` (only after a paid order; idempotent)
### Billing / mock gateway (tenant session)
- `POST /billing/orders` `createOrderSchema` -> `OrderDto` (`{ id, gatewayOrderId, amountPaise, status, keyId }`)
- `POST /billing/orders/:orderId/pay` `payAttemptSchema` -> `PayAttemptResult` (`{ payment, signature? }`)
- `POST /billing/verify` `verifyPaymentSchema` -> `OrderDto` (HMAC-SHA256(orderId|paymentId, MOCK_GATEWAY_KEY_SECRET))
- `POST /billing/payments/:paymentId/resolve` `resolvePendingSchema` -> `PaymentDto` (simulate webhook for pending)
- `GET  /billing/subscription` -> `SubscriptionDto`;  `POST /billing/change-quote` `changeConfigSchema` -> `QuoteDto` (prorated)
- `GET  /billing/invoices` -> `InvoiceListItem[]`;  `GET /billing/invoices/:id` -> `InvoiceDto`
- `GET  /billing/invoices/:id/pdf` -> application/pdf;  `GET /billing/invoices/:id/html` -> printable text/html
### Tenant app (tenant session, status `active`)
- `GET  /tenant/dashboard` -> `DashboardDto` (modules with `ModuleStateDto`, locations, plan, latest invoice, checklist)
- `PATCH /tenant/checklist/:key` `checklistToggleSchema` -> `ChecklistItemDto`
- `GET  /tenant/entitlements` -> `Entitlements` (from `computeEntitlements`)
- `GET  /tenant/locations` -> `LocationDto[]`
- `GET  /tenant/users` -> list of `UserDto`; `POST /tenant/users/invite` `inviteUserSchema` -> `{ user: UserDto, devInviteUrl? }`
- `PATCH /tenant/users/:id` `updateUserSchema` -> `UserDto`;  `GET /tenant/roles` -> `RoleDto[]`
- `GET  /tenant/audit` -> list of `AuditEntryDto`;  `GET /tenant/audit/verify` -> `AuditVerifyDto`
- `GET|POST /tenant/privacy/requests` (`dprCreateSchema`) -> `DprDto`;  `PATCH /tenant/privacy/requests/:id` `dprUpdateSchema`
- `GET  /tenant/consents` -> `ConsentDto[]`
- Module guard: any future `/tenant/m/:moduleKey/*` route uses `requireModule(moduleKey)` -> 403 `not_entitled`.
### App Admin (platform session) - prefix `/admin`
- `GET  /admin/overview` -> `AdminOverviewDto`
- `GET  /admin/plans` -> `CatalogPlan[]` (all statuses); `POST /admin/plans` `planCreateSchema`; `PATCH /admin/plans/:id` `planUpdateSchema`
- `POST /admin/plans/reorder` `planReorderSchema`;  `PUT /admin/plans/:id/price` `planPriceSchema`
- `GET  /admin/matrix` -> `{ plans, modules, features, included: {planId: featureId[]} }`; `PATCH /admin/matrix` `matrixUpdateSchema`
- `GET  /admin/modules` -> `CatalogModule[]`; `PATCH /admin/modules/:id` `moduleUpdateSchema`; `POST /admin/modules/:id/features` `featureCreateSchema`
- `GET  /admin/tenants` -> list of `AdminTenantListItem`; `GET /admin/tenants/:id` -> `AdminTenantDetailDto`
- `POST /admin/tenants/:id/overrides` `overrideSchema` -> `OverrideDto`; `DELETE /admin/tenants/:id/overrides/:overrideId`
- `POST /admin/tenants/:id/suspend` `suspendSchema`;  `POST /admin/tenants/:id/reactivate`
- `GET|PUT /admin/settings` `platformSettingsSchema` -> `PlatformSettingsDto`
- `GET  /admin/audit` -> list of `AuditEntryDto` (platform scope)
- OpenAPI JSON at `GET /api/docs/json` (generated from zod).

## Web route map (Next.js App Router, `apps/web/src/app`)
- `/` marketing landing (plans from `/catalog`, CTA "Start setup") ; `/login` ; `/design` design-system showcase
- `/onboarding` wizard shell with `Stepper` (8 steps, resumes from `GET /onboarding`):
  `/onboarding/signup` (1, + OTP verify) -> `/onboarding/facility` (2) -> `/onboarding/locations` (3) ->
  `/onboarding/plan` (4) -> `/onboarding/addons` (5) -> `/onboarding/checkout` (6, mock Razorpay-style modal:
  UPI/Card/Netbanking tabs, simulate success/failure/pending, retry) -> `/onboarding/invoice` (7) ->
  `/onboarding/provisioning` (8, progress then redirect to `/app`)
- `/app` tenant shell (sidebar from entitlements, location switcher, user menu): `/app` dashboard, `/app/modules`,
  `/app/modules/[key]` (enabled placeholder or locked upsell), `/app/settings/billing` (upgrade/add-ons, prorated mock
  checkout, invoices), `/app/settings/users`, `/app/settings/privacy`, `/app/settings/audit`
- `/admin` (App Admin shell): `/admin` overview, `/admin/plans`, `/admin/plans/[id]`, `/admin/matrix` (plan x module x
  feature editor, bulk toggle per module), `/admin/modules`, `/admin/modules/[id]`, `/admin/tenants`,
  `/admin/tenants/[id]` (overrides, suspend), `/admin/settings`, `/admin/audit`
- Web calls the API through `apps/web/src/lib/api.ts` (fetch wrapper, `credentials: 'include'`, csrf header, typed with
  shared DTOs). Dev: Next rewrites `/api/v1/*` -> `http://127.0.0.1:4400/api/v1/*`.

## Ownership (one worker per worktree; touch only your paths)
| Worker | Branch | Owns | May touch read-only / additive |
|---|---|---|---|
| ui-shell (claude-sonnet-5-5-high) | feat/ui-shell | `packages/ui/**`, `apps/web/` config (next.config, tailwind/postcss, tsconfig, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/design/**`, `src/components/shell/**`), `docs/DESIGN_SYSTEM.md` | `packages/shared` (additive) |
| api (claude-opus-5-5-high) | feat/api | `apps/api/**`, `packages/db/**` (schema, migrations, RLS SQL, seeds), `docs/SECURITY_AND_COMPLIANCE.md`, `.env.example` | `packages/shared` (additive) |
| admin-wizard (composer-2.5) | feat/admin-wizard | `apps/web/src/app/{page.tsx,login,onboarding,admin,app}/**`, `apps/web/src/lib/**`, `apps/web/src/features/**` | `packages/ui` (use, don't restyle) |
| tests (grok-4.7-high) | feat/tests | `tests/**`, `vitest.config.ts`, `**/*.test.ts`, `apps/web/e2e/**`, `apps/web/playwright.config.ts` | anything, read-only |

Root `package.json` / lockfile: only add deps to your own workspace's package.json; reviewer reconciles the lockfile.

## Tenancy, RLS & auth design (authoritative)
Implement exactly this; it wins over comments in `schema.ts`/`client.ts`. SQL lives in hand-written `migrations/0001_rls.sql`.

### 1. Roles and grants
- **superuser**: bootstrap only (DB, roles, connect/schema grants, `ALTER ROLE hos_app SET statement_timeout='10s'` and `SET idle_in_transaction_session_timeout='15s'`).
- **hos_migrator**: owns schema, tables, sequences and every `SECURITY DEFINER` function; runs migrations + seeds. NOSUPERUSER
  NOBYPASSRLS. `FORCE ROW LEVEL SECURITY` applies RLS to the owner too, so each table gets `<t>_owner TO hos_migrator USING
  (true) WITH CHECK (true)` (no extra risk: an owner can disable RLS anyway).
- **hos_app**: runtime. NOSUPERUSER NOBYPASSRLS NOINHERIT, member of nothing. Explicit per-table grants in 0001 (no default
  privileges, so new tables are deny-by-default); `USAGE` on `audit_log_id_seq`; definer functions `REVOKE … FROM PUBLIC`, `GRANT EXECUTE TO hos_app`.

### 2. Table classification (every table in schema.ts)
| Class | Tables | hos_app access |
|---|---|---|
| **G** global-readable catalogue (no tenant_id) | plans, modules, module_features, plan_module_features, prices, privacy_notices, permissions, platform_settings | SELECT always; INSERT/UPDATE/DELETE only when `app.scope='platform'` |
| **G\*** hybrid catalogue | roles (`tenant_id NULL` = system), role_permissions (via `roles`) | read system + own tenant's; write system only in platform scope, own non-system roles in tenant scope |
| **PA** platform, scope-gated | platform_admins | SELECT, UPDATE(name,password_hash,totp_secret,totp_enabled,last_login_at,status) only when `app.scope='platform'` |
| **PI** platform-internal | sessions, invoice_sequences, `_migrations` | **no grants**; only through definer functions (§4) |
| **T** tenant-owned | tenants (key = `id`), locations, departments, doctors, users, user_location_roles, invitations, otp_challenges, subscriptions, subscription_items, orders, payments, invoices, invoice_lines, consents, data_principal_requests, checklist_items, outbox_messages, **idempotency_keys** (new, §7) | full CRUD on own rows (tenants: no DELETE) |
| **T-ro** tenant-readable, platform-written | tenant_entitlement_overrides | SELECT own rows; writes need own tenant **and** `app.scope='platform'` |
| **A** audit | audit_log (`tenant_id` NULL = platform chain) | SELECT + INSERT only (§6) |
- Rule: every T table has `tenant_id uuid NOT NULL REFERENCES tenants(id)`; children reference parents by **composite**
  `(tenant_id, parent_id)` FK (fix 2, §9). RLS is tenant-level only; location scoping inside a tenant is RBAC in the API.

### 3. RLS SQL
```sql
CREATE FUNCTION hos_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$; -- unset -> NULL -> no rows
CREATE FUNCTION hos_scope() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('app.scope', true), ''), 'none') $$;
-- Template T (replace tenant_id with id for `tenants`):
ALTER TABLE t ENABLE ROW LEVEL SECURITY;  ALTER TABLE t FORCE ROW LEVEL SECURITY;
CREATE POLICY t_owner  ON t TO hos_migrator USING (true) WITH CHECK (true);
CREATE POLICY t_tenant ON t TO hos_app USING (tenant_id = (SELECT hos_tenant_id())) WITH CHECK (tenant_id = (SELECT hos_tenant_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON t TO hos_app;
-- Template G:  t_read FOR SELECT TO hos_app USING (true);  t_admin FOR ALL TO hos_app USING (hos_scope()='platform') WITH CHECK (hos_scope()='platform')
-- T-ro: t_read FOR SELECT USING (tenant match); t_admin FOR ALL USING (tenant match AND hos_scope()='platform') WITH CHECK (same)
-- roles: read (tenant_id IS NULL OR tenant_id = hos_tenant_id()); write (tenant_id IS NULL AND hos_scope()='platform') OR (tenant_id = hos_tenant_id() AND NOT is_system)
-- role_permissions: read EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id) (inner query is RLS-filtered); write: same EXISTS + roles write condition on r
-- user_location_roles: WITH CHECK adds AND EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id)
```
- `tenants_guard` BEFORE UPDATE trigger: changing `status` to/from `suspended`, `suspended_*` or `sandbox` raises unless platform scope.
- **No BYPASSRLS anywhere.** Cross-tenant needs (pre-tenant lookups, admin aggregates, the invoice counter) are `SECURITY
  DEFINER` functions owned by hos_migrator, `SET search_path = pg_catalog, public`, fixed inputs, minimal outputs (ids, not
  rows). Why: a bypass role makes a whole code path tenant-blind; this confines cross-tenant reach to ~10 reviewed SQL bodies
  that answer only "which tenant owns this exact secret/email". Admin work on **one** tenant uses `withPlatformOnTenant`.
- Limit (state it in SECURITY_AND_COMPLIANCE.md): hos_app sets its own GUCs, so RLS stops app bugs, not a compromised API process.

### 4. Definer functions (all `REVOKE … FROM PUBLIC; GRANT EXECUTE … TO hos_app`)
| Function | Guard inside | Returns |
|---|---|---|
| `hos_session_resolve(token_hash text)` | none (needs the secret) | one row: id, kind, user_id, platform_admin_id, tenant_id, location_id, expires_at; only if not revoked, not expired and `last_seen_at` within the idle limit for its kind (§5); bumps `last_seen_at` if > 60 s old |
| `hos_session_create(token_hash, kind, user_id, admin_id, location_id, ip, ua)` | tenant kind: `hos_scope()='tenant'`, tenant_id **taken from `hos_tenant_id()`**, user active in it; platform kind: `hos_scope()='platform'`, admin active; `expires_at` from the per-kind constant | uuid |
| `hos_session_set_location(token_hash, location_id)` | tenant scope, session.tenant_id = hos_tenant_id(), location in that tenant | void |
| `hos_session_revoke(token_hash)` / `hos_session_revoke_user(user_id)` | none / tenant scope + user in tenant | void |
| `hos_login_lookup(email text)` | exact `lower(email)` match | (tenant_id, user_id) or no row |
| `hos_otp_tenant(challenge_id uuid)` / `hos_invite_tenant(token_hash)` | unconsumed/pending and unexpired | tenant_id or no row |
| `hos_admin_tenant_list(q, status, lim, off)` / `hos_admin_overview()` | `hos_scope()='platform' AND hos_tenant_id() IS NULL` else raise | rows of `AdminTenantListItem` + total / jsonb `AdminOverviewDto` |
| `hos_next_invoice_number(issue_date date)` | scope tenant or platform | (fy, number), §8 |
- Signup needs no definer: `tenantId = randomUUID()`, `withTenant(tenantId)`, insert tenant (WITH CHECK passes), user, `tenant_admin`
  assignment (location NULL), consent, OTP, audit. Duplicate email = 23505 (constraints are global) → 409 `email_taken`.
- Login: `hos_login_lookup` → `withTenant` → verify hash → `hos_session_create`; admin login in `withPlatform`. OTP verify/resend
  and accept-invite: `hos_otp_tenant` / `hos_invite_tenant` → `withTenant`.

### 5. Request lifecycle
1. Cookie `hos_session` = base64url(32 random bytes), DB keeps sha256 hex; httpOnly, SameSite=Lax, Secure in prod. Absolute/idle:
   tenant 12 h / 2 h, platform 8 h / 30 min (SQL constants). New token per login; logout and user disable revoke.
2. `hos_session_resolve` (one autocommit statement) → claims, else 401 `unauthenticated`; mutation without `x-hos-csrf: 1` → 403 `csrf`.
3. One tx per request, READ COMMITTED (required by §6). `withTenant(db, tenantId, fn)`: `set_config('app.scope','tenant',true),
   set_config('app.tenant_id',$id,true)`; `withPlatform`: scope `platform`, tenant_id `''`; new `withPlatformOnTenant(db,
   tenantId, fn)`: scope `platform` + target tenant. UUID-validate first. Handler, audit and idempotency rows share the tx.
4. Order inside the tx: tenant status (`suspended` → 403 `tenant_suspended` except `/auth/me|logout`; `onboarding` → only
   `/auth/*`, `/onboarding/*`, `/billing/*`, else 403 `onboarding_incomplete`) → user active (else 401) → location (session's if
   the user has a role there or a NULL-location role, else the first permitted one, saved via `hos_session_set_location`) →
   `requireModule(key)` (a tenant-level fact, so the UI can always show the upsell) → `requirePermission(perm)` at that location.
5. 403 body `{ error: { code: 'not_entitled'|'forbidden'|'tenant_suspended'|'onboarding_incomplete'|'csrf', message,
   details?: { moduleKey } | { permission } } }`. Another tenant's id is invisible under RLS → **404**, never 403.
- Pool hygiene: only `set_config(…, true)`, never `SET`; only `packages/db/src/client.ts` touches `pool`; no external I/O in a tx.

### 6. Audit log
- App supplies tenant_id, location_id, actor_type (`user|platform_admin|system`), actor_id, actor_label, ip, user_agent, action
  (`domain.entity.verb`), entity_type, entity_id, before, after. Never log password hashes, OTPs, tokens, TOTP secrets, signatures.
- Append-only: `GRANT SELECT, INSERT`; policies FOR SELECT and FOR INSERT only, both `tenant_id = hos_tenant_id() OR (tenant_id
  IS NULL AND hos_scope()='platform')`; BEFORE UPDATE/DELETE (row) + BEFORE TRUNCATE triggers raise (stops hos_migrator too).
- Chain trigger `audit_log_chain` BEFORE INSERT, plpgsql, VOLATILE, SECURITY DEFINER; overwrites client values:
```sql
NEW.chain_key := coalesce(NEW.tenant_id::text, 'platform');  NEW.created_at := now();
PERFORM pg_advisory_xact_lock(hashtext('hos_audit'), hashtext(NEW.chain_key));        -- serialise per chain until commit
SELECT seq, hash INTO p_seq, p_hash FROM audit_log WHERE chain_key = NEW.chain_key ORDER BY seq DESC LIMIT 1;
NEW.seq := coalesce(p_seq, 0) + 1;  NEW.prev_hash := coalesce(p_hash, repeat('0', 64));
NEW.hash := encode(sha256(convert_to(hos_audit_canonical(NEW), 'UTF8')), 'hex');      -- built-in sha256, no pgcrypto
```
  Canonical JSON: `hos_audit_canonical(a audit_log) RETURNS text` = `jsonb_build_array(a.chain_key, a.seq, a.prev_hash,
  a.tenant_id, a.location_id, a.actor_type, a.actor_id, a.actor_label, a.ip, a.user_agent, a.action, a.entity_type,
  a.entity_id, a.before, a.after, to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text` (jsonb
  text is key-sorted and whitespace-normalised, so deterministic; `id` excluded). READ COMMITTED gives the SELECT a fresh
  snapshot after the lock; unique `(chain_key, seq)` is the backstop.
- Tenant chain = tenant actions **and** App Admin actions on that tenant (overrides, suspend). Platform chain = catalogue, matrix, prices, settings, admin auth.
- Verify (`GET /tenant/audit/verify`; add `GET /admin/audit/verify` for `platform`): keyset-page 1000 rows of `SELECT seq,
  prev_hash, hash, hos_audit_canonical(a) c FROM audit_log a WHERE chain_key=$1 ORDER BY seq`; in Node check seq = prev + 1
  from 1, prev_hash = previous hash (genesis 64 zeros), sha256_hex(c) = hash. First failure → `{ ok:false, entries, brokenAtSeq }`.
  Known gap: tail deletion needs an external anchor (Phase B). Failed mutations roll back their audit row; security failures
  (bad signature/OTP) commit only an audit row.

### 7. Mock gateway and idempotency
- Ids `order_`/`pay_` + 14 random base62 (`public_id`). `keyId` = env `MOCK_GATEWAY_KEY_ID`; `MOCK_GATEWAY_KEY_SECRET` dev value in
  `.env.example`, never logged/returned. Signature = lowercase hex `HMAC_SHA256(key=secret, msg=order.public_id + '|' +
  payment.public_id)`, compared with `timingSafeEqual` after a length check; `verifyPaymentSchema` ids are public ids.
- Order create: quote recomputed server-side (never client amounts); total must be > 0 else 422 `no_payment_due`; other open
  (`created|attempted`) orders of the same tenant + purpose → `cancelled`.
- Pay attempt (gateway side, `billing.ts` transitions): order `created|attempted` (else 409 `order_closed`), no `pending`
  payment (else 409 `payment_pending`). `success` → payment `captured`, order `paid`, signature returned; `failure` → `failed`
  (+ failure_code/reason), order `attempted`; `pending` → `pending`, order `attempted`.
- `POST /billing/verify` (merchant side; fix the `/billing/payments/verify` comment in types.ts): captured + valid signature →
  `signature_verified=true` → fulfil once if `fulfilled_at` NULL (invoice; apply change; onboarding provisioning stays in
  `/onboarding/provision`) → set `fulfilled_at`. Repeats return the same OrderDto. Bad signature → 400 `signature_invalid`.
- `POST /billing/payments/:id/resolve` (trusted mock webhook), pending only (else 409 `payment_not_pending`): `success` +
  open order → captured, paid, verified, fulfilled; `success` + closed order → `failed`, `failure_code='order_closed'`
  (mock auto-refund); `failure` → failed.
- `idempotency_keys(tenant_id, scope /* 'POST /billing/orders/:id/pay' */, key, request_hash, response_status, response_body
  jsonb, created_at, expires_at +24 h, PK (tenant_id, scope, key))`, template T. Key `^[A-Za-z0-9_-]{8,128}$`; required on
  order create + pay (400 `idempotency_key_required`), optional on other tenant mutations, ignored on platform routes;
  request_hash = sha256(canonical JSON of path params + body). Before the handler, in the request tx: `INSERT … ON CONFLICT DO
  NOTHING` (waits on a concurrent holder). Inserted → run handler, store the 2xx response in the same tx; non-2xx → the key
  row is rolled back or deleted. Conflict → same hash: replay with `Idempotent-Replayed: true`; else 409 `idempotency_mismatch`.

### 8. Invoice numbering
- One supplier-wide series per Indian FY (1 Apr–31 Mar by issue date in Asia/Kolkata); `fy` = `2026-27`. GST Rule 46 caps
  the number at **16 chars**, so `HOS/2026-27/000001` (18) is invalid. Format `{prefix}/{yy}{yy}/{6-digit seq}` →
  `HOS/2627/000001` (15); prefix max 4 (fix 7).
- `hos_next_invoice_number`: `INSERT INTO invoice_sequences(fy, last_no) VALUES ($fy, 1) ON CONFLICT (fy) DO UPDATE SET last_no =
  invoice_sequences.last_no + 1 RETURNING last_no`. The row lock is held to commit and a rollback restores it → no gaps, no
  duplicates. Call it right before the invoice insert, last in the tx. Invoices are never deleted (credit notes later).

### 9. schema.ts fixes (api worker)
1. Add `idempotency_keys` (§7) and CHECK constraints on every enum-like `text` status/kind/type column.
2. **Cross-tenant FK hole**: FK checks ignore RLS, so A can reference B's `location_id` today. Add `UNIQUE (tenant_id, id)` on
   locations, users, subscriptions, orders, payments, invoices; composite FKs `(tenant_id, x_id)` from departments, doctors,
   user_location_roles, invitations, otp_challenges, consents, subscription_items, payments, invoices, invoice_lines.
3. `users.email`: unique on `lower(email)` (not plain unique). `sessions`: FKs to users/platform_admins/tenants/locations,
   index `expires_at`, CHECK `(kind='tenant' AND user_id IS NOT NULL AND tenant_id IS NOT NULL AND platform_admin_id IS NULL)
   OR (kind='platform' AND platform_admin_id IS NOT NULL AND user_id IS NULL AND tenant_id IS NULL)`.
4. `payments`: partial unique `(order_id) WHERE status='captured'` and `… WHERE status='pending'`; CHECK amount > 0.
   `invoices`: `UNIQUE (order_id)`, CHECK `char_length(number) <= 16`. `locations`: partial unique `(tenant_id) WHERE is_primary`.
5. `tenant_entitlement_overrides`: CHECK `(target='module' AND module_id IS NOT NULL AND feature_id IS NULL) OR (target='feature' AND feature_id IS NOT NULL AND module_id IS NULL)`.
6. `client.ts`: add `withPlatformOnTenant`, UUID-validate ids; the `withPlatform` comment must say it sees **no** tenant rows.
   `audit_log` chain defaults are placeholders (trigger sets them). `updated_at` is never bumped: set it on update.
7. `schemas.ts` `invoicePrefix` → `^[A-Z0-9]{2,4}$` (§8).

### 10. Test plan (tests worker; real Postgres; connect as hos_app except where noted)
- Catalog guard: `pg_roles` shows hos_app/hos_migrator `rolsuper=false, rolbypassrls=false`; every `public` table except
  `_migrations` has `relrowsecurity AND relforcerowsecurity`; every table with a `tenant_id` column has a policy using `hos_tenant_id()`.
- Seed A and B with a row in every T table; per table (parametrised) in `withTenant(A)`: `SELECT count(*)` with no WHERE → A's
  rows only; UPDATE/DELETE by B's id → rowCount 0, B unchanged (checked as superuser); INSERT `tenant_id=B` or UPDATE to B → 42501.
- No context, `app.tenant_id=''`, or platform scope without target → 0 tenant rows, INSERT fails; garbage id → error. hos_app
  cannot `SET ROLE hos_migrator`, disable RLS, or read sessions/invoice_sequences/`_migrations` (42501); `SET row_security=off` → error.
- In A: department with B's location_id → 23503; overrides write → 42501 (ok in `withPlatformOnTenant(A)`); setting
  `tenants.status='suspended'` raises. Admin list/overview raise outside platform scope; `hos_session_create` for B's user
  while in A raises; `hos_session_resolve` with expired/revoked/unknown hash → no row.
- Pool leak: pool `max: 1`; after `withTenant(A)` a plain query sees `current_setting('app.tenant_id', true)` empty. API: A's
  session on B's ids → 404; tenant session on `/admin/*` → 403; un-entitled → 403 `not_entitled`; no permission → 403 `forbidden`.
- Audit: UPDATE/DELETE/TRUNCATE as hos_app → 42501, as hos_migrator → trigger error. N inserts → seq 1..N, genesis prev_hash,
  verify ok; client-supplied seq/hash/prev_hash/chain_key/created_at overwritten; 20 concurrent tx on one chain → contiguous,
  verifies; A and B chains each start at 1; A cannot read/insert B or platform rows. As superuser with `session_replication_role
  = replica`: edit `after` at seq k → `brokenAtSeq = k`; delete seq k → `k+1`. Each mutation route writes exactly one row; failures none.
- Billing: signature valid/tampered/wrong length; same key + body → same order with replay header, different body → 409, two
  concurrent → one order; double verify → one invoice; resolve on closed order → `order_closed`.
- Invoices: 20 concurrent fulfilments → 000001..000020 with no gaps/duplicates; rolled-back tx uses no number; 31/03 23:59 IST →
  2025-26, 01/04 00:00 IST → 2026-27; all numbers ≤ 16 chars.
