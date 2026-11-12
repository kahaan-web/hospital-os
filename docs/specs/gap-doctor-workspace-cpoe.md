# GAP · Doctor Workspace / CPOE (B3 on main: complete it)

CPOE is a sheet-only module (it isn't in the PDF list) [ARCH: PLAN.md map]. It has 13 rows, **all Premium only** [DOCS: S1 r99–r104, r109–r113]. Stage 1 in Sheet3.

The related doc items are:
- Doctor Appointment / Visit [DOCS: S1 r11–r19] (Basic);
- the Android Doctor's Medical Portal [DOCS: ML A4]: "APPOINTMENT DIARY", "MEDICAL DIARY (FACILITY TO ORDER TESTS / MEDICINES)";
- consultation visit registration [DOCS: ML #3].

**Status:** B3 (doctor workspace with CPOE and slot locking) was merged per the notes. `/app/clinic` was a 404 at screenshot time, before the merge [ARCH: FLOW.md, handover]. **All items are [VERIFY-REPO when the Dell is back].**

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md`. [DOCS] items are unchanged.
- **Diagnosis coding:** **ICD-10**, which ABDM's FHIR implementation guide binds for conditions (SNOMED CT is optional). It's also needed for NHCX claims (INS-T8). [RESEARCH: Gemini, R3.7, https://docs.abdm.gov.in/docs/hiecm/v3/resources/standards/icd]
- **Prescription format** (NMC): legible, **generic names preferably in CAPITALS**, the doctor's name, qualification and **registration number (with council)**, date, the patient's name/age/sex, and dose/frequency/duration. [RESEARCH-WEAK: Gemini, R3.6, no source; verify against the NMC Registered Medical Practitioner (Professional Conduct) Regulations]
- **Interaction checking** isn't mandatory for small hospitals, but **basic allergy alerts are expected**. Commercial drug databases (e.g. CIMS) are licensed. [RESEARCH-WEAK: Gemini, R3.6] So v1 is a **structured allergy list** (drug or class) that blocks or warns when ordering a matching drug or class. There's still no interaction database.

## Purpose
The doctor's consult screen:
- appointment diary;
- chief complaints;
- vitals;
- notes;
- diagnostic, medicine and procedure orders;
- a request for reservation or admission;
- printable prescriptions and notes. [DOCS: S1 r99–r104, r109–r113]

## Users and roles
- Doctor: everything.
- Nurse / Front Desk: vitals before the consult [DEFAULT, to confirm by research], and viewing the diary.

## Docs checklist with likely gaps

| Row | Item | Tier | Likely state |
|---|---|---|---|
| S1 r99 | Chief Complaints | P | verify (coded list + free text) |
| S1 r100 | Diagnostic Orders | P | verify (lab done; radiology routing is a gap until Radiology exists) |
| S1 r101 | Medicine Orders | P | verify (drug search from the item master, dose, frequency, duration, route) |
| S1 r102 | Procedure Orders | P | **likely gap** (feeds OT scheduling) |
| S1 r103 | Appointment Diary | P | verify (the doctor's own diary; front desk diary is Basic [S1 r16]) |
| S1 r104 | Request Reservation / Admission | P | **likely gap** (creates an ADT reservation request) |
| S1 r113 | Patient Vitals (function) | P | verify |
| S1 r109 | Investigation Prescription (report) | P | likely gap (print) |
| S1 r110 | Medicine Prescription (report) | P | verify the print layout |
| S1 r111 | Doctors Notes (report) | P | likely gap |
| S1 r112 | Patient Vitals Table / Graph | P | likely gap (graph) |

Doctor-facing items not in Sheet1: diagnosis coding (ICD-10), allergy capture, favourites/order sets, drug interaction checks, and follow-up scheduling. Phase 2 status: **ICD-10 diagnosis** [RESEARCH: Gemini, R3.7, ABDM ICD standard]. **Structured allergy list with a drug/class match warning** (changed from free text) [RESEARCH-WEAK: Gemini, R3.6]. Personal favourites [DEFAULT, to confirm by research]. **No interaction checking in v1**, because it needs a licensed drug database [RESEARCH-WEAK: Gemini, R3.6, which agrees].

## Workflows to finish
1. **Procedure order** [S1 r102] → creates an OT request (`03-ot-scheduling.md`) for OT-type procedures, or a bedside or OP procedure charge (C1) for minor ones.
2. **Request reservation or admission** [S1 r104] → an ADT reservation request with bed class, expected date, provisional diagnosis and estimated stay. The ADT desk confirms. "Reservations" is part of doc module #5 [DOCS: ML #5].
3. **Diagnostic orders** route to Lab or Radiology by service category.
4. **Prints** [S1 r109–r112]: investigation Rx, medicine Rx (with the doctor's registration no.), notes, and the vitals chart. Prescription format: generic name first in CAPITALS (brand optional in brackets), the doctor's name, qualification and registration number with council, the patient's name/age/sex, and dose/route/frequency/duration per line. [RESEARCH-WEAK: Gemini, R3.6, verify against the NMC regulations]
5. **Visit close:** the consult is marked done in the OPD queue, and follow-up is suggested in the appointment diary.

## Screens (add if missing [VERIFY-REPO])
- `/app/clinic` consult screen: add a Procedure order tab, a "Request admission" drawer and an ICD-10 diagnosis picker.
- `/app/clinic/diary`: the doctor's own appointment diary [S1 r103].
- Print previews for the investigation Rx, medicine Rx, doctor's notes and vitals chart [S1 r109–r112].
- A vitals graph panel [S1 r112].

## Data model additions [VERIFY-REPO]
- `cpoe_orders.order_type` must include `procedure`, and `target_module enum lab|radiology|ot|pharmacy|procedure`
- `admission_requests(encounter_id FK, patient_id FK, requested_by_doctor_id FK, bed_class, expected_admit_on, provisional_diagnosis enc, est_stay_days, status enum requested|reserved|admitted|cancelled, adt_reservation_id FK null)`
- `encounter_diagnoses(encounter_id FK, icd10_code, text enc, is_primary)` [RESEARCH: Gemini, R3.7]
- `patient_allergies(patient_id FK, allergen_type enum drug|drug_class|food|other, allergen_ref, reaction, severity, recorded_by)` (Phase 2) [RESEARCH-WEAK: Gemini, R3.6]
- An ICD-10 code list (WHO ICD-10, licensed for this use: **verify the licence terms**) is loaded as a platform table.

## APIs (module `cpoe`; feature keys per S1 row [VERIFY-REPO])
- POST `/tenant/cpoe/encounters/:id/orders` `{type: diagnostic|medicine|procedure}` (Idem) [S1 r100–r102]
- POST `/tenant/cpoe/encounters/:id/admission-request` (Idem) [S1 r104]
- PUT `/tenant/cpoe/encounters/:id/{complaints,notes,diagnoses}` [S1 r99, r111]
- POST `/tenant/cpoe/encounters/:id/vitals` [S1 r113]
- GET `/tenant/cpoe/diary?date` [S1 r103]
- GET `/tenant/cpoe/encounters/:id/print/{investigation-rx,medicine-rx,notes,vitals}` [S1 r109–r112]

## Business rules and edge cases
- Only the treating doctor (or a covering doctor with a permission) can sign orders.
- Signed orders are immutable. Cancelling is a status change with a reason.
- An admission request for a patient who's already admitted gives 409.
- A procedure order of OT type can't post a charge directly; OT posts it on completion.
- Premium guard on all CPOE routes. Lower tiers keep the Basic appointment and visit features [S1 r11–r19].

## Integrations
Appointments and the OPD queue, Lab, Radiology, Pharmacy, OT, ADT (reservations), Nurse Station (orders view), A4 Doctor portal (the same APIs), Doctor Accounting (consult attribution).

## Tier (Sheet1)
- **Premium only:** all 13 rows.

## Acceptance criteria
- Every checklist row has a route, a screen and a test.
- A procedure order of OT type appears in the OT request queue.
- An admission request appears at the ADT desk and converts to an admission.
- The 4 prints render. Non-Premium tenants get 403.
- (Phase 2) Ordering amoxicillin for a patient with a recorded penicillin-class allergy shows a blocking warning that needs an override reason. The medicine Rx prints generic names in capitals with the doctor's registration number.

## Build order and tasks
### CP-T1 Audit B3 against the checklist
- **Scope:** write `docs/specs/cpoe-gap.md`.
- **Model:** grok.
- **Depends:** Dell back.
### CP-T2 Procedure orders with routing, admission requests to ADT reservations, ICD-10 diagnoses, structured allergies and the allergy-match warning (Phase 2 scope)
- **Model:** grok.
- **Depends:** CP-T1, OT-T2 (for the OT routing).
### CP-T3 Prints and vitals graph endpoint
- **Model:** grok.
- **Depends:** CP-T1.
### CP-T4 Web: consult screen additions and print screens
- **Model:** composer.
- **Depends:** CP-T2, CP-T3.
