# Hospital OS

Multitenant hospital management (HMIS) SaaS for small nursing homes, clinics and hospitals in India. A hospital owner signs up, goes through the setup wizard (facility, locations, plan, add-on modules, mock payment, GST invoice) and starts working. A platform App Admin decides which modules each tier (Basic, Medium, Premium) includes and what they cost.

> **Demo build. Mock data only.** Every hospital, person, phone number and ABHA-style id in the seed is invented. Payments, SMS and email are mocks: no money moves and nothing is sent. Do not enter real patient data.

## What is in the repo

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js web app: landing, sign-up, setup wizard, hospital workspace, App Admin console. Port **3400**. |
| `apps/api` | Fastify API (zod, Drizzle). Port **4400**. OpenAPI in `apps/api/openapi.json`. |
| `apps/mobile` | Expo (React Native) Android app: patient and doctor portals. |
| `packages/db` | Drizzle schema, SQL migrations (forced row-level security), seeds. |
| `packages/shared` | Module catalogue, tiers, entitlements, pricing and GST, RBAC, India formats, zod schemas. |
| `packages/ui` | Shared React components and design tokens (see `docs/DESIGN_GUIDE.md`). |
| `docs/` | Plan, phase brief, API contracts, design guide, security and compliance, client source docs. |

## Requirements

- Node.js 20 or later and npm (the repo uses npm workspaces).
- Docker Desktop (Postgres 16 runs in a container).
- Free ports: **55432** (Postgres, bound to 127.0.0.1), **4400** (API), **3400** (web).

## Run the demo

```bash
npm ci
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
npm run demo
```

`npm run demo` does, in order:

1. `db:up` - starts the `hospital-os-postgres` container (compose project `hospital-os`, 512 MB memory cap) on 127.0.0.1:55432.
2. `db:migrate` - creates the database and the two least-privilege roles (`hos_migrator`, `hos_app`), then applies `packages/db/migrations/*.sql`.
3. `db:seed` - module catalogue, plans with placeholder prices, roles and permissions, privacy notice, App Admin.
4. `db:seed:demo` - the two demo hospitals, their staff and sample patients (idempotent; safe to re-run).
5. Starts the API on http://127.0.0.1:4400 and the web app on http://localhost:3400. Ctrl+C stops both.

Open http://localhost:3400 and sign in with any account below.

Stop the database when you are done: `npm run db:down` (data stays in the `hospital-os-pgdata` volume).

### Other commands

| Command | Does |
| --- | --- |
| `npm run dev` | API and web only (database already up and seeded). |
| `npm run dev:api` / `npm run dev:web` | One of them. |
| `npm run typecheck` | TypeScript across all workspaces. |
| `npm test` | Vitest (API tests use a throwaway database). |
| `npm run smoke` | API smoke test against the running API, including tenant isolation. Add `-- --db` to also check RLS directly in Postgres. |
| `npm run openapi` | Regenerate `apps/api/openapi.json`. |
| `npm run build` | Production build of API and web. |

## Demo logins

All hospital accounts use the password **`Demo@12345`**.

### App Admin (platform)

| Email | Password | Can do |
| --- | --- | --- |
| `admin@hospitalos.test` | `Admin@12345` | Plans and prices, the tier/module matrix, hospitals, overrides, platform audit. |

### Sunrise Care Hospitals (Demo): Medium plan, 3 locations

Locations: **Mumbai** (MUM, primary), **Indore** (IDR), **Jaipur** (JAI). 40 sample patients: 14 Mumbai, 13 Indore, 13 Jaipur.

| Role | Mumbai | Indore | Jaipur |
| --- | --- | --- | --- |
| Tenant Admin (owner, all locations) | `owner@sunrise.demo` | | |
| Accounts (all locations) | `accounts@sunrise.demo` | | |
| Location Admin | `location.admin@sunrise.demo` | `location.admin.indore@sunrise.demo` | `location.admin.jaipur@sunrise.demo` |
| Front Desk | `frontdesk@sunrise.demo` | `frontdesk.indore@sunrise.demo` | `frontdesk.jaipur@sunrise.demo` |
| Doctor | `doctor@sunrise.demo` | `doctor.indore@sunrise.demo` | `doctor.jaipur@sunrise.demo` |
| Nurse | `nurse@sunrise.demo` | `nurse.indore@sunrise.demo` | `nurse.jaipur@sunrise.demo` |
| Cashier / Billing | `cashier@sunrise.demo` | `cashier.indore@sunrise.demo` | `cashier.jaipur@sunrise.demo` |
| Pharmacist | `pharmacist@sunrise.demo` | `pharmacist.indore@sunrise.demo` | `pharmacist.jaipur@sunrise.demo` |
| Lab Tech | `labtech@sunrise.demo` | `labtech.indore@sunrise.demo` | `labtech.jaipur@sunrise.demo` |

### Lotus Nursing Home (Demo): Basic plan, 1 location (Pune)

A second, unrelated hospital, there to show that one hospital never sees another's data.

| Role | Email |
| --- | --- |
| Tenant Admin (owner) | `owner@lotus.demo` |
| Front Desk | `frontdesk@lotus.demo` |
| Nurse | `nurse@lotus.demo` |

To try the setup wizard from scratch, sign up a new hospital at http://localhost:3400. The mock OTP is printed in the API log (and echoed in the response while `MOCK_EXPOSE_SECRETS=true`).

## Sample data rules

- Patient UHIDs look like `DEMO-SUN-MUM-00001`, and every patient row has `is_sample = true`.
- Dates of birth are entered as DD/MM/YYYY; the API returns ISO `dob` plus `dobDisplay` in DD/MM/YYYY.
- Mobiles are `+91` numbers in the made-up `+91 90000 xxxxx` block.
- ABHA-style numbers start with `00-` (never issued) and ABHA addresses end in `@sbx` (ABDM sandbox). The database rejects ABHA values on any row that is not marked sample.
- The seed data lives in `packages/db/src/demo-data.ts`.

## Security and compliance

Tenant isolation is enforced by Postgres row-level security, not only by app code; the API connects as a role without `BYPASSRLS`. Every state change is written to a per-hospital, hash-chained, append-only audit log. See [`docs/SECURITY_AND_COMPLIANCE.md`](docs/SECURITY_AND_COMPLIANCE.md) for how DPDP Act duties map to what is built, and the gaps before go-live.

## Troubleshooting

- **Port in use.** Something else holds 55432, 4400 or 3400. Change `API_PORT` / `WEB_PORT` in `.env`, or free the port. Do not stop containers that are not `hospital-os-*`.
- **`db:migrate` cannot connect.** Check `docker ps` shows `hospital-os-postgres` as healthy; the first start takes a few seconds.
- **Start over.** `docker compose -p hospital-os down -v` deletes this project's database volume, then run `npm run demo` again.
