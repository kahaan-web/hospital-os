# OPB-T1 · OP billing gap (`main` vs the Sheet1 checklist)

B5 is on `main`. Module key `op-billing`. API prefix `/api/v1/tenant/m/op-billing` (`apps/api/src/clinical/billing/routes.ts`, `MODULE = 'op-billing'`). Web lives under `/app/billing`, not `/app/op-billing`.

`feat/integrate-6` does not add checklist features. It moves some money updates into 12 SECURITY DEFINER functions (`migrations/0153_billing_definers.sql`) and revokes matching grants. Migrations `0900` and `0901` on that branch only hide PHI from platform scope. `feat/b-b6` does not change OP billing except that IP calls the same engine.

The checklist "likely gap" column in `gap-op-billing.md` is stale. Deposits, credit/free pay class, settlement, concessions, refunds, and all six reports already have routes on `main`.

## Checklist (Sheet1)

| Row | Item | Status | Evidence | Gap |
|---|---|---|---|---|
| r20 | Accept deposit | done | `acceptDeposit` in `billing/engine.ts`. `POST …/op-billing/deposits` (idempotency list in `http.ts`). Table `deposits` (`clinical/billing.ts`, `0150_billing_tables.sql`). Screen `/app/billing/deposits`. Feature `CLINICAL_FEATURES.opBilling.acceptDeposit`. | Cash-limit rule is missing (rule table). Create stays an app `INSERT` even on `feat/integrate-6`. |
| r21 | Refund deposit | partial | `refundDeposit`. `POST …/deposits/:id/refund`. Screen on the deposits page. Balance check `deposit_short`. | No Accounts amount threshold. `approved_by` is the cashier. On `feat/integrate-6` the balance update is `hos_deposit_refund` (pending merge). |
| r22 | OP voucher posting (cash / credit / free) | partial | `buildBill` sets `bills.pay_class` `cash\|credit\|free` (`createOpBillSchema`). `POST …/bills` then `POST …/bills/:id/finalise`. UI pay-class `<Select>` on `/app/billing/page.tsx`. Free finalise requires `total_paise = 0` and an approved concession (`approval_required`). IPD encounters get 422 `use_ip_billing`. | No `credit_payer_id` / party type (column `bills.payer_id` exists and is never set). No `free_reason_code`. Credit needs no payer and no manager approval. Free is "concession to zero", not a reason-coded zero voucher. |
| r23 | OP refund | partial | `refund` in `engine.ts`. `POST …/bills/:id/refund`. Inserts `refunds` and `bill_credit_notes` (`numbering` key `credit_note`). Blocks `amount > paid_paise` (`refund_exceeds_paid`). Screen on `/app/billing/bills/[id]`. | A credit bill with `paid_paise = 0` cannot reduce outstanding; the refund path always moves cash. Free bills are not explicitly rejected. No approval limit. `feat/integrate-6`: `hos_bill_refund` (pending merge). |
| r24 | OP settlements of credit vouchers | partial | `settle`. `POST …/bills/:id/settle`. Modes in `SETTLEMENT_MODES` include `credit` and `deposit`. Credit only if `pay_class = 'credit'` (`credit_not_allowed`). Overpay → 422 `exceeds_balance`. Credit mode does not increase `paid_paise`, so the remainder stays outstanding. Part payment works. Screen on the bill page. | No payer on the credit. No cash-limit check. No settlement queue screen. `feat/integrate-6`: `hos_bill_settle` (pending merge). |
| r25 | Concessions | partial | `concede`. `POST …/bills/:id/concessions`. `concessionSchema` is amount + free-text reason. Draft only. `allocatePaise` blocks a discount above the total. Approver is anyone with `billing.op.refund` (`canApprove` in `routes.ts`); others insert `status = 'requested'`. | No percent, no line level, no reason codes, no cumulative %/₹ caps (cashier is not forced to 0). |
| r26 | OP voucher (document) | partial | `GET …/bills/:id/print?format=pdf\|html` → `billPrint` (`print-bill.ts`). Heading is `DOC_TYPE_LABEL` for `bill_of_supply` / `tax_invoice` / `invoice_cum_bill_of_supply`. A5. | No receipt voucher or refund voucher print. No "provisional" state. No A4. GST line is a CA disclaimer, not a tax-rules print. |
| r27 | Cash summary / detail | partial | `cashSummary` in `billing/queries.ts`. `GET …/reports/cash`. Groups `cash_ledger` by entry type, direction, mode, ref type. Screen `/app/billing/reports`. Test expects a pharmacy receipt in the same report (`billing.test.ts`). | Summary only (no detail lines, no `mode` switch). No counter filter (`counter_code` is usually `''`). No `counter_sessions`. No CSV/print. Includes every module, which matches the screen copy. |
| r28 | Revenue summary / detail | partial | `revenueReport`. `GET …/reports/revenue`. Groups final OP bills by `doc_type`. Screen on the same reports page. | No category or line detail. No CSV/print. Free and credit finals are included in `sum(total_paise)` with no separate statistics bucket. |
| r29 | Doctor sharing / detail | partial | `doctorSharing`. `GET …/reports/doctor-sharing`. Sums `bill_lines` by `performing_doctor_id` (C2 column, also on `charges`). Permission includes `accounts.manage`. | Totals only. No line detail. No share percentage (Doctor Accounting). Null doctor is labelled "Not assigned". |
| r30 | Patient outstanding | partial | `outstanding`. `GET …/reports/outstanding`. Final OP bills with `paid_paise < total_paise` and `pay_class <> 'free'`. Screen lists bill, patient, UHID, balance. | No date filter, payer, or CSV. Credit remainder is included, which is what the row needs. |
| r31 | Deposit register | partial | `depositRegister` → `listDeposits`. `GET …/reports/deposits`. Screen shows number, patient, balance, status, date. | No date or location-range filter beyond the session location. No CSV. OP and IP deposits share the table, so an IP encounter deposit appears here. |
| r98 | Visit statistics for the period | partial | `visitStatistics`. `GET …/reports/visit-statistics`. Counts OPD encounters and final OP bills. Feature key `opBilling.visitStatistics`. Sheet row 98 is `basic: false` (`sheet-features.generated.ts`). `billing.test.ts` expects 403 `not_entitled` for Lotus (Basic). | Three numbers only. No breakdown, CSV, or print. The Medium+ guard itself works. |

