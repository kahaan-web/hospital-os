# Research log, Phase 2 (12 Nov 2026)

This log records what the outside research answered for each research question, R1.1 to R8.8, and how each answer was folded into the specs. Batch 9 (R9.1 to R9.6) is left open as Kahaan's decisions; they're listed at the top of `INDEX.md`.

**Inputs**
- **Perplexity**, batches 1–2: `/workspace/perplexity-hmis/batch1-answer.txt`, `batch2-answer.txt`, with sources in `batch1-sources.txt` and `batch2-sources.txt`. Its own caveats are in `uncertainty-notes.md`. Perplexity's batch 5 attempt hit a sign-up wall and is ignored. Perplexity did not run batches 3–8.
- **Gemini**, batches 3–8: `/workspace/gemini-hmis/batch3-answer.txt` to `batch8-answer.txt`, with `*-sources.json`. Its own weaknesses are in `batches5-8-notes.json` and `complete-research.md`.
- **My verification**: 13 official-source checks (curl, plus WebSearch with official-document snippets), stored in `/workspace/hmis-verify/`. They're marked `[VERIFIED: …]` below and in the specs.

**Tags used in the specs**
- `[RESEARCH: <tool>, <source>]`: answered, with a specific citation. Source keys such as `P1-6` point to the source list at the end of this file.
- `[RESEARCH-WEAK: <tool>, verify]`: there's an answer, but it has no citation, only a homepage, a vendor or blog source, or a foreign source. Any number or rate it gives is kept as **configuration**, never hard-coded.
- `[VERIFIED: <url>]`: I checked it against an official text.
- `[CONFLICT: …]`: two tools disagree, or the research disagrees with a Phase 1 default or with an official text. Both sides are kept.
- `[DOCS]` items were not changed. Docs still win over research.

## Status summary

