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
