# Phase A brief — Foundations, App Admin, Setup Wizard, Mock Billing

You are leading UI and system design and implementation. Make it genuinely beautiful, modern and calm: a product a
nursing-home owner trusts on first sight and front-desk staff can use all day. Implement everything below fully (no
stubs left as TODO for in-scope items), then write `docs/PHASE_A_REPORT.md`.

## 0. Ground truth
- Module catalogue: all 27 HMIS Group I modules and all 7 Android apps from `docs/source/hmis-modules.txt`, plus CPOE
  (sheet only). Tier detail per function/report comes from `docs/source/features-by-tier.csv` (Sheet1 = source of truth;
  columns Module, Type, Function / Report Description, Status, Status Count, Basic, Medium, Premium with Y/N). 10 sheet
  modules, 112 items: Basic 66, Medium 82, Premium 112. Map sheet modules to doc modules as in PLAN.md §1 table
  ("The 27 doc modules and Android apps"). Modules without sheet detail are still in the catalogue (status "coming
  soon", configurable by App Admin).
- Android apps (later phase, but model them now as catalogue items/entitlements with their full feature lists from the
  doc — each app must eventually include everything the doc lists for it):
  A1 MIS/Dashboard (revenue MIS, material MIS, occupancy/admissions MIS & snapshots, doctors performance surgery/OP,
  patient outstanding, cost-centre profitability); A2 Equipment Maintenance (tracking non-operational equipment,
  recording problems/solutions, equipment master with down-time/financial cost); A3 Patient Portal (patient registration,
  doctor's appointments, medical data for hospital visits, accounts details, feedback); A4 Doctor's Medical Portal
  (appointment diary, medical diary with facility to order tests/medicines); A5 Nurses Workbench (doctor's order entry/view
  for investigation/medicine, vital-sign entry/view, medicine administration, diet order entry/view); A6 HR & Payroll;
  A7 Maintenance Tracker.

## 1. Monorepo & stack
- npm workspaces: `apps/web` (Next.js App Router + TypeScript + Tailwind), `apps/api` (TypeScript; NestJS or Fastify —
  your call, justify in report; OpenAPI spec generated), `packages/ui` (design system), `packages/shared` (types, zod
  schemas, entitlement keys, module catalogue), `packages/db` (schema + migrations + seed; Prisma or Drizzle — must support
  raw SQL for RLS policies).
- `docker-compose.yml` (project `hospital-os`): Postgres 16 on host port 55432, `mem_limit: 512m`, named volume, healthcheck.
  No Redis needed in Phase A (put jobs behind an interface).
- Scripts: `npm run db:up`, `db:migrate`, `db:seed`, `dev`, `build`, `test`, `lint`, `typecheck`.
- Design so Android (React Native/Expo, later) reuses `packages/shared` and the same API.

## 2. Design system & app shell (Fable leads)
- Tokens (colour incl. accessible clinical status colours, type scale, spacing, radius, elevation, motion), light + dark,
  density modes (comfortable / compact for busy front desks).
- Components: buttons, inputs, selects, combobox, date picker (DD/MM/YYYY), stepper, cards, data table (sort/filter/
  paginate), tabs, dialogs, drawers, toasts, badges, empty states, skeletons, tier/plan cards, price display (₹, en-IN),
  module tiles with enabled/locked/coming-soon states, print-friendly layout primitives (case paper, stickers, vouchers later).
- App shell: sidebar navigation driven by the tenant's entitlements (locked modules show an upgrade path), location
  switcher (multi-location), user menu, command palette (nice to have).
- A `/design` page showcasing the system. Document decisions in `docs/DESIGN_SYSTEM.md`.

## 3. Multitenancy, auth, RBAC, audit, compliance
- Tables (suggested): platform_admins, plans/tiers, modules, module_features (the 112 items + Android features),
  plan_module_features (which tier includes what), prices (per plan, per add-on module, monthly/annual, per location),
  tenants, locations, users, roles, permissions, user_location_roles, subscriptions, subscription_items, invoices,
  payments (mock), consents, audit_log.
- Tenant isolation: `tenant_id` on every tenant-owned row; Postgres RLS policies using `current_setting('app.tenant_id')`
  set per request inside a transaction; the app DB role is NOT a superuser and NOT `BYPASSRLS`; a separate migration role.
- RBAC: Tenant Admin, Location Admin, Front Desk, Doctor, Nurse, Cashier/Billing, Pharmacist, Lab Tech, Accounts;
  permissions scoped per location. Platform roles (App Admin) are separate from tenant roles.
- Entitlements: every sheet function/report = an entitlement key. Effective entitlements = plan's features + purchased
  add-ons + per-tenant overrides set by App Admin. Enforced in API (guard/middleware) and reflected in UI.
- Auth: email + password (argon2/bcrypt) plus mock OTP (code shown in dev console/log), sessions or JWT carrying tenant +
  location claims; TOTP 2FA scaffold for admins.
- Audit log: append-only (DB trigger blocks UPDATE/DELETE), hash-chained per tenant, records actor, tenant, location,
  IP, action, entity, before/after.
- DPDP Act 2023: versioned privacy notice + consent capture at signup with purpose tags; data-principal-request model
  (access/correction/erasure/grievance) scaffold; `docs/SECURITY_AND_COMPLIANCE.md` covering encryption at rest (managed
  disk + backup encryption, field-level encryption plan for identifiers via KMS), TLS, India data residency, retention,
  breach response, ABDM-readiness hooks (ABHA, HFR, HPR, FHIR R4) as optional per-tenant features.

## 4. App Admin console (platform)
- Separate area (`/admin`) for platform App Admins (seed one demo admin; credentials in README, dev only).
- Manage plans/tiers (create/edit/archive, order, display name, description, highlight), and a **plan × module × feature
  matrix editor** to choose which modules/features each tier includes (bulk toggle per module, per feature).
- Manage module catalogue: status (available / coming soon / hidden), description, add-on purchasable or not, prices
  (monthly/annual, per location), GST rate (default 18%), SAC code placeholder.
- Tenants list and detail: profile, locations, plan, add-ons, invoices, payment history, overrides (grant/revoke a module
  or feature), suspend/reactivate. All changes audited.
- Seed from `features-by-tier.csv` so the default matrix equals Sheet1 exactly (verify counts 66/82/112 in a test).
- Placeholder prices (clearly marked "placeholder — set by App Admin"), e.g. Basic ₹2,999, Medium ₹5,999, Premium ₹9,999
  per location per month, 2 months free on annual.

## 5. Setup wizard (self-onboarding)
Multi-step, resumable (progress saved server-side), with a progress stepper, validation and great empty/error states:
1. Sign up: owner or manager name, email, mobile, password, mock OTP verify, terms + DPDP privacy notice consent.
2. Facility profile: type (nursing home / clinic / hospital), legal name, display name, GSTIN (optional, validated
   format), registration/licence no., bed count, specialities, logo upload (local storage in dev).
3. Locations: add one or more (demo prefill Mumbai, Indore, Jaipur), address, state (drives GST), departments.
4. Choose plan: comparison built live from App Admin config (tier cards + expandable feature matrix), monthly/annual
   toggle, number of locations.
5. Add-on modules: enable/buy modules not in the chosen tier (from App Admin config); live price summary.
6. Review & pay: **mock Razorpay-like checkout** (UPI / card / netbanking tabs, simulated success / failure / pending,
   retry), server-side order + signature-style verification of the mock, idempotency.
7. GST tax invoice: invoice number series, supplier (placeholder GSTIN) and customer details, CGST+SGST when same state
   else IGST, SAC placeholder, downloadable PDF + printable HTML.
8. Provisioning: create tenant, locations, admin user (owner = Tenant Admin), roles, entitlements, seed sample masters
   (fake doctors/departments), then land on a **tenant dashboard** showing enabled modules, locked modules with
   "upgrade/buy" CTAs, locations, plan & invoice, and a go-live checklist.
- Post-onboarding: Billing page in tenant settings to upgrade/downgrade plan and buy add-ons (prorated, mock payment).
- Users page (basic): invite staff with role + locations (mock email), list users. (Full Users Management module is MVP.)

## 6. Tests
- Tenant isolation: with RLS, tenant A cannot read/update/delete tenant B rows even with a raw query lacking WHERE;
  app role cannot bypass RLS.
- Entitlements: plan features + add-ons + overrides compute correctly; API returns 403 for un-entitled module endpoints;
  seed matrix counts 66/82/112.
- Audit log: UPDATE/DELETE rejected; hash chain verifies.
- GST calc (intra vs inter-state), mock payment state machine, wizard happy path (API-level), plus Playwright e2e smoke
  for the wizard if time allows (keep browser installs small: chromium only).

## 7. Deliverables
- README (Windows + macOS/Linux run steps, demo logins, ports), `.env.example`, docs listed above.
- `docs/PHASE_A_REPORT.md`: what was built, screenshots list or descriptions, how to run, test results, decisions,
  deviations, known gaps, and a proposed Phase B (MVP clinical modules: Users Management, Patient Registration,
  Appointments, OPD visit, OPD billing) plan.
- Commit in logical steps throughout. Leave no dev servers or stray processes running at the end (Postgres container may
  stay up).

## Budget
This session shares a Claude Pro limit with other work. Be efficient: don't re-read large files repeatedly, avoid
needless full rebuilds, and prefer focused test runs while iterating. If you are about to run out of usage, commit what
works and write the report first.
