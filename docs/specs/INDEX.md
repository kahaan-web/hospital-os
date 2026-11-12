# Hospital OS: pending module specs, index and build order

## Open decisions (batch 9: not answerable by research)
All product and doc-meaning ambiguities are **OPEN – to confirm with Ajay Sheth**, and no defaults are set for them. The full numbered list, per module with the reason each one matters, is **`OPEN-QUESTIONS-AJAY.md`** (46 items). Summary:
- **R9.1** Tiers for the 17 modules not in Sheet1 (OT, Radiology, Insurance, Indents, Bill Passing, Blood Bank, Linen, Equipment, Maintenance Tracker, Payroll, Data Migration, Night Audit, Marketing, MIS, Complaint Tracker, Medicard, Users Management). Confirm or change the defaults in §1.
- **R9.2** Are the Android apps separate add-ons, or included with their modules?
- **R9.3** Do self-service employees and patients count towards seat limits (Basic 8 / Medium 25 / Premium 80)?
- **R9.4** Meanings to confirm: "Scrolling, Certification, Bill Passing" (Gemini's reading puts the 3-way match in *certification*; the spec makes the stage configurable); "Access Data Migration" (research supports MS Access); "Medicard"; "Employee Complaint Tracker"; "Maintenance Tracker" vs "Equipment Maintenance" (research supports separate modules).
- **R9.5** What does Sheet3's "Stage" column (1–4) mean? And which existing system do the Status values (Change / No Change / New) refer to?
- **R9.6** Blood bank: do target customers run full blood centres or only storage centres? (Storage-centre rules are now verified: under 2,000 units/yr, State approval, mother-centre tie-up.)

New decisions raised by Phase 2 research:
- **R9.7** ABDM and NHCX: pursue ABDM M1–M3 certification and NHCX participation, through our own gateway or a partner? INS-T9 (live NHCX) is on hold until then. INS-T8 (FHIR export) is built anyway.
- **R9.8** Medicard and discount campaigns: Gemini reports an NMC "Oct 2026" bar on discounts, offers and referral fees (unverified, no regulation number). Get a legal review before selling Medicard or running discount campaigns. Both are gated in the specs.
- **R9.9** Accept the research-driven scope changes: **multi-payer** insurance split in v1 (INS-T3), **package billing** (IPB-T11, optional) and **government scheme masters** (INS-T10)?
- **R9.10** Confirm the conservative seeds that research changed: concession matrix (cashier 0; supervisor 5% / ₹2,000; branch admin 10% / ₹10,000, cumulative per encounter); bed-day basis (tenant chooses; pre-filled fixed checkout 11:00 with a half day to 15:00); MSME due dates of 15/45 days.

**Phase 1 (docs-backed)**, then **Phase 2 (research folded in)**, both written 12 Nov 2026 while the Dell and the live repo were offline. No Cursor or Claude was used, and no code was written. Phase 2 used Perplexity batches 1–2, Gemini batches 3–8 and 13 official-source checks. Per-question status, sources and conflicts are in **`RESEARCH-LOG.md`**: **24 answered, 35 weak, 6 open (batch 9)**, plus open sub-parts. Start with `_CONVENTIONS.md` for:
- the tag legend: `[DOCS]`, `[ARCH]`, `[GAP: needs research]`, `[DEFAULT, to confirm by research]`, `[VERIFY-REPO]`, plus the Phase 2 tags `[RESEARCH: tool, source]`, `[RESEARCH-WEAK: tool, verify]`, `[VERIFIED: url]` and `[CONFLICT: …]`;
- the platform rules every module inherits (RLS, composite FKs, TENANT_GUARDS, requireFeature, DB-function money writes, idempotency, hash-chained audit with no patient data);
- the shared contracts C1–C6.

The research questions are in `RESEARCH-QUESTIONS.md` (9 batches, 65 questions). Their answers and status are in `RESEARCH-LOG.md`.

**Sources used:**
- `hmis-modules.pdf/.txt` (module list, "ML");
- `hmis-features-by-tier.xlsx` Sheet1 ("S1", tier source of truth), with Sheet3 noted where it disagrees;
- repo doc copies on the box: PLAN.md, PHASE_A_BRIEF.md, CLAUDE.md, CONTRACTS.md, the phase-B worker briefs, MULTITENANCY_AUDIT.md, SECURITY_AND_COMPLIANCE.md;
- the handover doc;
- FLOW.md.

The Phase B plan (`docs/PHASE_B_PLAN.md`) isn't on the box, so module and feature keys, paths and migration numbers are proposals marked [VERIFY-REPO].

## 1. Module list, tier and docs coverage

**Docs coverage** is a rough share of the spec's functional content that comes straight from Kahaan's docs; the rest is defaults or gaps.
- "Name only" means the module list gives just the title.
- Tiers not in Sheet1 are **OPEN – to confirm with Ajay Sheth**, with **no default set** (Phase 2 steering rule). Each is numbered in `OPEN-QUESTIONS-AJAY.md`. App Admin can assign any tier once decided.

| File | Module (doc ref) | Tier (Sheet1, or default) | Docs coverage | Tasks | Research coverage (Phase 2) |
|---|---|---|---|---|---|
| `00-shared-foundations.md` | Masters and contracts for all pending modules (not a doc module) | OPEN – to confirm with Ajay Sheth (#1) | ~5%. Cost centres and supplier side implied by ML A1 and S1 r63–r75 | 9 | R1.2, R1.6, R5.6: GST tax rules and the s.186 cash limit **verified**; MSME weak. +SF-T9 |
| `01-ip-billing.md` | IP Billing & Cash Handling (ML #7; S1 r41–r55). Finish B6 | **Sheet1:** all Basic except Patient Outstanding (Medium+); Sheet3 conflict OPEN – to confirm with Ajay Sheth (#24) | **~60%**. All 15 functions and reports from S1; mechanics (bed-day rule, approvals, GST) are defaults or gaps | 11 | R1.1–R1.8: 6 answered, 2 weak; room-rent GST and the cash limit **verified**. +IPB-T10 (GST docs), +IPB-T11 (packages, optional) |
| `02-mis-dashboards.md` | Hospital MIS & Dashboards (ML #25; ML A1) | OPEN – to confirm with Ajay Sheth (#15) | ~35%. The 6 A1 bullets define the screens; KPIs, formulas and allocation are gaps | 6 | R8.7 weak (standard KPI formulas, allocation basis) |
| `03-ot-scheduling.md` | OT Scheduling (ML #8) | OPEN – to confirm with Ajay Sheth (#2) | ~5%. Name only, plus CPOE procedure orders (S1 r102) | 7 | R3.1 weak (WHO checklist, slabs, anaesthetist %) |
| `04-radiology.md` | Radiology Reporting (ML #10) | OPEN – to confirm with Ajay Sheth (#3) | ~5%. Name only, plus CPOE diagnostic orders (S1 r100) | 7 | R3.2: PC-PNDT Form F, register and monthly report **verified**; AERB, PACS and TAT weak. +RAD-T7 |
| `05-insurance-tpa.md` | Insurance (ML #12) | OPEN – to confirm with Ajay Sheth (#4) | ~5%. Name only; payer split needed by S1 r47 and r54 | 10 | R2.1–R2.7: 5 answered, 2 weak; IRDAI 1 h / 3 h and TDS s.393 **verified**. +INS-T8 (FHIR), +INS-T9 (hold), +INS-T10 (schemes) |
| `06-doctors-accounting.md` | Doctors Accounting (ML #11; S1 r92–r94, r105–r108) | **Sheet1:** Premium only; Sheet3 says Medium, conflict OPEN – to confirm with Ajay Sheth (#24). Basic sharing reports S1 r29 and r52 | **~55%**. All 7 items from S1; sharing basis and TDS are gaps | 5 | R5.5 / V9: TDS 10%, ₹50k **verified**; referral fees weak (NMC) |
| `07-indents-purchase.md` | Indents & Purchase (ML #14; S1 r56–r58, r62, r65–r68, r71) | **Sheet1:** PO and Purchase Register Medium+; GRN, returns, adjustments and registers Basic. Departmental indents: OPEN – to confirm with Ajay Sheth (#5) | ~40%. Procurement rows from S1 Pharmacy; departmental indents are defaults | 8 | R5.2, R5.4, R5.7 weak (slabs, ITC, short expiry) |
| `08-bill-passing.md` | Scrolling, Certification, Bill Passing (ML #15; S1 r63, r64, r74, r75) | **Sheet1:** approvals, payment and supplier reports Basic. Scroll and certification: OPEN – to confirm with Ajay Sheth (#6) | ~30%. 4 S1 rows; what the terms mean is a gap | 7 | R5.1, R5.2, R5.5, R5.6 weak; TDS rows **verified** (conflict with Gemini on the threshold) |
| `09-blood-bank.md` | Blood Bank (ML #16) | OPEN – to confirm with Ajay Sheth (#7, #29) | ~0–5%. Name only; heavily regulated (research batch 4) | 7 | R4.1 **verified** (NACO storage centre); R4.2–R4.6 weak (R4.5 has a UK source). +BB-T7 (hold) |
| `10-linen-laundry.md` | Linen & Laundry (ML #17) | OPEN – to confirm with Ajay Sheth (#8) | ~5%. Name only | 4 | R7.6 weak |
| `11-equipment-maintenance.md` | Equipment Maintenance (ML #18; ML A2) | OPEN – to confirm with Ajay Sheth (#9) | ~35%. The 3 A2 bullets are DOCS; PM and calibration are defaults | 7 | R7.1, R7.3 answered (NHSRC); R7.2 and AERB weak. +EQ-T7 |
| `12-maintenance-tracker.md` | Maintenance Tracker (ML #19; ML A7) | OPEN – to confirm with Ajay Sheth (#10) | ~5%. Name only; how it differs from #18 is a gap | 4 | R7.4, R7.5 weak |
| `13-payroll-attendance.md` | Payroll & Attendance (ML #20; ML A6) | OPEN – to confirm with Ajay Sheth (#11) | ~5%. Name only; statutory rules are research batch 6 | 8 | R6.1–R6.3 answered, with EPF ₹25k (17 Sep 2026), ESI and Labour Codes **verified**; R6.4–R6.8, R6.10 weak. +PAY-T8 (hold) |
| `14-access-data-migration.md` | Access Data Migration (ML #22) | OPEN – to confirm with Ajay Sheth (#12) | ~5%. Name only; "Access" meaning is a gap | 6 | R8.8 weak |
| `15-night-audit.md` | Night Audit (ML #23) | OPEN – to confirm with Ajay Sheth (#13) | ~5%. Name only | 4 | R1.8 weak (no Indian HMIS source) |
| `16-marketing.md` | Marketing (ML #24; S1 r10 mailers) | **Sheet1:** mailers Medium+. Rest of module: OPEN – to confirm with Ajay Sheth (#14) | ~10% | 4 | R8.1 answered (DPDP **verified**); R8.5 weak (DLT, NMC); WhatsApp still open |
| `17-employee-complaint-tracker.md` | Employee Complaint Tracker (ML #26) | OPEN – to confirm with Ajay Sheth (#16) | ~5%. Name only; scope ambiguous | 3 | R6.9 answered (POSH timelines, no anonymous POSH) |
| `18-medicard.md` | Medicard Management (ML #27) | OPEN – to confirm with Ajay Sheth (#17) | ~5%. Name only; legal framing is a gap | 4 | R8.6 weak, R1.2(f) weak (18% GST); **NMC conflict → R9.8 gate** |
| `gap-op-billing.md` | OP Billing (ML #4; S1 r20–r31, r98). B5 on main | **Sheet1:** all Basic except Visit Statistics (Medium+); Sheet3 conflict OPEN – to confirm with Ajay Sheth (#24) | **~80%**. All 13 rows from S1; repo state unknown | 4 | R1.3, R1.5, R1.6, R1.7 answered; cash limit **verified** |
| `gap-nurse-station.md` | Nurse Station (ML #6; S1 r85–r91; ML A5). B9 on main | **Sheet1:** Premium only. Vitals, MAR and diet: OPEN – to confirm with Ajay Sheth (#19) | ~70% | 4 | R3.5 weak (6 rights, double check, LASA, 24 h countersign) |
| `gap-lab.md` | Laboratory (ML #9; S1 r76–r84). B8 on main | **Sheet1:** Medium+; email and 2 equipment interfaces Premium; Sheet3 conflict OPEN – to confirm with Ajay Sheth (#24) | ~70%. Interface protocol is a gap | 5 | R3.3, R3.4 weak (ASTM serial/TCP, read-back, sign-off) |
| `gap-pharmacy.md` | Pharmacy & Stores (ML #13; S1 r56–r75). B7 on main | **Sheet1:** Basic except PO and Purchase Register (Medium+) | ~75%. Controlled-drug and GST rules are gaps | 5 | R5.3: H1 register **verified**; X/NDPS weak; R1.2 GST answered. +PH-T5 |
| `gap-doctor-workspace-cpoe.md` | CPOE / doctor workspace (S1 r99–r104, r109–r113; ML A4). B3 on main | **Sheet1:** Premium only | ~70% | 4 | R3.7 answered (ICD-10, ABDM); R3.6 weak (NMC Rx format, allergies) |
| `android-a1-mis.md` | Android MIS / Dashboard (ML A1) | Follows `mis.*` (OPEN – to confirm with Ajay Sheth, #15); add-on? #21 | ~60%. All 6 screens from the doc | 3 | via R8.7 (weak) |
| `android-a2-equipment-maintenance.md` | Android Equipment Maintenance (ML A2) | Follows `equipment.*` (OPEN – to confirm with Ajay Sheth, #9); add-on? #21 | ~60%. All 3 bullets from the doc | 3 | via R7.1–R7.3 |
| `android-a3-patient-portal-gaps.md` | Android Patient Portal (ML A3). Mock screens exist | OPEN – to confirm with Ajay Sheth (#20, #21) | ~50%. 5 bullets from the doc; patient auth, DPDP and ABDM are gaps | 5 | R8.1–R8.3 answered (DPDP **verified**, ABDM M1–M3); R8.4 weak |
| `android-a4-doctor-portal-gaps.md` | Android Doctor Portal (ML A4). Mock screens exist | Diary per S1 r16 (Basic); ordering Premium (S1 r99–r113); add-on? OPEN – to confirm with Ajay Sheth (#21) | ~50% | 3 | via R3.6/R3.7 |
| `android-a5-nurses-workbench.md` | Android Nurses' Workbench (ML A5) | Premium (S1 r85–r91); vitals/MAR/diet OPEN – to confirm with Ajay Sheth (#19); add-on? #21 | ~60%. All 4 bullets from the doc | 3 | via R3.5 (weak) |
| `android-a6-hr-payroll.md` | Android HR & Payroll (ML A6) | Follows `payroll.*` (OPEN – to confirm with Ajay Sheth, #11); add-on? #21 | ~5%. Name only | 3 | R6.10 weak; DPDP dates **verified** |
| `android-a7-maintenance-tracker.md` | Android Maintenance Tracker (ML A7) | Follows `maintenance.*` (OPEN – to confirm with Ajay Sheth, #10); add-on? #21 | ~5%. Name only | 2 | via R7.4 (weak) |

**Total: 165 tasks** (Phase 1: 154; Phase 2 added 11: SF-T9, IPB-T10, IPB-T11, INS-T8, INS-T9, INS-T10, RAD-T7, PH-T5, BB-T7, EQ-T7, PAY-T8), each about half a day for one Grok or Composer worker (about 82 worker-days, of which 3 tasks are on hold).

**Not specced here** (already on main and outside this brief):
- Patient Registration (ML #1);
- Appointments (ML #2);
- Visit registration (ML #3);
- ADT (ML #5; B4);
- Users Management (ML #21).

Their Sheet1 rows (r2–r19, r32–r40, r95–r97) can get the same gap treatment later.

## 2. Overall build order (dependencies first)

The rules: masters come before transactions, and money cores before the modules that post into them. Specifically:
- IP billing comes before Insurance, Medicard, Doctor Accounting, OT and Radiology charges, and Night Audit.
- Indents come before Bill Passing.
- Data sources come before MIS.
- Web APIs come before their Android apps.

Model split: Grok for DB, API and logic tasks; Composer for UI tasks. Run 3–5 workers in parallel.

| Wave | What | Tasks | Gate |
|---|---|---|---|
| **W0 Audit** (Dell back) | SF-T1, IPB-T1, OPB-T1, NS-T1, LAB-T1, PH-T1 (+IND-T1, BP-T1 in the same audit), CP-T1, A3-T1, A4-T1 | 11 | B6, bills-definer, sec-fix-3 merged; migrations 0028/0900/0901 applied |
| **W1 Foundations** | SF-T2 to SF-T8, plus **SF-T9 shared statutory guards (s.186 cash limit, GST `tax_rules`)** (Phase 2) | 8 | W0 reuse decisions |
| **W2 Money core** | IP Billing IPB-T2 to T10 (**T10 GST document types and ≤16-char series**, Phase 2); OP Billing gaps OPB-T2 to T4; Pharmacy gaps PH-T2 to T5 (**T5 H1/X/NDPS registers**, Phase 2); Data Migration DM-T1 to T5 | 21 | SF-T2 to T6, **SF-T9** (cash guard used by every cash-taking function) |
| **W3 Day close and clinical completion** | Night Audit NA-T1 to T4; CPOE gaps CP-T2 to T4 (ICD-10 + structured allergies); Lab gaps LAB-T2 to T5 (read-back, sign-off); Nurse Station gaps NS-T2 to T4 (24 h countersign, double check) | 14 | IPB-T3 (bed charges, now policy-driven) for Night Audit |
| **W4 New clinical modules** | OT OT-T1 to T7; Radiology RAD-T1 to T7 (**T7 PC-PNDT Form F**, Phase 2); Blood Bank BB-T1 to T3, T5, T6 (Mode S, now with the verified storage-centre rules) | 19 | IPB-T2 (C1); CP-T2 for the OT routing |
| **W5 Payer and doctor money** | Insurance INS-T1 to T8, T10 (**multi-payer split, TAT timers, NHCX FHIR export, scheme master**, Phase 2); Doctor Accounting DA-T1 to T5; IPB-T11 package billing (optional, before INS-T10) | 15 | IPB-T4; **CP-T2 (ICD-10) for INS-T8**; R9.9 for the optional scope |
| **W6 Procurement** | Indents IND-T2 to T8; then Bill Passing BP-T2 to T7 | 13 | SF-T4 (ledger) for Indents; IND-T4 (GRN) for Bill Passing |
| **W7 MIS** | MIS-T1 to T6 | 6 | Billing, ADT, stores (and optionally payroll) data exist |
| **W8 Back office** | Equipment EQ-T1 to T7 (**T7 AERB/TLD/evidence pack**, Phase 2); Maintenance Tracker MT-T1 to T4; Linen LIN-T1 to T4; Payroll PAY-T1 to T7; Complaints CMP-T1 to T3; Marketing MKT-T1 to T4; **Medicard MED-T1 to T4 (moved from W5, Phase 2)** | 33 | SF-T4/T5/T7. Complaints after MT-T1. **Medicard and discount campaigns are production-gated on R9.8** |
| **W9 Android** | A1 (after MIS-T5), A2 (after EQ-T2; A2-T3 offline queue first), A5 (after NS-T2), A7 (after MT-T2), A6 (after PAY and CMP), A3-T2 to T5, A4-T2 to T3 | 20 | each app's backend tasks |
| **Research-gated (hold)** | BB-T4 (Mode F; R9.6), DM-T6 (MS Access converter; R9.4), **INS-T9 live NHCX (R9.7, ABDM M1)**, **BB-T7 e-RaktKosh (mandate and API unverified)**, **PAY-T8 PF ECR / ESI files (layouts unverified)** | 5 | as listed |

**Meaning gates (steering rule, 12 Nov 2026):** these tasks are scheduled but **must not start until the matching OPEN item is answered by Ajay Sheth**:
- BP-T2/BP-T3 scroll and certification parts (#25);
- DM-T1–T6 (#26);
- MED-T1–T4 (#27, plus legal R9.8);
- CMP-T1–T3 (#28);
- BB mode choice per location (#29);
- MT-T1–T4 vs EQ split (#30);
- NA-T1–T4 (#31);
- MIS snapshot screen (#45).

Tier assignment for every non-Sheet1 module waits on #1–#21, but building can go ahead, because feature keys are tier-agnostic.

**Optional ABDM track (not counted, Phase 2):** HFR/HPR registration support, ABHA M1 (create/verify, Scan & Share), M2 (HIP), M3 (HIU). Research (R8.3) says NHCX needs M1. Spec it once R9.7 is decided.

Wave task counts add up to the 165 total (11 + 8 + 21 + 14 + 19 + 15 + 13 + 6 + 33 + 20 + 5). Waves W4–W8 can overlap once their gates are met.

With 4 workers in parallel and about 2 tasks per worker per day, that's roughly 4 working weeks of worker time, before review and merge overhead and any research rework. This is a rough estimate, not a commitment.

**Statutory or regulatory logic: status after Phase 2.**
- **Verified against official text** (still stored as effective-dated config):
  - healthcare GST exemption and room-rent ₹5,000 / 5% rule;
  - s.186 ₹2 lakh cash limit;
  - IRDAI 1 h / 3 h cashless TATs;
  - TDS s.393 (10%, ₹50k professional; contractor rows);
  - EPF ₹25,000 ceiling from 17 Sep 2026, 12% / 8.33% EPS;
  - ESI 0.75% / 3.25%, ₹21,000 (PwD ₹25,000), ₹176/day exemption;
  - Labour Codes in force 21 Nov 2025;
  - DPDP Rules dates (13 Nov 2026 / 13 May 2027) and 72 h breach report;
  - PC-PNDT r.9 (Form F, 2 years, monthly by the 5th);
  - Schedule H1 register (r.65, 3 years);
  - NACO blood storage centre (<2,000 units/yr, State approval, mother-centre return 10 days before expiry).
- **Must still not reach a real customer until verified:**
  - Professional Tax and LWF slabs;
  - salary TDS under the new Act (Form 138);
  - EDLI and the PF ECR layout;
  - Schedule X / NDPS register formats per state;
  - blood-bank TTI, donor criteria, register formats and retention;
  - the emergency O-neg return window (UK source);
  - e-RaktKosh;
  - MSME 15/45-day rule details;
  - Rule 42/43 ITC apportionment;
  - IRDAI non-payables list transcription;
  - state scheme packages;
  - NMC discount and referral rules (Medicard, marketing);
  - RBI PPI cap;
  - card-fee GST;
  - MLC retention.

All are configurable, with conservative seeds and `is_placeholder` banners where they apply.

## 3. Proposed migration ranges ([VERIFY-REPO]; avoid 0028, 0900, 0901 and B-ranges already used)

| Range | Module |
|---|---|
| 1000–1019 | Shared foundations |
| 1020–1039 | IP billing finish (or B6's own range) |
| 1040–1049 | MIS |
| 1060–1069 | OT |
| 1080–1089 | Radiology |
| 1100–1119 | Insurance |
| 1120–1129 | Doctor Accounting |
| 1140–1159 | Indents & Purchase |
| 1160–1179 | Bill Passing |
| 1180–1199 | Blood Bank |
| 1200–1209 | Linen |
| 1220–1239 | Equipment |
| 1240–1249 | Maintenance Tracker |
| 1260–1279 | Payroll |
| 1280–1289 | Data Migration |
| 1300–1309 | Night Audit |
| 1320–1329 | Marketing |
| 1340–1349 | Complaints |
| 1360–1369 | Medicard |
| 1400–1499 | Gap specs (OP 1400, Nursing 1420, Lab 1440, Pharmacy 1460, CPOE 1480) |
| 1500–1519 | Patient portal and mobile |

## 4. Known doc conflicts carried into the specs

- **Sheet1 vs Sheet3:** specs show the Sheet1 value (PLAN.md's source of truth), but every conflict is **OPEN – to confirm with Ajay Sheth** (OPEN-QUESTIONS-AJAY #24). The ones that matter here:
  - Doctor Accounting (Premium vs Medium);
  - Lab email (Premium vs Medium);
  - IP Patient Outstanding (Medium vs Basic);
  - OP Visit Statistics (Medium vs Basic).
- Sheet3 "LAB Statistics" = Sheet1 "LAB MIS". Sheet3 leaves out the "2 Lab Equipments" interface.
- Maintenance Tracker appears both as Group I #19 and as Android item 7. One backend spec (12) and one app spec (A7).
- CPOE is in the sheet but not in the PDF list. It's specced as the doctor workspace.
- **Research vs Phase 1 defaults (Phase 2):** each one is kept in its spec with a `[CONFLICT]` tag.
  - single payer → multi-payer (05);
  - cashier concession 5% → 0 (01, OPB);
  - midnight census → configurable bed-day policy (01, 15);
  - MSME 45 days → 15/45 days (08);
  - bill-passing stage meaning (08);
  - near-expiry and short-expiry thresholds (07, PH);
  - match tolerances (08);
  - paid-days divisor (13);
  - Gemini's ₹30k TDS threshold vs the official ₹50k (08);
  - NACO vs Gemini mother-centre eligibility (09);
  - UK-sourced emergency O-neg rules (09);
  - dedup rule (14);
  - NMC discount claim vs Medicard and marketing (16, 18).
