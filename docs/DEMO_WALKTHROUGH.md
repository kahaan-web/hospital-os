# Demo walkthrough (web-polish FIX round)

Stack for this verification: API `http://127.0.0.1:4410`, web `http://127.0.0.1:3410` (reviewer defaults remain **4400 / 3400** with no `.env.local`). Worker uses `apps/web/.env.local` → `HOS_API_ORIGIN=http://127.0.0.1:4410`. Database: `hospital_os` on Postgres **55432** (shared).

## Credentials (seed)

| Role | Email | Password |
| --- | --- | --- |
| App Admin | `admin@hospitalos.test` | `Admin@12345` |
| Demo tenant owner | `owner@sunrise.demo` | `Demo@12345` |

---

## 1. Marketing landing

| Step | URL | Expected | Result |
| --- | --- | --- | --- |
| Load home | `http://127.0.0.1:3410/` | Plan cards from `/catalog`, “Sample price” badges, CTA “Start setup” | **PASS** (`GET /` HTTP 200 after fixing incomplete `lucide-react` in `node_modules`; API rewrite health **PASS**) |

---

## 2. App Admin console

| Step | URL / action | Expected | Result |
| --- | --- | --- | --- |
| Sign in | `http://127.0.0.1:3410/login?admin=1` | Platform session, redirect `/admin` | **not verified** in browser |
| Overview | `/admin` | Stats, plan mix, tenant list | **PASS** (`npm run smoke` with `API_URL=http://127.0.0.1:4410`: `GET /admin/overview`) |
| Plans | `/admin/plans` | Tier list, INR monthly/annual | **PASS** (smoke: admin login + overview; plans route unchanged) |
| Matrix | `/admin/matrix` | Plan × module grid, save PATCH | **not verified** in browser |
| Modules | `/admin/modules` | Catalogue, add-on sample prices in table | **not verified** in browser |
| Tenant detail | `/admin/tenants` → Sunrise | Overrides, invoices, payments | **PASS** (smoke: App Admin lists hospitals) |

---

## 3. New hospital signup wizard

| Step | URL | Expected | Result |
| --- | --- | --- | --- |
| Sign up | `/onboarding/signup` | Privacy notice, mock OTP shows `devCode` when `MOCK_EXPOSE_SECRETS=true` | **PASS** (smoke: throwaway signup + OTP verify) |
| Facility | `/onboarding/facility` | GSTIN normalises on blur; empty bed count saves as `null` | **PASS** (API: `PUT /onboarding/facility` with `bedCount: null` → step `locations`; `bedCount: 0` accepted) |
| Locations | `/onboarding/locations` | “Prefill Mumbai, Indore, Jaipur” | **not verified** in browser |
| Plan | `/onboarding/plan` | “Sample price” on plan cards | **not verified** in browser |
| Add-ons | `/onboarding/addons` | Per-module price, Added / Not added toggle | **not verified** in browser (UI fix in code review) |
| Checkout | `/onboarding/checkout` | Server quote, mock Razorpay modal | **not verified** in browser |
| Payment outcomes | Modal tabs | Success → invoice; failure message; pending → resolve | **not verified** in browser |
| Invoice | `/onboarding/invoice` | PDF link; print opens full HTML invoice tab | **not verified** in browser (print now uses `/billing/invoices/:id/html` in a new window) |
| Provisioning | `/onboarding/provisioning` | Progress then `/app` | **not verified** in browser |

Automated slice: `polish.fix.*@example.test`, OTP verify, facility `bedCount: null` → API `step=locations`.

---

## 4. Demo tenant application

| Step | URL | Expected | Result |
| --- | --- | --- | --- |
| Sign in | `/login` | `owner@sunrise.demo` → `/app` | **PASS** (smoke: sunrise owner login + dashboard) |
| Dashboard | `/app` | Checklist, latest sample invoice, modules | **PASS** (smoke: `GET /tenant/dashboard`, 3 locations) |
| Billing | `/app/settings/billing` | Change plan/add-ons, invoices list | **PASS** (smoke: `GET /billing/subscription`, `GET /billing/invoices`) |
| Users invite | `/app/settings/users` | Invite staff (mock dev URL) | **not verified** in browser (`GET /tenant/users` smoke partial: 6 users, expected 7 roles seed) |
| Audit | `/app/settings/audit` | Append-only trail | **PASS** (smoke: audit chain verifies) |

---

## 5. API bugs found

Smoke on 4410: **34 passed, 3 failed** — seed/account issues, not web-polish regressions (`frontdesk.indore@sunrise.demo` credentials, staff role count). No new entry in `docs/API_BUGS.md`.

---

## 6. Build checks

| Command | Result |
| --- | --- |
| `npx tsc --noEmit -p apps/web` | **PASS** (exit 0, 2026-11-11 fix round) |
| `npx tsc --noEmit -p packages/shared` | **PASS** (exit 0) |
| `npx tsc --noEmit -p packages/ui` | **PASS** (exit 0) |
| `npm run lint -w @hos/web --if-present` | **PASS** (no ESLint config in web workspace; script no-op) |

---

## Opus must-fix coverage (this round)

| Item | Addressed |
| --- | --- |
| API default **4400** in `next.config.ts` / `.env.example`; worker `.env.local` → 4410 | Yes |
| Facility blank bed count → `null`, not `NaN` | Yes (`facilitySchema.bedCount` nullable + client parse) |
| Add-on tiles: Added / Not added (not Locked / Enabled) | Yes (`ModuleTile` selection picker + badges) |
| Null add-on price → “Price not set” | Yes (`wizard.priceNotSet`) |
| Print CSS scoped to invoice wizard | Yes (`body:has(.hos-invoice-print-area)`) |
| Print full invoice HTML (not iframe / `window.print()` on parent) | Yes (opens `/html` tab) |
| Typed `wt()` with recursive keys | Yes (`WebMessageKey` / `Leaves<>`) |
| Wizard hard-coded strings → i18n | Yes (signup, provisioning, plan, locations, facility, invoice, quote summary) |
| `onboarding-steps` labels at render time | Yes (`getWizardRoutes()`) |
| GSTIN checksum soft warning | Yes |
| Plain-language plan / invoice descriptions | Yes |
| Document parallel translator vs `@hos/shared` | Yes (comment in `src/i18n/index.ts`) |

---

## Notes for Kahaan

- Reviewer clone: web **3400**, API **4400**, no env file required.
- This worktree demo: copy `apps/web/.env.example` pattern into `.env.local` with `HOS_API_ORIGIN=http://127.0.0.1:4410`; API `$env:API_PORT='4410'`, web `next dev -p 3410`.
- Catalogue money remains labelled **Sample price**; null catalogue add-on prices show **Price not set**.
- If `next dev` errors with `Can't resolve 'lucide-react'`, the hoisted tarball was incomplete — remove `node_modules/lucide-react` and run `npm install` from the repo root (apps/web and `@hos/ui` already declare the dependency).