## Bills-definer functions (`feat/integrate-6` only)

`migrations/0153_billing_definers.sql` defines **12** `SECURITY DEFINER` functions. None of them are on `main`. On `main`, `0151_billing_rls.sql` grants `SELECT, INSERT, UPDATE, DELETE` on `bills`, `bill_lines`, `deposits`, `bill_settlements`, `concessions`, `refunds`, `bill_credit_notes` to `hos_app`.

`0153` then:

- `REVOKE UPDATE, DELETE` on `bills`, `bill_lines`, `deposits`, `concessions`, `cash_ledger`
- `REVOKE INSERT, UPDATE, DELETE` on `bill_settlements`, `refunds`, `bill_credit_notes`

| Function | Role | Called from (integrate-6 engine) |
|---|---|---|
| `hos_billing_guard()` | session guard; not granted to `hos_app` | other definers |
| `hos_bill_lock(uuid)` | `FOR UPDATE` | `lockBill` |
| `hos_deposit_lock(uuid)` | `FOR UPDATE` | settle and deposit refund |
| `hos_bill_reprice(...)` | rewrite draft totals and lines | concession apply |
| `hos_bill_finalise(uuid, text)` | set final + number | `finalise` |
| `hos_bill_cancel(uuid, text)` | cancel | `cancel` (no OP route on `main` uses this) |
| `hos_bill_settle(...)` | insert settlement, update paid / deposit | `settle` |
| `hos_bill_refund(...)` | refund, credit note, paid | `refund` |
| `hos_bill_credit_note_cancel(uuid)` | cancel a credit note | not used by the OP routes read on `main` |
| `hos_deposit_refund(...)` | refund deposit | `refundDeposit` |
| `hos_cash_attach_ref(uuid, uuid)` | point the cash row at the deposit | `acceptDeposit` |
| `hos_cash_void(uuid, text)` | void a cash row | `cash.ts` |

