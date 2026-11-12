# Android A4 · Doctor's Medical Portal (gaps to close)

[DOCS: ML A4] "ANDROID MOBILE: DOCTOR'S MEDICAL PORTAL":
- APPOINTMENT DIARY;
- MEDICAL DIARY (FACILITY TO ORDER TESTS / MEDICINES).

**Status:** Phase A built a diary, visit detail and an order form on **mock data** [ARCH: task-mobile.md, handover]. B3 put the web doctor workspace and CPOE on main [VERIFY-REPO]. CPOE is **Premium only** in Sheet1 [DOCS: S1 r99–r113]. The doctor-facing appointment diary report is Basic [DOCS: S1 r16] and the CPOE diary is Premium [DOCS: S1 r103].

## Purpose
Doctors see their day, review patients, and order tests and medicines from the phone, against the real API.

## Users and roles
Doctor (own patients and appointments; covering doctor by permission).

## Gaps vs the docs

| Doc bullet | Built (mock) | Gap |
|---|---|---|
| APPOINTMENT DIARY | today's list on mock | Real diary (day and week) from appointments and the OPD queue, status (waiting, in consult, done), block or unblock slots (leave), multi-location switch. |
| MEDICAL DIARY (order tests / medicines) | order form on mock | Real CPOE orders (diagnostic → Lab or Radiology, medicine → Pharmacy) with drug search, favourites, sign. Patient history: past visits, results (final), vitals trend. Inpatient list (my admitted patients) with orders. |

Useful but not in the doc [DEFAULT, to confirm by research]: result notifications (push) for "my patients", and the countersign queue for nurse-entered orders (from gap-nurse-station), plus their own Doctor Accounting statement (Premium).

## Workflows
1. Sign in (staff login, Doctor role) → Diary (today, by location).
2. Tap an appointment → patient summary → history, results, vitals → order tests or medicines → sign.
3. My inpatients → orders, results, countersign the nurse's verbal orders.
4. Block my slots for a date range (leave) [DEFAULT, to confirm by research].
5. My statement (if Doctor Accounting is entitled).

## Screens
Diary (day and week), Appointment and patient summary, History and results viewer, Vitals trend, Order entry (tests, medicines; favourites), My inpatients, Countersign queue, Slot blocking, My statement.

## Data model
No new tables beyond CPOE, nursing and doctor accounting (`doctor_favourites(doctor_id FK, kind, payload jsonb)` [DEFAULT, to confirm by research]).

## APIs (prefix `/api/v1/doctor/*` per the proposal, or reuse the `/tenant/cpoe/*` routes with the doctor principal [VERIFY-REPO])
- GET `/doctor/diary?date&locationId`; POST `/doctor/slots/block`
- GET `/doctor/patients/:id/summary`, `/doctor/patients/:id/results`, `/doctor/patients/:id/vitals`
- POST `/tenant/cpoe/encounters/:id/orders` (Idem) and sign; GET `/doctor/inpatients`; GET/POST `/doctor/countersign`
- GET/POST `/doctor/favourites`; GET `/tenant/doctor-accounting/doctors/me/statement`

## Business rules and edge cases
- The doctor sees only patients with an encounter where they are treating, consulting or covering (an ownership check plus RLS).
- Ordering on mobile has the same validation and Premium guard as the web.
- The phone has no offline ordering (the safety risk of stale data) [DEFAULT, to confirm by research]. Read-only cache only, wiped on logout, with an idle lock.
- Slot blocking can't remove booked appointments: a conflict list is shown for the front desk to reschedule.

## Integrations
Appointments, OPD queue, CPOE (B3), Lab, Radiology, Pharmacy, Nursing (countersign), Doctor Accounting, Outbox (push, later).

## Tier
- Appointment diary (view) [DOCS: S1 r16 Basic].
- Ordering, history and countersign: **Premium** (CPOE) [DOCS: S1 r99–r113].
- Whether the app is an add-on: **OPEN – to confirm with Ajay Sheth.** (#21).

## Acceptance criteria
- With the real API: the diary shows seeded appointments. An order placed on mobile appears in Lab and Pharmacy queues. Countersigning clears the nurse's badge.
- A non-Premium tenant sees the diary but not the order entry.
- Typecheck passes. Native screenshots on a device [GAP: needs research].

## Build order and tasks
### A4-T1 Audit mobile, B3 and B10
- **Scope:** write `docs/specs/doctor-portal-gap.md`.
- **Model:** grok.
- **Depends:** Dell back.
### A4-T2 Doctor principal routes: diary, patient summary, results and vitals, inpatients, slot block, favourites; ownership guard
- **Model:** grok.
- **Depends:** A4-T1, CP-T2.
### A4-T3 Mobile: real diary, patient summary, order entry with sign, inpatients, countersign queue, statement
- **Model:** composer.
- **Depends:** A4-T2, NS-T2.
