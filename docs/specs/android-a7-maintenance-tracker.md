# Android A7 · Maintenance Tracker app

[DOCS: ML A7] "MAINTENANCE TRACKER" is a **name only** (also Group I #19). Scope is [DEFAULT, to confirm by research]. **Status:** placeholder in `apps/mobile/src/apps/maintenance/` [ARCH: task-mobile.md]. The backend is `12-maintenance-tracker.md`.

## Purpose
Maintenance staff receive, work and close facility tickets on the phone. Any staff member can raise a facility problem with a photo. The supervisor triages and watches SLAs.

## Users and roles
Any staff (raise and track own tickets), Maintenance Staff (assigned work), Maintenance Supervisor (triage, board, recurring checks).

## Workflows
1. **Raise:** pick the area (or scan an area QR code [DEFAULT, to confirm by research]), category, urgency, description and photo.
2. **My work** (staff): assigned list sorted by due time → start → hold (reason) → done with notes, photos and materials.
3. **Recurring checklists:** today's due checks (for example the DG log, fire extinguishers) → fill the checklist → done.
4. **Supervisor:** the unassigned queue → assign. SLA breach list. Close or reopen.
5. Offline queue for work updates (A2-T3 utility).

## Screens
Raise ticket, My tickets, Work list, Ticket detail (actions, materials, photos), Recurring checks, Supervisor queue, SLA breaches.

## Data model
Server: `mt_*` (12). Client: the offline action queue and photo cache.

## APIs (from 12)
- GET/POST `/tenant/maintenance/tickets`
- POST `/tenant/maintenance/tickets/:id/{assign,start,hold,done,close,reopen}`
- POST `/tenant/maintenance/tickets/:id/materials` (Idem)
- GET `/tenant/maintenance/recurring?due=today`
- POST `/tenant/attachments`

## Business rules and edge cases
- Staff see only their own and assigned tickets.
- Done ≠ closed (the requester or supervisor closes).
- Offline replay is idempotent. Conflicts are surfaced to the user.
- Photo hint: no patients in the frame.

## Integrations
12 Maintenance Tracker, stores (materials), attachments, Complaint Tracker (facility complaints arrive as tickets).

## Tier
Uses `maintenance.*`, whose tier is **OPEN – to confirm with Ajay Sheth.** (#10). Add-on or included: **OPEN – to confirm with Ajay Sheth.** (#21).

## Acceptance criteria
- Raise with a photo → supervisor assigns → staff start, hold and finish offline → syncs → the requester closes. The SLA timers match the web.
- A recurring check completes once per due date.
- Typecheck passes. Native screenshots once a device build exists [GAP: needs research].

## Build order and tasks
### A7-T1 Raise ticket (area picker / QR, photo), my tickets, ticket detail
- **Model:** composer.
- **Depends:** MT-T1.
### A7-T2 Work list with actions and materials, recurring checks, supervisor queue and SLA list, offline queue
- **Model:** composer.
- **Depends:** A7-T1, MT-T2, A2-T3.
