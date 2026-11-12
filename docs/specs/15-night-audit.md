# 15 · Night Audit

Doc module "NIGHT AUDIT" [DOCS: ML #23]. It's a **name only**. In hotel-style systems a night audit is the end-of-day close. What the doc means by it is **OPEN – to confirm with Ajay Sheth** (#31). The text that follows is a *candidate reading only*, kept so work can start fast once confirmed. It is **not a decision**: no task in this module may be built on it until the meaning is confirmed. Candidate reading: **a per-location end-of-day process** that:
- posts the daily recurring charges (bed, nursing, monitoring);
- reconciles the day's cash and counters;
- flags exceptions;
- freezes the business date;
- triggers the MIS snapshots.

How Indian hospital HMIS products use "night audit" (R1.8): no Indian HMIS product was found using the term publicly; the sources were hotel night-audit material. [RESEARCH-WEAK: Perplexity, P1-29/30 hotel sources, P1-31 Shucon billing article] Perplexity recommends an explicit **end-of-day workflow**:
- charge completeness;
- counter close;
- digital-payment reconciliation;
- advance (deposit) reconciliation;
- exceptions;
- day lock;
- reports.

That matches this spec. **One correction:** the scheduler must **not decide room-days**. It only calls the bed-charge job, which applies the tenant's bed-day policy (01). [CONFLICT-resolved: Phase 1 implied the night run "posts the day's bed charge"; it now calls `ipb_post_bed_charges`, and the policy decides the quantity.]

## Purpose
Close each business day reliably so that:
- inpatients are charged for every day they stayed;
- every rupee collected is accounted for by counter and mode;
- unbilled or stuck items surface before they become leakage;
- reports for the day stop changing.

## Users and roles
- Accounts or a Night Audit operator (Cashier role + `night_audit.run`): runs and reviews it.
- Location Admin: re-opens a day, with a reason.
- Tenant Admin: schedule settings.

## Workflows
1. **Pre-checks** (blocking unless overridden):
   - all cash counters closed for the day (counter close with denomination count);
   - no bills in `draft` older than X h;
   - no settlements pending verification.

   Override needs a reason [DEFAULT, to confirm by research].
2. **Recurring charge posting.** Call `ipb_post_bed_charges(location, date)` (IPB-T3), plus other configured daily services per bed class (nursing, monitoring, diet) [DEFAULT, to confirm by research]. Idempotent per (account, date, service).
3. **Reconciliation:**
   - collections by mode and counter vs receipts;
   - deposits received vs deposit register;
   - refunds;
   - the difference is shown, and the variance needs a remark.
4. **Exception report:**
   - inpatients whose deposit is below X% of the running bill;
   - discharged today but not billed;
   - orders done but not charged (lab, radiology, pharmacy issues without charges);
   - pre-auth pending > 24 h;
   - blood units expiring tomorrow;
   - equipment down > 24 h;
   - pending indents.

   Each enabled module adds its own checks.
5. **Close.**
   - The business date for the location moves to the next day.
   - Postings dated on or before a closed date are blocked, except reversals posted on the current date.
   - MIS snapshots run for the closed date (MIS-T1).
6. **Re-open.** Location Admin with a reason. Snapshots for that date become stale.
7. **Schedule.** Optional auto-run at a set time (default 23:55 IST [DEFAULT, to confirm by research]). Failing pre-checks leaves the day open and notifies Accounts.

## Screens
- `/app/night-audit`: today's status per location, pre-check list, run button, progress.
- `/app/night-audit/runs/[id]`: posted charges summary, reconciliation table, exceptions with links, close and re-open.
- `/app/billing/counter-close`: cashier counter close with denominations.
- Reports: day-end summary (print), audit history, variance register.

## Data model
- `business_dates(location_id, current_business_date, last_closed_date)`, one row per location, FOR UPDATE on close
- `counter_sessions(location_id, counter_id, user_id, opened_at, closed_at, expected_cash_paise, counted_cash_paise, denominations jsonb, variance_paise, remark)`. These may exist from B5 [VERIFY-REPO].
- `night_audit_runs(location_id, business_date, status enum running|blocked|completed|failed|reopened, started_by, started_at, finished_at, overrides jsonb, reopen_reason null)`, with UNIQUE (tenant_id, location_id, business_date) where status != reopened
- `night_audit_postings(run_id FK, account_id FK, service_id FK, charge_id FK)`
- `night_audit_exceptions(run_id FK, check_code, severity enum info|warn|block, entity_type, entity_id, detail_code, resolved bool)`. **No patient names: entity refs only.**
- `night_audit_reconciliation(run_id FK, mode, counter_id null, system_paise, declared_paise, variance_paise, remark)`

## APIs (module `night_audit`; features `night_audit.run`, `night_audit.reports` [DEFAULT])

| Method | Path | Roles |
|---|---|---|
| GET | `/tenant/night-audit/status?locationId` | Accounts, Admin |
| POST | `/tenant/night-audit/runs` `{locationId, overrides?}` (Idem) | Accounts / Night Audit operator |
| GET | `/tenant/night-audit/runs/:id` | Accounts, Admin |
| POST | `/tenant/night-audit/runs/:id/close` (Idem) | Accounts |
| POST | `/tenant/night-audit/runs/:id/reopen` | Location Admin |
| POST | `/tenant/billing/counter-sessions/:id/close` (Idem) | Cashier |
| GET | `/tenant/night-audit/reports/{day-end,history,variance}` | Accounts, Admin |

## Business rules and edge cases
- Only one active run per location and date (DB unique + FOR UPDATE on `business_dates`).
- Recurring postings are idempotent. Re-running after a failure doesn't double-charge.
- **Back-dated posting guard:** the money DB functions reject `service_date <= last_closed_date` (422 `day_closed`), except reversals, which take today's date.
- A location in a different timezone isn't a concern: all locations are IST [DEFAULT, to confirm by research].
- If Night Audit isn't entitled, bed charges still post through the IP billing job, and MIS snapshots run on the scheduler. This module adds the close, the reconciliation and the exceptions.

## Integrations
- IP billing (bed charges, day lock).
- OP billing (counter close).
- MIS (snapshot trigger).
- Lab, Radiology, Pharmacy, Insurance, Blood Bank, Equipment and Indents (exception checks).
- Outbox (failure alerts).

## Tier
Not in Sheet1. **OPEN – to confirm with Ajay Sheth.** No default tier is set. (OPEN-QUESTIONS-AJAY #13) Feature keys exist so App Admin can assign any tier once decided.
Whether lower tiers get automatic bed-charge posting without the close: **OPEN – to confirm with Ajay Sheth.**

## Acceptance criteria
- With 3 inpatients, running the audit posts 3 bed charges. Running it again posts none.
- With one counter open, the run is blocked. An override with a reason completes it.
- After close, posting a charge dated on the closed date returns 422 `day_closed`, and a reversal dated today succeeds.
- Re-opening marks the MIS snapshots stale. RLS fixtures exist.

## Build order and tasks (migrations 1300–1309)
### NA-T1 Business dates, counter sessions (reuse B5 if present), runs and RLS
- **Model:** grok.
- **Depends:** IPB-T3.
### NA-T2 Pre-checks, recurring postings, reconciliation and the exception check registry
- **Scope:** a registry so each module can plug in its own checks.
- **Model:** grok.
- **Depends:** NA-T1.
### NA-T3 Close and re-open, the back-dated guard in the money functions, and the MIS trigger
- **Model:** grok.
- **Depends:** NA-T2, MIS-T1.
### NA-T4 Web: status, run detail, counter close, reports and the scheduler setting
- **Model:** composer.
- **Depends:** NA-T3.
