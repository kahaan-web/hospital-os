# ot-gapA worker notes

Spec scope: OT-SPEC §1–§7 (dashboard, request CRUD/cancel, outstanding, direct & against-request booking).

## Changes

- **Dashboard (`/app/ot`)**: Replaced the legacy **Cases** tab with **Bookings of the day** per spec §1. New `DayBookingsPanel` lists the day grid columns (Req no → Nurse name), date + optional OT filter, row click opens `/app/ot/book` with the booking selected.
- **Request dashboard**: Sort-by legend + PDF-style sort labels (Request No, Patient No, …); **OT List** button label aligned with spec.
- **Outstanding popup (§5)**: **Enter remark** field on office permission, persisted with the checkbox save.
- **Booking screen — OT list entry (§6)**: **Patient type** and **Case type** fields added to the IT common module panel (alongside existing centre booking fields).

## Decisions

- Two dashboard **O.P.** columns remain **OP/IP** + **Office permission** (safe default from OT-SPEC OPEN items).
- Legacy `CasesPanel` and `/app/ot/new` left in repo for old `ot_cases` API; not linked from the §1 dashboard tab.

## Verify

- `npm run typecheck -w @hos/web` — passed after edits.