| Status | Count | Question ids |
|---|---|---|
| **Answered** (cited, some partly) | **24** | R1.1, R1.2, R1.3, R1.5, R1.6, R1.7, R2.1, R2.2, R2.3, R2.5, R2.7, R3.2 (PC-PNDT part), R3.7, R4.1, R5.3 (Schedule H1 part), R6.1, R6.2, R6.3, R6.9, R7.1, R7.3, R8.1, R8.2, R8.3 |
| **Weak** (answer given, citation weak or missing) | **35** | R1.4, R1.8, R2.4, R2.6, R3.1, R3.3, R3.4, R3.5, R3.6, R4.2, R4.3, R4.4, R4.5, R4.6, R5.1, R5.2, R5.4, R5.5, R5.6, R5.7, R6.4, R6.5, R6.6, R6.7, R6.8, R6.10, R7.2, R7.4, R7.5, R7.6, R8.4, R8.5, R8.6, R8.7, R8.8 |
| **Open** | **6** questions, plus the sub-parts below | R9.1–R9.6 (Kahaan's decisions) |

Sub-parts no tool answered (still open):
- R2.4: the claim-portal URLs and current state-scheme names.
- R3.2: the AERB rule citation.
- R4.4: an official e-RaktKosh mandate and its API.
- R5.3: Schedule X register fields and NDPS form numbers by state.
- R6.2: the EDLI rate and the ECR file layout.
- R6.4: full PT slabs and LWF rates for MH and MP, and whether Rajasthan levies LWF.
- R6.7: MP and Rajasthan leave norms.
- R8.5: WhatsApp Business rules.
- R8.6: IRDAI and CBIC authority for Medicard.

## Official verifications done (13)

| # | Fact | Result | Official source |
|---|---|---|---|
| V1 | GST exemption for healthcare by a clinical establishment | **Confirmed.** Entry 74, Heading 9993, Nil, in Notification 12/2017-CT(R). The definition of clinical establishment, and the exclusion of cosmetic/plastic surgery and hair transplant (except reconstruction), are in the notification's definitions. | https://cbic-gst.gov.in/hindi/pdf/central-tax-rate/Notification12-CGST.pdf |
| V2 | Room rent above ₹5,000/day (non-ICU) taxable | **Confirmed.** Entry 31A: 2.5% CGST (5% total), on rooms other than ICU/CCU/ICCU/NICU charging above ₹5,000 per day, with no ITC taken. | https://gstcouncil.gov.in/sites/default/files/2024-05/03_2022-ctr-eng_1.pdf |
| V3 | IRDAI cashless timelines | **Confirmed.** Cashless authorisation "immediately but not more than one hour". Final discharge authorisation within three hours; any delay cost is borne by the insurer from the shareholders' fund. Master Circular on Health Insurance Business, 29 May 2024. | IRDAI PDF (source P2-2) |
| V4 | Blood storage centre | **Confirmed, with an age caveat.** The NACO guideline says: storage centres transfusing under **2,000 units a year** are exempt from a licence but need **approval from the State/UT licensing authority**; the mother centre must be a licensed Government hospital, Indian Red Cross or Regional Blood Transfusion Centre blood bank; 10 m²; unused bags go back to the mother centre **at least 10 days before expiry**; expiry 35/42 days. **Caveat:** the guideline predates later Drugs Rules amendments. Whether private mother centres are now allowed is open. | https://naco.mohfw.gov.in/files/8-Guidelines%20for%20Setting%20up%20Blood%20Storage%20Centres%281%29.pdf |
| V5 | EPF wage ceiling | **Confirmed.** ₹25,000/month from **17 Sep 2026**, by S.O. 5109(E) under the Code on Social Security 2020, superseding S.O. 2702(E) of 29 May 2026. EPS maximum is 8.33% of ₹25,000. | https://www.labour.gov.in/static/uploads/2026/09/2b0f1dbbd3769fc388416186ec145328.pdf ; PIB https://www.pib.gov.in/PressReleasePage.aspx?PRID=2314111 |
| V6 | ESI | **Confirmed.** Employee 0.75%, employer 3.25%. Ceiling ₹21,000 (₹25,000 for persons with disability). Employees at ₹176/day or less are exempt from the employee share. Contribution periods Apr–Sep and Oct–Mar. Due within 15 days of month end. | https://esic.gov.in/contribution ; ESIC Standard Note as on 01.01.2026 |
| V7 | Labour Codes in force | **Confirmed.** The Code on Social Security has been in force since **21.11.2025** (Lok Sabha Unstarred Q.1345, 27.07.2026). | https://sansad.in/getFile/lsapps/loksabhaquestions/annex/188/AU1345_TBAsOH.pdf |
| V8 | Cash receipt limit | **Confirmed.** Income-tax Act 2025 **s.186** (in force 1 Apr 2026) bars receiving ₹2,00,000 or more in cash from a person in a day, for a single transaction, or for one event. The old reference is s.269ST. | https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf |
| V9 | TDS on professional fees under the new Act | **Confirmed.** s.393(1) Table Sl. 6(iii): 10% for professional fees (2% for technical services). Threshold **₹50,000**. | https://www.incometaxindia.gov.in/w/section-393-6 |
| V10 | DPDP Rules commencement | **Confirmed.** Notified 13 Nov 2025 (G.S.R. 846(E); Act commencement G.S.R. 843(E)). Rules 1, 2 and 17–21 in force immediately. **Rule 4 (Consent Managers) from 13 Nov 2026.** Rules 3, 5–16, 22 and 23 (most duties, including notice and breach) from **13 May 2027**. | https://egazette.gov.in/WriteReadData/2025/267647.pdf ; PIB PRID 2190014 |
| V11 | DPDP breach intimation (Rule 7) | **Confirmed.** Tell each affected principal without delay. Tell the Board without delay, and send the detailed report **within 72 hours**. Rule 6(1)(e) also requires keeping security logs for **one year**. | https://www.dpdpa.in/dpdpa_rules_2025/dpdpa_rules_english_2.pdf (copy of the gazette text) |
| V12 | PC-PNDT records | **Confirmed.** Rule 9(4) Form F for each prenatal procedure. Rule 9(6) keep records **2 years** (until disposal if proceedings are pending). Rule 9(8) monthly report by the **5th** of the following month. | https://dhsr.hp.gov.in/Files/PC-PNDT%20RULES%20-1996_0.pdf |
| V13 | Schedule H1 register | **Confirmed.** Rule 65: a separate register recording the prescriber's name and address, the patient's name, the drug name and the quantity; kept **3 years**. | https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2022/drug_rules/Drugs%20Rules%201945_2024%2009.09.2024.pdf ; NHSRC register format https://nhsrcindia.org/sites/default/files/2021-07/Attachment%20A%2C%20Schedule%20H1%20register%20and%20NDPS%20Forms.pdf |

V7 and V9–V13 rely on official document text quoted in search results (gazette, CBDT, CDSCO, state PDFs), not full downloads. V1–V4 were downloaded and read.

## Per question

Format: **id** · status · tool · sources · what changed in the specs · conflicts.

### Batch 1: billing and GST (Perplexity)
- **R1.1** · answered · Perplexity · P1-4 (Raigad Hospital IPD policy, no year), P1-5 (MoHFW Patients' Rights Charter).
  - **Finding:** there is no national room-day convention. The bed-day basis must be configuration: admission anniversary, fixed checkout or calendar day, with grace and half-day rules.
  - **Specs:** 01 (bed-day policy config, IPB-T3 scope), 15.
  - **Conflict:** the Phase 1 default was a midnight census. Perplexity says the midnight census is for statistics, not a commercial rule. The default changes to "configurable; no default basis imposed; tenant picks at setup", with the midnight census kept for MIS only.
- **R1.2** · answered · Perplexity, **V1, V2 verified**.
  - **Findings:**
    - Entry 74 exempts healthcare.
    - Room rent above ₹5,000 (non-ICU) is 5% with no ITC, on the whole charge.
    - IP medicines and consumables are an exempt composite supply (Kerala AAR, not binding).
    - OP pharmacy is taxable per HSN: mostly 5%, some nil, from 22 Sep 2025 (Notifications 09/2025 and 10/2025-CT(R); P1-1 Delhi Drugs Control circular).
    - Cosmetic procedures 18%.
    - Diagnostic health-check packages exempt.
    - Card fee: probably 18%, but there's no clarification (**weak**).
  - **Specs:** 01, gap-pharmacy, 00 (service tax config), 18.
  - **Conflict:** none. Gemini R8.6 also says 18% for card fees.
- **R1.3** · answered · Perplexity · CGST Rules 46/49/50 (P1-12, P1-13), MoHFW Charter (P1-5); Maharashtra Nursing Homes Amendment Rules 2021 Sch. III rate display (P1-15/16; the 2026 GR number is unverified).
  - **Finding:** the interim statement is "provisional – not a tax invoice". Separate document types: bill of supply, tax invoice, receipt voucher, refund voucher, credit note.
  - **Specs:** 01 (new IPB-T10), gap-op-billing.
- **R1.4** · **weak** · Perplexity · P1-22 (consumer insurance blog).
  - **Finding:** no statutory package template. Package master fields are proposed.
  - **Specs:** 01 (new optional IPB-T12, package billing).
- **R1.5** · answered (no statute; management policy) · Perplexity.
  - **Findings:** use percentage **and** absolute caps, cumulative per encounter. Discounts on taxable supplies follow CGST s.15(3) and s.34 (credit notes).
  - **Specs:** 01, gap-op-billing.
  - **Conflict:** Perplexity's proposed matrix gives the cashier **no** discretion (supervisor 5%/₹2,000, branch admin 10%/₹10,000). The Phase 1 default was cashier 5%/₹1,000. Both are kept. The seed now follows Perplexity, since it's more conservative.
- **R1.6** · answered · Perplexity (P1-24/25/26), **V8 verified**.
  - **Findings:**
    - Block a cash receipt that would make ₹2,00,000 or more per person per day, per transaction, or per event. This is s.186 of the Income-tax Act 2025 (formerly s.269ST; penalty s.451, formerly s.271DA).
    - Evaluate at the legal-entity level.
    - No manager override.
    - A refund doesn't reset the total.
  - **Specs:** 01, gap-op-billing, gap-pharmacy, 00 (new SF-T9 cash-limit guard).
- **R1.7** · answered · Perplexity · CGST Rules 46/49/50.
  - **Findings:** invoice serial at most 16 characters, unique per financial year. A GST-registered hospital's exempt bills of supply also need consecutive numbering. Cancelled numbers are kept, never reused, and there's a gap report.
  - **Specs:** _CONVENTIONS §4 (series format must be ≤16 characters), 01.
  - **Conflict:** the Phase 1 format `<LOC>/<DOC>/<FY>/<seq>` can exceed 16 characters. It's now constrained to ≤16, for example `MUM/IP/2627/0001`. The SaaS format `HOS/2627/000001` is 15 characters, which is fine.
- **R1.8** · **weak** · Perplexity · hotel sources only (P1-29, P1-30), P1-31.
  - **Finding:** no Indian HMIS product verified as using the term "night audit". Treat it as an explicit end-of-day workflow: counter close, reconciliation, exceptions, day lock. The day close must **not** decide room-days; the tariff policy does.
  - **Specs:** 15.

### Batch 2: insurance and TPA (Perplexity)
- **R2.1** · answered · Perplexity · IRDAI Master Circular 29 May 2024 (P2-1/P2-2), **V3 verified**.
  - **Findings:**
    - Pre-auth decision within 1 h.
    - Discharge authorisation within 3 h; delay cost is the insurer's.
    - Settlement within 30 days of the last document (cited, not independently verified).
    - The insurer or TPA collects documents from the hospital.
    - No statutory enhancement TAT.
  - **Specs:** 05 (TAT timers and breach flags).
- **R2.2** · answered · Perplexity · IRDAI HCX circular (P2-6), NRCeS NHCX FHIR profiles (P2-7, P2-12), PIB (P2-8, P2-10), ABDM DHIS (P2-14).
  - **Findings:**
    - NHCX is live but not mandated for small hospitals.
    - It uses FHIR R4 profiles: Claim, ClaimResponse, Coverage, CoverageEligibilityRequest/Response, Task, PaymentNotice, PaymentReconciliation.
    - It needs ABDM M1 and HFR.
    - DHIS gives an incentive for PM-JAY claims filed through NHCX.
  - **Specs:** 05 (new INS-T8, NHCX-ready FHIR export; INS-T9 connector, held).
- **R2.3** · answered · Perplexity · IRDAI 2020 circular, Standardisation master circular (P2-16).
  - **Findings:**
    - Proportionate deduction = eligible ÷ actual room rent, applied to "associated" expenses, which are policy-specific.
    - There's an IRDAI non-payables list.
    - Order of application: non-payables → proportionate deduction → sub-limits → co-pay.
  - **Specs:** 05 (split engine order, worked example).
- **R2.4** · **weak** · Perplexity · hospitals.pmjay.gov.in (P2-18), insights.pmjay (P2-19).
  - **Findings:**
    - PM-JAY: ₹5 lakh per family per year, HBP package codes.
    - The state scheme rows are generic. Perplexity's own note says the portals and names weren't verified.
  - **Specs:** 05 (scheme master, separate ledger; new INS-T10).
- **R2.5** · answered · Perplexity (P2-13 myndsolution, P2-20 eztax), **V9 verified**.
  - **Findings:** TDS on insurer/TPA payments to hospitals at 10% as professional fees, with lower-deduction certificates possible. Reconcile against Form 26AS.
  - **Specs:** 05, 08.
  - **Conflict:** Perplexity cites old s.194J. Under the Income-tax Act 2025 it's s.393 Table Sl. 6(iii), threshold ₹50,000 (V9). Section codes are configuration.
- **R2.6** · **weak** (no citation) · Perplexity.
  - **Finding:** several payers per admission (primary + corporate top-up + scheme + patient) is normal. Split at line level into responsibility buckets.
  - **Specs:** 05.
  - **Conflict:** the Phase 1 default (v1 = one payer + patient) is changed to multi-payer buckets (INS-T3 scope +1 task).
- **R2.7** · answered · Perplexity · IRDAI master circular.
  - **Finding:** cashless and reimbursement document checklists.
  - **Specs:** 05 (checklist seed).

### Batch 3: clinical (Gemini)
- **R3.1** · **weak** · Gemini · G3-1 (Rely Technologies NABH checklist, vendor).
  - **Findings:**
    - WHO Surgical Safety Checklist (sign-in, time-out, sign-out) expected.
    - Pre-op items: ID, NPO, vitals, allergy, site marking, PAC clearance, blood.
    - Procedure-specific consent with a witness.
    - Op notes before the patient moves to recovery.
    - Charges: duration slabs; anaesthetist 30–40% of the surgeon fee.
  - **Specs:** 03.
- **R3.2** · answered (PC-PNDT) / weak (AERB, PACS, TAT) · Gemini · G3-2 (Delhi Health PC-PNDT page), **V12 verified**.
  - **Findings:**
    - Form F before the scan.
    - Register; monthly report by the 5th; keep 2 years.
    - AERB e-LORA, TLD badges and QA dates (**weak**, no source).
    - PACS increasingly expected (weak).
    - TAT: routine 12–24 h, stat 1–2 h (weak).
  - **Specs:** 04 (new RAD-T7), 11 (AERB tracking).
- **R3.3** · **weak** (no source) · Gemini.
  - **Findings:**
    - ASTM E1394 over RS-232 or TCP is the most common protocol; HL7 v2 on newer analysers.
    - Common analysers: Sysmex, Mindray, Erba.
    - Critical-value read-back log, sample-rejection log, pathologist sign-off.
  - **Specs:** gap-lab.
- **R3.4** · **weak** · Gemini · G3-3 (blog).
  - **Finding:** explicit opt-in consent for WhatsApp/email reports, password-protected PDFs.
  - **Specs:** gap-lab, 04.
- **R3.5** · **weak** (no source) · Gemini.
  - **Findings:** MAR with the "6 rights", double check for high-alert drugs (two nurses), LASA flags, verbal orders countersigned within 24 h.
  - **Specs:** gap-nurse-station, A5.
- **R3.6** · **weak** (no source) · Gemini.
  - **Findings:**
    - NMC: legible, generic names (capitals preferred), doctor's name, qualification and registration number.
    - Interaction checking not mandatory for small hospitals; basic allergy alerts expected.
    - CIMS is the common licensed drug database.
  - **Specs:** gap-doctor-workspace-cpoe.
- **R3.7** · answered · Gemini · G3-4 (ABDM developer docs, ICD page).
  - **Finding:** ABDM FHIR binds ICD-10 (and SNOMED CT) for conditions. ICD-10 is the functional requirement for claims.
  - **Specs:** gap-doctor-workspace-cpoe, 05.

### Batch 4: blood bank (Gemini)
- **R4.1** · answered · Gemini · G4-1 (NACO storage guideline), G4-2 (Scribd), **V4 verified**.
  - **Findings:** fewer than 2,000 units a year; State Licensing Authority approval; tie-up with a mother centre; 10 m²; refrigerator with alarm; one MO and one tech designated, with 3-day training.
  - **Specs:** 09.
  - **Conflict:** Gemini says the mother centre must be "CDSCO-licensed". The NACO text says a Government/IRCS/RBTC blood bank only. Both are kept, and the rule is configuration.
- **R4.2** · **weak** · Gemini · storage temperatures from NACO; the rest unsourced.
  - **Findings:**
    - TTI tests: HIV 1/2, HBsAg, HCV, syphilis, malaria.
    - Donor: 18–65 years, over 45 kg (50 kg for 450 ml), Hb ≥ 12.5.
    - Shelf life and temperature: RBC 35/42 days at 2–6 °C; platelets 5 days at 20–24 °C with agitation; FFP 1 year at −18 °C or colder.
  - **Specs:** 09 (component master seed as configuration).
- **R4.3** · **weak** · Gemini · G4-7 (RAKT vendor blog).
  - **Findings:** registers (donor, master, issue, discard, cross-match, transfusion reaction), kept 5 years.
  - **Specs:** 09.
- **R4.4** · **weak** (no source; describes "late 2026 DTAB proposals") · Gemini.
  - **Finding:** e-RaktKosh reporting is "mandated", with an API.
  - **Specs:** 09 (BB-T7 e-RaktKosh export, **held**).
- **R4.5** · **weak, foreign source** · Gemini · G4-8 is the **UK** NBTC.
  - **Findings:** emergency O-negative release with a physician's signed form; return unused units within 30 min.
  - **Specs:** 09.
  - **Conflict:** the source isn't Indian. The 30-minute return window conflicts with NACO's "return to the mother centre ≥10 days before expiry", which is a different flow (storage centre to mother centre). Both are kept as configuration.
- **R4.6** · **weak** · Gemini · ResearchGate secondary (G4-9/10).
  - **Findings:** consent for notification before donation; up to 3 confidential recall attempts; referral to ICTC and others.
  - **Specs:** 09.

### Batch 5: procurement, pharmacy, bill passing (Gemini; Perplexity attempt blocked)
- **R5.1** · **weak** (ICAI homepage only) · Gemini.
  - **Finding:** scrolling = initial invoice entry as a provisional liability; certification = check against GRN and PO (3-way); bill passing = Accounts' final authorisation with TDS → payment.
  - **Specs:** 08.
  - **Conflict:** Phase 1 had certification = the user department certifies receipt, and passing = the 3-way match. Gemini puts the 3-way match inside certification. The spec now supports both, as a configurable routing.
- **R5.2** · **weak** (NABH homepage) · Gemini.
  - **Findings:** slab examples (Store Manager ≤ ₹50k, Finance ≤ ₹2L, MD above); tolerances qty ±2–5%, rate ±₹10.
  - **Specs:** 07, 08.
  - **Conflict:** the Phase 1 tolerance default was qty 0 and rate ±0.5%. Both kept; the seed stays at the stricter Phase 1 value.
- **R5.3** · answered (H1) / weak (Schedule X, NDPS) · Gemini · G5-1 (Drugs Rules PDF), **V13 verified**.
  - **Findings:**
    - H1 register: prescriber, patient, drug, quantity; kept 3 years.
    - Schedule X: duplicate prescription retained, separate register, 2 years (weak).
    - NDPS: RMI registers, Forms 3E/3F "depending on state", 2 years (weak).
    - The IP drug chart serves as the prescription.
  - **Specs:** gap-pharmacy (new PH-T5).
- **R5.4** · **weak** (CBIC homepage) · Gemini.
  - **Findings:** ITC blocked for exempt IP supplies; claimable for taxable OP and outside sales; apportion under CGST Rules 42/43.
  - **Specs:** 07, gap-pharmacy.
  - **Conflict:** none with Perplexity R1.2 (both treat IP supplies as an exempt composite supply).
- **R5.5** · **weak + conflict** · Gemini (homepage).
  - **Findings:** 194C 1%/2% (₹30k single / ₹1L aggregate); 194J 10%/2% (₹30k); 194Q 0.1% over ₹50L; 194H 2% (₹15k).
  - **Specs:** 08 (TDS section master as configuration).
  - **Conflict:** V9 shows the professional-fee threshold is **₹50,000**, under the new s.393, not ₹30,000. The 194C figures match s.393 Sl. 6(i). 194Q and 194H weren't verified.
- **R5.6** · **weak** (homepages) · Gemini.
  - **Findings:** MSMED s.15: **15 days with no written agreement, 45 days with one**. s.43B(h) disallows the deduction for late payment. Capture the Udyam number and micro/small/medium status.
  - **Specs:** 08, 00.
  - **Conflict:** the Phase 1 default flagged only 45 days. Now 15 or 45 depending on whether there's an agreement.
- **R5.7** · **weak** · Gemini.
  - **Findings:** FEFO; near-expiry alerts 3–6 months; short expiry = under 60–75% of shelf life left at GRN, auto-reject with a chief-pharmacist override.
  - **Specs:** 07, gap-pharmacy.
  - **Conflict:** the Phase 1 rule was "under 6 months → warning". Now configurable by months **or** % of shelf life. The default stays a warning, not an auto-reject.

### Batch 6: HR and payroll (Gemini)
- **R6.1** · answered · Gemini (Mercans, KPMG; secondary), **V7 verified** (in force 21.11.2025).
  - **Finding:** the 50% wage rule: if excluded allowances exceed 50% of remuneration, the excess is added back into wages for PF, ESI, gratuity and bonus (secondary source).
  - **Specs:** 13 (PAY-T4 scope).
- **R6.2** · answered · Gemini (KPMG, YouTube), **V5 verified**.
  - **Findings:** ceiling ₹25,000 from 17 Sep 2026; employee 12%; employer 3.67% EPF + 8.33% EPS (EPS capped at the ceiling). EDLI and admin charges are missing (**open**). Monthly ECR text file; layout not given (**open**).
  - **Specs:** 13.
- **R6.3** · answered · Gemini (SharDhan), **V6 verified**.
  - **Specs:** 13.
- **R6.4** · **weak** · Gemini (factoHR, Tradeviser).
  - **Findings:**
    - MH PT: ₹200/month, ₹300 in February; women exempt up to ₹25,000.
    - MP PT: ₹208 × 11 + ₹212 (income over ₹3L/year).
    - Rajasthan: no PT.
  - Full slabs and LWF are missing (**open**). Seeded as configuration with `is_placeholder=true`.
  - **Specs:** 13.
- **R6.5** · **weak** · Gemini (Finin2min).
  - **Findings:** from 1 Apr 2026 salary TDS is under the Income-tax Act 2025 (s.392; quarterly Form 138 replaces 24Q per the source); new regime is the default; ₹75,000 standard deduction.
  - **Specs:** 13 (section codes as configuration).
  - **Conflict:** V9's s.393 text refers to "section 392" for salary, which is consistent. The form numbers aren't verified.
- **R6.6** · **weak** · Gemini (Wisemonk).
  - **Findings:** a 26-day divisor for minimum wages; 8 h/day, 48 h/week; a 30-minute break after 5 h; overtime at 2×, at most 144 h per quarter.
  - **Specs:** 13.
  - **Conflict:** the Phase 1 paid-days default was calendar days. Now configurable (calendar or 26); the default stays calendar days.
- **R6.7** · **weak** · Gemini (Wisemonk).
  - **Findings:** Maharashtra S&E: 18 days EL, 8 days CL; SL is policy. MP and Rajasthan not given (**open**).
  - **Specs:** 13 (leave-type seed per state as configuration).
- **R6.8** · **weak** · Gemini (Wisemonk).
  - **Findings:** full and final settlement within 2 working days (Code on Wages s.17(2)); gratuity within 30 days; fixed-term staff get pro-rata gratuity after 1 year.
  - **Specs:** 13.
- **R6.9** · answered · Gemini · LKS (law firm, specific page).
  - **Findings:**
    - An Internal Committee is needed at 10 or more employees.
    - Complaint within 3 months; inquiry within 90 days; employer action within 60 days.
    - **No anonymous POSH complaints for a formal inquiry.** Software may route POSH complaints confidentially only.
  - **Specs:** 17 (this confirms the Phase 1 default).
- **R6.10** · **weak** · Gemini (HelloTime).
  - **Findings:** explicit consent and purpose limitation for biometric and geofenced attendance; delete biometrics after their purpose ends.
  - **Specs:** 13, A6.

### Batch 7: facilities (Gemini)
- **R7.1** · answered · Gemini · NHSRC Guidelines on Equipment Maintenance, Calibration and Testing (G7-1), Safdarjung policy (G7-9).
  - **Findings:** asset register status functional, dysfunctional or beyond economic repair (BER); PM per OEM; calibration logs; breakdown timestamps (reported, engineer arrival, resolved); **95% uptime for critical equipment** (from a hospital policy, not a universal NABH rule).
  - **Specs:** 11.
- **R7.2** · **weak** (vendor) · Gemini.
  - **Findings:** calibration by the OEM or an NABL ISO 17025 lab; annual for BP sets, scales, monitors, defibrillators and autoclaves; every 6–12 months for lab analysers.
  - **Specs:** 11 (PM template seed).
- **R7.3** · answered · Gemini · NHSRC (G7-1), CBR blog.
  - **Findings:** AMC = labour + PM visits, parts extra. CMC = parts included. 2-year warranty then 5–8 years CMC for critical equipment. Master fields include an uptime guarantee %.
  - **Specs:** 11.
- **R7.4** · **weak** · Gemini (consultant blog).
  - **Findings:** fire NOC annual or bi-annual; extinguishers monthly; electrical audit 6-monthly; lifts annual; water tank cleaning quarterly; DG daily log; pest control monthly or quarterly.
  - **Specs:** 12 (recurring-task templates).
- **R7.5** · **weak** (Scribd) · Gemini.
  - **Finding:** facility and biomedical maintenance are separate modules.
  - **Specs:** 12 and 11 (confirms the Phase 1 split).
- **R7.6** · **weak** (no source) · Gemini.
  - **Findings:** infected linen in yellow leak-proof (alginate) bags; thermal disinfection at 70 °C or more for 25 minutes, or 1% hypochlorite; par 4–6 per bed; per-kg billing for flatwork and per-piece for specials.
  - **Specs:** 10.

### Batch 8: privacy, ABDM, portals, marketing (Gemini)
- **R8.1** · answered · Gemini (EY, AMLEGALS; secondary), **V10, V11 verified**.
  - **Findings:**
    - Hospital = data fiduciary, SaaS = data processor.
    - Notice must give the purpose, contact and a withdrawal link.
    - Verifiable parental consent under 18.
    - Consent Manager net worth ₹2 crore and 7-year records (weak).
    - Breach notice to the Board within 72 h.
    - CERT-In 6-hour rule (weak).
  - **Specs:** _CONVENTIONS, A3, 16.
- **R8.2** · answered · Gemini · NMC/MCI Code of Ethics 2002 (nmc.org.in), Avinya blog; **V12** for PC-PNDT.
  - **Findings:** indoor records kept 3 years from the start of treatment; MLC 10 years or until final disposal (DGHS OM 2014, **weak**); PC-PNDT 2 years; BMW 5 years. **DPDP erasure doesn't override statutory retention.**
  - **Specs:** _CONVENTIONS (retention table), A3, 14.
- **R8.3** · answered · Gemini · abdm.gov.in/dhis.
  - **Findings:** HFR and HPR registration; certification milestones M1 (ABHA), M2 (HIP), M3 (HIU); Scan & Share; DHIS extended to Sep 2026 (its Nov 2026 status is **open**).
  - **Specs:** A3, 05 (NHCX needs M1). New optional ABDM track noted in INDEX.
- **R8.4** · **weak** (no source) · Gemini.
  - **Findings:** show final labs, prescriptions and discharge summaries; hold back critical results until the doctor has reviewed them; guardian-linked access for minors; OTP to the registered mobile.
  - **Specs:** A3.
- **R8.5** · **weak** · Gemini · TRAI advice page, SMSCountry, NMC download 1874.
  - **Findings:**
    - Marketing consent opt-in and unbundled from treatment consent.
    - DLT: principal entity registration (₹5,000), header, templates (≤2 variables).
    - NMC "Oct 2026": no discounts, cashbacks, referral fees or paid reviews.
  - WhatsApp rules: **open**.
  - **Specs:** 16, 18.
  - **Conflict:** the NMC claim (no regulation number) **conflicts with the Medicard and marketing discount features**. Flagged as a gate before production.
- **R8.6** · **weak** · Gemini · RBI PPI Master Direction (link only).
  - **Findings:** a hospital card could be a closed-system PPI (no RBI approval); the "₹10,000 cap" is unverified and doubtful; risk-pooling resembles insurance under IRDAI; card fee 18% GST.
  - **Specs:** 18.
  - **Conflict:** none with Perplexity R1.2(f) on GST. The PPI cap needs verifying. The Phase 1 rule (no stored value) stays.
- **R8.7** · **weak** (formulas self-generated) · Gemini.
  - **Findings:** occupancy % = inpatient days ÷ available bed-days; ALOS = inpatient days ÷ discharges; bed turnover = discharges ÷ beds; ARPOB = IP revenue ÷ inpatient days; OPD→IPD conversion %; overhead allocation by area or by % of revenue.
  - **Specs:** 02.
- **R8.8** · **weak** (no source) · Gemini.
  - **Findings:** MS Access is common in old Indian set-ups; dedupe on mobile + name (or ABHA); opening-balance cut-over rather than invoice history; physical stock count before go-live.
  - **Specs:** 14.

## Source keys
- **P1-n:** Perplexity batch 1 sources, numbered as in `/workspace/perplexity-hmis/batch1-sources.txt`. Key ones:
  - P1-1: Delhi Drugs Control GST rationalisation circular, 22-09-2025;
  - P1-4: Raigad Hospital IPD;
  - P1-5: MoHFW Patients' Rights Charter;
  - P1-6: Notification 12/2017-CT(R) (CBIC);
  - P1-8: Notification 03/2022-CT(R) (GST Council);
  - P1-12/13: CBIC invoice rules / CGST Rules;
  - P1-15/16: Maharashtra Nursing Homes (Amendment) Rules 2021 / PTI;
  - P1-22: joinditto package article;
  - P1-24/25/26: CBDT pages for s.269ST, s.451, s.271DA.
- **P2-n:** Perplexity batch 2, `/workspace/perplexity-hmis/batch2-sources.txt`. Key ones:
  - P2-1/2: IRDAI Master Circular on Health Insurance Business, 29-05-2024;
  - P2-6: IRDAI HCX circular;
  - P2-7/12: NRCeS NHCX profiles and FHIR implementation guide;
  - P2-8/10: PIB;
  - P2-13: myndsolution TPA reconciliation;
  - P2-14: ABDM DHIS;
  - P2-16: IRDAI Standardisation master circular;
  - P2-18/19: PM-JAY.
- **G3-n to G8-n:** Gemini sources in order, from `/workspace/gemini-hmis/batchN-sources.json`.
- **V1–V13:** my verifications above. The downloaded copies are in `/workspace/hmis-verify/`.
