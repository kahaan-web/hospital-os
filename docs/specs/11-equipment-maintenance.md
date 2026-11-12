# 11 · Equipment Maintenance (biomedical and clinical equipment)

Doc module "EQUIPMENT MAINTENANCE" [DOCS: ML #18]. The functional scope comes from the Android app [DOCS: ML A2 "ANDROID MOBILE: EQUIPMEMT MAINTENANCE"], which lists:
- (b1) TRACKING NON-OPERATIONAL EQUIPMENTS;
- (b2) RECORDING PROBLEMS / SOLUTION DETAILS;
- (b3) EQUIPMENT MASTER DETAILS (DOWN-TIME / FINANCIAL COST).

These three are **[DOCS]**. Everything else is [DEFAULT, to confirm by research]: PM, calibration, AMC/CMC, and the AERB / NABH facility-management requirements were [GAP: needs research]; Phase 2 answers are below.

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md` for the sources and the verification detail. [DOCS] items above and below are unchanged.

- **Equipment management evidence** (R7.1): a documented equipment management plan with:
  - an asset register classifying equipment as **functional / dysfunctional / beyond economic repair (BER)**;
  - PM schedules per OEM;
  - traceable calibration logs;
  - breakdown logs with timestamps (**reported, engineer arrival, resolved**);
  - **uptime ≥95% for critical equipment** (from a MoHFW hospital policy, not a universal NABH clause).

  [RESEARCH: Gemini, MoHFW/NHSRC "Guidelines on Equipment Maintenance, Calibration and Testing" https://nhsrcindia.org/sites/default/files/2025-01/Guidelines%20on%20Equipment%20Maintenance%2C%20Calibration%20and%20Testing.pdf ; Safdarjung Hospital equipment policy https://vmmc-sjh.mohfw.gov.in/sites/default/files/Policy%20on%20Equiment%20Maintenance.pdf]

  Scope changes: an **engineer-arrival timestamp**, a **BER** status, and an **uptime-target %** per criticality (seed 95% for high).
- **Calibration** (R7.2): by the **OEM or a NABL-accredited (ISO/IEC 17025) lab**, with a traceable certificate. Seed frequencies: BP sets, weighing scales, patient monitors, defibrillators and autoclaves **annually**; lab analysers **6–12 months per OEM**, plus daily IQC. [RESEARCH-WEAK: Gemini, Cyrix (vendor), verify] Seeded as **PM templates per category**, editable. The calibration record stores the agency, its NABL certificate no. and validity.
- **AMC vs CMC** (R7.3): an **AMC** covers PM visits and labour, with parts extra. A **CMC** covers labour, PM and major parts (tubes, probes, boards). MoHFW guidance: critical equipment bought with a **2-year warranty, then 5–8 years of CMC**. The master needs the **uptime guarantee %** and the PM visits per year. [RESEARCH: Gemini, NHSRC guideline; CBR blog] So contracts get `covers_parts bool`, `uptime_guarantee_bp`, and an excluded-parts list. An **uptime-vs-guarantee report** supports penalty claims.
- **AERB** (R3.2): X-ray, CT, C-arm and cath lab need an AERB **e-LORA licence** (number, validity), **QA test** due dates, and **TLD badge** issue/return per wear period for radiation workers. [RESEARCH-WEAK: Gemini, no source, verify on aerb.gov.in] These are added as **compliance items** on radiology assets (new EQ-T7).

## Purpose
- Keep a register of equipment with its financial and warranty details.
- Log breakdowns, then track them to repair with the problem and solution recorded.
- Know at any moment which equipment is non-operational.
- Measure downtime and the cost of maintenance per asset. [DOCS: ML A2 b1–b3]

## Users and roles
- Biomedical Engineer (new): owns the module.
- Any staff (Nurse, Lab Tech, Radiology Tech): reports a breakdown.
- Department head: views own department.
- Accounts: AMC bills through Bill Passing.
- Admin: master approval.

## Workflows
1. **Equipment master** [DOCS: ML A2 b3]. Fields:
   - asset tag;
   - name and category;
   - department and location;
   - make, model and serial;
   - vendor;
   - purchase date and cost (the "financial cost");
   - installation date;
   - warranty end;
   - AMC/CMC contract (vendor, period, cost);
   - criticality (high, medium, low);
   - status (operational, non-operational, under maintenance, condemned);
   - a QR label (printable).
2. **Breakdown report** [DOCS: ML A2 b1, b2]. Any user scans the QR code (A2) or picks the asset, then enters the problem description and a photo (C5). The asset becomes **non-operational** and the downtime clock starts.
3. **Attend and resolve** [DOCS: ML A2 b2]. The engineer:
   - assigns the ticket (in-house or vendor visit);
   - records the diagnosis, solution, spare parts used (C3 issue from the maintenance store) and the vendor service report;
   - marks it operational, which stops the downtime clock.

   The repair cost is spares + vendor charge.
4. **Non-operational dashboard** [DOCS: ML A2 b1]. A live list of equipment that's down: since when, department, criticality, ticket status.
5. **Preventive maintenance and calibration.** Schedules per asset (frequency) generate PM tasks. Completion records the checklist results, the calibration agency, its **NABL certificate no.** and the calibration certificate (C5). **Category templates** seed the frequencies: annual for BP/scales/monitors/defibrillators/autoclaves, and 6 or 12 months for analysers per OEM. [RESEARCH-WEAK: Gemini, R7.2] The evidence pack per asset (register entry, PM history, calibration certificates, breakdown log, uptime) is exportable for NABH audits. [RESEARCH: Gemini, R7.1, NHSRC guideline]
6. **Downtime and cost** [DOCS: ML A2 b3]. Per asset and period:
   - downtime hours and uptime %;
   - maintenance cost (spares + vendor + AMC share);
   - cost as a % of the purchase cost.
7. **Condemnation.** Approval, a reason and the disposal record.

## Screens
- `/app/equipment/assets`: list, detail with history, QR print.
- `/app/equipment/non-operational`: the [DOCS: ML A2 b1] dashboard.
- `/app/equipment/tickets`: list, detail.
- `/app/equipment/pm`: calendar and tasks.
- `/app/equipment/contracts`: AMC/CMC.
- Reports:
  - downtime by asset and department;
  - maintenance cost;
  - PM compliance %;
  - AMC expiry;
  - breakdown frequency.
- Android A2 screens: see `android-a2-equipment-maintenance.md`.

## Data model
- `equipment(location_id, asset_tag, name, category, department_id FK, make, model, serial_no, supplier_id FK null, purchase_date, purchase_cost_paise, installed_on, warranty_until, criticality enum high|medium|low, status enum operational|non_operational|under_maintenance|condemned, qr_code)`, with UNIQUE (tenant_id, asset_tag)
- `equipment_contracts(equipment_id FK, contract_type enum warranty|amc|cmc, supplier_id FK, start_date, end_date, cost_paise, visits_per_year, covers_parts bool, excluded_parts text, uptime_guarantee_bp null)` (Phase 2 fields) [RESEARCH: Gemini, R7.3]
- `equipment.status` adds `ber`; `equipment_tickets` adds `engineer_arrived_at` [RESEARCH: Gemini, R7.1]
- `equipment_compliance(equipment_id FK, kind enum aerb_licence|aerb_qa|tld_period|other, ref_no, valid_from, valid_to, next_due, attachment_id FK null)` and `tld_badges(employee_id FK, period, issued_on, returned_on, dose_report_attachment_id null)` [RESEARCH-WEAK: Gemini, R3.2]
- `equipment_tickets(location_id, ticket_no, equipment_id FK, reported_by, reported_at, problem text, priority, assigned_to_user_id null, vendor_supplier_id FK null, status enum open|assigned|in_progress|awaiting_parts|resolved|closed|cancelled, diagnosis text, solution text, resolved_at, vendor_charge_paise, attachment_ids uuid[])`
- `equipment_downtime(equipment_id FK, ticket_id FK null, down_from, up_at null)`, with an open interval while it's down and at most one open row per asset (partial unique index)
- `equipment_ticket_parts(ticket_id FK, item_id FK, batch_id FK null, qty, cost_paise, stock_issue_id FK)`
- `equipment_pm_schedules(equipment_id FK, kind enum pm|calibration, frequency_days, checklist jsonb, next_due)` and `equipment_pm_tasks(schedule_id FK, due_on, done_on, done_by, result enum pass|fail|na, notes, certificate_attachment_id FK null)`
- `equipment_condemnations(equipment_id FK, reason, approved_by, disposed_on, disposal_note)`

## APIs (module `equipment`; features `equipment.master` [DOCS: ML A2 b3], `equipment.breakdown` [DOCS: ML A2 b1–b2], `equipment.pm`, `equipment.reports` [DEFAULT])

| Method | Path | Feature | Roles |
|---|---|---|---|
| GET/POST/PATCH | `/tenant/equipment/assets` ; GET `/assets/:id` ; GET `/assets/by-qr/:code` | equipment.master | Biomedical Eng; read for all staff |
| GET | `/tenant/equipment/non-operational` | equipment.breakdown | all staff (own dept), Biomedical Eng |
| POST | `/tenant/equipment/tickets` (Idem) | equipment.breakdown | any staff |
| PATCH | `/tenant/equipment/tickets/:id` ; POST `/:id/{assign,resolve,close,cancel}` | equipment.breakdown | Biomedical Eng |
| POST | `/tenant/equipment/tickets/:id/parts` (Idem) | equipment.breakdown | Biomedical Eng |
| GET/POST | `/tenant/equipment/contracts` | equipment.master | Biomedical Eng, Accounts |
| GET/POST | `/tenant/equipment/pm/{schedules,tasks}` ; POST `/pm/tasks/:id/complete` | equipment.pm | Biomedical Eng |
| GET | `/tenant/equipment/reports/{downtime,cost,pm-compliance,amc-expiry,breakdowns}` | equipment.reports | Admin, Biomedical Eng |

## Business rules and edge cases
- Raising a ticket on an operational asset sets it to non-operational and opens a downtime row in the same transaction. Resolving closes the row.
- A ticket on an asset that's already down links to the same downtime interval; no second interval opens.
- Downtime hours are wall-clock by default. Excluding non-working hours is [DEFAULT, to confirm by research].
- Condemned assets can't get tickets or PM tasks.
- A PM task overdue by more than 7 days shows red on the dashboard. Calibration failure sets the asset to non-operational.
- AMC expiring within 30 days triggers an alert (outbox to the Biomedical Engineer).
- **Critical equipment down** (for example a ventilator, defibrillator, or blood-bank fridge) sends an immediate notification to the department head [DEFAULT, to confirm by research].

## Integrations
- Stores: spares through C3.
- Bill Passing: AMC and vendor bills.
- OT, Radiology, Lab and Blood Bank: asset-down warnings in their screens.
- MIS: cost centre, downtime.
- A2 Android: everything in the [DOCS: ML A2] list.

## Tier
Not in Sheet1. **OPEN – to confirm with Ajay Sheth.** No default tier is set. (OPEN-QUESTIONS-AJAY #9) Feature keys exist so App Admin can assign any tier once decided.
The Android A2 app uses the same keys.

## Acceptance criteria
- Create an asset (cost ₹4,00,000) → a nurse raises a ticket at 10:00 → the asset shows on the non-operational list → resolve at 16:30 with a ₹1,200 part and a ₹2,500 vendor charge → downtime 6.5 h, cost ₹3,700, 0.93% of purchase cost on the report.
- A second ticket while the asset is down doesn't open a second downtime interval.
- A QR lookup returns the asset only within the tenant (cross-tenant QR → 404).
- RLS fixtures exist for all `equipment_*` tables.
- (Phase 2) A high-criticality monitor down for 40 h in a 30-day month shows 94.4% uptime, flagged below the 95% target. Its CMC with a 97% guarantee shows a guarantee breach on the contract report.
- (Phase 2) An X-ray unit with an AERB licence expiring in 45 days shows on the compliance due list.

## Build order and tasks (migrations 1220–1239)
### EQ-T1 Asset master, contracts, QR codes and RLS
- **Model:** grok.
- **Depends:** SF-T2, SF-T3.
### EQ-T2 Tickets, downtime intervals, status sync and parts through C3
- **Accept:** the worked example as a test.
- **Model:** grok.
- **Depends:** EQ-T1, SF-T4.
### EQ-T3 PM and calibration schedules, task generation job, alerts through the outbox
- **Model:** grok.
- **Depends:** EQ-T1, SF-T7.
### EQ-T4 Reports
- **Scope:** downtime, cost, PM compliance, AMC expiry, breakdowns.
- **Model:** grok.
- **Depends:** EQ-T2, EQ-T3.
### EQ-T5 Web: assets, non-operational dashboard and tickets
- **Model:** composer.
- **Depends:** EQ-T2.
### EQ-T6 Web: PM, contracts, reports and seed
- **Model:** composer.
- **Depends:** EQ-T3, EQ-T4.
### EQ-T7 Compliance items: AERB licence, QA, TLD badges and the NABH evidence pack (Phase 2)
- **Scope:** `equipment_compliance`, `tld_badges`, due-list and outbox alerts, uptime-vs-target and uptime-vs-guarantee reports, the per-asset evidence-pack export.
- **Accept:** the Phase 2 acceptance bullets.
- **Model:** grok.
- **Depends:** EQ-T3, EQ-T4.
