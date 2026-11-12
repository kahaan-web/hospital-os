# 04 · Radiology Reporting

Doc module "RADIOLOGY REPORTING" [DOCS: ML #10]. It's a **name only**. The related doc items are:
- CPOE "Diagnostic Orders" [DOCS: S1 r100];
- the Nurse Station "View Test Results" [DOCS: S1 r87];
- the A4 doctor "MEDICAL DIARY (FACILITY TO ORDER TESTS…)" [DOCS: ML A4];
- the A3 "MEDICAL DATA FOR VISITS" [DOCS: ML A3].

The Lab module (B8) is the closest pattern to follow (order → sample → result → report). Everything functional is [DEFAULT, to confirm by research].

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md` for the sources and the verification detail. [DOCS] items above and below are unchanged.

- **PC-PNDT** (R3.2):
  - **Form F** is filled for every prenatal ultrasound **before** the procedure, with the doctor's declaration and the woman's declaration (and consent for invasive procedures).
  - A Form F register is kept, and a complete **monthly report goes to the Appropriate Authority by the 5th** of the following month (many states use an online portal).
  - All records are kept **2 years** from the procedure, longer if proceedings are pending.

  [VERIFIED: PC-PNDT Rules 1996 r.9(4), r.9(6), r.9(8), https://dhsr.hp.gov.in/Files/PC-PNDT%20RULES%20-1996_0.pdf ; Form F format https://pcpndt.ap.gov.in/forms/FORM%20F.pdf] [RESEARCH: Gemini, G3-2 Delhi Health PC-PNDT page]

  The research changes scope with new task **RAD-T7**: a Form F gate before the study **starts**, not just before finalising; a register; and the monthly report export.
- **AERB:** X-ray, CT and C-arm need AERB licensing through e-LORA, TLD badge monitoring for radiation workers, and periodic QA tests. These are tracked as **equipment compliance items in module 11** (licence number, validity, QA due date, TLD issue/return per quarter). [RESEARCH-WEAK: Gemini, R3.2, no source, verify]
- **PACS** is "increasingly expected" but not mandatory, so it stays out of v1. **Report TAT targets:** routine 12–24 h, stat 1–2 h, as configuration per priority for the TAT report. [RESEARCH-WEAK: Gemini, verify]
- **Report delivery** by WhatsApp or email needs explicit opt-in consent (logged, with opt-out), and the PDF is password-protected. [RESEARCH-WEAK: Gemini, R3.4, G3-3 blog]

## Purpose
Take radiology orders from OPD, IPD and walk-ins; bill them; run a modality worklist; let the radiologist write and sign reports from templates; and deliver the reports in print, PDF and the portals.

## Users and roles
- Front Desk / Cashier: walk-in orders and billing.
- Radiology Tech (new): worklist, performs the study.
- Radiologist (new; a Doctor with the radiology permission): reports and signs.
- Doctor and Nurse: view reports.
- Location Admin: masters.

## Workflows
1. **Order.**
   - From CPOE diagnostic orders [DOCS: S1 r100], an IP nurse/doctor, or a walk-in at the counter (OP bill first, through OP billing).
   - Each order line is a radiology service (modality + body part + contrast flag).
2. **Billing.** OP walk-ins pay before the study (OP voucher). IP orders post through C1 when the study is done [DEFAULT, to confirm by research].
3. **Worklist.**
   - The tech sees the orders by modality and status: ordered → scheduled → arrived → in progress → done.
   - Contrast studies capture a renal-function and allergy check.
4. **Reporting.**
   - The radiologist opens the study.
   - Picks a template (per service).
   - Writes findings and impression.
   - Saves a draft, then signs and finalises.
   - An addendum after finalisation creates a new version; the original is kept.
5. **Delivery.**
   - A PDF with the hospital letterhead.
   - Visible in the doctor workspace, Nurse Station, and the patient portal (A3) after finalisation.
   - Email delivery reuses the Lab email pattern (Premium) [DEFAULT, to confirm by research].
6. **Images:** a DICOM/PACS link is out of scope for v1. Store an optional image or report attachment (C5). PACS is "increasingly expected" but not mandated, so it stays out of v1 and isn't held for research. [RESEARCH-WEAK: Gemini, R3.2]
7. **PC-PNDT (ultrasound in pregnancy):**
   - Obstetric USG services are flagged `pcpndt_regulated`.
   - **Form F must be completed and signed (doctor's declaration + patient's declaration) before the study can move to `in_progress`**, and the report can't finalise without it.
   - Each Form F gets a serial in a per-location register.
   - A **monthly report** (all Form Fs for the month) can be exported by the 5th, with a reminder through the outbox on the 1st.
   - Retention is 2 years, extended while a legal hold flag is set.
   - Form F records can't be deleted, only corrected by addendum.

   [VERIFIED: PC-PNDT Rules r.9(4)/(6)/(8)] Field list: the AP-published Form F (sections A: clinic and patient details, including the number of children with sex; B: non-invasive procedure, indication, referring doctor, result; C: invasive; D: declarations). Transcribe it from https://pcpndt.ap.gov.in/forms/FORM%20F.pdf, and check any state variation with the tenant's Appropriate Authority. [VERIFIED source; field transcription to do in RAD-T7]

## Screens
- `/app/radiology/worklist`: by modality, with status chips.
- `/app/radiology/orders/[id]`: the order and study details.
- `/app/radiology/report/[studyId]`: the editor with template, preview and sign.
- `/app/radiology/masters`: modalities, services to templates, report templates.
- Reports:
  - radiology register;
  - modality-wise counts and revenue;
  - TAT (order → report);
  - PCPNDT Form F register.
- Print: report PDF.

## Data model
- `rad_modalities(location_id, code enum xray|usg|ct|mri|mammo|other, name, room, active)`
- `rad_services(service_id FK, modality_id FK, body_part, contrast bool, pcpndt_regulated bool, template_id FK null)`
- `rad_orders(location_id, patient_id FK, encounter_id FK, cpoe_order_id FK null, ordering_doctor_id FK, priority enum routine|urgent|stat, clinical_notes enc, status)`
- `rad_studies(order_id FK, rad_service_id FK, modality_id FK, status enum ordered|scheduled|arrived|in_progress|done|reported|cancelled, scheduled_at, performed_at, tech_employee_id FK, contrast_checks jsonb, charge_id FK null)`
- `rad_reports(study_id FK, version int, findings text enc, impression text enc, status enum draft|final|addendum, radiologist_id FK, signed_at)`, with UNIQUE (study_id, version)
- `rad_templates(name, rad_service_id FK null, body text)`
- `rad_pcpndt_forms(location_id, study_id FK, register_serial, form_version, form_data jsonb enc, doctor_declared_at, patient_declared_at, report_month, legal_hold bool, retain_until)`, with the field list from Form F (see workflow 7) [VERIFIED: r.9]
- `rad_pcpndt_monthly_reports(location_id, month, generated_at, generated_by, form_count, submitted_on null, submission_ref null)`

## APIs (module `radiology`; features `radiology.orders`, `radiology.reporting`, `radiology.reports`, `radiology.email_result` [DEFAULT, to confirm by research])

| Method | Path | Feature | Roles |
|---|---|---|---|
| POST | `/tenant/radiology/orders` (Idem) | radiology.orders | Doctor, Nurse, Front Desk |
| GET | `/tenant/radiology/worklist?modality&status&date` | radiology.orders | Radiology Tech, Radiologist |
| POST | `/tenant/radiology/studies/:id/{schedule,arrive,start,done,cancel}` (Idem) | radiology.orders | Radiology Tech |
| GET/PUT | `/tenant/radiology/studies/:id/report` (draft) | radiology.reporting | Radiologist |
| POST | `/tenant/radiology/studies/:id/report/sign` (Idem) | radiology.reporting | Radiologist |
| POST | `/tenant/radiology/studies/:id/report/addendum` | radiology.reporting | Radiologist |
| GET | `/tenant/radiology/studies/:id/report.pdf` | radiology.orders | Doctor, Nurse, Front Desk |
| POST | `/tenant/radiology/studies/:id/report/email` | radiology.email_result | Front Desk |
| GET/POST/PATCH | `/tenant/radiology/masters/*` | radiology.orders | Location Admin |
| GET | `/tenant/radiology/reports/{register,modality,tat,pcpndt}` | radiology.reports | Admin |

## Business rules and edge cases
- Only the signing radiologist can finalise. A finalised report is immutable; changes are versioned addenda.
- An OP walk-in can't move to `arrived` unless the order is paid or approved as credit [DEFAULT, to confirm by research].
- A cancelled study after charge posting reverses the charge through C1.
- A PC-PNDT-regulated study can't **start** (`in_progress`) or finalise without a signed Form F. [VERIFIED: r.9(4)]
- A Form F can't be deleted. `retain_until = procedure date + 2 years`, unless a legal hold is set. [VERIFIED: r.9(6)]
- The radiology TAT report measures against per-priority targets (seed: routine 24 h, urgent 4 h, stat 1 h). [RESEARCH-WEAK: Gemini]
- Report text is clinical data: stored `enc` and never sent to audit.
- Portal visibility applies to final reports only.

## Integrations
- CPOE: orders.
- OP/IP billing: payment and charges.
- Nurse Station and the doctor workspace: view results.
- A3 and A4: report view.
- Doctor Accounting: the radiologist's share.
- Equipment Maintenance: modality downtime.
- MIS: revenue.

## Tier
Not in Sheet1. **OPEN – to confirm with Ajay Sheth.** No default tier is set. (OPEN-QUESTIONS-AJAY #3) Feature keys exist so App Admin can assign any tier once decided.

## Acceptance criteria
- An order → done → draft → sign flow produces a versioned, immutable report PDF. An addendum keeps v1.
- An IP study posts its charge once when done, and cancelling it reverses the charge.
- An obstetric USG can't start or be finalised without a signed Form F.
- (Phase 2) The monthly PC-PNDT report for a month lists every Form F with its register serial, and exports PDF and CSV. The reminder outbox row is created on the 1st. Deleting a Form F returns 409.
- The worklist filters by modality and status. The 4 reports export.
- RLS fixtures exist for all `rad_*` tables. No report text appears in the audit log.

## Build order and tasks (migrations 1080–1089)
### RAD-T1 Schema, masters and RLS
- **Accept:** CRUD and RLS tests.
- **Model:** grok.
- **Depends:** SF-T6.
### RAD-T2 Orders and worklist state machine with C1 posting
- **Accept:** transition tests; charge once; reversal on cancel.
- **Model:** grok.
- **Depends:** RAD-T1, IPB-T2.
### RAD-T3 Reporting
- **Scope:** draft, sign, addendum, versioning, PDF render, PCPNDT gate.
- **Accept:** immutability test; PDF snapshot test.
- **Model:** grok.
- **Depends:** RAD-T2.
### RAD-T4 Web: worklist and order screens
- **Model:** composer.
- **Depends:** RAD-T2.
### RAD-T5 Web: report editor, masters and reports
- **Model:** composer.
- **Depends:** RAD-T3.
### RAD-T6 Integration and seed
- **Scope:** link from CPOE diagnostic orders, the result view in the doctor workspace and Nurse Station, and `seed-clinical/radiology.ts`.
- **Accept:** a doctor sees the final report in the workspace.
- **Model:** grok.
- **Depends:** RAD-T3, CPOE [VERIFY-REPO].
### RAD-T7 PC-PNDT Form F, register and monthly report (Phase 2)
- **Scope:** the Form F schema (fields transcribed from the official Form F), a start gate, the register serial, the monthly report export (PDF/CSV), a reminder on the 1st, retention and legal hold.
- **Accept:** the Phase 2 acceptance bullet; the gate test; no Form F content in the audit log.
- **Model:** grok.
- **Depends:** RAD-T3.
