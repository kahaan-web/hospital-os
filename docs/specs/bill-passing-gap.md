# Bill Passing gap audit (BP-T1)

Audited **main** against `docs/specs/08-bill-passing.md`. `git diff main feat/integrate-6` adds patient OP bill/deposit/cash definers (`hos_bill_*`, `hos_deposit_*`, `hos_cash_*` in `0153_billing_definers.sql`) and PHI scope `0900`/`0901`. `git diff main feat/b-b6` adds patient payer tables (`payers`, `encounterPayers`, `payerReceivables` in `packages/db/src/clinical/ipbilling.ts`). Neither branch has a supplier bill, a payment batch, or a supplier outstanding balance. No row is "done (pending merge)".

Scroll, certification, and 3-way passing are **blocked (OPEN)** on OPEN-QUESTIONS-AJAY **#6** (which tier, and what Basic does without them). They are not designed here. Meaning of the three words is a separate open item (**#25**); INDEX already gates BP-T2 and BP-T3 on that meaning. This audit does not pick Reading A or Reading B.

Sheet1 payment rows are Basic and are audited below. B7 has no payment document to extend.

## Matrix

| Kind | Item | Status | Evidence | Gap |
|---|---|---|---|---|
| checklist | S1 r63 Payment Approvals | missing | Catalogue key `pharmacy.payment-approvals` only (`sheet-features.generated.ts` via `buildFeatures`) | No batch table, no route, no screen. |
| checklist | S1 r64 Bill Payment | missing | Catalogue key `pharmacy.bill-payment` only | No `supplier_payments`, no voucher, no route. |
| checklist | S1 r74 Supplier Outstanding | missing | Catalogue key `pharmacy.supplier-outstanding` only | `pharmacy_grns.total_paise` is a receipt total, not a balance. |
| checklist | S1 r75 Supplier Payment Register | missing | Catalogue key `pharmacy.supplier-payment-register` only | No payment rows to list. |
| workflow | Scroll entry | blocked (OPEN) | — | #6. Not designed. |
| workflow | Certification | blocked (OPEN) | — | #6. Not designed. |
| workflow | 3-way match, deductions, TDS, pass/hold | blocked (OPEN) | — | #6 (3-way passing is in the question). Not designed. #25 still gates the stage model. |
| workflow | Payment approval batches | missing | — | No code on main or on the two branches. |
| workflow | Record payment (mode, reference, allocations, part-pay) | missing | — | Pharmacy cash (`cash.record`, counter `PHARMACY`) is a patient/counter receipt, not a supplier disbursement. |
| workflow | Supplier outstanding ageing | missing | — | — |
| workflow | Supplier payment register | missing | — | — |
| workflow | Scroll register, pending certification, passed-not-paid | blocked (OPEN) | — | #6. Not designed. |
| workflow | MSME due date and 43B(h) alert | blocked (OPEN) | — | Depends on a bill acceptance date, which is part of scroll/certification (#6). Not designed. |
| screen | `/app/accounts/scroll` | blocked (OPEN) | — | #6. Not designed. |
| screen | `/app/accounts/certification` | blocked (OPEN) | — | #6. Not designed. |
| screen | `/app/accounts/bills/[id]` match view | blocked (OPEN) | — | #6. Not designed. |
| screen | `/app/accounts/payment-approvals` | missing | No page under `apps/web/src/app/app` | — |
| screen | `/app/accounts/payments` | missing | — | — |
| screen | `/app/accounts/reports/*` | missing | Pharmacy reports (`/app/pharmacy/reports`) have no supplier outstanding or payment register | — |
| table | `supplier_bills` and scroll columns | blocked (OPEN) | — | #6. Not designed. |
| table | `bill_certifications` | blocked (OPEN) | — | #6. Not designed. |
| table | `bill_match_lines`, `bill_deductions`, `bill_tds`, `bill_passings`, `bill_passing_settings` | blocked (OPEN) | — | #6. Not designed. |
| table | `tds_sections`, `supplier_tds_certificates` | blocked (OPEN) | — | TDS is applied at pass time in the spec, which is inside the blocked passing step. Not designed. |
| table | `payment_batches`, `payment_batch_bills` | missing | — | — |
| table | `supplier_payments`, `supplier_payment_allocations` | missing | — | — |
| api | `GET/POST /tenant/accounts/bills` (scroll) | blocked (OPEN) | — | #6. Not designed. |
| api | `POST …/bills/:id/certify` | blocked (OPEN) | — | #6. Not designed. |
| api | `GET …/match`, `POST …/{pass,hold,reject}` | blocked (OPEN) | — | #6. Not designed. |
| api | Payment batches and approve | missing | — | Feature key exists in the catalogue and is not referenced from `route-guards.ts`. |
| api | `POST /tenant/accounts/payments` and voucher | missing | — | — |
| api | Supplier outstanding and supplier payment reports | missing | — | — |
| api | Scroll, pending-cert, passed-unpaid reports | blocked (OPEN) | — | #6. Not designed. |
| rule | Duplicate supplier invoice is 409 | missing | `pharmacy_grns` has no supplier invoice number | Cannot be enforced. Adding the column is an indents GRN change (`indents-purchase-gap.md`), not a bill design. |
| rule | Pass before certify, approve before pass, pay before approve | blocked (OPEN) | — | The sequence includes the blocked stages (#6). Not designed. |
| rule | Passer is not the approver | blocked (OPEN) | — | Needs the passing step (#6). Not designed. |
| rule | Basic can approve and pay without scroll; scroll routes 403 | blocked (OPEN) | — | #6 asks what Basic does without scroll and certification. Not decided here. |
| rule | Payments cannot exceed net payable | missing | No payable and no payment | — |
| rule | Debit notes from supplier returns offset outstanding | missing | `pharmacy_supplier_returns` has no money columns and no link to a payable | Stock return only. |

## Reuse decisions

- **Do not reuse OP billing.** `feat/integrate-6` `hos_bill_*` / `hos_cash_*` and main `charges` / `cash.record` are patient bills and the pharmacy counter. Supplier payment needs its own tables when it is built. Do not post a supplier payment through `hos_bill_settle`.
- **Do not reuse B6 payers.** `feat/b-b6` payer tables are TPA/patient payers, not suppliers.
- **Supplier master:** when work is allowed, extend `pharmacy_suppliers` (name, gstin, phone, city). Do not create a second supplier table. State code and Udyam are not on it today; adding them is data on that table, not a scroll design.
- **GRN is not a bill.** `pharmacy_grns.total_paise` is the receipt value. Do not show it as supplier outstanding.
- **No payment object exists to generalise.** BP-T4 cannot "extend B7 payments". B7 never stored one.
- Scroll, certification, match, TDS, and MSME behaviour stay unspecified until #6 (and #25 for the stage meaning) is answered.

## Proposed next-task adjustments

- **BP-T2 and BP-T3:** do not start. Leave them blocked on #6 and on the existing #25 meaning gate. No scope cut and no substitute design in this audit.
- **BP-T4, BP-T5, BP-T6, BP-T7:** do not shrink. There is no B7 approval, payment, outstanding, or voucher code to delete from the task. They also cannot be pulled forward as a Basic-only payment path, because #6 includes "what happens on tiers without scroll and certification". They stay behind that answer.
- **IND-T4** still owns supplier invoice number on the GRN (duplicate 409). That column is a receipt fact, not a scroll screen. It is tracked in `indents-purchase-gap.md`.
