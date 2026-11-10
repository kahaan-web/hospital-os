# Hospital OS — instructions for Claude Code

Hospital OS (working name) is a multitenant HMIS SaaS for small nursing homes, clinics and hospitals in India.
A hospital owner/manager self-onboards through a setup wizard, picks a tier (Basic / Medium / Premium), enables and buys
modules (mock payment for now), and starts using the product. A platform App Admin configures tiers, which modules each
tier includes, and prices.

## Read first
- `docs/PLAN.md` — approved product & build plan (+ Kahaan's decisions at the top, which win over the Page).
- `docs/PHASE_A_BRIEF.md` — what to build in the current phase. This is your task spec.
- `docs/source/` — the client source docs: `hmis-modules.txt` (27 HMIS Group I modules + 7 Android apps),
  `hmis-modules-full.txt` (pdftotext of the PDF), `features-by-tier.csv` (Sheet1 of the tier spreadsheet; source of truth
  for tiers), `hmis-features-by-tier.xlsx`, `hmis-modules.pdf`.

## Environment (Windows 10/11 desktop "DESKTOP-50GE904", shared machine)
- Node 20 is at `C:\Users\DELL\dev-tools\node` (already on PATH). Use **npm workspaces** (pnpm is not installed).
- Docker Desktop is running. Other projects' containers (`flippr-*`) and other apps also run here: **never stop, remove,
  restart or reconfigure any container, volume, network or process you did not create.** Use compose project name
  `hospital-os` only.
- Ports already taken on this machine include 1025, 1080, 4040, 5173, 5432, 7070, 8025, 8081-8102, 9000, 9001.
  Use: Postgres **55432**, API **4400**, web **3400**. Check a port is free before using any other.
- RAM is shared (~4 GB free). Keep Docker memory limits small (Postgres `mem_limit: 512m`), don't run several heavy
  builds in parallel, and **stop any dev server you start** once you've checked it (never leave long-running processes).
- Work only inside this project folder. Do not read or write outside it (no `~/.claude`, no `~/.agent-office`, no other
  repos). Do not install global packages or change global git/npm config.
- Git: local only. Commit in small logical steps with clear messages on `main`. No remote, no push (the GitHub repo is
  created later).

## Non-negotiables
- **Mock / sample data only.** Never real patient data. Seed data uses realistic but fictional Indian names: every row is flagged sample (is_sample), with DEMO- UHIDs, 00- ABHA ids, @sbx email addresses and +91 90000 mobiles. Never real people.
- **No real payment gateway**, no real SMS/email providers. Mock them behind interfaces so real ones plug in later.
- No secrets committed: use `.env.example`; `.env` is git-ignored.
- Tenant isolation is enforced in Postgres (row-level security keyed on a per-request session setting), not only in app
  code. Every tenant-owned table has `tenant_id`. Add tests proving cross-tenant reads/writes fail.
- Every state-changing action writes to the append-only, hash-chained audit log.
- Accessibility (WCAG 2.2 AA), responsive layouts, keyboard support. India formats: ₹, en-IN numbers, DD/MM/YYYY,
  GST rules. Hindi-ready i18n structure (English strings only for now).
- Model for this project: Claude Fable 5.2, standard (not fast mode), high effort.

## Done means
Code builds, type-checks, lints, tests pass, README run steps work from a clean clone, and the phase report is written.
