# Research questions for Phase 2 (outside research)

> **Phase 2 status (12 Nov 2026):** answers, sources, verification and conflicts per question are in `RESEARCH-LOG.md`. Summary: 24 answered, 35 weak, 6 open (batch 9, plus new decisions R9.7–R9.10 in `INDEX.md`). Sub-parts still open are listed at the top of the log.

These are the open questions behind every `[GAP: needs research]` and `[DEFAULT, to confirm by research]` tag in the specs. They're grouped into **9 batches**. Each batch is a ready-to-paste prompt for Perplexity, ChatGPT or Gemini.

How to use them:
- Paste the whole fenced block for a batch.
- Ask for sources (statute, rule, circular, guideline, with year).
- Record each answer against its question id (for example `R3.4`) in the module spec, replacing the tag with `[RESEARCH: <tool>, <source>]`.
- Where two tools disagree, keep both and flag it.

Question ids map to spec files in brackets. Keep usage sensible: one batch per tool first, then cross-check only the disputed answers.

---

## Batch 1 · Inpatient and outpatient billing practice, and GST on hospital services
Specs: 01-ip-billing, gap-op-billing, gap-pharmacy, 15-night-audit, 18-medicard

```text
Context: I'm specifying billing for a multi-tenant HMIS SaaS for small private hospitals and nursing homes in India (10–100 beds, several branches in Maharashtra, Madhya Pradesh and Rajasthan). Answer for India as of 2026, cite the statute/notification/circular/guideline and year for each answer, say clearly where practice varies or where you're unsure, and don't invent sources.

R1.1 How do Indian hospitals usually count inpatient bed-days for room charges: midnight census, 24-hour cycles from admission time, or calendar days? How is the discharge day and a stay under 24 hours charged? What's common in nursing homes?
R1.2 GST on healthcare: which hospital services are exempt as "health care services by a clinical establishment"? What's the current GST treatment of (a) room rent above a per-day threshold (non-ICU), (b) medicines and consumables supplied to inpatients (composite supply?), (c) OP pharmacy sales, (d) cosmetic procedures, (e) health check packages, (f) a hospital membership/discount card fee? Give rates and the notification numbers.
R1.3 Interim vs final bill: is an interim bill a tax document? What must a final hospital bill show (itemisation, rates, GSTIN, HSN/SAC)? Any NABH or state Clinical Establishments Act requirements for bill transparency or displaying rates?
R1.4 Package billing in Indian nursing homes (fixed surgical packages with exclusions): typical structure, how excess stay or exclusions are billed.
R1.5 Common concession or discount approval practice: who can approve, typical limits, reason codes. Any regulatory constraints?
R1.6 Deposits and refunds: typical advance deposit practice on admission, refund modes, and cash-handling limits (for example the Income Tax Act section 269ST on cash receipts of ₹2 lakh or more). What does this mean for a hospital billing system?
R1.7 What's a sensible standard for patient bill and receipt numbering (per branch, per financial year), and are gap-free series needed for non-GST (exempt) bills?
R1.8 "Night audit" / end-of-day close in Indian hospital HMIS products: what does it usually include (bed charge posting, counter cash close, reconciliation, day lock)? Name common HMIS products that use the term, if you know any.
```

## Batch 2 · Insurance, TPA and government schemes
Specs: 05-insurance-tpa, 01-ip-billing

