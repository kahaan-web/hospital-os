# 17 · Employee Complaint Tracker

Doc module "EMPLOYEE COMPLAINT TRACKER" [DOCS: ML #26]. It's a **name only**. It's ambiguous whether this means **complaints raised by employees** (grievances about pay, workplace, colleagues, facilities) or **complaints about employees** (for example from patients) **OPEN – to confirm with Ajay Sheth** (#28). The text that follows is a *candidate reading only*, kept so work can start fast once confirmed. It is **not a decision**: no task in this module may be built on it until the meaning is confirmed. Candidate reading: **an internal grievance tracker for employees**, with:
- confidential categories;
- facility issues routed to the Maintenance Tracker;
- a restricted sexual-harassment (POSH) channel.

POSH (R6.9): an **Internal Committee is mandatory at 10 or more employees**. The complaint is filed **within 3 months** of the incident (extendable), the **inquiry is completed within 90 days**, and the **employer acts within 60 days** of the report. **Anonymous complaints can't go to formal inquiry**, because the complainant must be identified to the IC. [RESEARCH: Gemini, LKS Employment Law POSH page https://employmentlaw.lkslaw.com/posh]

So the POSH category stays a **confidential intake routed only to the IC members**, with **due-date tracking** (filing-window warning, 90-day inquiry clock, 60-day action clock) and an **annual-report count** (no details). Full inquiry proceedings stay outside the software. [Phase 1 default confirmed]

Patient feedback is a separate thing (A3 "FEEDBACK" [DOCS: ML A3]) and isn't part of this module.

## Purpose
Give staff a safe, trackable channel for complaints and grievances, with:
- categories;
- assignment;
- SLAs;
- escalation;
- confidentiality controls;
- resolution feedback;
- reports for management without exposing complainants.

## Users and roles
- Employee (self-service): raise complaints and track their own.
- Grievance Officer (new): triage, assign, resolve.
- HR/Payroll Officer: pay and leave grievances.
- Department head: assigned complaints for their department.
- IC Member (POSH, new permission): sees only POSH intakes.
- Tenant Admin: configuration and aggregate reports only. Admins **can't** read POSH or anonymous complainant identity [DEFAULT, to confirm by research].

## Workflows
1. **Raise.** Category (Pay & benefits, Leave & attendance, Workplace/conduct, Facilities, Safety, IT/Systems, POSH, Other), description, attachments, and optionally **anonymous** (not for POSH, which needs identity for a formal inquiry [RESEARCH: Gemini, R6.9, LKS]).
2. **Route.**
   - Facilities → creates a linked Maintenance Tracker ticket.
   - Pay/leave → HR.
   - POSH → the IC members only.
   - Others → Grievance Officer.
3. **Work.** open → acknowledged → under review → resolved / rejected (with reason) → closed after the complainant confirms or after 7 days. Reopen is allowed within 7 days [DEFAULT, to confirm by research].
4. **SLA and escalation.** Acknowledge within 2 working days and resolve within 15 [DEFAULT, to confirm by research]. A breach escalates to the next level.
5. **Feedback.** The complainant rates the resolution (1–5).
6. **Reports.** Counts by category, department and status; SLA compliance; ageing. No names. A department with fewer than 3 complaints is suppressed to protect anonymity [DEFAULT, to confirm by research].

## Screens
- `/app/complaints/mine` (also on A6).
- `/app/complaints/new`.
- `/app/complaints/inbox`: by assignee.
- `/app/complaints/[id]`: thread, status, internal notes (hidden from the complainant).
- `/app/complaints/settings`: categories, routing, SLAs, IC members.
- `/app/complaints/reports`.

## Data model
- `complaint_categories(code, name, route_to enum grievance|hr|maintenance|posh|department, ack_sla_hours, resolve_sla_hours, allow_anonymous bool)`
- `complaints(location_id, complaint_no, category_id FK, raised_by_employee_id FK null, is_anonymous bool, anon_token_hash, department_id FK null, subject enc, description enc, status enum open|acknowledged|under_review|resolved|rejected|closed|reopened, assigned_to_user_id null, ack_due_at, resolve_due_at, acknowledged_at, resolved_at, closed_at, rating null, linked_mt_ticket_id FK null)`
- `complaint_messages(complaint_id FK, author_user_id null, author_is_complainant bool, body enc, internal bool, created_at)` and `complaint_events(complaint_id FK, event, from_status, to_status, by_user, at)`
- An anonymous complaint stores no employee id. The complainant follows it with a one-time token shown at submission. Only the hash is stored.

## APIs (module `complaints`; features `complaints.core`, `complaints.posh`, `complaints.reports` [DEFAULT])

| Method | Path | Roles |
|---|---|---|
| POST | `/tenant/complaints` | Employee (any staff) |
| GET | `/tenant/complaints/mine` ; GET `/tenant/complaints/anon/:token` | complainant |
| GET | `/tenant/complaints/inbox` | Grievance Officer, HR, Dept head, IC (POSH only) |
| GET | `/tenant/complaints/:id` | complainant, assignee, Grievance Officer (non-POSH), IC (POSH) |
| POST | `/tenant/complaints/:id/{ack,assign,resolve,reject,close,reopen,rate}` | per role |
| POST | `/tenant/complaints/:id/messages` | complainant, assignee |
| GET/PUT | `/tenant/complaints/settings/*` | Tenant Admin |
| GET | `/tenant/complaints/reports/*` | Tenant Admin, Grievance Officer |

## Business rules and edge cases
- Access to a POSH complaint is limited to the IC members. Even Tenant Admin gets 404 [DEFAULT, to confirm by research]. This is enforced in the API **and** by an RLS sub-policy on `category.route_to = 'posh'`, using a session var for the user's IC flag.
- An anonymous complaint has no link back to the employee anywhere, including audit (the audit actor is recorded as `anonymous` for the create).
- Internal notes are never shown to the complainant.
- Retaliation isn't something the software can detect. Out of scope.
- Complaint text is `enc`. Audit holds ids and status only.

## Integrations
- Employees (SF-T5).
- Maintenance Tracker (facilities).
- Payroll/HR (pay grievances).
- Outbox (SLA alerts).
- A6 Android (raise and track).

## Tier
Not in Sheet1. **OPEN – to confirm with Ajay Sheth.** No default tier is set. (OPEN-QUESTIONS-AJAY #16) Feature keys exist so App Admin can assign any tier once decided.

## Acceptance criteria
- A facilities complaint creates a linked maintenance ticket.
- A POSH complaint is invisible to Tenant Admin (404) and visible to the IC members, enforced by both the API and RLS tests.
- An anonymous complaint is trackable only by its token, and no table holds the employee id.
- An SLA breach escalates through the outbox. The reports suppress groups smaller than 3.
- RLS fixtures exist.

## Build order and tasks (migrations 1340–1349)
### CMP-T1 Categories, complaints, messages, events, anonymous token, POSH RLS sub-policy
- **Model:** grok.
- **Depends:** SF-T5.
### CMP-T2 Routing (including the maintenance link), state machine, SLA escalation and reports
- **Model:** grok.
- **Depends:** CMP-T1, MT-T1.
### CMP-T3 Web: mine, new, inbox, detail, settings and reports
- **Model:** composer.
- **Depends:** CMP-T2.
