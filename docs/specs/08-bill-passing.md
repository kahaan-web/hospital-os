# 08 · Scrolling, Certification & Bill Passing

Doc module "SCROLLING, CERTIFICATION BILL PASSING" [DOCS: ML #15]. It's a **name only**. What the three terms mean was [GAP: needs research]. Phase 2 has a weak answer, below. Meaning: **OPEN – to confirm with Ajay Sheth** (OPEN-QUESTIONS-AJAY #25).

The related Sheet1 rows sit under Pharmacy, all Basic:
- Payment Approvals [S1 r63] (Status "New");
- Bill Payment [S1 r64] (Status "New");
- Supplier Outstanding [S1 r74] (Status "New");
- Supplier Payment Register [S1 r75] (Status "New").

Meaning **OPEN – to confirm with Ajay Sheth** (#25). The text that follows is a *candidate reading only*, kept so work can start fast once confirmed. It is **not a decision**: no task in this module may be built on it until the meaning is confirmed. Candidate reading A (Phase 1):
- **Scrolling:** the daily "scroll", a register of supplier and vendor bills received at the inward desk.
- **Certification:** the receiving or user department certifies that goods were received or the service was rendered (for example a GRN, AMC visit or laundry delivery).
- **Bill passing:** Accounts checks the bill against the PO, GRN and certification, then passes the net payable for payment approval and payment.

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md` for the sources and the verification detail. [DOCS] items above and below are unchanged.

- **Meanings** (R5.1):
  - **Scrolling** is the initial entry of the supplier invoice (no., date, gross) as a **provisional liability**.
  - **Certification** is validating the scrolled invoice **against the GRN and PO (3-way match)**, confirming receipt and the agreed rates.
  - **Bill passing** is Accounts' final authorisation: statutory deductions (TDS, GST adjustments), the net payable, then the payment queue.
  - Flow: scroll → certification → bill passing → payment approval → disbursement.

  [RESEARCH-WEAK: Gemini, ICAI homepage only, verify]

  [CONFLICT: in Phase 1, certification was the *user department* certifying receipt, and the 3-way match sat in *bill passing*. Gemini puts the 3-way match in certification. Resolution: one pipeline with **configurable stage ownership**: `match_stage enum certification|passing` with **no seed**; the department-receipt certification step is a setting (`require_dept_certification`). Which reading is right is **OPEN – to confirm with Ajay Sheth** (OPEN-QUESTIONS-AJAY #25).]
- **Tolerances** (R5.2): "common" quantity tolerance ±2–5%, and rate tolerance up to ₹10 for GST rounding. [RESEARCH-WEAK: Gemini, NABH homepage] [CONFLICT: the Phase 1 seed is qty 0 / rate ±0.5%. The seed stays strict, and the research values are documented as allowed ranges. A rate tolerance can be % **or** an absolute ₹.]
- **TDS** (R5.5): configuration per supplier and section, effective-dated.
  - Gemini gave contractors 1%/2% (₹30k single / ₹1L aggregate), professional 10% and technical 2% (Gemini said a ₹30k threshold), purchase of goods 0.1% over ₹50L, and commission 2% (₹15k). [RESEARCH-WEAK: Gemini, homepage]
  - **Verified:** under the **Income-tax Act 2025 s.393(1) Table**: contractors Sl. 6(i) 1% individual/HUF or 2% others, thresholds ₹30,000 single / ₹1,00,000 aggregate; professional fees Sl. 6(iii) **10%, technical 2%, threshold ₹50,000**. [VERIFIED: https://www.incometaxindia.gov.in/w/section-393-6]
  - [CONFLICT: Gemini's ₹30,000 professional-fee threshold is outdated; the seed uses ₹50,000. The goods-purchase and commission rows are seeded `is_placeholder=true` until verified.]
  - Section codes are stored as the **new-Act reference plus the legacy code** (e.g. `393/6(iii)` and legacy `194J`), because suppliers and 26AS still quote the old numbers.
- **MSME** (R5.6): pay micro and small suppliers within **15 days** (no written agreement) or **45 days** (with one), counted from acceptance. Income-tax s.43B(h) disallows the expense until paid. Capture the Udyam number and category. [RESEARCH-WEAK: Gemini, msme.gov.in/incometaxindia homepages, verify] The research turns the MSME badge into a **due-date engine plus a pre-31-March alert**.

## Purpose
Control every supplier and vendor bill from receipt to payment:
- log it (scroll);
- get it certified;
- match it (3-way);
- pass it with deductions and TDS;
- approve payment;
- record the payment;
- track supplier outstanding and payment registers. [DOCS: S1 r63, r64, r74, r75]

## Users and roles
- Accounts clerk: scroll entry, passing.
- Department head / Store Keeper / Biomedical Engineer / Linen Supervisor: certification.
- Accounts head / Tenant Admin: payment approval.
- Cashier/Accounts: records the payment (no real payout).

[DEFAULT, to confirm by research]

## Workflows
1. **Scroll entry.**
   - Inward a bill: supplier, invoice no. and date, amount, GST, linked PO(s) and GRN(s) or service contract, received date, and an attachment (C5).
   - Each bill gets a scroll no.
2. **Certification.**
   - The bill is routed to the certifying department (auto: the GRN's store or the contract owner).
   - The certifier accepts, rejects, or partly certifies with remarks.
   - A pharmacy or stores GRN may count as auto-certified [DEFAULT, to confirm by research].
3. **Bill passing (3-way match).** The system compares, per line:
   - PO qty × rate;
   - GRN accepted qty;
   - invoice qty × rate.

   Within tolerance, the line passes. Otherwise the variance shows and the clerk either:
   - passes it with a deduction (short supply, rate difference, rejection, penalty), or
   - holds it.

   TDS by section and rate comes from the effective-dated `tds_sections` master (new-Act s.393 references plus legacy codes), set per supplier with an optional lower-deduction certificate (rate, validity, limit). [VERIFIED: s.393 contractors and professional rows] [RESEARCH-WEAK: other rows] The result is the net payable.
4. **Payment Approvals.** [DOCS: S1 r63] Passed bills are batched by due date (from supplier payment terms). The approver approves all or some.
5. **Bill Payment.** [DOCS: S1 r64]
   - Record the payment: mode (NEFT/cheque/cash/UPI), reference, date, and the bills covered.
   - The bank file export is [DEFAULT, to confirm by research] (a CSV only, no bank integration).
   - Advance payments and debit notes (supplier returns) adjust the next payment.
6. **Reports:**
   - Supplier Outstanding [DOCS: S1 r74], with ageing by due date;
   - Supplier Payment Register [DOCS: S1 r75];
   - Scroll register, pending certification and passed-not-paid ([DEFAULT, to confirm by research]).

## Screens
- `/app/accounts/scroll`: inward entry and list.
- `/app/accounts/certification`: my pending certifications.
- `/app/accounts/bills/[id]`: the match view (PO / GRN / invoice side by side), deductions, TDS, pass or hold.
- `/app/accounts/payment-approvals`: batch approve.
- `/app/accounts/payments`: record payment and print the voucher.
- `/app/accounts/reports/*`.

## Data model
- `supplier_bills(location_id, scroll_no, supplier_id FK, invoice_no, invoice_date, received_on, gross_paise, gst_paise, total_paise, source_type enum grn|service|doctor_invoice|other, status enum scrolled|pending_cert|certified|passed|on_hold|approved|partly_paid|paid|rejected, due_date, attachment_id FK null)`, with UNIQUE (tenant_id, supplier_id, invoice_no)
- `supplier_bill_links(bill_id FK, po_id FK null, grn_id FK null, contract_ref null)`
- `bill_certifications(bill_id FK, department_id FK, certifier_user_id, decision enum accepted|partial|rejected, certified_amount_paise, remarks, decided_at)`
- `bill_match_lines(bill_id FK, item_id FK null, po_qty, po_rate_paise, grn_accepted_qty, inv_qty, inv_rate_paise, variance_paise, decision enum ok|deduct|hold)`
- `bill_deductions(bill_id FK, reason_code, amount_paise, remarks)` and `bill_tds(bill_id FK, section_code, rate_bp, base_paise, tds_paise)`.
- `tds_sections(code, legacy_code, description, rate_bp_individual, rate_bp_other, threshold_single_paise, threshold_aggregate_paise, effective_from, effective_to, is_placeholder)`, seeded with s.393 Sl. 6(i) and 6(iii) [VERIFIED] and others as placeholders. `supplier_tds_certificates(supplier_id FK, section_code, rate_bp, valid_from, valid_to, limit_paise)`.
- `bill_passing_settings(match_stage, require_dept_certification, qty_tolerance_bp, rate_tolerance_bp, rate_tolerance_abs_paise)` (Phase 2)
- `bill_passings(bill_id FK, net_payable_paise, passed_by, passed_at)`
- `payment_batches(location_id, batch_no, status enum draft|approved|paid, approved_by, approved_at)` and `payment_batch_bills(batch_id FK, bill_id FK, amount_paise)`
- `supplier_payments(location_id, payment_no, supplier_id FK, amount_paise, mode, mode_ref, paid_on, batch_id FK null)` and `supplier_payment_allocations(payment_id FK, bill_id FK null, debit_note_id FK null, amount_paise)`, through the DB function `bp_record_payment` (FOR UPDATE on the bills)

## APIs (module `bill_passing`; features below)

| Method | Path | Feature | Roles |
|---|---|---|---|
| GET/POST | `/tenant/accounts/bills` (scroll) | `bill_passing.scroll` [DEFAULT] | Accounts |
| POST | `/tenant/accounts/bills/:id/certify` | `bill_passing.certification` [DEFAULT] | Certifier |
| GET | `/tenant/accounts/bills/:id/match` | `bill_passing.passing` [DEFAULT] | Accounts |
| POST | `/tenant/accounts/bills/:id/{pass,hold,reject}` (Idem) | `bill_passing.passing` | Accounts |
| GET/POST | `/tenant/accounts/payment-batches`; POST `/:id/approve` | `pharmacy.payment_approvals` [S1 r63] | Approver |
| POST | `/tenant/accounts/payments` (Idem); GET `/payments/:id/voucher` | `pharmacy.bill_payment` [S1 r64] | Accounts |
| GET | `/tenant/accounts/reports/supplier-outstanding` | `pharmacy.supplier_outstanding` [S1 r74] | Accounts |
| GET | `/tenant/accounts/reports/supplier-payments` | `pharmacy.supplier_payment_register` [S1 r75] | Accounts |
| GET | `/tenant/accounts/reports/{scroll,pending-cert,passed-unpaid}` | `bill_passing.*` | Accounts |

The Sheet1 rows r63/r64/r74/r75 are pharmacy features. If B7 already built them for pharmacy suppliers [VERIFY-REPO], extend the same tables to all suppliers instead of duplicating them.

## Business rules and edge cases
- A duplicate (supplier, invoice no.) returns 409.
- A bill can't be passed before certification. A bill can't be approved before passing. A bill can't be paid before approval.
- Net payable = certified/matched amount − deductions − TDS. Payments can't exceed the net payable outstanding.
- Match tolerance is configurable (default qty 0, rate ±0.5% **or** an absolute ₹ amount per line). Research gives "common" ranges of qty ±2–5% and rate ±₹10. [RESEARCH-WEAK: Gemini, R5.2] [CONFLICT: the strict seed is kept]
- Supplier debit notes from returns (IND-T5) offset the outstanding.
- **MSME suppliers** (micro or small):
  - `msme_due_date` = acceptance date + **45 days** if `has_written_payment_agreement` (and the agreed term is ≤45), else **+15 days**.
  - Bills approaching the due date appear first in payment approvals.
  - Overdue ones show a red badge, and a **March alert** lists MSME bills unpaid as of 15 March (the 43B(h) exposure).
  - Medium enterprises aren't covered.

  [RESEARCH-WEAK: Gemini, R5.6, verify] [CONFLICT: Phase 1 flagged 45 days only]
- Separation of duties: the user who passes a bill can't approve it [DEFAULT, to confirm by research].

## Integrations
- Indents & Purchase: PO and GRN.
- Pharmacy: supplier bills.
- Equipment Maintenance and the Maintenance Tracker: AMC and service vendor bills.
- Linen: laundry vendor bills.
- Doctor Accounting: optionally, doctor invoices through the same approval and payment flow.
- MIS: supplier outstanding.

## Tier
- Payment Approvals, Bill Payment, Supplier Outstanding and the Supplier Payment Register are **Basic** [S1 r63, r64, r74, r75].
- Scroll, certification and 3-way passing aren't in Sheet1. **OPEN – to confirm with Ajay Sheth.** (OPEN-QUESTIONS-AJAY #6)
- How Basic tenants handle bills without scroll and certification depends on that answer. **OPEN – to confirm with Ajay Sheth.**

## Acceptance criteria
- A PO for 100 @ ₹10 → GRN with 95 accepted → invoice for 100 @ ₹10.10 → the match shows a qty and rate variance → passed with deductions of ₹60.00 (5 short @ ₹10.10 = ₹50.50, plus a rate difference of 95 × ₹0.10 = ₹9.50, because 1% is outside the ±0.5% tolerance) → net ₹950.00 before TDS → approved → paid in two parts → the outstanding report goes to 0.
- Each out-of-order transition gives a 422. A duplicate invoice gives a 409. Passer ≠ approver is enforced.
- A Basic tenant can approve and pay without scroll or certification. Scroll routes give 403.
- RLS fixtures exist for all tables.
- (Phase 2) A micro supplier with no agreement: a bill accepted on 1 Mar is due 16 Mar, and appears in the March 43B(h) alert if unpaid. With an agreement, it's due 15 Apr.
- (Phase 2) A professional-fee bill of ₹40,000 from a supplier with no prior payments this year → no TDS. A second bill taking the year to ₹60,000 → TDS on the whole ₹60,000 aggregate at 10% (₹6,000, less any TDS already deducted). Rules come from `tds_sections` rows only.

## Build order and tasks (migrations 1160–1179)
### BP-T1 Diff B7 payment approvals and bill payment, and decide reuse
- **Model:** grok.
- **Depends:** IND-T1.
### BP-T2 Scroll and certification schema, API and routing
- **Model:** grok.
- **Depends:** BP-T1, IND-T4.
### BP-T3 3-way match engine, deductions, TDS (s.393 master, thresholds, certificates) and pass/hold; configurable match stage; MSME due-date engine (Phase 2 scope)
- **Accept:** the worked example as a test.
- **Model:** grok.
- **Depends:** BP-T2.
### BP-T4 Payment batches, approval, payment DB function and allocations
- **Model:** grok.
- **Depends:** BP-T3.
### BP-T5 Reports
- **Scope:** supplier outstanding ageing, payment register, scroll, pending-cert, passed-unpaid.
- **Model:** grok.
- **Depends:** BP-T4.
### BP-T6 Web: scroll, certification inbox and match view
- **Model:** composer.
- **Depends:** BP-T3.
### BP-T7 Web: approvals, payments, voucher print and reports
- **Model:** composer.
- **Depends:** BP-T4, BP-T5.
