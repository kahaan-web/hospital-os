# IPB-T1 · IP billing gap (`main` vs `feat/b-b6` and `feat/integrate-6`)

`main`: `apps/api/src/clinical/ipbilling/routes.ts` is an empty `registerIpbilling`, and `public.ts` `discharge.check` always returns `{ ok: true, balancePaise: 0 }`. Schema file `packages/db/src/clinical/ipbilling.ts` is `export {}`. Seed `packages/db/src/seed-clinical/ipbilling.ts` is an empty function.

`feat/b-b6` (`20e62e3`, merge `9131958`) is the IP desk: payers, manual charges, bills, statement, reports, discharge clearance, web list. It does **not** add `ip_accounts`, `patient_charges`, or `ipb_*` functions. It writes the B5 tables (`bills.kind = 'ip'`, `charges`, `deposits`, `concessions`, `bill_settlements`) and calls the OP engine (`finalise`, `settle`, `concede`, `acceptDeposit`, `refundDeposit` from `apps/api/src/clinical/billing/engine.ts`).

`feat/integrate-6` does not add IP routes. It moves some OP money updates into SECURITY DEFINER functions (counted in `op-billing-gap.md`). Those functions key off `bills` / `deposits`, so an IP bill that uses the same tables will go through them once B6 is rebased onto that branch. They do not exist on `main`.

Paths below are the real ones. The spec's `/tenant/ip-billing/…` names are not used; the module prefix is `/api/v1/tenant/m/ip-billing`.

## Decision: reuse `charges`, do not add `patient_charges`

**Reuse `charges` for OP and IP. Do not create `patient_charges`.**

| Spec column | Actual |
|---|---|
| Table | `charges` in `packages/db/src/clinical/foundation.ts`, created in `migrations/0101_clinical_tables.sql` |
| OP vs IP | No `account_type`. `encounters.kind` is `opd\|ipd\|daycare\|emergency`. `bills.kind` is `op\|ip`. OP `buildBill` rejects `encounter.kind === 'ipd'` (`engine.ts`). B6 `requireIpdEncounter` requires `ipd`. |
| Who posts | App function `charges.post` / `charges.reverse` in `apps/api/src/clinical/charges.ts`. Not a DB function. Idempotency is unique index `charges_source_active_uq` on `(tenant_id, source_type, source_id, source_line)` where `reversal_of_id` is null, not an `Idempotency-Key` argument. |
| Money and GST | `qty numeric(12,3)`, `unit_price_paise`, `amount_paise`, `discount_paise`, `gst_treatment`, `gst_rate_bp`, `service_date`, `performing_doctor_id`, `referring_doctor_id`, `source_module`, `source_type`, `source_id`, `source_line` |
| Reversal | `charges.reverse` sets `status = 'reversed'`. It does not insert a negative row and does not set `reversal_of_id`. A second reverse returns the same row (not 409). A billed charge returns 409 `on_final_bill`. |
| Grants | `hos_app` can UPDATE `charges` (status, `bill_id`). Not append-only. `0153` on `feat/integrate-6` does not cover `charges`. |

Shared money tables already used by both sides (all in `packages/db/src/clinical/billing.ts`, `migrations/0150_billing_tables.sql`): `bills`, `bill_lines`, `deposits`, `bill_settlements`, `concessions`, `refunds`, `bill_credit_notes`, plus `cash_ledger`. Do not add `op_deposits`, `ip_bills`, `deposit_refunds`, or `settlements`.

Do not add `ip_accounts`. The stay is `admissions` + `encounters` (`kind = 'ipd'`). There is no `open\|final_billed\|settled\|cancelled` account status.

## Workflows

