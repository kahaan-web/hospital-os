# Phase A report - Foundations, App Admin, Setup Wizard, Mock Billing

Working name **Hospital OS**. All data is mock/sample; no real gateway, SMS or email. Prices are sample prices.

## What was built
- **Monorepo** (npm workspaces): `apps/web` (Next.js 15 App Router + Tailwind v4), `apps/api` (Fastify 5 + zod type
  provider, OpenAPI at `/api/docs/json`, `apps/api/openapi.json`), `apps/mobile` (Expo / React Native, expo-router),
  `packages/ui` (design system), `packages/shared` (catalogue, entitlements, billing/GST, RBAC, zod schemas, DTOs,
  mobile DTOs, i18n), `packages/db` (Drizzle schema, SQL migrations 0000-0003, seeds).
- **Catalogue**: 27 HMIS Group I modules + 7 Android apps + CPOE; 112 sheet functions/reports from Sheet1 with the
  default tier matrix Basic 66 / Medium 82 / Premium 112 (seeded and asserted in tests).
- **Multitenancy**: `tenant_id` on every tenant-owned row with composite `(tenant_id, id)` foreign keys; Postgres RLS
  ENABLE + FORCE on every tenant table, keyed on `current_setting('app.tenant_id')` set per request with `SET LOCAL`;
  runtime role `hos_app` and owner `hos_migrator` are both NOSUPERUSER / NOBYPASSRLS; narrow SECURITY DEFINER functions
  for the few cross-tenant operations (session lookup, admin tenant list, invoice counter).
- **Auth & RBAC**: argon2 passwords, httpOnly cookie sessions, CSRF header, mock OTP, TOTP scaffold for admins,
  9 tenant roles scoped per location, separate platform App Admin; privilege-escalation guards on user management.
- **Audit log**: append-only (trigger blocks UPDATE/DELETE/TRUNCATE), hash-chained per tenant plus a platform chain
  using built-in `sha256`, verify endpoint; every mutation writes one row.
- **App Admin console** (`/admin`): overview, plans (create/edit/archive/reorder/price), plan x module x feature matrix
  editor with bulk toggles and an unsaved-changes bar, module catalogue (status, add-on purchasable, prices, GST rate,
  SAC), tenants list/detail (overrides grant/revoke with reason, suspend/reactivate, invoices, payments), settings, audit.
- **Setup wizard** (`/onboarding/*`, 8 steps, resumable server-side): sign up + mock OTP + DPDP consent, facility
  profile (GSTIN check, logo upload with SVG sanitising), locations (Mumbai/Indore/Jaipur prefill, GST state codes),
  plan comparison from live App Admin config (monthly/annual, location count), add-ons with live price summary,
  mock Razorpay-style checkout (UPI/card/netbanking; success/failure/pending + resolve; HMAC signature verify;
  idempotency keys), GST tax invoice (gap-free per-FY series `HOS/2627/000001`, CGST+SGST intra-state or IGST,
  PDF + printable HTML), provisioning to an active tenant and the tenant dashboard.
- **Tenant app** (`/app`): entitlement-driven sidebar with locked modules and upgrade paths, dashboard with go-live
  checklist, module pages, billing (prorated plan/add-on changes, invoices), users (invite with role + locations),
  privacy (data-principal requests, consents), audit.
- **Android app** (`apps/mobile`): login, role-based home, Patient portal (A3: appointments + booking, visits, bills,
  profile, feedback) and Doctor portal (A4: appointment diary, visit detail, order tests/medicines) on a typed client
  with mock and HTTP implementations; role-gated placeholder sections for A1, A2, A5, A6 and A7 listing every feature the
  module doc names. Proposed patient/doctor API in `apps/mobile/API_PROPOSAL.md`.
- **Design**: `docs/DESIGN_GUIDE.md` (one teal accent #0E6B66, tinted neutrals, IBM Plex Sans + Devanagari fallback,
  4/8 spacing, 6-8px radius, hairline borders, keyboard-first, Indian formats, WCAG AA); `/design` showcase;
  `docs/DESIGN_SYSTEM.md`.