```text
Context: same HMIS for small Indian private hospitals (see above). India, 2026, cite sources, don't invent.

R2.1 End-to-end cashless hospitalisation flow with insurers and TPAs in India: pre-authorisation, query, approval, enhancement, discharge approval, claim submission, settlement. Typical turnaround-time rules (IRDAI master circular on health insurance, 2024 or later).
R2.2 The National Health Claims Exchange (NHCX): status in 2026, whether small hospitals must or can integrate, standards used (FHIR profiles), and what an HMIS needs to support.
R2.3 Bill deductions: how room-rent eligibility limits and "proportionate deduction" work, common non-payable items (IRDAI list of excluded items), and how co-pay is applied. Give a worked example.
R2.4 Government schemes a small private hospital may empanel with (AB PM-JAY, state schemes such as MJPJAY in Maharashtra, Chiranjeevi in Rajasthan, Ayushman in MP, CGHS, ECHS): package-rate billing and claim portals. Should an HMIS integrate, or only record?
R2.5 TDS on insurer and TPA claim settlements to hospitals (section and rate), and how hospitals reconcile disallowances.
R2.6 Can one admission have several payers (insurer + corporate top-up + patient)? How are bills split?
R2.7 Which documents are typically needed for a cashless claim file and for reimbursement claims?
```

## Batch 3 · Clinical modules: OT, radiology, lab, nursing, CPOE
Specs: 03-ot-scheduling, 04-radiology, gap-lab, gap-nurse-station, gap-doctor-workspace-cpoe, android-a5

```text
Context: same HMIS (India, 2026, small hospitals and nursing homes; NABH entry-level and full accreditation relevant). Cite NABH standard numbers/editions, Acts and guidelines; don't invent.

R3.1 OT: NABH requirements for OT scheduling and records. Is the WHO Surgical Safety Checklist expected? What should the pre-op checklist, consent and operation notes contain? OT charge structures (slabs by duration, surgeon and anaesthetist fees as % of the surgeon fee)?
R3.2 Radiology: PC-PNDT Act obligations for ultrasound centres (Form F fields, registers, online submission, retention period). AERB licensing for X-ray and CT, and what an HMIS should track. Is DICOM/PACS integration common or expected in small hospitals? Typical report TAT expectations.
R3.3 Lab: interfacing analysers to an LIS in India (ASTM E1394 vs HL7 v2, middleware, serial vs TCP). Common analysers in small labs. NABL/NABH expectations for critical-value reporting and read-back, sample rejection criteria, and report sign-off by a pathologist.
R3.4 Lab reports by email/WhatsApp: any legal or NABH constraints, and patient consent under the DPDP Act 2023.
R3.5 Nursing: NABH requirements for the medication administration record, high-alert medication double-checks, the "rights" of medication administration, and verbal/telephonic order countersignature (time limit).
R3.6 Prescriptions: NMC rules on prescription format (generic names, legibility, registration number). Expectations for drug-interaction checking in Indian EMRs, and licensed drug databases available in India.
R3.7 Diagnosis coding: is ICD-10 (or ICD-11) expected for Indian hospital records and insurance claims? Any ABDM requirement?
```

## Batch 4 · Blood bank / blood centre regulation
Specs: 09-blood-bank

```text
Context: same HMIS; the customers are small private hospitals and nursing homes in India (2026). Cite the Drugs and Cosmetics Rules (as amended), NBTC guidelines and CDSCO notices; don't invent.

R4.1 What can a small hospital do without a full blood centre licence: blood storage centre rules (licence, tie-up with a mother blood centre, quantity limits, staff)?
R4.2 For a licensed blood centre: the mandatory TTI screening tests, donor eligibility criteria and deferral rules, component shelf lives and storage temperatures.
R4.3 Mandatory registers and records (donor, issue, discard, cross-match, transfusion reaction) and retention periods.
R4.4 e-RaktKosh: is reporting mandatory for private blood centres or storage centres, and is there an API?
R4.5 Emergency issue of uncross-matched O-negative: accepted practice and documentation. Return-to-blood-bank time window for issued units.
R4.6 Rules for disclosing TTI-reactive results to donors (counselling, referral) and confidentiality.
```

## Batch 5 · Procurement, stores, pharmacy compliance and bill passing
Specs: 07-indents-purchase, 08-bill-passing, gap-pharmacy, 00-shared-foundations

