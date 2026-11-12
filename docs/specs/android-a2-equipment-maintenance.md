# Android A2 · Equipment Maintenance app

[DOCS: ML A2] "ANDROID MOBILE: EQUIPMEMT MAINTENANCE":
- TRACKING NON-OPERATIONAL EQUIPMENTS;
- RECORDING PROBLEMS / SOLUTION DETAILS;
- EQUIPMENT MASTER DETAILS (DOWN-TIME / FINANCIAL COST).

**Status:** placeholder in `apps/mobile/src/apps/equipment/` [ARCH: task-mobile.md]. The backend is `11-equipment-maintenance.md`.

## Purpose
The biomedical engineer, and any staff member who finds a fault, can work on equipment from the phone: report a breakdown by scanning the asset QR code, see what's down, record the diagnosis and solution, and look up an asset's downtime and cost.

## Users and roles
- Biomedical Engineer: everything.
- Any staff: scan → report a problem, view own reports.
- Department head: own department's non-operational list.

## Workflows
1. **Scan QR → asset card** (status, department, warranty/AMC, last tickets) → "Report problem": description and photo (camera, compressed), urgency.
2. **Non-operational list** [DOCS: ML A2 b1]: filter by department and criticality, sorted by down-since.
3. **Ticket work** [DOCS: ML A2 b2]: assign (to self or a vendor), in progress, diagnosis, solution, parts used (pick from the maintenance store), vendor charge, then resolve. Works offline: drafts queue locally and sync when online [DEFAULT, to confirm by research].
4. **Asset master view** [DOCS: ML A2 b3]: purchase cost, downtime hours (period), maintenance cost, cost % of purchase. Editing the master stays on the web [DEFAULT, to confirm by research].

## Screens
Scan, Asset detail, Report problem, Non-operational list, My tickets / All tickets, Ticket detail (diagnosis, solution, parts, resolve), Asset financials.

## Data model
Server: `equipment_*` tables (11). Client: an offline outbox of pending ticket actions (an idempotency key per action), photos stored until uploaded.

## APIs (from 11)
- GET `/tenant/equipment/assets/by-qr/:code`
- GET `/tenant/equipment/assets/:id`
- GET `/tenant/equipment/non-operational`
- POST `/tenant/equipment/tickets` (Idem)
- POST `/tenant/equipment/tickets/:id/{assign,resolve}`
- POST `/tenant/equipment/tickets/:id/parts` (Idem)
- POST `/tenant/attachments` (photo)
- GET `/tenant/equipment/reports/{downtime,cost}?assetId`

## Business rules and edge cases
- Offline actions replay in order with their original idempotency keys. A conflict (for example a ticket already resolved by someone else) shows a clear message and drops the action.
- Photos: up to 3 per ticket, each at most 1 MB after compression [DEFAULT, to confirm by research]. No patient faces or data; there's a capture hint.
- A QR code from another tenant → "Asset not found".

## Integrations
11 Equipment API, attachments (SF-T7), stores (parts), outbox (critical-down alerts as push, a future option [DEFAULT, to confirm by research]).

## Tier
Uses the `equipment.*` keys, whose tiers are **OPEN – to confirm with Ajay Sheth.** (#9). Add-on or included: **OPEN – to confirm with Ajay Sheth.** (#21).

## Acceptance criteria
- All 3 doc bullets work against the real API: scan → report → shows as non-operational → resolve with parts → financials updated.
- An offline report syncs exactly once.
- Typecheck passes. Native screenshots are taken once a device build exists [GAP: needs research].

## Build order and tasks
### A2-T1 QR scan (expo-camera), asset detail, report problem with a photo
- **Model:** composer.
- **Depends:** EQ-T2.
### A2-T2 Non-operational list, tickets list and detail, resolve with parts, asset financials
- **Model:** composer.
- **Depends:** A2-T1, EQ-T4.
### A2-T3 Offline action queue with idempotent replay and conflict handling (shared mobile utility, reused by A5 and A7)
- **Model:** grok.
- **Depends:** A2-T1.