- **Demo**: `npm run demo` (db up, migrate, seed, demo seed, API 4400 + web 3400). Demo group "Sunrise Care Hospitals"
  with Mumbai/Indore/Jaipur, staff logins for every role, 45 realistic but fictional sample patients (flagged sample,
  DEMO- UHIDs, 00- ABHA ids, @sbx emails, +91 90000 mobiles). Logins are in the README.

## How to run
See `README.md`. Short version: `npm install`, `npm run demo`, open http://localhost:3400. `npm run smoke` runs the
API + isolation smoke test.

## Verification (on the Dell, main)
- `npm run typecheck`: all 6 workspaces pass. `npm run build`: API (tsup) and web (27 pages) build.
- `npm run demo` + end-to-end smoke through the web origin: 7 pages 200; 28/28 API checks - admin login and matrix
  66/82/112, demo owner dashboard, full wizard signup -> OTP -> facility -> locations -> plan -> add-ons -> quote ->
  order -> pay failure -> pay success -> verify -> provision -> invoice (CGST+SGST) -> PDF -> dashboard; audit chain
  verifies; cross-tenant invoice read returns 404.
- Test suite: 88/88 pass on an isolated `hos_test` database, none skipped - shared unit tests, two-tenant RLS isolation on every
  tenant table, role flags, audit append-only and tamper detection, invoice GST intra/inter-state and numbering,
  payment state machine and idempotency, wizard happy path via `buildApp().inject`. API security tests: 7/7.
- `npm run lint`: 0 errors (1 warning) with the root `eslint.config.mjs`.
- Playwright: wizard e2e passes; a client error on `/onboarding/invoice` found by the e2e is being fixed on
  `feat/invoice-fix`.

## Status at merge (main, 11 Nov 2026 ~02:25 IST)
- Multitenancy audit (`docs/MULTITENANCY_AUDIT.md`) merged. Hardening in progress on Cursor workers: server-decided
  payment outcome (no client self-capture), `requireFeature` on every tenant route with a route-inventory test, seat
  limits, `FOR UPDATE` + idempotency on money routes, revoke UPDATE/DELETE on financial tables, subscription writes
  (migrations 0020-0023), missing composite FKs (0024-0025). DB-level RLS tests on `feat/claude-mt`.
- Phase B B0 (clinical foundations) in final fix round before merge.

## Decisions
- Fastify over NestJS: smaller footprint on a shared 32 GB machine, zod-first schemas shared with web/mobile, simple
  per-request transaction hooks for RLS. Drizzle for schema + typed queries, hand-written SQL migrations for RLS,
  triggers and SECURITY DEFINER functions.
- Invoice number format shortened to `HOS/2627/000001` (GST Rule 46 allows 16 characters).
- Healthcare-service GST exemption applies to clinical billing (Phase B); SaaS subscription invoices carry 18% GST.
- Models: Cursor workers on composer-2.5, grok-4.7-high and Grok 4.6 for implementation; Opus (Cursor) only for the
  tenancy/RLS design pass, early pre-merge reviews and the Phase B plan. From 01:04 IST, Cursor runs composer-2.5 and
  grok-4.7-high only; reviews are done by the orchestrator against the review checklist.

## Known gaps
- Hindi strings not yet translated (dictionary structure in place).
- Field-level encryption via KMS and audit-chain tail anchoring are designed (SECURITY_AND_COMPLIANCE.md), not built.
- ABDM (ABHA/HFR/HPR/FHIR) is hooks only. Real payment gateway, SMS and email are mock implementations behind interfaces.
- Mobile app runs against mock data until the Phase B patient/doctor API (B10) lands; no emulator build yet.

## Phase B
Planned in `docs/PHASE_B_PLAN.md`: B0 shared clinical foundations (patients/UHID, encounters, numbering, print), then
B1-B11 - patient registration, appointments/OPD, doctor workspace and CPOE, ADT and beds, OP and IP billing, pharmacy,
lab, nurse workbench, mobile portal API and screens - in waves of 3-5 parallel workers, each reviewed before merge.
