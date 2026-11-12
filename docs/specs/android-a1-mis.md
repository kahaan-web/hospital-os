# Android A1 · MIS / Dashboard app

[DOCS: ML A1] "ANDROID MOBILE: MIS / DASHBOARD":
- REVENUE MIS;
- MATERIAL MIS;
- OCCUPANCY / ADMISSIONS MIS & SNAPSHOTS;
- DOCTORS PERFORMANCE (SURGERY / OP CONSULTATIONS);
- PATIENT OUTSTANDING;
- COST CENTER PROFITABILITY.

**Kahaan's rule:** every Android app must have everything the doc lists for it [ARCH: PLAN.md decision 3]. **Status:** a placeholder section in `apps/mobile/src/apps/mis/` listing these features [ARCH: task-mobile.md, handover]. The backend is `02-mis-dashboards.md`.

## Purpose
Owners and managers check the hospital's numbers on the phone: today, month-to-date, per location, with drill-down to the summary level.

## Users and roles
Tenant Admin, Location Admin and MIS Viewer see everything entitled. Accounts sees revenue, outstanding and profitability. Doctor sees self only (doctor performance). [DEFAULT, to confirm by research]

## Workflows
1. Log in (existing mobile auth) → MIS home for users with any `mis.*` permission.
2. Pick the location (or "All locations" for Tenant Admin) and a period (Today, MTD, last month, custom).
3. Open a tile → detail screen → the group-by switch (department, payer, doctor…) → share a summary as an image/PDF [DEFAULT, to confirm by research]. **No patient-level data on mobile.**
4. Pull to refresh. Read-only offline cache of the last view, encrypted at rest using expo-secure-store for the key [DEFAULT, to confirm by research].

## Screens (each maps to one doc bullet)

| Screen | Doc bullet | API (from 02) |
|---|---|---|
| Home: KPI tiles (revenue, collections, occupancy %, admissions, outstanding) | all | GET `/tenant/mis/overview` |
| Revenue | REVENUE MIS | GET `/tenant/mis/revenue` |
| Material | MATERIAL MIS | GET `/tenant/mis/material` |
| Occupancy, Admissions and Snapshot (ward census) | OCCUPANCY / ADMISSIONS MIS & SNAPSHOTS | GET `/tenant/mis/occupancy`, `/tenant/mis/census` |
| Doctors (surgery and OP consultations) | DOCTORS PERFORMANCE | GET `/tenant/mis/doctors` |
| Outstanding (ageing) | PATIENT OUTSTANDING | GET `/tenant/mis/outstanding` |
| Cost centres | COST CENTER PROFITABILITY | GET `/tenant/mis/cost-centres` |

## Data model
None new on the server; it uses the `mis_*` snapshot tables. On the client: a cached last response per screen (no PII).

## APIs
The same `/api/v1/tenant/mis/*` routes and feature keys as `02-mis-dashboards.md`. Mobile auth sends the session token header used by the existing mobile client [VERIFY-REPO: B10 mobile API / API_PROPOSAL.md].

## Business rules and edge cases
- A tile is hidden if its feature isn't entitled; there are no zero tiles.
- Money shows in ₹ en-IN with lakh/crore short forms on tiles (₹12.4 L) [DEFAULT, to confirm by research].
- Data freshness shows as "As of HH:MM" (snapshot time + live delta).
- Logging out wipes the cache.

## Integrations
02 MIS API, Night Audit (snapshot timing), auth/session.

## Tier
Uses the `mis.*` feature keys from 02, whose tiers are **OPEN – to confirm with Ajay Sheth.** (#15). Whether the Android app is a separate add-on: **OPEN – to confirm with Ajay Sheth.** (#21).

## Acceptance criteria
- All 6 doc bullets have a working screen against the real API on demo data. The mock client still works with `EXPO_PUBLIC_USE_MOCK=1`.
- A Doctor login sees only their own performance.
- Un-entitled tiles are hidden.
- `npx tsc --noEmit -p apps/mobile` passes. Native screenshots are taken once a device or emulator build is possible [GAP: needs research — build and distribution path (EAS vs local) wasn't allowed on the Dell].

## Build order and tasks
### A1-T1 MIS API client, DTOs in shared, mock fixtures, home screen with tiles and location/period picker
- **Model:** composer.
- **Depends:** MIS-T5.
### A1-T2 Revenue, Material and Occupancy/Snapshot screens
- **Model:** composer.
- **Depends:** A1-T1.
### A1-T3 Doctors, Outstanding and Cost-centre screens, share-as-image, cache and wipe on logout
- **Model:** composer.
- **Depends:** A1-T1.