Still app inserts on that branch (`engine.ts`, `cash.ts`): `bills`, `bill_lines`, `concessions`, `deposits`, `cash_ledger`. Charge post/reverse is untouched (`charges` is not in `0153`).

So "all money writes go through DB functions" is **partial (pending merge: feat/integrate-6)**: finalise, cancel, settle, bill refund, deposit refund, reprice, and cash void do; create bill, create deposit, create concession, and post charge do not.

## Workflows the spec asked to finish

| Workflow | Status | Evidence | Gap |
|---|---|---|---|
| Credit voucher | partial | `pay_class = 'credit'` plus credit settlement. Outstanding includes the unpaid remainder. | No payer, corporate, or staff party. No eligibility approval. |
| Free voucher | partial | `pay_class = 'free'` plus a full approved concession before finalise. | No reason code (`staff\|follow-up\|camp\|charity`). Counted inside revenue totals as a zero bill, not held out of revenue. |
| OP deposits adjusted on a later voucher | done | `settle` mode `deposit` reduces `deposits.balance_paise`. | Same cash-limit gap as r20. |
| Settlement of credit, part or full | partial | See r24. | Same payer gap. |
| Counter close and cash summary | partial | Cash summary reads `cash_ledger`. | No counter session and no close. Night Audit's `counter_sessions` does not exist. |
| Reports with C6 | partial | Six JSON reports and one web page. | No shared export, no CSV, no `report.export` audit. Patient-register CSV is the only CSV in the API. |

## APIs

Spec paths were `/tenant/op-billing/…`. `main` uses `/api/v1/tenant/m/op-billing/…`. Keep the `main` paths.

| Spec | Status | Actual |
|---|---|---|
| POST vouchers `{type}` | partial | `POST …/bills` with `payClass`, then `POST …/bills/:id/finalise`. Not one call. |
| POST deposits / deposit refund | done / partial | r20 done, r21 partial. |
| POST voucher refund / settle | partial | r23, r24. |
| POST concession | partial | r25. Body is `amountPaise` + `reason`, not percent. |
| GET print | partial | r26. |
| GET reports cash, revenue, doctor-sharing, outstanding, deposits | partial | All five exist. Names match. No CSV twin. |
| GET visit stats, Medium+ | partial | `GET …/reports/visit-statistics`. 403 on Basic is tested. |

Service and tariff routes are extra and real: `GET/POST …/services`, `PATCH …/services/:id`, `POST …/tariffs`, `PATCH …/tariffs/:id`. They are masters, not checklist rows (see `masters-reuse.md`).

## Rules

| Rule | Status | Evidence | Gap |
|---|---|---|---|
| Free total 0, needs a reason, cannot be refunded | partial | Finalise checks total 0 and an approved concession. | Reason is concession text, not a code. Refund is blocked only because `paid_paise` is 0. |
| Credit outstanding = net − settlements; over-settle 422 | done | `paid_paise` stays 0 for credit mode; further credit capped at `total_paise`; cash overpay is `exceeds_balance`. | Outstanding is `total - paid`, which matches while credit does not count as paid. |
| Refund ≤ paid; credit refund reduces outstanding | partial | Paid cap exists. | No credit-outstanding reduction. |
| Money writes are definers, idempotent, `FOR UPDATE` | partial (pending merge: feat/integrate-6) | `main` locks the bill or deposit in the app (`lockBill`, `select … for update`). Idempotency keys listed in `http.ts` for bills, finalise, settle, refund, concessions, deposits, deposit refund. | 12 definers on the branch; creates still bypass them. See the function table. |
| Clinical GST exempt by default; taxable via `resolve_gst` | partial | `resolveLineGst` + `documentTypeFor`. Service default `exempt_healthcare`. | Not `tax_rules`. Threshold constants in `gst-health.ts`. |
| `assert_cash_allowed` → 422 `cash_limit_exceeded` | missing | No function, no tally table, no call in `acceptDeposit` or `settle`. | SF-T9. Blocks the Phase 2 acceptance bullet. |
| Voucher series ≤ 16 characters | done | `numbering.next` throws `series_exhausted` above 16. `bills_number_len_chk`. Test in `clinical.test.ts` (`op_bill`, 20 numbers, each `length <= 16`). | Gap report and cancelled-number retention are still missing (number-series master). |

