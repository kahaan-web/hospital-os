# GAP · OP Billing & Cash Handling (B5 on main: complete it)

Doc module "OUTPATIENT BILLING AND CASH HANDLING" [DOCS: ML #4]. Sheet module "OP Billing & Cash handling", 13 rows [DOCS: S1 r20–r31, r98]. **Status:**
- B5 is merged on main.
- `bills-definer` (moving the B5 bill and settlement writes into DB functions, plus migration 0901) was in flight.
- How complete B5 is against the sheet is unknown [ARCH: handover §5].

**Everything here is [VERIFY-REPO when the Dell is back].** Task OPB-T1 produces the real gap list. The items below are what the docs require. The ones marked *likely gap* are those a first vertical slice ("DB + API + tests + main web screen", per phaseb-head.md) usually leaves out.

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md`. [DOCS] items are unchanged.
- **Cash limit:** cash vouchers, deposits and settlements go through the SF-T9 guard (Income-tax Act 2025 s.186: ₹2 lakh per person per day, per transaction, or per event), at the legal-entity level, with no override. [VERIFIED: V8]
- **Documents:** an exempt OP voucher is a **bill of supply**. A voucher with a taxable line (cosmetic procedure, some items) is a tax invoice or an invoice-cum-bill of supply. Deposits issue receipt vouchers, and refunds issue refund vouchers. Each series is ≤16 characters. [RESEARCH: Perplexity, R1.3/R1.7, CGST Rules 46/46A/49/51]
- **Concessions:** the same cumulative %/₹ matrix as IP (cashier 0 by default). [RESEARCH: Perplexity, R1.5] [CONFLICT with the Phase 1 cashier allowance; see 01]

## Purpose
OP cash handling end to end: vouchers (cash, credit, free), deposits, refunds, settlements, concessions, and the OP cash, revenue, sharing, outstanding and deposit reports. [DOCS: S1 r20–r31, r98]

## Users and roles
- Cashier/Billing, Front Desk: vouchers, deposits.
- Accounts: reports, refund approval.
- Location Admin: concession approval over the limit.

[DEFAULT, to confirm by research]

## Docs checklist (Sheet1) with likely gaps

| Sheet1 row | Item | Tier B/M/P | Likely state |
|---|---|---|---|
| r20 | Accept Deposit | Y/Y/Y | likely gap (OP deposits are often skipped in a slice) |
| r21 | Refund Deposit | Y/Y/Y | likely gap |
| r22 | OP Voucher Posting (Cash / Credit / Free) | Y/Y/Y | cash likely done; **credit and free likely gaps** |
| r23 | OP Refund | Y/Y/Y | verify |
| r24 | OP Settlements (of credit vouchers) | Y/Y/Y | likely gap |
| r25 | Concessions | Y/Y/Y | verify (approval limits likely missing) |
| r26 | OP Voucher (Document) | Y/Y/Y | verify print layout |
| r27 | Cash Summary / Detail | Y/Y/Y | likely gap |
| r28 | Revenue Summary / Detail | Y/Y/Y | likely gap |
| r29 | Doctor Sharing / Detail | Y/Y/Y | likely gap (needs C2 attribution; engine from Doctor Accounting) |
| r30 | Patient Outstanding | Y/Y/Y | likely gap (needs credit vouchers) |
| r31 | Deposit Register | Y/Y/Y | likely gap |
| r98 | Visit Statistics for the period | N/Y/Y | likely gap; Medium+ guard |

## Workflows (to finish)
1. **Credit voucher.**
   - Bill to a payer, corporate or staff, or "patient credit".
   - Stays outstanding until an OP settlement [DOCS: S1 r22, r24].
   - The credit eligibility rules are [DEFAULT, to confirm by research]: needs an approved payer or a manager approval.
2. **Free voucher.**
   - A zero-value voucher with a reason code: staff, follow-up, camp or charity [DOCS: S1 r22].
   - Counted in statistics but not revenue.
   - Approval needed [DEFAULT, to confirm by research].
3. **OP deposits**, for example for day-care or advance for procedures [DOCS: S1 r20, r21]. They're adjusted against later vouchers.
4. **Settlement** of credit vouchers, in part or full, with mode details [DOCS: S1 r24].
5. **Counter close and cash summary** [DOCS: S1 r27]. Ties to Night Audit's `counter_sessions`.
6. **Reports** [DOCS: S1 r26–r31, r98] with the C6 framework.

## Screens (add if missing)
- `/app/op-billing` voucher screen: cash/credit/free toggle, deposit adjust.
- `/app/op-billing/deposits`.
- `/app/op-billing/settlements`.
- `/app/op-billing/reports/{cash,revenue,doctor-sharing,outstanding,deposits,visit-stats}`.
- Voucher print.

## Data model (additions to B5 [VERIFY-REPO])
- `op_vouchers.voucher_type enum cash|credit|free`, `credit_party_type`, `credit_payer_id FK null`, `free_reason_code`, `approved_by`
- `op_deposits` / shared `deposits` with `account_type='op'` (see IP spec)
- `op_settlements(voucher_id FK, amount_paise, mode, mode_ref, settled_at)`, through a DB function
- Doctor attribution columns (C2) on OP charge lines

## APIs (module `op_billing`; feature keys one per row, [VERIFY-REPO names])
- POST `/tenant/op-billing/vouchers` `{type: cash|credit|free}` (Idem) → `op_billing.op_voucher_posting` [S1 r22]
- POST `/tenant/op-billing/deposits` (Idem) [S1 r20]; POST `/tenant/op-billing/deposits/:id/refund` (Idem) [S1 r21]
- POST `/tenant/op-billing/vouchers/:id/refund` (Idem) [S1 r23]; POST `/tenant/op-billing/vouchers/:id/settle` (Idem) [S1 r24]
- POST `/tenant/op-billing/vouchers/:id/concession` [S1 r25]; GET `/tenant/op-billing/vouchers/:id/print` [S1 r26]
- GET `/tenant/op-billing/reports/{cash,revenue,doctor-sharing,outstanding,deposits}` [S1 r27–r31]; GET `/reports/visit-stats` [S1 r98], **Medium+**

## Business rules and edge cases
- A free voucher has a total of 0, needs a reason, and can't be refunded.
- A credit voucher's outstanding = net − settlements. Over-settlement gets 422.
- A refund can't exceed the amount paid. A refund on a credit voucher reduces the outstanding instead.
- All money writes go through DB functions (bills-definer), idempotent, FOR UPDATE.
- Clinical GST is exempt by default [VERIFY-REPO plan §3.2]; taxable lines resolve through `resolve_gst()` (SF-T9). [VERIFIED: V1]
- Cash receipts are checked by `assert_cash_allowed`; a breach → 422 `cash_limit_exceeded`. [VERIFIED: V8]

## Integrations
- Appointments and visits (consultation charge).
- Lab and Radiology (OP orders paid first).
- Pharmacy (OP sales may be a separate bill [VERIFY-REPO]).
- Medicard (concession type).
- Marketing (corporate discount).
- Doctor Accounting.
- Night Audit.
- MIS.

## Tier (Sheet1)
- **Basic:** r20–r31.
- **Medium and Premium:** r20–r31, plus r98 Visit Statistics.
- Sheet3 puts Visit Statistics at Basic. The conflict is **OPEN – to confirm with Ajay Sheth.** (#24).

## Acceptance criteria
- Every row in the checklist has a working route plus a screen, and a test.
- Visit Statistics returns 403 on Basic.
- The cash summary for a day equals the sum of cash receipts minus cash refunds for that counter and day.
- A credit voucher → part settlement → Patient Outstanding shows the remainder.
- (Phase 2) An OP cash deposit of ₹1,50,000 followed by a ₹50,000 cash voucher for the same patient on the same day → 422. The voucher series fits in 16 characters.

## Build order and tasks
### OPB-T1 Audit main against the checklist
- **Scope:** write `docs/specs/op-billing-gap.md` (done / partial / missing per row).
- **Model:** grok.
- **Depends:** Dell back, bills-definer merged.
### OPB-T2 Credit and free vouchers, OP deposits and refund, settlement DB functions
- **Scope:** whichever are missing. Phase 2 adds the `assert_cash_allowed` calls and the document type per voucher (bill of supply / tax invoice). Depends on SF-T9 as well.
- **Model:** grok.
- **Depends:** OPB-T1.
### OPB-T3 Missing reports
- **Scope:** cash, revenue, doctor sharing, outstanding, deposits, visit stats; Medium+ guard on r98.
- **Model:** grok.
- **Depends:** OPB-T2.
### OPB-T4 Web: voucher type toggle, deposits, settlements, report screens and voucher print
- **Model:** composer.
- **Depends:** OPB-T2, OPB-T3.