| Workflow | Status | Evidence | Gap |
|---|---|---|---|
| IP account opening | partial (pending merge: feat/b-b6) | Main: ADT `admit` creates `admissions` + `encounters` (`apps/api/src/clinical/adt/service.ts`). B6: `upsertEncounterPayer` writes `encounter_payers`; `runningBalances` lists open IPD encounters. | No `ip_accounts` row or status. Payer is optional and one-per-encounter. Opening is the admission, not a billing account. |
| Posting charges (manual) | partial (pending merge: feat/b-b6) | `postManualCharge` → `charges.post`. Route `POST /api/v1/tenant/m/ip-billing/encounters/:encounterId/charges`. | Caller passes price and GST. No tariff resolve, no service-date-within-stay check, no `ipb_post_charge`. |
| Posting charges (automatic) | partial | `charges.post` from pharmacy IP issues and from `postBedCharges`. | Not contract C1 (no DB function, no idempotency key). Source modules other than pharmacy and ADT beds are out of scope here. |
| Bed / room charges | partial | `postBedCharges` in `adt/service.ts`. Route `POST /api/v1/tenant/m/adt/bed-charges/post` (`http.ts` idempotency list). One charge per occupied bed-assignment per calendar date; unique on source line = date. `gstTreatmentFor` forces ICU/NICU to `exempt_healthcare`. | Not `ipb_post_bed_charges`. No tenant bed-day policy (checkout time, grace, half day, transfer split). Threshold is the constant `ROOM_RENT_THRESHOLD_PAISE` in `gst-health.ts`, not `tax_rules`. Not on the B6 branch as a new job. |
| Accept deposit | done (pending merge: feat/b-b6) | B6 route `POST …/ip-billing/deposits` calls OP `acceptDeposit`. Table `deposits`. Cash row via `cash.record`. | No s.186 check (rule row). Number series is `deposit` (`DP`), not a receipt-voucher type. On `main` the same function is only mounted under OP billing. |
| Refund deposit | partial (pending merge: feat/b-b6) | `POST …/deposits/:id/refund` → `refundDeposit`. New `refunds` row; deposit balance reduced. | No Accounts threshold. `approved_by` is the caller. Unadjusted-balance check exists (`deposit_short`). |
| Posting reversals | partial (pending merge: feat/b-b6) | `POST …/charges/:id/reverse` → `charges.reverse`. | Status flip, not a negative linked charge. No 409 on a second reverse. No credit note after final bill. No source-module outbox. |
| Bill preparation | partial (pending merge: feat/b-b6) | `buildIpBill`. `POST …/encounters/:encounterId/bills` body `interim`, `chargeIds`, `payClass`, `applyDeposits`. Non-interim requires every unbilled charge. `applyDeposits` calls `finalise` then `applyOpenDeposits`. Doc type from `documentTypeFor`. Number from `numbering.next(..., 'ip_bill')` only when finalised. | Interim is still a `bills` draft that can be finalised into a tax series. It is not a snapshot titled "Provisional statement – not a tax invoice" with no number. Lines are per charge, not grouped by category. No single-final-bill lock. Payer share is a later `splitBill`, not part of prepare. |
| Payer split | partial (pending merge: feat/b-b6) | `splitBill`, `POST …/bills/:id/split`. Inserts `payer_receivables`, sets `bills.pay_class = 'credit'`, credit-settles the payer share. | One payer. Amount is typed by the cashier, not taken from Insurance. Split bill is then excluded from discharge dues (see settlement). |
| Concessions | partial (pending merge: feat/b-b6) | `POST …/bills/:id/concessions` → OP `concede`. Table `concessions` (`amount_paise`, `reason` text, `status`). Approver if the user has `billing.op.refund` (`canApprove`). Draft bills only. | No percent, no line level, no reason codes, no cumulative %/₹ matrix. |
| Bill settlement | partial (pending merge: feat/b-b6) | `POST …/bills/:id/settle` → OP `settle`. Modes include cash, UPI, card, cheque, NEFT, deposit, credit. `FOR UPDATE` via `lockBill`. Overpay → 422 `exceeds_balance`. | No `settled` account state. Excess deposit is not auto-refunded. Credit mode does not increase `paid_paise`. No cash-limit check. |
| Discharge clearance | partial (pending merge: feat/b-b6) | B6 `computeDischargeBalance` replaces the stub. ADT `dischargePatient` already calls `discharge.check` (`adt/service.ts`). Blocks on unbilled charges and on `total_paise - paid_paise` for final bills whose `pay_class <> 'credit'`, minus encounter deposit balance. | A split bill is `pay_class = 'credit'`, so the patient share on that bill does not block discharge. Credit approval is "any credit pay class", not a payer approval. Override still exists on ADT (`canOverride`). |

## Reports

B6 routes live under `GET /api/v1/tenant/m/ip-billing/reports/…`. None export CSV. None take `mode=summary|detail`.

