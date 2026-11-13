# ot-web1 — OT dashboard, requests, booking, schedule

Web only. Did not change `apps/api`, `packages/db`, or the ot-web2 routes (`/app/ot/bookings/[id]/post-op`, `/app/ot/list-status`, `/app/ot/reports`, `/app/ot/masters`). Those four routes are linked from the OT sub-nav and from the dashboard action bar. Surgery details entry links to `/app/ot/bookings/<id>/post-op`.

`npm run typecheck -w @hos/web` passes. Repo-wide `npm run typecheck` still fails in `@hos/api`, `@hos/mobile` and `@hos/db` because `drizzle-orm` has no declaration file in this worktree's `node_modules`. Those packages were not edited here. The dev server was not started (ports 3400 and 4400 are off limits), so the screens were not clicked through in a browser.

## Built

- **§1 Dashboard** `/app/ot` (Requests tab). Sort radios (request no, patient no, patient name, doctor name), OT combobox, from/to dates, OT list → `/app/ot/list-status`. Grid columns: Sel, Req no, IP no, Patient name, O.S., Doctor name, OP/IP, Office permission, Gender, Age (`58 Y 4 M 25 D` when year/month/day parts or a date of birth are present), Mobile, Expected date. Row radio selects. Clicking the row outside controls, the request number, or View opens `/app/ot/requests/[id]`. Action bar: Direct OT booking, OT booking against request (`/app/ot/book?requestId=`), New / Edit / Cancel OT request, OT schedule dashboard, Print (`window.print`), Cancel (clears the selection), Exit, View, Reports, Masters. Cases tab keeps the previous case list and `/app/ot/new`.
- **§2 New request** `/app/ot/requests/new`. Patient search, doctor search, IP/OP, ward and bed when IP (from `/patients/:id/context`), diagnosis, major/minor then filtered surgery, expected date and time, frozen section, TEE default No, special remarks, weight, language, sex, indication, surgeons, anaesthetists, office permission and remark, future OT list. Save / Clear / Exit.
- **§3 Edit** `/app/ot/requests/[id]/edit`. Same form, prefilled. Save is blocked unless status is `requested`.
- **Detail** `/app/ot/requests/[id]`. Every saved field from §2 (CR P2-7).
- **§4 Cancel**. Dialog title is exactly `Are you sure cancel the OT request?` with Cancel / OK. A reason is required and sent as `{reason}`.
- **§5 Outstanding**. O.S. opens `Patient Outstanding Details` with the four amounts in ₹ (paise via `PriceDisplay`) and Office permission. The checkbox saves `{granted, remark}` and does not block booking.
- **§6 / §7 Booking** `/app/ot/book` and `/app/ot/book?requestId=`. Left: OT, date with arrows, session start/end. Request header `REQUEST NO :- … / FOR DATE :- …` and prefill when `requestId` is set (booking type Planned). Centre: doctor, pat type, new patient, patient, start, hours, mins, appt no, slot count, booking type (Select / Planned / Emergency), case type, remarks, cancel remarks, IT fields (number, name, age, weight, language, sex, department, ward, bed, OT name, surgery date/time, surgery type and name, frozen section, indication, diagnosis, TEE default No, surgeon and anaesthetist checklists), operation doctors / services / employees, Save / Cancel. Right: New, Modify, Cancel (needs cancel remarks), Shift manual, Shift now. 24-hour timeline and the day grid (req no, doctor, doctor name, start, end, patient no, patient name, IP/OP, appt no, AnesTyp, AnesTypCd, nurse name). Block or row click selects for modify / cancel / shift. `slot_overlap` and `booking_cutoff` are shown inline. Surgery details entry → post-op route.
- **§8** Modify is Save / Modify booking (`PATCH`). Cancel booking posts `{remarks}`.
- **§10** Shift manual confirms with exactly `Are you sure want to shift appointment`, then `POST /shift` with the theatre, date and start time on the screen. Shift now opens `Shift OT` (resource, date, start, end, hours, mins). Save calls `POST /shift`. Next free slot calls `POST /shift-now` with `{resourceId}`.
- **§11 Schedule** `/app/ot/schedule`. Date arrows, OT category filter, rows × 15-minute columns 07:00–19:00, scrollable. Blocks read `Appt No: … From … To …` plus patient and doctors. Click opens `/app/ot/book?bookingId=&date=&resourceId=`.
- **§15 Bulk** on the schedule. Tick bookings, or pick a doctor and a date range. Bulk cancel (reason) and bulk reschedule (shift N days, including negative, or move to a date). Done and failed counts are listed.

Typed client functions for the endpoints these screens call live in `apps/web/src/features/clinical/ot/api.ts`. Existing `otApi` case functions are unchanged. List responses may be an array or `{items|rows|requests|bookings|data}`. A failed call shows an empty state or an inline error and does not crash the page.

## Decisions

- The two dashboard columns that are both labelled O.P. in the source are **OP/IP** and **Office permission** (spec safe default).
- Button text is sentence case, matching the design guide. Dialog sentences that the spec quotes are exact.
- A status filter (All / Requested / Booked / Cancelled) was added so a cancelled request can stay on the list. It uses the contract `status` query. Default is all.
- Booking type values sent to the API are `select`, `planned`, `emergency`. Default is planned. Against a request the default is planned.
- Case type `emergency` is what the cutoff bypass refers to. The screen shows the tenant cutoff from `GET /settings` when that call succeeds. Emergency bypass text follows `emergencyBypass` (default true).
- Operation services and employees are name lists stored as `serviceNames` and `employeeNames`. There is no service or staff master on this contract.
- Department on the booking is free text.
- Slot count uses the resource slot length, or 15 minutes when the resource payload does not include one. Session start/end stay blank when the master does not send them.
- Shift now's end time is start plus hours and minutes. `/shift` only receives `{resourceId, date, startTime}`. If hours and minutes change the duration, a follow-up `PATCH` sends the new duration.
- Schedule blocks outside 07:00–19:00 are listed for bulk tick and are not drawn on the grid.
- There is no `GET /bookings/:id` on the contract, so a schedule click passes `bookingId`, `date` and `resourceId` and the booking screen selects that row from the day list.
- Office permission is an informational flag only.
- Nav entries for the new routes are registered with `nav: false` and reuse the existing OT message keys, so `packages/shared` was not changed.

## OPEN (not guessed past the safe default)

1. Meaning of the two O.P. columns — shown as OP/IP and office permission.
2. What office permission authorises — flag only, no booking block.
3. Full booking-type list — Select, Planned, Emergency.
4. Operation services and employees — free-text name lists.
5. Whether the cutoff applies to emergency — UI says emergency bypasses when settings say so; the API enforces it.
6. Shift manual vs shift now — manual moves to the slot on the screen after the confirm; now opens the Shift OT dialog, and Next free slot calls `shift-now`.