```text
Context: same HMIS for small Indian hospitals (2026). Cite Acts, rules and CBIC/CBDT notifications; don't invent.

R5.1 In Indian hospital/HMIS terminology, what do "Scrolling", "Certification" and "Bill Passing" mean in the context of supplier bills? Describe a typical scroll register → certification → bill passing → payment approval flow.
R5.2 Typical departmental indent → store issue → purchase requisition → PO → GRN flow in Indian hospitals. Approval-slab practice. Quantity and rate tolerances for 3-way matching.
R5.3 Pharmacy compliance under the Drugs and Cosmetics Rules: registers for Schedule H, H1 and X drugs (fields, retention), NDPS Act record-keeping for hospitals, and prescription requirements for OP and outside sales.
R5.4 GST input tax credit for a hospital providing mostly exempt services: can it claim ITC on medicine and consumable purchases? How do hospitals typically account for this?
R5.5 TDS applicable to hospital vendor payments (sections 194C, 194J, 194Q, 194H, etc.) with thresholds and rates for 2026.
R5.6 The MSME 45-day payment rule (MSMED Act section 15, Income Tax section 43B(h)): what a hospital accounts system should flag.
R5.7 FEFO, near-expiry thresholds and short-expiry acceptance norms in Indian hospital pharmacies.
```

## Batch 6 · HR, payroll, attendance and grievances
Specs: 13-payroll-attendance, 17-employee-complaint-tracker, android-a6

```text
Context: same HMIS for small Indian private hospitals with branches in Maharashtra, Madhya Pradesh and Rajasthan (2026). Cite Acts, the new Labour Codes status, state notifications; don't invent.

R6.1 Status in 2026 of the four Labour Codes (Wages, Social Security, Industrial Relations, OSH): are they in force, and what changed for wage definition (50% rule), PF, ESI, gratuity and bonus?
R6.2 EPF: wage ceiling, employee and employer rates, the EPS/EDLI split, and the ECR file format for monthly returns.
R6.3 ESI: wage threshold, employee and employer rates, contribution periods, and the return/challan process.
R6.4 Professional Tax slabs and rules for Maharashtra, Madhya Pradesh and Rajasthan (does Rajasthan levy PT?). Labour Welfare Fund rates and periodicity for those states.
R6.5 TDS on salary (section 192), new vs old regime defaults, and what payroll software must compute monthly.
R6.6 Paid-days basis (calendar days vs 26 days), overtime rules for nurses and hospital staff, shift and rest-period norms.
R6.7 Leave norms (CL, SL, EL) under the Shops and Establishments Acts in those states, as they apply to hospitals.
R6.8 Gratuity and full-and-final settlement timelines.
R6.9 POSH Act 2013: Internal Committee requirements, complaint timelines and confidentiality. Is it appropriate for HR software to handle POSH complaints, or only route them? Best practice for anonymous employee grievance systems in India.
R6.10 DPDP Act considerations for employee data (Aadhaar storage limits, biometric attendance data, geofenced mobile attendance).
```

## Batch 7 · Facilities: equipment, maintenance, linen and laundry
Specs: 11-equipment-maintenance, 12-maintenance-tracker, 10-linen-laundry, android-a2, android-a7

```text
Context: same HMIS for small Indian hospitals and nursing homes (2026). Cite NABH FMS (facility management and safety) standards, BMW Rules, fire rules and AERB; don't invent.

R7.1 NABH FMS chapter: what it requires for medical equipment management (inventory, PM schedules, calibration, breakdown records, downtime) and what evidence an HMIS can provide.
R7.2 Calibration frequency norms for common equipment (BP apparatus, weighing scales, monitors, defibrillators, autoclaves, lab analysers). Who may calibrate (NABL-accredited labs)?
R7.3 AMC vs CMC norms in Indian hospitals, and the typical fields of an equipment master.
R7.4 Statutory and recurring facility checks for a small hospital: fire extinguishers and fire NOC, DG set logs, lift licences, water tank cleaning, electrical safety audits, pest control. Typical frequencies.
R7.5 Is "Maintenance Tracker" in Indian HMIS usually distinct from biomedical "Equipment Maintenance"? What does each usually cover?
R7.6 Linen and laundry: NABH/infection-control requirements for segregating soiled vs infected linen, washing standards, linen par levels per bed, condemnation practice, and outsourced laundry billing (per kg vs per piece).
```

