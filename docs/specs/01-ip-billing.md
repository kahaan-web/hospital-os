# 01 · IP Billing & Cash Handling (finish B6)

Doc module: "IN PATIENT BILLING AND CASH HANDLING" [DOCS: ML #7]. Sheet module "IP Billing & Cash Handling", 15 rows [DOCS: S1 r41–r55]. Stage 1 in Sheet3 [DOCS: S3 r23].
**Status:** B6 was in flight on `feat/b-b6` (test database `hos_b6m`). A `bills-definer` worker was moving B5 bill and settlement writes into DB functions. Its migration 0901 adds a platform-scope policy for the billing tables. [ARCH: orchestrator notes, handover §5] **The whole spec is [VERIFY-REPO]:** diff it against the B6 branch first (task IPB-T1) and build only what is missing.

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md` for the sources and the verification detail. [DOCS] items above and below are unchanged.

- **Bed-day rule** (R1.1): there is no national convention, so it's per-tenant configuration (below). [RESEARCH: Perplexity, P1-4 Raigad Hospital IPD policy; P1-5 MoHFW Charter]
- **GST** (R1.2): healthcare is exempt; non-ICU rooms above ₹5,000/day are taxed at 5% with no ITC on the whole charge; IP drugs and consumables are an exempt composite supply. [VERIFIED: V1, V2]
- **Documents** (R1.3, R1.7):
  - The interim bill is a **"Provisional statement – not a tax invoice"**.
  - The final document is a **bill of supply** for exempt lines, a **tax invoice** for taxable lines, or an **invoice-cum-bill of supply** when mixed (CGST Rule 46A).
  - Deposits issue **receipt vouchers**, refunds issue **refund vouchers**, and post-bill changes issue **credit notes**.
  - Every series is ≤16 characters, unique per financial year, never reused, with a gap report.

  [RESEARCH: Perplexity, CGST Rules 46/46A/49/50/51, P1-12/13/28] New **IPB-T10**.
- **Cash limit** (R1.6): cash deposits and settlements go through the SF-T9 guard (s.186, ₹2 lakh). [VERIFIED: V8]
- **Concessions** (R1.5): there's no statute, so it's management policy: % **and** ₹ caps, **cumulative per encounter**, with a reason code. A discount on a taxable line is pre-supply (s.15(3)) or a credit note (s.34). [RESEARCH: Perplexity, CGST Act s.15(3)/s.34]
- **Packages** (R1.4): common in practice, with no statutory template. The master has inclusions, exclusions, a length-of-stay cap, an overstay rule, and conversion to itemised billing. [RESEARCH-WEAK: Perplexity, P1-22 consumer blog, verify] New optional **IPB-T11**.
- **Itemised bill and rate display**: the MoHFW Patients' Rights Charter expects itemised bills; Maharashtra requires rate display (Nursing Homes Amendment Rules 2021, Sch. III). [RESEARCH: Perplexity, P1-5, P1-15] [RESEARCH-WEAK for the 2026 Marathi/English display GR: number unverified]

## Purpose
Run the money side of every inpatient stay:
- post charges as services happen;
- take and refund deposits;
- reverse wrong postings;
- prepare interim and final bills;
- apply concessions;
- settle the bill;
- report on all of the above. [DOCS: S1 r41–r55]

## Users and roles
- Cashier/Billing: deposits, settlement, bill preparation.
- Front Desk / IP desk: deposits.
- Nurse, Lab Tech, Pharmacist: charges post automatically from their modules.
- Accounts: reports, refunds approval.
- Location Admin / Tenant Admin: concession approval above a limit, reversal approval.

The role-to-function mapping is [DEFAULT, to confirm by research]. The functions themselves are [DOCS: S1 r41–r47].

## Workflows
1. **IP account opening.**
   - An ADT admission (B4) opens one `ip_account` for the encounter, with the primary payer (self by default) and bed class.
   - [DEFAULT, to confirm by research]; the admission itself is [DOCS: S1 r32].
2. **Posting charges for services.** [DOCS: S1 r41]
   - **Manual:** search a service, enter qty, rate (resolved from the tariff for bed class and payer, SF-T6), performing doctor and date of service.
   - **Automatic:** through contract C1 from lab, radiology, pharmacy IP issues, OT, blood bank and nursing.
   - **Bed and room charges:** posted daily by the bed-charge job (see Night Audit) or at transfer and discharge.
   - **Bed-day policy is tenant configuration**: `basis enum admission_anniversary|fixed_checkout|calendar_day`, `checkout_time` (for example 11:00), `grace_minutes`, `half_day_until` (for example 15:00), `min_charge_days` (1), and `transfer_rule enum higher_class_for_day|split_by_hours`. No national rule exists. [RESEARCH: Perplexity, R1.1, P1-4 Raigad 11am–11am with a half day until 3pm]
   - [CONFLICT: the Phase 1 default was a midnight census. Perplexity says the midnight census is a **statistics** convention, not a charging rule. Resolution: the midnight census feeds MIS occupancy only. Charging follows the policy, and the setup wizard makes the tenant pick a basis, pre-filled `fixed_checkout 11:00 / half day to 15:00`.]
   - The day-close (Night Audit) **never decides room-days**; it only calls the job that applies this policy. [RESEARCH-WEAK: Perplexity, R1.8]
3. **Accept deposit.** [DOCS: S1 r42]
   - Cash, UPI, card or cheque, recorded only (mock, no gateway).
   - Prints a deposit receipt with its own number series.
4. **Refund deposit.** [DOCS: S1 r43]
   - Only the unadjusted deposit balance can be refunded.
   - Refunds above a configurable limit need Accounts approval [DEFAULT, to confirm by research].
5. **Posting reversals.** [DOCS: S1 r44]
   - Select a charge and give a reason.
   - Creates a negative charge linked to the original.
   - The original can't be edited.
   - A reversal after the final bill isn't allowed. Use a credit note instead, under the same rule.
6. **Bill preparation.** [DOCS: S1 r45]
   - **Interim bill:** a snapshot, can be printed any time, titled **"Provisional statement – not a tax invoice"**, with no tax-document number. [RESEARCH: Perplexity, CGST s.31 / Rule 46, P1-12]
   - **Final bill:**
     - Locks the account.
     - Gets a bill number.
     - Groups charges by category.
     - Splits by payer: payer share vs patient share. The payer split comes from Insurance/TPA and Medicard; until they are built, everything is the patient share.
7. **Concessions.** [DOCS: S1 r46]
   - Percentage or amount, at bill level or line level.
   - Needs a reason code and the approver.
   - Limits per role, as **% and ₹ caps, cumulative per encounter**. The seed: Cashier 0 (request only), Billing supervisor 5% / ₹2,000, Location Admin 10% / ₹10,000, Tenant Admin (owner) above that. Reason codes: staff, senior citizen, financial hardship, doctor-approved, corporate contract, goodwill/service failure, rounding. [RESEARCH: Perplexity, R1.5 (no statute; proposed matrix)]
   - [CONFLICT: the Phase 1 default let a Cashier give 5% / ₹1,000. Perplexity's proposal gives the cashier no discretion. The seed follows Perplexity, the more conservative option; the tenant can raise it.]
8. **Bill settlement.** [DOCS: S1 r47]
   - Adjust deposits, collect the balance (split modes allowed), or mark credit for payer/corporate dues.
   - Settlement closes the account and unblocks discharge (ADT "discharge" checks billing clearance [DEFAULT, to confirm by research]).
   - Excess deposit becomes a refund.

## Screens
- `/app/ip-billing`: list of active IP accounts. Columns: UHID, IP no., bed, admitted on, running total, deposits, balance, payer. Filter by location and ward.
- `/app/ip-billing/[accountId]`:
  - **Charges** tab: grouped by date or category, add charge, reverse.
  - **Deposits** tab: accept, refund.
  - **Bill** tab: interim and final, concession, settlement.
  - **Statement** tab: summary and detail.
- Print layouts:
  - deposit receipt;
  - interim bill;
  - final bill (summary and detailed);
  - refund voucher;
  - concession slip.
- Reports under `/app/ip-billing/reports/*`, one per report row below.

## Data model (tenant-scoped; extend the B6 tables if present [VERIFY-REPO])
- `ip_accounts(location_id, encounter_id FK, patient_id FK, primary_payer_id FK, bed_class, status enum open|final_billed|settled|cancelled, opened_at, final_bill_id FK null)`
- `patient_charges(account_type enum op|ip, account_id, service_id FK, qty numeric(10,2), unit_price_paise, gross_paise, line_concession_paise, net_paise, gst_rate_bp, gst_paise, service_date, source_module, source_ref_id, performed_by_doctor_id FK null, referring_doctor_id FK null, reverses_charge_id FK null, reason null, posted_by)`. This may be shared with OP, so check B5. Append-only.
- `deposits(location_id, account_id, patient_id FK, receipt_no, amount_paise, mode enum cash|upi|card|cheque|neft|other, mode_ref, received_at, received_by)` and `deposit_refunds(deposit_id FK null, account_id, amount_paise, mode, approved_by null, refund_no)`
- `ip_bills(account_id FK, bill_no, bill_type enum interim|final, gross_paise, concession_paise, gst_paise, net_paise, payer_share_paise, patient_share_paise, deposits_adjusted_paise, balance_paise, status enum draft|final|cancelled, finalised_at, finalised_by)` and `ip_bill_lines(bill_id FK, category, charge_ids uuid[], amount_paise, payer_id FK)`
- `concessions(account_id, bill_id FK null, charge_id FK null, kind enum percent|amount, value, amount_paise, reason_code, requested_by, approved_by, approved_at)`
- `settlements(bill_id FK, settlement_no, amount_paise, mode, mode_ref, settled_at, settled_by, credit_payer_id FK null)`
- The money functions are DB functions, the bills-definer pattern:
  - `ipb_post_charge`
  - `ipb_reverse_charge`
  - `ipb_accept_deposit`
  - `ipb_refund_deposit`
  - `ipb_apply_concession`
  - `ipb_finalise_bill`
  - `ipb_settle_bill`

  Each takes `FOR UPDATE` on `ip_accounts` and an idempotency key.

## APIs (module `ip_billing`; feature keys one per Sheet1 row)

| Method | Path | Feature key | Roles |
|---|---|---|---|
| GET | `/tenant/ip-billing/accounts` | `ip_billing.posting_charges` | Cashier, Front Desk, Accounts |
| GET | `/tenant/ip-billing/accounts/:id` | same | same |
| POST | `/tenant/ip-billing/accounts/:id/charges` (Idem) | `ip_billing.posting_charges` [S1 r41] | Cashier, Nurse |
| POST | `/tenant/ip-billing/charges/:id/reverse` (Idem) | `ip_billing.posting_reversals` [S1 r44] | Cashier (+approver over limit) |
| POST | `/tenant/ip-billing/accounts/:id/deposits` (Idem) | `ip_billing.accept_deposit` [S1 r42] | Cashier, Front Desk |
| POST | `/tenant/ip-billing/deposits/:id/refund` (Idem) | `ip_billing.refund_deposit` [S1 r43] | Cashier + Accounts approval |
| POST | `/tenant/ip-billing/accounts/:id/bills` `{type}` (Idem) | `ip_billing.bill_preparation` [S1 r45] | Cashier |
| POST | `/tenant/ip-billing/accounts/:id/concessions` (Idem) | `ip_billing.concessions` [S1 r46] | Cashier, approver |
| POST | `/tenant/ip-billing/bills/:id/settle` (Idem) | `ip_billing.bill_settlement` [S1 r47] | Cashier |
| GET | `/tenant/ip-billing/bills/:id/print?layout=` | `ip_billing.bill_preparation` | Cashier |
| GET | `/tenant/ip-billing/reports/statement-of-account?accountId&mode=summary\|detail` | `ip_billing.patient_statement_of_account` [S1 r48] | Cashier, Accounts |
| GET | `/tenant/ip-billing/reports/revenue?mode=` | `ip_billing.revenue_summary_detail` [S1 r49] | Accounts |
| GET | `/tenant/ip-billing/reports/bill-register` | `ip_billing.bill_register` [S1 r50] | Accounts |
| GET | `/tenant/ip-billing/reports/concession-register` | `ip_billing.concession_register` [S1 r51] | Accounts |
| GET | `/tenant/ip-billing/reports/doctor-sharing?mode=` | `ip_billing.doctor_sharing_detail` [S1 r52] | Accounts |
| GET | `/tenant/ip-billing/reports/deposit-register` | `ip_billing.deposit_register` [S1 r53] | Accounts, Cashier |
| GET | `/tenant/ip-billing/reports/patient-outstanding` | `ip_billing.patient_outstanding` [S1 r54] | Accounts |
| GET | `/tenant/ip-billing/reports/cash?mode=` | `ip_billing.cash_summary_detail` [S1 r55] | Cashier, Accounts |

Note: [S1 r55] spells the module "IP Billing & Cash handling". It's the same module (PLAN.md).

## Business rules and edge cases
- **Charges:**
  - Only on an `open` account.
  - The service date must fall within the admission's start and end (or today); otherwise 422.
  - Qty must be greater than 0, with decimals allowed for hourly items [DEFAULT, to confirm by research].
- **Reversals:**
  - A reversal never exceeds the original net amount.
  - A double reversal returns 409.
  - Reversing an auto-posted charge also notifies the source module through an outbox event [DEFAULT, to confirm by research].
- **Final bill:**
  - Exactly one non-cancelled final bill per account.
  - Re-billing needs the final bill cancelled first (Location Admin permission, with a reason). The cancelled number stays in the series with no gap.
- **Deposits** can't be refunded below the amount already adjusted. A refund is a new row.
- **Cash limit:** a cash deposit or settlement that would take the person's cash total for the day or event at the legal entity to **₹2,00,000 or more** is rejected (422 `cash_limit_exceeded`). There's no manager override. The UI suggests UPI, card, NEFT or cheque. [VERIFIED: Income-tax Act 2025 s.186] [RESEARCH: Perplexity, R1.6]
- **Numbering:** deposit receipts, refund vouchers, bills of supply, tax invoices and credit notes each have their own ≤16-character series, unique per financial year. Cancelled numbers are kept with status `cancelled`, never reused. [RESEARCH: Perplexity, R1.7, CGST Rules 46/49]
- **Concessions:**
  - A concession can't make the net amount negative.
  - Approval limits are checked against the **cumulative** concession on the encounter, not per request. [RESEARCH: Perplexity, R1.5]
  - The concession total is shown separately on the bill.
- **Clinical GST:** exempt by default (Phase B plan §3.2 [VERIFY-REPO]). All of these resolve through `resolve_gst()` and `tax_rules` (SF-T9):
  - **Room rent:** non-ICU room above ₹5,000/day → 5% (CGST 2.5% + SGST 2.5%) on the **whole** room charge, no ITC. ICU/CCU/ICCU/NICU are exempt at any rate. Exactly ₹5,000 is exempt. [VERIFIED: Notif. 03/2022-CT(R) entry 31A]
  - **Inpatient pharmacy items and consumables:** part of the exempt composite supply (no separate GST on IP issues). [RESEARCH: Perplexity, CGST s.2(30)/s.8; Kerala AAR Thomas Hospital 2021 (non-binding)]
  - **Cosmetic/plastic procedures** (not reconstructive): taxable, with the seed at 18%. [VERIFIED exclusion: Notif. 12/2017 definitions] [RESEARCH-WEAK: rate, verify]
  - **Health-check packages** (diagnostic): exempt. [RESEARCH: Perplexity, R1.2]
  - A bill with both exempt and taxable lines prints as an **invoice-cum-bill of supply**. [RESEARCH: Perplexity, CGST Rule 46A]
- **Package billing** (a fixed-price surgery package with exclusions) is common, and there's no statutory template. [RESEARCH-WEAK: Perplexity, R1.4, P1-22, verify] It's **optional task IPB-T11, after the finish**.
  - **Package master:** code, procedure, bed class, price, included LOS days, included items/categories, exclusions list, overstay rule (per-day room + nursing at tariff), implant rule (actuals vs cap), and conversion rule (convert to itemised if a complication occurs or LOS exceeds N days, with approval).
  - Lines inside a package post at ₹0 with `package_id` so utilisation reports still work.
- Patient Outstanding is **Medium+** (Sheet1 r54 = N,Y,Y). Sheet3 says Basic. The conflict is **OPEN – to confirm with Ajay Sheth** (#24).
- **Multi-location:** an account belongs to the admission's location, and reports filter by location.
- **Concurrency:** two cashiers settling the same bill: the second gets 409 (FOR UPDATE plus idempotency).

## Integrations
- **ADT (B4):**
  - opens the account at admission;
  - transfer changes the bed class from the transfer time;
  - discharge checks for settled or credit-approved.
- **Lab, Pharmacy, Nursing, OT, Radiology, Blood Bank:** post through C1.
- **Doctor Accounting:** reads charges with doctor attribution (C2) for the doctor-sharing report and payables.
- **Insurance/TPA and Medicard:** set the payer split at bill preparation.
- **Night Audit:** bed charges and the daily cash close.
- **MIS:** revenue, outstanding and occupancy-revenue.

## Tier (Sheet1)
- **Basic:** all 7 functions [S1 r41–r47], and the reports Statement of Account, Revenue, Bill Register, Concession Register, Doctor Sharing, Deposit Register and Cash Summary/Detail [S1 r48–r53, r55].
- **Medium:** everything in Basic, plus Patient Outstanding [S1 r54].
- **Premium:** the same as Medium.
- Patient Outstanding: Sheet3 says Basic. The conflict is **OPEN – to confirm with Ajay Sheth.** (#24).

## Acceptance criteria
1. Admitting a sample patient opens an account. Posting 3 charges, 1 reversal, 2 deposits, a 10% concession, a final bill and a settlement gives the correct balance to the paisa, and a refund of the excess.
2. Every money write goes through a DB function. `hos_app` can't UPDATE or DELETE charges, deposits, bills or settlements.
3. Replaying the same `Idempotency-Key` returns the original result. Parallel settle returns one 200 and one 409.
4. Every report in the table renders, filters by date and location, and exports CSV. Patient Outstanding returns 403 `not_entitled` on Basic.
5. Discharge is blocked while the account is `open` with a balance and no credit approval.
6. The RLS fixtures cover all IP billing tables, and cross-tenant access fails.
7. Audit rows hold ids and amounts only, with no patient names.
8. (Phase 2) A non-ICU room at ₹5,500/day for 3 days gives ₹16,500 taxable plus ₹825 GST (₹412.50 CGST + ₹412.50 SGST, rounded per line), and the bill prints as an invoice-cum-bill of supply. The same stay in ICU at ₹8,000 is fully exempt.
9. (Phase 2) A ₹1,90,000 cash deposit followed by a ₹10,000 cash settlement for the same patient on the same day is rejected. A ₹10,000 UPI settlement succeeds.
10. (Phase 2) The interim print says "Provisional statement – not a tax invoice" and has no tax series number. Every final series fits in 16 characters, and the gap report lists cancelled numbers.
11. (Phase 2) The bed-day policy `fixed_checkout 11:00, half_day_until 15:00`: admitted 10/11 at 20:00 and discharged 12/11 at 14:00 gives 2 full days + 1 half day.

## Build order and tasks (migration range: B6's range if reserved, else 1020–1039)
### IPB-T1 Diff B6 against this spec
- **Scope:** check out `feat/b-b6` and `bills-definer`. Mark each workflow, report, API and rule as done, partial or missing in `docs/specs/ip-billing-gap.md`.
- **Accept:** a complete matrix, and a decision on reusing `patient_charges` with OP.
- **Model:** grok.
- **Depends:** Dell back, B6 merged or rebased.
### IPB-T2 Money DB functions
- **Scope:** any of the 7 `ipb_*` functions still missing, plus grants (revoke UPDATE/DELETE from hos_app). Phase 2: deposit and settle call `assert_cash_allowed` (SF-T9); concession checks the cumulative caps.
- **Accept:** function-level tests for each, including the concurrency test.
- **Model:** grok.
- **Depends:** IPB-T1, bills-definer merged, SF-T9 (Phase 2).
### IPB-T3 Bed-charge posting job
- **Scope:** `ipb_post_bed_charges(location, business_date)`, idempotent per account and date, applying the **tenant bed-day policy** (Phase 2: basis, checkout time, grace, half day, transfer rule) and `resolve_gst()` for room rent. Callable from Night Audit later.
- **Accept:** running it twice posts once; transfer mid-day splits the bed class per the rule; acceptance criteria 8 and 11.
- **Model:** grok.
- **Depends:** IPB-T2.
### IPB-T4 Final bill, concession approval, settlement and discharge clearance
- **Scope:** API plus the approval limit config, and the ADT discharge check.
- **Accept:** acceptance criteria 1, 3 and 5.
- **Model:** grok.
- **Depends:** IPB-T2.
### IPB-T5 Reports part 1
- **Scope:** Statement of Account (summary and detail), Bill Register, Deposit Register, Cash Summary/Detail.
- **Accept:** CSV export, and the totals reconcile with the function tests.
- **Model:** grok.
- **Depends:** IPB-T4.
### IPB-T6 Reports part 2
- **Scope:** Revenue Summary/Detail, Concession Register, Doctor Sharing/Detail (gross attribution until Doctor Accounting rules exist), Patient Outstanding (Medium+ feature guard).
- **Accept:** 403 on Basic for outstanding.
- **Model:** grok.
- **Depends:** IPB-T5.
### IPB-T7 Web: account list and account detail tabs
- **Scope:** `/app/ip-billing/**` screens.
- **Accept:** the full flow in acceptance criterion 1 works from the UI on demo data.
- **Model:** composer.
- **Depends:** IPB-T4.
### IPB-T8 Print layouts and report screens
- **Scope:** the 5 print layouts and 8 report screens.
- **Accept:** prints at A4 and A5 [DEFAULT, to confirm by research]; Indian formats.
- **Model:** composer.
- **Depends:** IPB-T5, IPB-T6.
### IPB-T9 Seed and demo
- **Scope:** `seed-clinical/ip-billing.ts` with 6 sample admissions in assorted states.
- **Accept:** the demo shows open, final-billed and settled accounts.
- **Model:** grok.
- **Depends:** IPB-T7.
### IPB-T10 GST document types and series (Phase 2)
- **Scope:**
  - Document types: provisional statement (no number), bill of supply, tax invoice, invoice-cum-bill of supply, receipt voucher (deposit), refund voucher, and credit note (post-bill concession or reversal).
  - ≤16-character series per location and financial year, with a validator.
  - Cancelled-number retention and a gap report.
  - Print headers per document type.
- **Accept:** acceptance criterion 10; a mixed bill prints as an invoice-cum-bill of supply; a credit note references the original document.
- **Model:** grok.
- **Depends:** IPB-T4, SF-T9.
### IPB-T11 Package billing (Phase 2, optional, after the finish)
- **Scope:**
  - Package master as in the business rules.
  - Apply a package to an account; in-package lines post at ₹0 with `package_id`.
  - Overstay and exclusion posting.
  - Convert to itemised with approval.
  - Package utilisation report.
- **Accept:** a ₹60,000 package with 3 days included, a 5-day stay and one excluded implant bills ₹60,000 + 2 days' overstay + the implant; converting to itemised re-prices every line from the tariff.
- **Model:** grok.
- **Depends:** IPB-T4. Tagged [RESEARCH-WEAK]: confirm the package fields with a pilot hospital before building.