| Report | Status | Evidence | Gap |
|---|---|---|---|
| Statement of account (r48) | partial (pending merge: feat/b-b6) | `statement` in `ipbilling/engine.ts`. `GET …/encounters/:encounterId/statement`. | One combined statement. No summary/detail switch. No CSV. |
| Revenue summary / detail (r49) | missing | B6 `revenueReport` calls OP `revenueReport`, which filters `bills.kind = 'op'` (`billing/queries.ts`). | The IP route returns OP revenue. |
| Bill register (r50) | partial (pending merge: feat/b-b6) | `ipBillRegister` filters `kind = 'ip'`, `status = 'final'`, location, date. | JSON only. No CSV. |
| Concession register (r51) | partial (pending merge: feat/b-b6) | `concessionRegister` joins `concessions` to `bills.kind = 'ip'`. | JSON only. No date filter in the function. |
| Doctor sharing / detail (r52) | missing | B6 `doctorSharing` calls OP `doctorSharing` (`kind = 'op'`). | IP route returns OP doctor totals. No share rules (expected until Doctor Accounting). |
| Deposit register (r53) | partial (pending merge: feat/b-b6) | B6 `depositRegister` calls OP `depositRegister` → `listDeposits` (all deposits at the location). | Includes OP deposits. No date filter. No CSV. |
| Patient outstanding (r54) | missing | B6 `outstanding` takes the OP report (`kind = 'op'`) and keeps numbers containing `/IB/`. OP numbers use `OB`. | IP route is empty. Medium+ guard is not the issue; the query is. Sheet1 Medium+ is `basic: false` in `sheet-features.generated.ts` row 54. |
| Cash summary / detail (r55) | partial (pending merge: feat/b-b6) | B6 `cashSummary` calls OP `cashSummary` (all `cash_ledger` rows at the location, grouped). | Summary groups only. Not IP-scoped. No detail lines. No counter. IP receipts do appear if they were written to `cash_ledger`. |

## APIs

Feature keys already match Sheet1 via `CLINICAL_FEATURES.ipBilling` in `packages/shared/src/clinical/features.ts`. Guards for the B6 routes are in `feat/b-b6` `apps/api/src/route-guards.ts` (`IP = '/api/v1/tenant/m/ip-billing'`). On `main` none of these routes are registered.

| Spec API | Status | Actual | Gap |
|---|---|---|---|
| GET accounts | partial (pending merge: feat/b-b6) | `GET …/running` → `runningBalances` | Open encounters, not `ip_accounts`. |
| GET account | partial (pending merge: feat/b-b6) | `GET …/encounters/:encounterId/statement` and `GET …/bills/:id` | No account resource. |
| POST charges (Idem) | partial (pending merge: feat/b-b6) | `POST …/encounters/:encounterId/charges` | See manual posting. Idempotency list on B6 `http.ts` (diff adds the IP posts). |
| POST reverse (Idem) | partial (pending merge: feat/b-b6) | `POST …/charges/:id/reverse` | See reversals. |
| POST deposits (Idem) | done (pending merge: feat/b-b6) | `POST …/deposits` | Cash-limit rule still missing. |
| POST deposit refund (Idem) | partial (pending merge: feat/b-b6) | `POST …/deposits/:id/refund` | No approval limit. |
| POST bills (Idem) | partial (pending merge: feat/b-b6) | `POST …/encounters/:encounterId/bills` | Interim/final behaviour above. |
| POST concessions (Idem) | partial (pending merge: feat/b-b6) | `POST …/bills/:id/concessions` | No cap matrix. |
| POST settle (Idem) | partial (pending merge: feat/b-b6) | `POST …/bills/:id/settle` | No account close. |
| GET print | missing | No IP print route. OP print is `GET /api/v1/tenant/m/op-billing/bills/:id/print` (`print-bill.ts`). | No deposit receipt, interim, final, refund voucher, or concession slip for IP. |
| GET reports (8) | partial (pending merge: feat/b-b6) | Seven report routes in `ipbilling/routes.ts`. Outstanding, revenue, and doctor sharing return the wrong population. | No `mode` query. No CSV. No print. |
| Payer CRUD (not in the spec API table; needed for split) | done (pending merge: feat/b-b6) | `GET/POST …/payers`, `PATCH …/payers/:id`, `GET/PUT …/encounters/:encounterId/payer` | Kind list is short (masters doc). |

None of the seven `ipb_*` DB functions exist on `main` or `feat/b-b6`.

## Rules