## Batch 8 · Data protection, ABDM, portals and marketing
Specs: _CONVENTIONS, 14-access-data-migration, 16-marketing, android-a3, android-a4, 02-mis-dashboards, gap-lab

```text
Context: same multi-tenant HMIS SaaS (India, 2026). We are the data processor; each hospital is the data fiduciary. Cite the DPDP Act 2023, DPDP Rules (as notified), ABDM/NHA documents, TRAI and NMC regulations, and medical-records retention rules; don't invent.

R8.1 DPDP Rules: what is now in force and when; consent notice content; consent managers; breach notification timelines (to the Board and to data principals); children's data and verifiable guardian consent (age, methods); retention and erasure duties; obligations of a processor vs a fiduciary.
R8.2 Medical records retention periods in India (NMC/MCI regulations, state Clinical Establishments rules, medico-legal cases, PC-PNDT, blood bank) and how they interact with DPDP erasure requests.
R8.3 ABDM in 2026: ABHA creation and linking at registration, Scan & Share for OPD, HFR/HPR registration, HIP/HIU milestones (M1/M2/M3), the DHIS incentive scheme, and what a small-hospital HMIS needs to be ABDM-certified.
R8.4 Patient portals: which records may be shown to patients (notes, results, critical results before doctor review), guardian access for minors, and OTP-based authentication norms.
R8.5 Marketing: DPDP consent for marketing messages to patients; TRAI DLT registration (entity, headers, templates) for SMS; WhatsApp Business rules; NMC/ethics rules on paying referral fees to doctors and on hospital advertising.
R8.6 Hospital membership/discount cards ("Medicard"): are they legal? When would a prepaid card fall under RBI PPI rules, or a health card resemble insurance under IRDAI? GST on card fees.
R8.7 Standard hospital MIS KPIs and formulas used in India: bed occupancy %, ALOS, bed turnover, ARPOB, OPD-to-IPD conversion, doctor-wise revenue, and how cost-centre profitability is usually allocated in small hospitals.
R8.8 "Access Data Migration": do Indian legacy HMIS products commonly run on Microsoft Access? Best practice for migrating patient master data, opening balances and stock into a new HMIS (dedupe, cut-over).
```

## Batch 9 · Product and tier decisions (for Kahaan / the doc author, not web research)
Specs: INDEX and every spec's Tier section

```text
These need a decision from Kahaan or Ajay Sheth (the module doc's author), not web research. Ask them directly.

R9.1 Tiers for the 17 modules not in Sheet1 (OT, Radiology, Insurance, Indents, Bill Passing, Blood Bank, Linen, Equipment, Maintenance Tracker, Payroll, Data Migration, Night Audit, Marketing, MIS, Complaint Tracker, Medicard, Users Management): confirm or change the defaults in INDEX.md.
R9.2 Are the Android apps separate add-ons or included with their modules?
R9.3 Do self-service employees and patients count towards seat limits (Basic 8 / Medium 25 / Premium 80)?
R9.4 Meanings to confirm: "Scrolling, Certification, Bill Passing"; "Access Data Migration" (MS Access?); "Medicard"; "Employee Complaint Tracker" (complaints by vs about employees); "Maintenance Tracker" vs "Equipment Maintenance".
R9.5 What does Sheet3's "Stage" column (1–4) mean? And which existing system do the Status values (Change / No Change / New) refer to?
R9.6 Blood bank: do target customers run full blood centres or only storage centres?
```
