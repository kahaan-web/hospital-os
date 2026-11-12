# Android A5 · Nurses' Workbench app

[DOCS: ML A5] "ANDROID MOBILE: NURSES WORKBANCH":
- DOCTOR'S ORDER ENRY / VIEW FOR INVESTIGATION / MEDICINE;
- VITL SIGN ENTRY / VIEW;
- MEDICINE ADMINISTRATION;
- DIET ORDER ENTRY / VIEW.

**Status:** placeholder in `apps/mobile/src/apps/nurse/` [ARCH: task-mobile.md]. The backend is B9 nursing plus `gap-nurse-station.md` [VERIFY-REPO].

## Purpose
Bedside nursing on a phone or ward tablet: see and enter doctors' orders, record vitals, give medicines with a scan check, and handle diet orders.

## Users and roles
Nurse and Nurse in-charge (ward-scoped by roster or assignment [DEFAULT, to confirm by research]).

## Workflows
1. **My ward → patient list** (bed, name initials + UHID, alerts: meds due, abnormal vitals, new results).
2. **Orders** [DOCS: ML A5 b1]:
   - view active investigation and medicine orders;
   - enter an order on behalf of a doctor (verbal/telephonic), which shows as "awaiting countersign";
   - view results when they're ready.
3. **Vitals** [DOCS: ML A5 b2]: quick entry (T, P, R, BP, SpO₂, pain, GCS optional), range flags, and a trend chart.
4. **Medicine administration** [DOCS: ML A5 b3]:
   - the due-now list from the MAR;
   - **scan the patient wristband (UHID barcode) + the medicine barcode** [DEFAULT, to confirm by research; the barcode exists as S1 r95 Print Barcode, Premium];
   - mark given, held, refused or missed with a reason.
   - A **6-rights** check prompt (patient, drug, dose, route, time, documentation). High-alert items need a second nurse to authenticate on the same device. LASA items show a warning. [RESEARCH-WEAK: Gemini, R3.5, verify] The countersign badge turns overdue after 24 h.
5. **Diet orders** [DOCS: ML A5 b4]: view and enter the diet type, start and stop, and notes.
6. **Shift handover note** per patient [DEFAULT, to confirm by research].

## Screens
Ward list, Patient summary, Orders (view and enter), Results, Vitals (entry and trend), MAR due list → administer (scan flow), Diet, Handover.

## Data model
Server: B9 tables plus the gap additions (countersign fields, MAR events). Client: the offline queue (from A2-T3) for vitals and MAR when the ward Wi-Fi drops. MAR replay must keep the original timestamp and reject a duplicate dose server-side (409).

## APIs (from gap-nurse-station.md)
- GET `/tenant/nursing/ward`
- GET `/tenant/nursing/encounters/:id/summary`
- GET/POST `/tenant/nursing/encounters/:id/{lab-orders,medicine-orders}`
- GET `/results`
- POST/GET `/vitals`
- POST `/tenant/nursing/mar/:scheduleId/administer` (Idem)
- GET/POST `/diet-orders`

## Business rules and edge cases
- A wristband/medicine scan mismatch blocks administration (an override needs a reason and is audited) [DEFAULT, to confirm by research].
- An offline administration replayed after a colleague already gave the dose → 409 and an alert.
- Clinical data is cached only for the open ward, encrypted at rest, and wiped on logout or after a 15-minute idle lock [DEFAULT, to confirm by research].
- The screen shows initials + UHID in lists and the full name only in patient detail [DEFAULT, to confirm by research].

## Integrations
Nursing (B9), CPOE, Lab and Radiology results, Pharmacy (IP issues → MAR), IP billing (nursing charges), Blood Bank (transfusion vitals), Payroll rosters (ward assignment).

## Tier
Nurse Station features are **Premium only** [DOCS: S1 r85–r91]. Vitals, MAR and diet aren't in Sheet1: **OPEN – to confirm with Ajay Sheth.** (#19). Add-on or included: **OPEN – to confirm with Ajay Sheth.** (#21).

## Acceptance criteria
- All 4 doc bullets work against the real API on demo data.
- The scan-match flow blocks a wrong patient.
- Offline vitals sync once.
- A duplicate dose → 409 shown to the user.
- Typecheck passes. Native screenshots once a device build exists [GAP: needs research].

## Build order and tasks
### A5-T1 Ward list, patient summary, orders view and entry (on behalf, countersign badge), results
- **Model:** composer.
- **Depends:** NS-T2.
### A5-T2 Vitals entry and trend, diet orders
- **Model:** composer.
- **Depends:** NS-T3.
### A5-T3 MAR due list and barcode scan administration with offline replay (uses A2-T3), idle lock and cache wipe
- **Model:** grok.
- **Depends:** A5-T1, A2-T3.