## Screens

| Spec screen | Status | Actual | Gap |
|---|---|---|---|
| Voucher screen, cash/credit/free, deposit adjust | partial | `/app/billing` creates the bill; `/app/billing/bills/[id]` finalises, settles (including deposit), concedes, refunds, prints. | Not `/app/op-billing`. Deposit adjust is a settlement mode on the bill, not a toggle on the worklist. |
| Deposits | done | `/app/billing/deposits` | Refund approval is not a separate Accounts step. |
| Settlements | partial | On the bill page only. | No `/app/op-billing/settlements` queue. Do not add a second tree; a filter on the bill list is enough if a queue is required. |
| Reports | partial | `/app/billing/reports` runs all six, including visit statistics. | No CSV, no print, no detail mode. |
| Voucher print | partial | Print action uses the bill print API. | A5 bill only. |

## Data model the spec wanted to add

| Spec | Decision | Evidence |
|---|---|---|
| `op_vouchers.voucher_type` | reuse `bills.pay_class` | Check constraint `cash\|credit\|free` in `0150_billing_tables.sql`. |
| `credit_party_type`, `credit_payer_id`, `free_reason_code`, `approved_by` | missing columns | `bills.payer_id` is an unused uuid with no FK on `main`. |
| `op_deposits` or `deposits.account_type = 'op'` | do not add | `deposits.encounter_id` is nullable. OP and IP (B6) share it. |
| `op_settlements` | reuse `bill_settlements` | Modes include `credit` and `deposit`. |
| C2 on OP lines | done on the line | `charges.performing_doctor_id`, `charges.referring_doctor_id`, `bill_lines.performing_doctor_id`. Referring doctor is not copied onto `bill_lines`. |

## Reuse decisions

1. **Do not add `patient_charges` or `op_vouchers`.** OP vouchers are `bills` with `kind = 'op'`. Lines are `bill_lines` pointing at `charges`. IP uses the same tables with `kind = 'ip'` (`ip-billing-gap.md`).
2. **Do not add `op_deposits` or `op_settlements`.**
3. **Keep paths.** API `/api/v1/tenant/m/op-billing`. Web `/app/billing`. Feature keys in `CLINICAL_FEATURES.opBilling` already match the sheet names.
4. **Definers stay the `hos_bill_*` / `hos_deposit_refund` / `hos_cash_*` set** from `0153`. OPB-T2 should not invent `opb_*` functions. New cash-limit checks belong inside `hos_bill_settle`, `hos_deposit_refund`, and the deposit insert once that insert is a definer.
5. **Credit party reuses B6 `payers`** (`payer_id` on `bills`) after that branch merges. Do not add a second payer id.
6. **Visit statistics guard stays `requireFeature(opBilling.visitStatistics)`.** It already returns 403 on Basic. Sheet3's Basic conflict stays OPEN (Ajay #24); do not change the seed tier.

## Proposed next-task adjustments

- **OPB-T2 shrinks hard.** Credit, free, deposits, deposit refund, settlement, bill refund, and concessions already run on `main`. Left: credit payer (after B6 `payers`), free reason code, credit refund that reduces outstanding, cashier concession cap of 0 with cumulative limits, and `assert_cash_allowed` once SF-T9 exists. Fold the remaining inserts (bill, deposit, concession) into `0153`-style definers instead of a new function family. `hos_bill_cancel` is already on the branch and has no OP route; wire it only if cancelled bills are in scope.
- **OPB-T3 shrinks.** All six reports and the Medium+ visit-stats guard exist. Left: detail mode for cash, revenue, and doctor sharing; CSV (and `report.export`); counter close when Night Audit adds `counter_sessions`. Do not rewrite the queries from scratch. Outstanding already shows a credit remainder.
- **OPB-T4 shrinks.** Screens exist under `/app/billing` (desk, bill, deposits, refunds, reports, services). Left: print layouts (receipt voucher, refund voucher, A4), CSV buttons, and a clearer credit/free form (payer, reason code). Do not create `/app/op-billing`.
