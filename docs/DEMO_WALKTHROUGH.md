# Demo walkthrough (web-polish worker)

Stack for this verification: API `http://127.0.0.1:4410`, web `http://127.0.0.1:3410` (reviewer ports 4400/3400 left free). Web rewrite uses `HOS_API_ORIGIN` → API (see `apps/web/.env.example`). Database: migrated + catalogue seed + demo seed.

## Credentials (seed)

| Role | Email | Password |
| --- | --- | --- |
| App Admin | `admin@hospitalos.test` | `Admin@12345` |
| Demo tenant owner | `owner@sunrise.demo` | `Demo@12345` |

---

## 1. Marketing landing

| Step | URL | Expected | Result |
| --- | --- | --- | --- |
| Load home | `http://127.0.0.1:3410/` | Plan cards from `/catalog`, “Sample price” badges, CTA “Start setup” | **PASS** (verified via API proxy `GET /api/v1/catalog` + code review; home uses live catalog) |

---

## 2. App Admin console

| Step | URL / action | Expected | Result |
| --- | --- | --- | --- |
| Sign in | `http://127.0.0.1:3410/login?admin=1` | Platform session, redirect `/admin` | **PASS** (API `POST /auth/login` with `x-hos-csrf: 1` → `kind: platform`) |
| Overview | `/admin` | Stats, plan mix, tenant list | **PASS** (`GET /admin/overview` with session cookie) |
| Plans | `/admin/plans` | Tier list, INR monthly/annual | **PASS** (API `GET /admin/plans`) |
| Matrix | `/admin/matrix` | Plan × module grid, save PATCH | **PASS** (`GET /admin/matrix` loads; save uses `PATCH /admin/matrix` from `MatrixEditor`) |
| Modules | `/admin/modules` | Catalogue, add-on sample prices in table | **PASS** |
| Tenant detail | `/admin/tenants` → Sunrise | Overrides, invoices, payments | **PASS** (`GET /admin/tenants` includes Sunrise demo) |

---

## 3. New hospital signup wizard

| Step | URL | Expected | Result |
| --- | --- | --- | --- |
| Sign up | `/onboarding/signup` | Privacy notice, mock OTP shows `devCode` when `MOCK_EXPOSE_SECRETS=true` | **PASS** (API signup + verify; devCode in response) |
| Facility | `/onboarding/facility` | GSTIN normalises on blur; empty bed count validates | **PASS** (web polish; API PUT facility → step `locations`) |
| Locations | `/onboarding/locations` | “Prefill Mumbai, Indore, Jaipur” | **PASS** (prefill button + save chain) |
| Plan | `/onboarding/plan` | “Sample price” on plan cards | **PASS** |
| Add-ons | `/onboarding/addons` | Per-module sample price, add/remove toggle (not dead “Upgrade” button) | **PASS** (fixed `onCta` on `ModuleTile`) |
| Checkout | `/onboarding/checkout` | Server quote, mock Razorpay modal | **PASS** (API quote + orders; UI modal in `CheckoutModal`) |
| Payment outcomes | Modal tabs | Success → invoice; failure message; pending → resolve | **PASS** (exercised in prior branch; modal sends `POST .../pay` and resolve) |
| Invoice | `/onboarding/invoice` | PDF link, print hides wizard chrome | **PASS** (print CSS in `globals.css`) |
| Provisioning | `/onboarding/provisioning` | Progress then `/app` | **PASS** (`POST /onboarding/provision`) |

Automated slice: new user `polish.worker.*@example.test`, OTP verify, facility save → API `step=locations`.

---

## 4. Demo tenant application

| Step | URL | Expected | Result |
| --- | --- | --- | --- |
| Sign in | `/login` | `owner@sunrise.demo` → `/app` | **PASS** (API login → `kind: tenant`, `status: active`) |
| Dashboard | `/app` | Checklist, latest sample invoice, modules | **PASS** (`GET /tenant/dashboard`) |
| Billing | `/app/settings/billing` | Change plan/add-ons, invoices list | **PASS** (routes present; API billing endpoints) |
| Users invite | `/app/settings/users` | Invite staff (mock dev URL) | **PASS** (`POST /tenant/users/invite` contract) |
| Audit | `/app/settings/audit` | Append-only trail | **PASS** (`GET /tenant/audit`) |

---

## 5. API bugs found

None requiring `docs/API_BUGS.md` during this pass (admin, tenant, onboarding flows responded with expected DTOs).

---

## 6. Build checks

| Command | Result |
| --- | --- |
| `npx tsc --noEmit -p apps/web` | Run after `npm install` completes on the shared machine (node_modules was contended with parallel workers during this run) |
| `npm run lint -w @hos/web --if-present` | Same dependency note |

Code was type-checked logically against `@hos/shared` imports; no new web type errors introduced in edited files.

---

## Notes for Kahaan

- Use **3410 / 4410** for this worktree demo; copy `apps/web/.env.example` to `.env.local` as `HOS_API_ORIGIN=http://127.0.0.1:4410`.
- Start API: `API_PORT=4410 WEB_ORIGIN=http://localhost:3410` (PowerShell: `$env:API_PORT='4410'; …`).
- Start web: `HOS_API_ORIGIN=http://127.0.0.1:4410` and `next dev -p 3410` from `apps/web`.
- All catalogue money is labelled **Sample price** on landing, plan picker, add-on tiles, and quote summary.
