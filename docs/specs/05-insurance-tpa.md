# 05 · Insurance / TPA

Doc module "INSURANCE" [DOCS: ML #12]. It's a **name only**. IP billing has "Bill Settlement" and "Patient Outstanding" [DOCS: S1 r47, r54], which need payer dues. The Phase B plan called for "credit/TPA hooks" in billing [ARCH: task-phase-b-plan.md]. Everything functional is [DEFAULT, to confirm by research]. Indian cashless flows, government schemes and NHCX were [GAP: needs research]. Phase 2 answered most of them; see the section below.

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md` for the sources and the verification detail. [DOCS] items above and below are unchanged.

- **IRDAI cashless timelines** (R2.1), from the Master Circular on Health Insurance Business of 29 May 2024:
  - pre-auth decision "immediately but not more than **1 hour**";
  - final discharge authorisation within **3 hours**, with any extra charge from a delay paid by the insurer;
  - claim settlement within **30 days** of the last document;
  - no statutory TAT for enhancements;
  - insurers and TPAs collect documents from the hospital, not the patient.

  [VERIFIED: 1 h / 3 h, IRDAI master circular PDF (P2-2)] [RESEARCH: Perplexity, 30 days (P2-1/2/5)]

  These become **SLA timers** on pre-auth and discharge-auth requests, a TAT breach flag and the pre-auth TAT report. The hospital can't enforce them, but they're evidence in disputes.
- **NHCX** (R2.2):
  - live, but **not mandatory** for small hospitals;
  - FHIR R4 profiles from NRCeS: Claim, ClaimResponse, Coverage, CoverageEligibilityRequest/Response, InsurancePlan, Task, PaymentNotice, PaymentReconciliation;
  - needs ABDM **M1 + HFR** registration and sandbox certification;
  - the DHIS incentive covers PM-JAY claims filed through NHCX.

  [RESEARCH: Perplexity, P2-6 IRDAI HCX circular, P2-7/P2-12 NRCeS profiles, P2-8/10 PIB, P2-14 ABDM DHIS]

  The research changes scope with two new tasks: **INS-T8** builds NHCX-ready FHIR bundles (export only, no network), and **INS-T9**, a live NHCX connector, stays **on hold** until ABDM M1 and a gateway decision (**R9.7**, new).
- **Proportionate deduction** (R2.3):
  - ratio = eligible room rent ÷ actual room rent, applied to **associated** charges, which are policy-defined;
  - IRDAI keeps a standard **non-payables** list, plus items "subsumed into room charges";
  - order of application: **non-payables → proportionate deduction → sub-limits → co-pay → cap at approved → payer split**.

  [RESEARCH: Perplexity, IRDAI Standardisation master circular (P2-16)]
- **Several payers on one admission** (R2.6):
  - normal practice is a primary insurer + corporate top-up + government scheme + patient;
  - **v1 is changed to line-level responsibility buckets**, with an ordered payer list per case.

  [RESEARCH-WEAK: Perplexity, no citation, verify] [CONFLICT: the Phase 1 default was one payer plus the patient. It's overridden here because a single-payer data model is costly to undo. INS-T3 now has multi-payer scope.]
- **Government schemes** (R2.4):
  - PM-JAY: ₹5 lakh per family per year, HBP package codes and rates, mandatory pre-auth, its own portal (TMS).
  - MJPJAY (MH), Chiranjeevi (RJ), Ayushman MP, CGHS and ECHS each have their own package lists, portals and settlement cycles.
  - These are a **scheme master**, and scheme receivables go in a **separate ledger**. Package billing reuses IPB-T11.

  [RESEARCH: Perplexity, P2-18 hospitals.pmjay.gov.in] [RESEARCH-WEAK: the state scheme rows are generic; portals, names and cycles are unverified] New **INS-T10**.
- **TDS on insurer/TPA payments** (R2.5): 10% as fees for professional services. Under the Income-tax Act 2025 this is **s.393(1) Table Sl. 6(iii), threshold ₹50,000** (formerly s.194J). A lower-deduction certificate is possible. Reconcile against Form 26AS (or its successor).

  [VERIFIED: https://www.incometaxindia.gov.in/w/section-393-6] [RESEARCH: Perplexity, P2-13, P2-20 (old s.194J)]

  The section code is configuration with an effective date.
- **Document checklists** (R2.7): the cashless set (pre-auth form, ID, policy card, doctor's notes, investigations, estimate) and the discharge/claim set (final bill, itemised breakup, discharge summary, reports, pharmacy bills, implant stickers/invoices, pre-auth approvals). These are seeded as an editable checklist per payer. [RESEARCH: Perplexity, IRDAI master circular]
- **Coding:** diagnoses on the claim use **ICD-10**, the ABDM FHIR binding. [RESEARCH: Gemini, G3-4 ABDM ICD standard]

## Purpose
Handle cashless and reimbursement inpatient cases for insurers, TPAs, corporates and government schemes:
- capture policy details;
- request and track pre-authorisation and enhancements;
- split the final bill into payer and patient shares;
- submit and track claims;
- record settlements, deductions and TDS;
- age the payer outstanding.

## Users and roles
- Insurance/TPA Desk (new): everything below.
- Cashier: sees the split at settlement.
- Accounts: settlement posting, write-offs.
- Doctor: fills the clinical part of the pre-auth form.
- Location Admin: payer master and payer tariffs.

## Workflows
1. **Payer setup.**
   - Payers (insurer, TPA, corporate, government scheme) from SF-T3.
   - Each payer can have:
     - a tariff (SF-T6);
     - a non-payable item list;
     - room-rent eligibility rules;
     - co-pay %;
     - credit days.
   - **Deduction mechanics:** the ratio is eligible ÷ actual room rent, applied to the payer's configured **associated** categories (room-linked: nursing, doctor visits, investigations as the policy says; **not** pharmacy, implants or consumables). Order: non-payables → proportionate deduction → sub-limits → co-pay → cap. [RESEARCH: Perplexity, R2.3, P2-16]
   - Worked example: eligible ₹3,000/day, actual ₹6,000/day gives a ratio of 0.5, so ₹2,00,000 of associated charges become ₹1,00,000 payable, and the other ₹1,00,000 shifts to the patient.
2. **Policy capture** at admission or pre-admission:
   - payer and TPA;
   - policy number;
   - member id;
   - sum insured;
   - balance;
   - validity;
   - a policy-card image (C5).

   It links to the IP account as the primary payer.
3. **Pre-authorisation.**
   - Create the request: diagnosis, planned procedure, estimated cost, doctor's notes.
   - Send it outside the system (email or portal). In v1 the system records the status only.
   - Status runs: draft → submitted → query → approved (amount) / partially approved / rejected.
   - Enhancement requests follow the same states.
   - The approved-amount history is kept.
   - **TAT timers:** pre-auth `due_at = submitted_at + 1h`; discharge auth `due_at = submitted_at + 3h`; overdue gives a red flag, a desk alert through the outbox, and a row in the pre-auth TAT report. The hours are configuration. [VERIFIED: IRDAI master circular 29-05-2024, V3]
   - **NHCX:** v1 stays a printable form plus status tracking. INS-T8 adds an NHCX-ready FHIR export (CoverageEligibilityRequest, Claim with `use=preauthorization|claim`). The live exchange (INS-T9) is on hold. [RESEARCH: Perplexity, R2.2, P2-7/P2-12]
4. **Discharge and final bill split.** At IP final bill (IPB-T4), apply:
   - the payer tariff;
   - non-payables to the patient;
   - co-pay %;
   - the cap at the approved amount.

   The result is `payer_share` vs `patient_share`, recorded on the bill lines. The patient pays their share at settlement. The payer share becomes a receivable.
5. **Claim submission.**
   - A claim record with a document checklist (final bill, discharge summary, investigation reports, pre-auth approval) and attachments.
   - Status: submitted date, then queries and responses.
6. **Settlement.**
   - Record the amount received, TDS deducted, disallowed amount (with a reason) and UTR/reference.
   - The disallowance can be:
     - written off (Accounts approval);
     - recovered from the patient (a new patient receivable); or
     - kept open for appeal.
7. **Reimbursement cases** (the patient pays and claims later): the bill is all patient share. Print the claim documents pack only.

## Screens
- `/app/insurance/cases`: all insured admissions. Columns: payer, pre-auth status, approved, billed, claim status, received, outstanding.
- `/app/insurance/cases/[id]`: tabs for Policy, Pre-auth and enhancements, Bill split, Claim, Settlement, Documents.
- `/app/insurance/payers`: payer config (tariff link, non-payables, co-pay, room-rent rule).
- Reports:
  - payer outstanding ageing;
  - claims register;
  - settlement register with TDS;
  - disallowance analysis;
  - pre-auth TAT.

## Data model
- `payer_rules(payer_id FK, co_pay_bp, room_rent_limit_paise null, room_rent_rule enum none|cap|proportionate, associated_categories text[], non_payable_service_ids uuid[], sub_limits jsonb, credit_days, preauth_tat_minutes default 60, discharge_tat_minutes default 180, tds_section_code, tds_rate_bp)`. Semantics: [RESEARCH: Perplexity, R2.3]
- `irdai_non_payables(code, description, kind enum non_payable|subsumed_room|subsumed_procedure|subsumed_treatment)`, seeded from the IRDAI standardisation list (seed **to transcribe from P2-16 and verify**).
- `case_payers(case_id FK, payer_id FK, sequence, role enum primary|top_up|scheme|corporate, approved_paise)` and `bill_line_responsibility(bill_line_id FK, payer_id FK null, bucket enum payer|patient, amount_paise, reason_code)` (multi-payer, R2.6).
- `schemes(payer_id FK, scheme_code, package_source, preauth_required, portal_url, settlement_cycle_days)` and `scheme_packages(scheme_id FK, package_code, name, rate_paise, effective_from)` (R2.4, rows to verify).
- `insurance_tat_events(case_id FK, kind enum preauth|enhancement|discharge, submitted_at, decided_at null, due_at, breached bool)`
- `insurance_policies(patient_id FK, payer_id FK, tpa_payer_id FK null, policy_no enc, member_id enc, sum_insured_paise, balance_paise null, valid_from, valid_to, card_attachment_id FK null)`
- `insurance_cases(location_id, ip_account_id FK, policy_id FK, case_type enum cashless|reimbursement, status enum open|preauth_pending|approved|claim_submitted|settled|closed)`
- `preauth_requests(case_id FK, seq int, kind enum initial|enhancement, est_amount_paise, approved_amount_paise null, status enum draft|submitted|query|approved|partial|rejected, submitted_at, responded_at, ref_no, clinical_summary enc)`
- `claims(case_id FK, claim_no, bill_id FK, claimed_paise, submitted_at, status enum draft|submitted|query|settled|partially_settled|rejected|written_off)`, plus `claim_queries(claim_id FK, raised_at, query_text enc, responded_at, response_text enc)`
- `claim_settlements(claim_id FK, received_paise, tds_paise, disallowed_paise, disallow_reason_code, utr_ref, received_on, disposition enum write_off|recover_from_patient|appeal)`, posted through the DB function `ins_post_settlement` (FOR UPDATE on the claim).
- Bill split columns on `ip_bill_lines(payer_id, payer_share_paise, patient_share_paise, split_reason)` (IP billing).

## APIs (module `insurance`; features `insurance.cases`, `insurance.preauth`, `insurance.claims`, `insurance.reports` [DEFAULT, to confirm by research])

| Method | Path | Feature | Roles |
|---|---|---|---|
| GET/POST | `/tenant/insurance/policies` | insurance.cases | Insurance Desk, Front Desk |
| GET/POST | `/tenant/insurance/cases`; GET `/:id` | insurance.cases | Insurance Desk |
| POST | `/tenant/insurance/cases/:id/preauth` ; PATCH `/preauth/:id` (status, amounts) | insurance.preauth | Insurance Desk (Doctor fills the clinical summary) |
| POST | `/tenant/insurance/cases/:id/split-preview` | insurance.cases | Insurance Desk, Cashier |
| POST | `/tenant/insurance/cases/:id/claims` (Idem); PATCH `/claims/:id` | insurance.claims | Insurance Desk |
| POST | `/tenant/insurance/claims/:id/settlements` (Idem) | insurance.claims | Accounts |
| GET | `/tenant/insurance/reports/{ageing,claims,settlements,disallowance,preauth-tat}` | insurance.reports | Accounts, Admin |
| GET/PUT | `/tenant/insurance/payers/:id/rules` | insurance.cases | Location Admin |

## Business rules and edge cases
- The payer share can't exceed the latest approved pre-auth amount (cashless). Any excess shifts to the patient share automatically, with a visible reason.
- Policy validity must cover the admission date; otherwise a warning plus an override reason.
- Re-split is allowed only before the final bill.
- **Settlement:**
  - received + TDS + disallowed must not exceed the claimed amount;
  - partial settlements are allowed;
  - the receivable closes when the sum reaches the claimed amount.
- A recover-from-patient disposition creates a patient receivable that shows in Patient Outstanding [S1 r54].
- Policy numbers, member ids and clinical text are `enc`, and audit logs ids only.
- **Several payers on one admission** are supported: an ordered list (primary, then top-up/corporate/scheme, then patient). Each payer's rules apply to what's left after the previous payer, giving line-level buckets. Example: ₹1,80,000 = insurer ₹1,40,000 + corporate top-up ₹20,000 + patient ₹20,000. [RESEARCH-WEAK: Perplexity, R2.6, verify] [CONFLICT: replaces the Phase 1 "one payer + patient"]
- Insurer/TPA settlement TDS is checked against the configured section (s.393 Sl. 6(iii), 10%, threshold ₹50,000). A mismatch gets flagged for 26AS reconciliation. [VERIFIED: V9]

## Integrations
- IP billing: split at final bill, receivables.
- ADT: policy at admission.
- Discharge summary and Lab/Radiology reports: claim documents.
- Masters: payers and tariffs.
- MIS: payer outstanding.
- Night Audit: open pre-auth alerts.

## Tier
Not in Sheet1. **OPEN – to confirm with Ajay Sheth.** No default tier is set. (OPEN-QUESTIONS-AJAY #4) Feature keys exist so App Admin can assign any tier once decided.

## Acceptance criteria
- A cashless case: policy → pre-auth approved ₹50,000 → bill ₹62,000 with ₹2,000 non-payable → split gives payer ₹50,000 and patient ₹12,000. The patient settles. The payer receivable is ₹50,000.
- Settlement of ₹47,000 received + ₹2,000 TDS + ₹1,000 disallowed (recover from patient) closes the claim and adds ₹1,000 to patient outstanding.
- Over-settlement is rejected with 422.
- The ageing report buckets correctly by claim submission date.
- RLS fixtures exist, encrypted columns are masked in lists, and there is no clinical text in the audit log.
- (Phase 2) Proportionate deduction: eligible ₹3,000 vs actual ₹6,000, associated charges ₹2,00,000 gives payer ₹1,00,000 and patient +₹1,00,000. Pharmacy and implants are not reduced.
- (Phase 2) Multi-payer: bill ₹1,80,000, insurer approved ₹1,40,000, corporate top-up ₹20,000, gives buckets 1,40,000 / 20,000 / 20,000, and each payer gets its own receivable.
- (Phase 2) A pre-auth submitted at 10:00 and still undecided at 11:01 shows breached. A discharge auth submitted at 14:00 and undecided at 17:01 shows breached. Both appear in the TAT report.
- (Phase 2) The INS-T8 export gives FHIR R4 JSON that validates against the NRCeS NHCX profiles for Claim and CoverageEligibilityRequest (offline validator in tests).

## Build order and tasks (migrations 1100–1119)
### INS-T1 Schema, payer rules and policies
- **Scope:** tables, RLS, policy CRUD.
- **Accept:** RLS and validity tests.
- **Model:** grok.
- **Depends:** SF-T3, SF-T6, IPB-T2.
### INS-T2 Cases and pre-auth state machine
- **Accept:** transition tests; approved-amount history; TAT timers and breach flags (Phase 2).
- **Model:** grok.
- **Depends:** INS-T1.
### INS-T3 Bill split engine
- **Scope:** tariff + non-payables + **proportionate deduction** + sub-limits + co-pay + cap, applied **per payer in sequence** (multi-payer buckets, Phase 2); writes `bill_line_responsibility`; split preview.
- **Accept:** the original worked example, plus the Phase 2 proportionate and multi-payer examples, plus 3 edge cases.
- **Model:** grok.
- **Depends:** INS-T2, IPB-T4.
### INS-T4 Claims, queries and the settlement DB function
- **Accept:** the settlement maths and the over-settlement 422.
- **Model:** grok.
- **Depends:** INS-T3.
### INS-T5 Web: cases list and case detail tabs
- **Model:** composer.
- **Depends:** INS-T2, INS-T3.
### INS-T6 Web: claims, settlement and payer rules screens
- **Model:** composer.
- **Depends:** INS-T4.
### INS-T7 Reports and seed
- **Scope:** the 5 reports and `seed-clinical/insurance.ts` (3 sample payers, 4 cases).
- **Model:** grok.
- **Depends:** INS-T4.
### INS-T8 NHCX-ready FHIR export (Phase 2)
- **Scope:** build FHIR R4 bundles (Coverage, CoverageEligibilityRequest, Claim pre-auth/claim, with attachments as DocumentReference) from a case, following the NRCeS NHCX profiles. Download only; no network.
- **Accept:** the acceptance bullet above; ICD-10 coded diagnoses; no PHI in logs.
- **Model:** grok.
- **Depends:** INS-T4, CP-T2 (ICD-10).
### INS-T9 Live NHCX / insurer gateway (Phase 2, **HOLD**)
- **Scope:** an HCX participant connector (sandbox first).
- **Hold reason:** needs ABDM M1/HFR registration, NHCX sandbox onboarding, and Kahaan's decision on the gateway or a partner (**R9.7**).
- **Model:** grok.
- **Depends:** INS-T8, the ABDM track.
### INS-T10 Government scheme master and separate ledger (Phase 2)
- **Scope:** `schemes`, `scheme_packages` (CSV import), scheme cases using package billing (IPB-T11), and a scheme receivables ledger and ageing.
- **Accept:** a PM-JAY sample package case bills the package rate, and the scheme receivable is separate from insurer receivables. State-scheme seed rows are marked `is_placeholder` until verified.
- **Model:** grok.
- **Depends:** INS-T3, IPB-T11.
