# GAP · Nurse Station / Nursing (B9 on main: complete it)

Doc module "NURSE STATION" [DOCS: ML #6]. Sheet module "Nurse Station", 7 rows, **all Premium only** [DOCS: S1 r85–r91]. The Android Nurses' Workbench [DOCS: ML A5] lists:
- DOCTOR'S ORDER ENRY / VIEW FOR INVESTIGATION / MEDICINE;
- VITL SIGN ENTRY / VIEW;
- MEDICINE ADMINISTRATION;
- DIET ORDER ENTRY / VIEW.

**Status:** B9 nursing is merged per the build notes; it was not seen in the demo [ARCH: handover appendix]. **All items are [VERIFY-REPO when the Dell is back].**

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md`. [DOCS] items are unchanged. Everything here is R3.5. [RESEARCH-WEAK: Gemini, no source, verify against the NABH 6th edition MOM chapter]
- **MAR "6 rights":** right patient, drug, dose, route, time, documentation.
- **High-alert medicines** (insulin, heparin, KCl concentrate, opioids, chemotherapy) need an **independent double check by two nurses**, both identities recorded.
- **LASA** (look-alike sound-alike) items are flagged on the item master and shown with a warning.
- **Verbal and telephonic orders** are read back and **countersigned by the doctor within 24 h**.

All four are configuration: the high-alert list, the LASA flag, and `countersign_hours = 24`.

## Purpose
The ward-side workspace for nurses to:
- see and place lab and medicine orders;
- view test results;
- record vitals;
- record medicine administration;
- handle diet orders;
- print the investigation and medicine prescriptions, doctors' notes and vitals charts. [DOCS: S1 r85–r91, ML A5]

## Users and roles
- Nurse (ward), Nurse in-charge: everything.
- Doctor: read access, plus orders through CPOE.
- Dietitian or kitchen: diet order view [DEFAULT, to confirm by research].

## Docs checklist with likely gaps

| Source | Item | Tier | Likely state |
|---|---|---|---|
| S1 r85 | Lab Orders | P | verify (nurse-entered, or on behalf of a doctor) |
| S1 r86 | Medicine Orders | P | verify |
| S1 r87 | View Test Results | P | likely partial (needs Lab and Radiology results) |
| S1 r88 | Investigation Prescription (report) | P | likely gap (print) |
| S1 r89 | Medicine Prescription (report) | P | likely gap (print) |
| S1 r90 | Doctors Notes (report) | P | likely gap |
| S1 r91 | Patient Vitals Table / Graph | P | verify graph |
| ML A5 b2 | Vital sign entry/view | **not in Sheet1** | B9 built per notes; tier is GAP |
| ML A5 b3 | Medicine administration (MAR) | **not in Sheet1** | B9 built per notes; tier is GAP |
| ML A5 b4 | Diet order entry/view | **not in Sheet1** | B9 built per notes; tier is GAP |

The tier for vitals, MAR and diet isn't in Sheet1 It is **OPEN – to confirm with Ajay Sheth** (#19, R9.1), and no default tier is set. Note the CPOE "Patient Vitals" row [S1 r113] is also Premium.

## Workflows to finish or verify
1. **Ward census view.** Patients on my ward with bed, alerts (due meds, pending results), and the latest vitals.
2. **Orders on behalf of a doctor** (verbal or telephonic order) record `read_back_confirmed`, and need the doctor's countersignature **within 24 h** (configurable `countersign_hours`). Unsigned orders show a badge; past the deadline they show as overdue on the ward census and the doctor's worklist, and in a compliance report. [RESEARCH-WEAK: Gemini, R3.5, verify]
3. **Medicine orders → pharmacy indent/issue to the IP patient** (B7) → MAR schedule.
4. **MAR.** Per dose: given, held (reason), refused or missed, with time and nurse.
   - The administer screen shows a **6-rights** confirmation (patient, drug, dose, route, time, documentation).
   - For items flagged `high_alert`, a **second nurse** must authenticate (PIN or re-login) before the dose is recorded as given.
   - `lasa` items show a warning banner.

   [RESEARCH-WEAK: Gemini, R3.5, verify]
5. **Vitals** entry with range alerts, plus table and graph [S1 r91].
6. **Diet orders.** Diet type, start and stop. A kitchen list per ward and meal [DEFAULT, to confirm by research].
7. **Prints and reports** [S1 r88–r91] with the C6 framework.

## Screens
`/app/nursing/ward`, `/app/nursing/patients/[encounterId]` with tabs for Orders, Results, MAR, Vitals, Diet, Notes and Prints. Verify what B9 has.

## Data model (verify against B9)
`nursing_vitals`, `mar_schedules`, `mar_administrations`, `diet_orders`, and order-on-behalf flags on CPOE orders (`entered_by_nurse_id`, `countersigned_by`, `countersigned_at`). The exact table names are [VERIFY-REPO].

## APIs (module `nursing` or `nurse_station` [VERIFY-REPO]; feature keys per S1 r85–r91, plus new keys `nurse_station.vitals`, `.mar`, `.diet` [DEFAULT])
- GET `/tenant/nursing/ward?wardId`; GET `/tenant/nursing/encounters/:id/summary`
- POST `/tenant/nursing/encounters/:id/{lab-orders,medicine-orders}` [S1 r85, r86]
- GET `/tenant/nursing/encounters/:id/results` [S1 r87]
- POST/GET `/tenant/nursing/encounters/:id/vitals` [S1 r91; ML A5]
- POST `/tenant/nursing/mar/:scheduleId/administer` (Idem) [ML A5]
- POST/PATCH `/tenant/nursing/encounters/:id/diet-orders` [ML A5]
- GET `/tenant/nursing/encounters/:id/print/{investigation-rx,medicine-rx,doctor-notes,vitals}` [S1 r88–r91]

## Business rules and edge cases
- A dose can't be administered twice: same schedule slot means 409.
- Administering a medicine stopped by the doctor gives 422.
- Vitals outside the configured ranges raise an alert flag (not a notification by default).
- Notes and results are clinical data: `enc` where specified, never in the audit log.
- Premium guard on all S1 r85–r91 routes.

## Integrations
CPOE (orders), Lab and Radiology (results), Pharmacy (issue to IP), IP billing (nursing charges through C1), Night Audit (daily nursing charges), Blood Bank (transfusion vitals), Android A5.

## Tier (Sheet1)
- S1 r85–r91: **Premium only**.
- Vitals, MAR and diet: not in Sheet1. **OPEN – to confirm with Ajay Sheth.** (OPEN-QUESTIONS-AJAY #19)

## Acceptance criteria
- Each checklist row has a route, a screen and a test.
- The 4 prints render.
- Double administration → 409.
- (Phase 2) A high-alert dose can't be recorded as given without a second, different nurse; the same user twice → 422. A verbal order unsigned at 24 h shows overdue in the countersign compliance report.
- An order on behalf of a doctor appears unsigned until countersigned.
- Non-Premium tenants get 403.

## Build order and tasks
### NS-T1 Audit B9 against the checklist
- **Scope:** write `docs/specs/nursing-gap.md`.
- **Model:** grok.
- **Depends:** Dell back.
### NS-T2 Order-on-behalf countersign, results aggregation, MAR double-dose guard
- **Scope:** whichever are missing. Phase 2 adds: the 24-h countersign deadline and overdue report, read-back flag, high-alert second-nurse check, LASA flag on `items` (`items.high_alert`, `items.lasa`), and the 6-rights confirmation payload.
- **Model:** grok.
- **Depends:** NS-T1.
### NS-T3 The 4 print reports and the vitals graph data endpoint
- **Model:** grok.
- **Depends:** NS-T1.
### NS-T4 Web: ward census, patient tabs and print screens
- **Scope:** fill whatever is missing.
- **Model:** composer.
- **Depends:** NS-T2, NS-T3.
