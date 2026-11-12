# 12 · Maintenance Tracker (facility and building maintenance)

Doc module "MAINTENANCE TRACKER" [DOCS: ML #19]. It also appears as Android item 7 [DOCS: ML A7]. **Both are names only.** How it differs from Equipment Maintenance (#18) isn't stated in the docs. Research (R7.5) says Indian HMIS practice keeps facility/civil maintenance and biomedical equipment maintenance **separate**, because the risk profiles and audit trails differ. [RESEARCH-WEAK: Gemini, Scribd FMS policy] That supports the candidate split below; it doesn't decide it. Meaning: **OPEN – to confirm with Ajay Sheth** (#30).

Split between #18 and #19: **OPEN – to confirm with Ajay Sheth** (#30). The text that follows is a *candidate reading only*, kept so work can start fast once confirmed. It is **not a decision**: no task in this module may be built on it until the meaning is confirmed. Candidate split:
- **#18 covers medical and biomedical equipment** (assets with cost and downtime).
- **#19 covers facility work orders:** civil, electrical, plumbing, carpentry, HVAC/AC, lifts, DG set, fire safety, housekeeping requests, and recurring statutory or safety checks.

## Purpose
- Let any staff member raise a facility problem.
- Route it to the right maintenance trade.
- Track it to closure against an SLA.
- Schedule recurring checks (fire extinguishers, DG set, lift, water tank cleaning).
- Report on turnaround and backlog.

## Users and roles
- Any staff (Employee role or any role): raises and views own requests.
- Maintenance Supervisor (new): triages, assigns, closes.
- Maintenance Staff (new): works the tickets (mostly on A7 mobile).
- Location Admin: categories, SLAs, recurring tasks.

## Workflows
1. **Raise.** Location (building, floor, ward, room), category, description, photo, and urgency.
2. **Triage and assign** to a trade and person, or an outside vendor. The SLA comes from the category × urgency.
3. **Work.** Statuses: assigned → in progress → on hold (awaiting parts or vendor) → done, with notes, photos and materials used (C3 from the maintenance store).
4. **Verify and close.** The requester (or the supervisor) confirms. A reopen within 48 h goes back to in progress [DEFAULT, to confirm by research].
5. **Recurring tasks.** Checklists with a frequency auto-generate tickets. Seeded **statutory and safety templates** (R7.4):

   | Check | Seed frequency | Authority |
   |---|---|---|
   | Fire NOC renewal | annual (state-dependent) | State fire department |
   | Fire extinguisher check | monthly | NABH / fire code |
   | Electrical safety audit | 6-monthly | State electrical inspectorate |
   | Lift licence and inspection | annual | State lift inspectorate |
   | Water tank cleaning | quarterly | NABH |
   | Water chemical analysis | 6-monthly | NABH |
   | Water bacteriological test | monthly | NABH |
   | DG set log | daily | — |
   | DG emission/noise check | periodic | State PCB / CPCB |
   | Pest control | monthly or quarterly | NABH FMS |

   [RESEARCH-WEAK: Gemini, consultant blog, verify per state] All rows are editable, and each **licence-type** item (fire NOC, lift licence) also stores the certificate no., validity and an attachment (C5), with a 60-day expiry alert.
6. **Escalation.** An SLA breach notifies the supervisor, then the Location Admin (outbox).

## Screens
- `/app/maintenance/requests`: my requests, and all for the supervisor.
- `/app/maintenance/requests/[id]`.
- `/app/maintenance/board`: kanban by status and trade.
- `/app/maintenance/recurring`.
- `/app/maintenance/masters`: areas, categories, SLAs.
- Reports:
  - TAT by category;
  - SLA breaches;
  - backlog ageing;
  - recurring-task compliance;
  - materials consumed.
- Android A7: see `android-a7-maintenance-tracker.md`.

## Data model
- `facility_areas(location_id, code, name, building, floor, parent_area_id FK null)`
- `mt_categories(code, name, trade enum civil|electrical|plumbing|carpentry|hvac|lift|dg|fire|housekeeping|it|other, default_assignee_user_id null)` and `mt_slas(category_id FK, urgency enum low|normal|high|critical, response_min, resolve_min)`
- `mt_tickets(location_id, ticket_no, area_id FK, category_id FK, urgency, description text, raised_by, raised_at, assigned_to_user_id null, vendor_supplier_id FK null, status enum open|assigned|in_progress|on_hold|done|closed|reopened|cancelled, response_due_at, resolve_due_at, responded_at, done_at, closed_at, closure_note, attachment_ids uuid[], recurring_task_id FK null)`
- `mt_ticket_events(ticket_id FK, event, from_status, to_status, by_user, at, note)`, append-only
- `mt_ticket_materials(ticket_id FK, item_id FK, qty, cost_paise, stock_issue_id FK)`
- `mt_recurring_tasks(location_id, area_id FK, category_id FK, title, checklist jsonb, frequency enum daily|weekly|monthly|quarterly|half_yearly|yearly, next_due_on, active)`

## APIs (module `maintenance`; features `maintenance.requests`, `maintenance.recurring`, `maintenance.reports` [DEFAULT, to confirm by research])

| Method | Path | Feature | Roles |
|---|---|---|---|
| GET/POST | `/tenant/maintenance/tickets` (own list for staff) | maintenance.requests | all staff |
| GET | `/tenant/maintenance/tickets/:id` | maintenance.requests | requester, Maintenance |
| POST | `/tenant/maintenance/tickets/:id/{assign,start,hold,done,close,reopen,cancel}` | maintenance.requests | Supervisor / Staff / requester (close, reopen) |
| POST | `/tenant/maintenance/tickets/:id/materials` (Idem) | maintenance.requests | Maintenance Staff |
| GET/POST/PATCH | `/tenant/maintenance/recurring` | maintenance.recurring | Supervisor, Location Admin |
| GET/POST/PATCH | `/tenant/maintenance/masters/{areas,categories,slas}` | maintenance.requests | Location Admin |
| GET | `/tenant/maintenance/reports/{tat,sla,backlog,recurring,materials}` | maintenance.reports | Supervisor, Admin |

## Business rules and edge cases
- The SLA clock is wall-clock by default [DEFAULT, to confirm by research]. Time "on hold" pauses the resolve clock.
- Only the requester or the supervisor can close. Staff can only mark done.
- A recurring task generates one ticket per due date, idempotently. A missed one stays open and overdue.
- Staff see only the tickets they raised or that are assigned to them. The supervisor sees everything in the location.
- No patient data in tickets. The UI warns if a description looks like it includes a UHID [DEFAULT, to confirm by research].

## Integrations
- Stores: materials through C3.
- Bill Passing: vendor bills.
- Equipment Maintenance: a ticket can be converted to an equipment ticket if the category is "medical equipment".
- Employee Complaint Tracker: facility complaints route here.
- MIS: cost centre.
- A7 Android.

## Tier
Not in Sheet1. **OPEN – to confirm with Ajay Sheth.** No default tier is set. (OPEN-QUESTIONS-AJAY #10) Feature keys exist so App Admin can assign any tier once decided.

## Acceptance criteria
- Raising a high-urgency electrical ticket sets the due times from the SLA. Hold for 1 h extends the resolve due time by 1 h. A breach generates an outbox notification.
- A recurring monthly task generates exactly one ticket per month across repeated job runs.
- A staff user can't see other people's tickets (403/404). RLS fixtures exist.

## Build order and tasks (migrations 1240–1249)
### MT-T1 Masters, tickets, state machine, events and SLA computation
- **Model:** grok.
- **Depends:** SF-T2.
### MT-T2 Recurring generator job, escalations through the outbox, materials through C3, plus the Phase 2 statutory template seed and licence-validity alerts
- **Model:** grok.
- **Depends:** MT-T1, SF-T4, SF-T7.
### MT-T3 Reports
- **Model:** grok.
- **Depends:** MT-T2.
### MT-T4 Web: requests, board, recurring, masters, reports and seed
- **Model:** composer.
- **Depends:** MT-T1 to MT-T3.
