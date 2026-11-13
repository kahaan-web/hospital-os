# Worker ot-gapB — spec-gap UI pass

Branch: `feat/ot-gapB`. Scope: OT-SPEC §9–§15 web UI (schedule, post-op, list-status, reports, masters, `api-gknm2` + `gknm2/`).

## Changes

### Schedule dashboard & bulk (§11, §15) — `ScheduleScreen.tsx`
- Page title aligned to **Schedule dashboard**; grid block text uses **From Time / To Time** per spec.
- **OT category** + **OT type** filters (CR P10) using GKNM resource master metadata.
- **Off-grid bookings** table (07:00–19:00) — was promised in copy but missing.
- Bulk panel retitled **Bulk cancellation / rescheduling**; selection modes: ticked day (with optional OT limit), doctor + date range, **date range + OT** (client gathers booking ids via schedule API).
- Bulk OT dropdown uses theatre master list from lookups.

### Post-op (§9) — `PostOpScreen.tsx`, `TimeTickRow.tsx`
- Title **Surgery details entry**; field labels match spec wording (Pre OP Time, Wheeling In Time, etc.).
- Back links: booking screen + OT home.
- Time rows use **Tick** checkbox (sets now on tick, clears on untick) with editable time input.

### List status (§12) — `ListStatusScreen.tsx`
- Filter labels **Dates From**, **Search OT** per spec.

### Reports (§13) — `ReportsScreen.tsx`, `helpers.ts`
- **IT module report list** quick-pick buttons (P11-style list).
- **CSV** export for all report result shapes; **Print/Clear** behaviour unchanged.
- Cancellation table wrapped for horizontal scroll / print.

### Masters (§14) — `MastersScreen.tsx`
- Resource type option label **Non Medical**.

### Navigation — `OtSectionNav.tsx`
- Added **Schedule** link among gknm2 section routes.

## Decisions
- **Bulk by date + OT**: API bulk body has no `resourceId`; worker gathers `ids[]` by iterating `GET /schedule` per day in range (respects active category/type filters).
- **OT type filter**: client-side from `listResources()` when schedule rows lack type.
- Did not modify `BookingScreen.tsx` (worker A — modify/cancel/shift dialogs).

## Verification
- `npm run typecheck -w @hos/web` — **pass**.