| Rule | Status | Evidence | Gap |
|---|---|---|---|
| Charges only on an open account; service date inside the stay | missing | `postManualCharge` checks IPD, location, not cancelled. | No stay-date window. No account status. |
| Qty > 0, decimals allowed | done | `charges.qty` is `numeric(12,3)`. `manualChargeSchema` qty is `z.number().positive()`. | — |
| Reversal ≤ original net; second reverse 409; no edit of original | partial | Billed reverse is 409. Amount is not partially reversed. | Status update instead of a negative row. Second reverse is not 409. |
| One non-cancelled final bill; cancel keeps the number | missing | Several `bills` rows per encounter are allowed. `hos_bill_cancel` exists only on `feat/integrate-6` and is not an IP route. | `0103_numbering.sql` rewinds on rollback, so a cancelled number would be reused. |
| Deposit refund cannot exceed unadjusted balance | done (pending merge: feat/b-b6) | `refundDeposit` compares `amount_paise` to `balance_paise`. | — |
| Cash ≥ ₹2,00,000 rejected `cash_limit_exceeded` | missing | No `assert_cash_allowed`, no `cash_receipt_tally`. | SF-T9. |
| Series ≤ 16, unique per FY, cancelled kept, gap report | partial | `formatDocNumber` + `MAX_DOC_NUMBER_LENGTH` + `bills_number_len_chk`. Keys `ip_bill`, `deposit`, `refund`, `credit_note`. | No gap report. Cancelled numbers are not retained. Interim has no "no number" document type. |
| Concession cannot make net negative; cumulative caps; shown on the bill | partial | `allocatePaise` rejects `discount_exceeds_total` (`packages/shared/src/clinical/billing.ts`). Bill print shows a concession total (OP layout). | Caps are not cumulative and not role-based. IP has no print. |
| Clinical GST via `resolve_gst` / `tax_rules` | partial | `resolveLineGst` and ADT `gstTreatmentFor`. Private bed seed `BED-PVT` is ₹6,000 (`seed-clinical/foundation.ts`). ICU test expects 0% (`adt.test.ts`). | Hard-coded threshold and ICU list. No CGST/SGST split test at the IP bill for the Phase 2 3-day case. Composite IP pharmacy GST is not a separate rule in code. |
| Invoice-cum-bill of supply when mixed | partial | `documentTypeFor` in `gst-health.ts`, stored on `bills.doc_type`. | Print heading uses `DOC_TYPE_LABEL`. No IP print. No provisional wording. |
| Package billing | missing | `services.category` may be `package`. | No package master, inclusions, or ₹0 package lines. IPB-T11 stays optional and empty. |
| Patient outstanding Medium+ | partial (pending merge: feat/b-b6) | `GET …/reports/outstanding` calls `requireFeature(ipBilling.patientOutstanding)`. Sheet row 54 is `basic: false`. Guard is also in B6 `route-guards.ts`. | The query returns no IP rows, so the 403 is the only behaviour that can succeed. No Basic-tier test on this route. |
| Multi-location | done | Charges, bills, deposits, and `runningBalances` filter `location_id`. | — |
| Two cashiers settling: 409 | partial | `lockBill` does `SELECT … FOR UPDATE`. Idempotency keys cover the POST list. | No IP concurrency test on `main`. Definers add `hos_bill_lock` only on `feat/integrate-6`. |
| `hos_app` cannot UPDATE/DELETE charges, deposits, bills, settlements | missing | `migrations/0151_billing_rls.sql` grants `SELECT, INSERT, UPDATE, DELETE` on the billing tables to `hos_app`. | Revoke is `feat/integrate-6` `0153_billing_definers.sql`, and it does not cover `charges`. |
| Audit without patient names | partial | IP audits pass ids and amounts (`ipbilling.bill.create`, `clinical.charge.post`). | `patchPayer` audits the whole row (`existing` includes the payer name). Statement DTO returns `patientName`. |
| Bed-day worked example (2 full + 1 half) | missing | Calendar-day occupancy in `occupiedOn`. | No checkout-time policy. |
| Interim print has no tax number | missing | Interim flag does not set a document type or suppress numbering if the draft is later finalised. | IPB-T10. |

## Screens

