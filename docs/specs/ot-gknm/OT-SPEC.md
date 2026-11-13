# OT Scheduling (GKNM) — build checklist spec

Source: `docs/specs/ot-gknm/ot.pdf` (GKNM Hospital / Sofscript "OT Scheduling", 16 pages, plus `ot.txt` and page images `pages/p-NN.png`).
Target: extend the existing MVP OT module (`ot-scheduling`, migration 1060, `apps/api/src/clinical/ot/routes.ts`, `apps/web/src/app/app/ot/`) on branch `feat/ot-gknm` (from `feat/mvp-all`).
Rules: MVP demo quality (clickable screens, working main actions), tenant_id + RLS on every new table, migrations only ADD tables/columns (range 1061–1079), mock/sample data only (fictional names, `is_sample`), UI with `packages/ui` and docs/DESIGN_GUIDE.md (no Sofscript look-alike colours; use our design system). Items marked **OPEN – to confirm with Ajay Sheth** must not be guessed beyond the stated safe default.

Legend: [P#] = PDF page. "CR" = a "Change Requirements" line in the PDF (these are the new asks and are mandatory).

---

## 1. OT Scheduling Dashboard [P1, P3]
Screen: list of OT **requests** for a date range.
- Filters [P1]: Sort by radio — Request No / Patient No / Patient Name / Doctor Name; OT picker (search); Date (from) + To Date; button "OT List" (opens OT List Status §11).
- Columns [P1, P3]: Sel (radio), Req No, IP No, Patient Name, O.S. (link "OS" = outstanding popup §5), Doctor Name, O.P. (tick icon), O.P. (checkbox) — *two columns both labelled "O.P." in the screenshot; meaning OPEN – to confirm with Ajay Sheth (safe default: show "OP/IP" type and "Office permission" flag)*, Gender, Age (e.g. "58 Y 4 M 25 D"), Mobile, Expected Date.
- Action bar [P1]: Direct OT Booking, OT Booking Against Request, New OT Request, Edit OT Request, Cancel OT Request, OT Schedule Dashboard, Print, Cancel, Exit. (Print = browser print of the list; Cancel/Exit = clear selection / back.)
- **CR P2-7**: provision to view **all saved fields** of a request from the dashboard → row click / "View" opens a detail drawer/page showing every field of §2.

## 2. New OT Request [P1, P2]
Base fields [P1]: Patient No* (search), Doctor No* (search), Expected Date, Office Permission? (checkbox) + remark text ("Enter Remark"); panel "Future OT List" (patient's future requests/bookings: Date, IP No, Patient Name, Doctor Name, Status, Req/App No [P2]). Buttons Save / Clear / Exit.
CR P2 (all mandatory):
1. Request for **In Patient or Out Patient** (IP/OP selector). If IP → show **Ward name and Bed No** (CR P5-10) from the active admission.
2. **Diagnosis** — free text.
3. **Type of surgery Major/Minor**; **Surgery name** list filtered by the chosen type (master §14).
4. **Expected Time** next to Expected Date.
5. **Frozen Section** (checkbox) and **TEE Required** (Yes/No radio, **default No**).
6. **Special Remarks** — multi-select from master §14.
7. (Dashboard view of all saved fields — see §1.)
Also captured "at the time of request as per ITC" (CR P5 1–12 apply to request AND booking): Weight (text), Language (text), Sex (text, prefill from patient), Indication (text), Diagnosis (text), Frozen Section, TEE (default No), Surgeons (multi-select, doctors with surgeon role only), Anaesthetists (multi-select, doctors with anaesthetist role only), IP → Ward/Bed, Surgery type + name.

## 3. Edit OT Request [P2]
Same form as §2 prefilled (Patient, Doctor, Expected date, Office permission + remark, all CR fields); Future OT List with Status "REQUEST". Save updates. Only status=requested can be edited.

## 4. Cancel OT Request [P3]
From dashboard: select row → "Cancel OT Request" → confirm dialog "Are you sure cancel the OT request?" (Cancel / OK). Reason text required (our rule, consistent with booking cancel remarks). Status → cancelled; stays visible with filter.

## 5. Outstanding [P3]
Click "OS" link on a dashboard row → popup "Patient Outstanding Details": Un-Settled Amount, Un-Billed Amount, Deposit Balance, Due Amount, checkbox "Office Permission?", Close. Compute from existing billing data where available (OP bills unsettled, IP charges unbilled, deposits); else 0. Office permission checkbox saves to the request. *What office permission unlocks (e.g. booking despite dues): OPEN – to confirm with Ajay Sheth; safe default = informational flag only, no blocking.*

## 6. Direct Booking [P4] (+ IT Common Module fields [P4], CR P5)
Booking screen (no prior request):
- Left: OT (resource search, e.g. "OT1-3FLR-NB"), Date with prev/next arrows, OT Start Time / End Time (from resource master session, e.g. 01:00–23:30).
- Centre: Doctor (search), Pat Type (In Patient / Out Patient) + "New Patient" button, Patient (search), Start Time, Hours + Mins (duration), Appt No (auto), No of Slots (auto = duration / slot duration), Booking Type (SELECT / PLANNED / EMERGENCY — *full list OPEN – to confirm with Ajay Sheth; default Planned, Emergency*), Remarks*, Cancel Remarks*.
- Sub-actions: Operation Services, Operation Doctors, Select Employees, Save, Cancel. *Operation Services/Select Employees content not shown → OPEN – to confirm with Ajay Sheth; MVP: Operation Doctors = surgeons/anaesthetists multi-select; Services/Employees = simple multi-select of services / staff names stored on the booking.*
- Right: New Booking, Modify Booking, Cancel Booking, Shift Manual, Shift Now.
- Timeline: 24 h ruler (0100…0000) for the selected OT/date showing booked blocks (doctor name, "Patient no + name").
- Bottom grid (bookings of the day): Req No, Doctor, Doctor Name, Start Time, End Time, Patient No, Patient Name, IP/OP, Appt No, AnesTyp, AnesTypCd, Nurse Name.
IT Common Module "OT List Entry" fields [P4] to include on the booking: Patient Type, Number + Load Patient, Name, Age, Weight, Language, Sex, Department, Ward, OT Name, Surgery Dt/Time, Case Type (Elective/Emergency), Frozen Section, Indication*, Diagnosis, Surgery, TEE Required (No default), Surgeon (multi), Anaesthetist (multi), button "Surgery Details Entry" (→ §9).
CR P5 rules: all 12 CR fields (see §2). **Booking cutoff (CR P5-11)**: configurable per tenant (and overridable per OT, §14 "Restriction days & time"): `cutoffTime` (default 17:00) + `minLeadDays` (default 1): after cutoff today, bookings for the next `minLeadDays` day(s) are refused with a clear message; Emergency case type bypasses — *bypass for emergency is OPEN – to confirm with Ajay Sheth; safe default = emergency bypasses*.
Overlap: refused unless OT master overlap allowed and count < max overlap (§14).

## 7. OT Booking Against Request [P5]
Same booking screen, opened from a selected dashboard request: shows "REQUEST NO :- 128407 / FOR DATE :- 22/09/2023"; Doctor, Pat Type, Patient prefilled from the request; Booking Type PLANNED default. Save creates the booking linked to the request; request status → booked. All CR request fields carry over to the booking.

## 8. Modify Booking [P7] / Cancel Booking [P8]
- Modify: select a booking → edit Start time, Hours/Mins, Booking type, Remarks, doctors → Save (re-checks overlap and cutoff).
- Cancel: requires **Cancel Remarks** (e.g. "surgery postponed") → status cancelled; appears in Cancellation report.

## 9. Post Operative Surgery Details Entry [P6, P7] (CR)
Per booking (button "Surgery Details Entry"): times each with a **tick; if ticked default time (now) loads and stays editable**: Pre OP Time, Wheeling In Time, Anesthesia Start Time, Surgery Start Time, Surgery End Time, Anesthesia End Time, Wheeling Out Time. Fields: Executed Surgery (prefilled with booked surgery + additional remarks), Per OP Findings, Assisted Doctors, Scrub Nurse, Floor Nurse, Adverse Anesthesia event, Change of Plan if any, Anesthesia Type (dropdown — *values OPEN – to confirm with Ajay Sheth; default list General, Spinal, Epidural, Regional block, Local, Sedation/MAC*), Type of Surgery (dropdown Major/Minor), Complication, Outcome, Antibiotic. Saving marks booking completed.

## 10. Shift Manual [P8] / Shift Now [P9]
- Shift Manual: confirm "Are you sure want to shift appointment" → pick new OT/date/start → move booking.
- Shift Now dialog "Shift OT": Resource (OT), Date, Start Time, End Time, Hours, Mins, Start Time; Save / Cancel. MVP: one dialog that moves the booking to the chosen OT/date/time (overlap + cutoff checks). *Difference between Manual and Now: OPEN – to confirm with Ajay Sheth; default: Manual = pick slot on timeline/date, Now = move to the next free slot today.*

## 11. Schedule Dashboard [P9, P10] (CR)
Grid: rows = OTs (e.g. OT1-3FLR-NB … CVTSOT…), columns = time of day in 15-min ticks; blocks "Appt No: 903 From Time 07:00 AM To 10:00 AM / patient / doctors"; Select Date with < > arrows. **CR P10: filter by OT Category/Type as tagged in Resource Master (§14).**

## 12. OT List Status [P10]
Filters: Dates From (checkbox)/To; Criteria Surgery date / Booking date; Status Active / Cancelled / All; Search OT, Cr Company (*credit company — OPEN – to confirm with Ajay Sheth; MVP: text filter on payer name if present*), Patient Type (Pay Patient, …); Show. Columns: Surgery Date, Bkg Date, Bkg Time, Theatre, From Tm, To Tm, Booking Doctor, Surgeon & Assistant Surgeon Name, Surgery, Remark, Patient No, IP No, Patient Name. Clear / Back.

## 13. Reports [P10–P15] (CR P11)
Parameter screen [P10/P11]: report type OT Register / OT Register Date-wise / Doctor-wise Surgery List / OT Cancel List; Select OT; Operating Doctor; Date range; Booking type; Print/Clear/Back. IT-module report list [P11]: Doctor-wise, Department-wise, OT Register, Anaesthetist-wise, Cancellation, Check Duplication, Frozen Statistics.
- Doctor-wise [P11]: Sno, OT, Date, OP No, IP No, Name, Sex, Age, Diagnosis, Surgery.
- Department-wise [P12]: matrix Department × OT with totals.
- Anaesthetist-wise [P13]: as doctor-wise, filtered by anaesthetist.
- Cancellation [P13]: Type (OP/IP/TEMP), OT, Number, Name, Date, Time, Reason.
- Duplicate entry [P14]: same patient with more than one booking in range — Sno, Date, Time, OP No, IP No, Name, Sex, Diagnosis, Surgery.
- Frozen statistics [P15]: frozen-section cases — Sno, OP/IP Number, Date/Time, Name, Sex/Age, Ward, OT, Diagnosis, Surgery, Surgeon, Frozen Indication, Cancelled.
- **CR P11**: OT Register gets **Length of Stay (LOS)**: admitted → admission date to report date; discharged → admission to discharge date. Report filter by **Doctor/Department with multiple surgery selection (master)**.
MVP: on-screen tables + browser print; CSV optional.

## 14. Masters (new) [P2-6, P15, P16]
- **Surgery master**: name, type Major/Minor, department, active. Seed ~20 sample surgeries for Sunrise.
- **Special remarks master**: text, active. Seed ~8 (e.g. "Blood to be reserved", "Implant required", "C-arm required", "ICU bed post-op", "Frozen section", "Laser required", "Microscope required", "High-risk consent").
- **Doctor OT roles**: surgeon / anaesthetist flags on existing doctors (new mapping table); seed for Sunrise doctors (add 3 sample anaesthetists if none).
- **OT / Resource master** [P15] (extend OT rooms): Category code/name (OT), Main code, Resource (e.g. OT1-3FLR-NB), Resource type Medical/Non medical, Default charge code, Default service code, Store code, Online date, Max calendar period (days), Max history period, Overlap allowed Yes/No, Max overbook allowed, Print slips Yes/No, No. of sessions, Slot duration (h/m), Appointment booking status Active/Inactive, Appointment for (*OPEN – to confirm with Ajay Sheth*), session start/end time. **CR P16**: Overlapping allowed Yes/No and Max overlapping count drive the booking overlap check; **OT Category/Type** per OT; **Restriction days & time per OT** (cutoff override).
- **OT settings** (tenant): booking cutoff time + lead days (CR P5-11).

## 15. Bulk Cancellation / Rescheduling [P16] (CR)
Select bookings by doctor (e.g. doctor leave) or date/OT → bulk cancel (reason required) or bulk postpone/reschedule by N days or to a date (overlap checks per booking; report what moved and what failed).

---

## API contract (prefix `/api/v1/tenant/m/ot-scheduling`, all tenant-scoped, permission `ot.manage`, add each to TENANT_GUARDS)
Masters: `GET/POST /masters/surgeries` (`?type=major|minor`), `PATCH /masters/surgeries/:id`; `GET/POST /masters/special-remarks`; `GET /masters/doctors?role=surgeon|anaesthetist`; `PUT /masters/doctors/:doctorId/roles` `{surgeon, anaesthetist}`; `GET/POST /resources`, `PATCH /resources/:id`; `GET/PUT /settings` `{cutoffTime:"17:00", minLeadDays:1, emergencyBypass:true}`.
Requests: `GET /requests?from&to&otId&sort&q&status`; `POST /requests`; `GET /requests/:id` (all fields + names); `PATCH /requests/:id`; `POST /requests/:id/cancel {reason}`; `GET /requests/:id/outstanding` → `{unsettledPaise, unbilledPaise, depositPaise, duePaise, officePermission}`; `POST /requests/:id/office-permission {granted, remark}`; `GET /patients/:patientId/future` (future requests+bookings); `GET /patients/:patientId/context` → `{patientType, sex, age, ward, bed, admissionId}`.
Bookings: `GET /bookings?date&resourceId` (day grid + timeline); `POST /bookings` (direct; body = request CR fields + resourceId, date, startTime, durationMin, bookingType, caseType, remarks, surgeonIds[], anaesthetistIds[], serviceNames[], employeeNames[]); `POST /requests/:id/book` (against request); `PATCH /bookings/:id` (modify); `POST /bookings/:id/cancel {remarks}`; `POST /bookings/:id/shift {resourceId,date,startTime}`; `POST /bookings/:id/shift-now {resourceId}`; `GET/PUT /bookings/:id/post-op`; `POST /bookings/bulk-cancel {ids[] | doctorId+from+to, reason}`; `POST /bookings/bulk-reschedule {ids[] | doctorId+from+to, shiftDays | toDate}`.
Boards & reports: `GET /schedule?date&category`; `GET /list-status?from&to&criteria&status&otId&patientType`; `GET /reports/:kind?from&to&doctorId&departmentId&anaesthetistId&surgeryIds` with kind ∈ `register|doctor|department|anaesthetist|cancellation|duplicates|frozen`.
Errors: 409 `slot_overlap`, 422 `booking_cutoff` (message names the cutoff), 422 `validation`.
Keep the existing `/cases*` routes and `ot_cases` table working (old screens keep working); new bookings may reuse `ot_cases` by ADDING columns, or a new `ot_bookings` table — backend worker decides, documented in the PR.

## Web screens (`/app/ot/...`, linked from the existing OT sidebar entry)
`/app/ot` dashboard (§1, tabs: Requests | Bookings of the day) · `/app/ot/requests/new` · `/app/ot/requests/[id]` (view all fields) · `/app/ot/requests/[id]/edit` · outstanding dialog · cancel dialog · `/app/ot/book` (direct, §6) · `/app/ot/book?requestId=` (against request, §7) · modify/cancel/shift dialogs on the booking screen · `/app/ot/bookings/[id]/post-op` (§9) · `/app/ot/schedule` (§11) · `/app/ot/list-status` (§12) · `/app/ot/reports` (§13) · `/app/ot/masters` (tabs: Surgeries, Special remarks, Doctor roles, OT resources, Settings) · bulk actions on `/app/ot/schedule` or bookings tab (§15).

## OPEN – to confirm with Ajay Sheth (collected)
1. Meaning of the two "O.P." dashboard columns [P1/P3].
2. What "Office Permission" authorises (booking despite dues?) [P1/P3].
3. Full Booking Type list (Planned/Emergency/others?) [P4/P5].
4. Contents of "Operation Services" and "Select Employees" [P4/P5].
5. Whether the next-day cutoff applies to Emergency bookings [P5-11].
6. Difference between "Shift Manual" and "Shift Now" [P8/P9].
7. Anaesthesia Type dropdown values [P7-14].
8. "Cr Company" filter and Patient Type values on OT List Status [P10].
9. "Appointment For" field on Resource Master [P15].
10. "TEMP" type in Cancellation report [P13].
11. Whether Max overbook (resource master) differs from Max overlapping (CR P16).
