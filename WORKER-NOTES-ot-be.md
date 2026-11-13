# Worker notes — ot-be (OT GKNM backend)

## Built (by OT-SPEC section)

| § | Delivered |
|---|-----------|
| §14 Masters | Tables `ot_surgery_master`, `ot_special_remarks`, `ot_doctor_roles`, `ot_resources`, `ot_settings`; API masters/resources/settings routes |
| §2–5 Requests | Table `ot_requests` + `ot_request_special_remarks`; CRUD, cancel, outstanding (billing-derived), office permission, patient future/context |
| §6–8, §15 Bookings | Table `ot_bookings` (separate from legacy `ot_cases`); direct + against-request book, modify/cancel/shift/shift-now, bulk cancel/reschedule, overlap + cutoff enforcement |
| §9 Post-op | Table `ot_post_op`; GET/PUT on booking |
| §11 Schedule board | `GET /schedule` with category filter |
| §12 List status | `GET /list-status` |
| §13 Reports | `GET /reports/:kind` for register (with `losDays` when admission linked), doctor, department matrix, anaesthetist filter, cancellation, duplicates, frozen |
| API contract | All routes under `/api/v1/tenant/m/ot-scheduling` registered in `TENANT_GUARDS` with `ot.manage` / `ot-scheduling` |
| Seed | Idempotent `seedOtGknm` wired into `db:seed:demo`; also `npm run seed:ot-gknm -w @hos/db` |
| Tests | RLS tables + probe rows; `ot.test.ts` request→book + overlap |

## Tables (migration `1061_ot_gknm.sql`)

- `ot_surgery_master`, `ot_special_remarks`, `ot_doctor_roles`, `ot_resources`, `ot_settings`
- `ot_requests`, `ot_request_special_remarks`, `ot_bookings`, `ot_post_op`
- Legacy `ot_cases` and `/cases*` routes unchanged.

## Deviations

- **Bookings vs cases:** New GKNM flow uses `ot_bookings`; MVP `ot_cases` kept for existing UI.
- **Shift now:** Moves to today 08:00 on same or given resource (MVP default); not “next free slot” scan.
- **Department report filter:** `departmentId` query param not wired to surgery department FK (department is text on surgery master).
- **List-status “Cr Company”:** Not implemented (OPEN in spec).
- **Booking type enum:** Only `planned` / `emergency` (spec OPEN for full list).

## OPEN items (from spec, unchanged)

- Dashboard twin “O.P.” columns meaning; office permission blocking; full booking type list; Operation Services / Employees UI detail; emergency cutoff edge cases; Shift Manual vs Now UX; anaesthesia type master list; list-status filters; TEMP cancellation type; max overbook vs max overlap semantics.