| Screen | Status | Evidence | Gap |
|---|---|---|---|
| Account list | partial (pending merge: feat/b-b6) | `apps/web/src/app/app/ip-billing/page.tsx` loads `running()`. | Not the spec column set (no payer, no admitted-on). |
| Account detail tabs | partial (pending merge: feat/b-b6) | `ip-billing/[encounterId]/page.tsx` shows the statement and a "Prepare final bill" button (`interim: false`, `applyDeposits: true`). | No Charges, Deposits, or Bill tabs. No add-charge or reverse UI. |
| Payers | done (pending merge: feat/b-b6) | `ip-billing/payers/page.tsx` | Kind list is the short B6 enum. |
| Reports | missing | `ip-billing/reports/page.tsx` is a `PageHeader` only. | No report UI. |
| Five print layouts | missing | No IP print page. | OP bill print is A5 only (`print-bill.ts` `size: 'A5'`). |

## Tables to add vs reuse

| Spec table | Decision | Actual |
|---|---|---|
| `ip_accounts` | do not add | `encounters` + `admissions` |
| `patient_charges` | do not add | `charges` |
| `deposits` / `deposit_refunds` | reuse `deposits` and `refunds` | Already shared. No `account_type`. |
| `ip_bills` / `ip_bill_lines` | reuse `bills` (`kind = 'ip'`) and `bill_lines` | No `bill_type`. Interim is a request flag. |
| `concessions` | reuse | Bill-level amount only. |
| `settlements` | reuse `bill_settlements` | No `settlement_no`. Payer credit is `payer_receivables` (B6) plus `mode = 'credit'`. |
| `payers` | extend after B6 merges | See masters doc. |

## Reuse decisions

1. **One charge table: `charges`.** OP and IP already share it. A new `patient_charges` would fork pharmacy IP issues, bed charges, and OP vouchers.
2. **One bill table: `bills.kind`.** IP finalise, settle, concession, and deposit refund should keep calling the OP engine functions. After `feat/integrate-6` merges, those calls hit `hos_bill_finalise`, `hos_bill_settle`, `hos_bill_reprice`, `hos_bill_refund`, `hos_deposit_refund`. Do not add a parallel `ipb_*` set for the same writes.
3. **Charge post and reverse stay on `charges`** until a real C1 definer exists. B6's `postManualCharge` is a thin wrapper, which is the right shape.
4. **Bed charges stay `postBedCharges`.** IPB-T3 extends that job with the bed-day policy. Do not add a second nightly insert into `charges`.
5. **Payers stay the B6 tables.** Insurance should read `encounter_payers` and `payer_receivables` rather than invent another link.
6. **Discharge hook stays `discharge.check`.** The stub on `main` is what B6 replaces. Fix the credit-bill hole; do not add a second ADT call.
7. **Web path stays `/app/ip-billing`.** API prefix stays `/api/v1/tenant/m/ip-billing`.

## Proposed next-task adjustments

- **IPB-T2 shrinks.** Do not implement seven new `ipb_*` names. Rebase B6 onto `feat/integrate-6` so IP settle/finalise/refund/concession/deposit-refund use the existing definers. Still add: a charge post/reverse definer if C1 is in this task, `assert_cash_allowed` inside deposit and cash settle, cumulative concession caps, and a negative reversal row (or an explicit decision to keep the status flip). Grants on `charges` are still open.
- **IPB-T3 shrinks** to policy + `resolve_gst` inside `postBedCharges`. Idempotency per bed and date already works (`source_line = date`, and the ADT test posts twice).
- **IPB-T4 shrinks** for the happy path (finalise, settle, concession, and a discharge check exist on B6) and **must still fix** the credit-bill discharge hole, one-final-bill, and excess-deposit refund. Do not rewrite `settle`.
- **IPB-T5 stays mostly as-is.** Statement, bill register, and a cash/deposit feed exist, but cash and deposits are not IP-scoped and nothing exports CSV. Add CSV here rather than in a new task.
- **IPB-T6 grows.** The B6 routes for revenue, doctor sharing, and outstanding are wired and wrong. Replace those three queries. Concession register is only missing CSV and dates. Outstanding still needs the Medium+ 403 test.
- **IPB-T7 shrinks** for the list and the statement page. Still needs the four tabs (charge, deposit, bill, statement) and manual charge/reverse.
- **IPB-T8 stays.** Report screen is a stub. No IP print layouts. OP `billPrint` is one A5 bill, not the five layouts.
- **IPB-T9 stays.** `seedIpbilling` is empty on `main`.
- **IPB-T10 shrinks.** Doc types, ≤16 series, and `documentTypeFor` already exist for final bills. Remaining: provisional statement with no number, voucher titles (receipt vs `DP`, refund vs `RF`), cancelled-number retention, gap report.
- **IPB-T11 unchanged.** No package master. Optional, and R9.9 still applies.
