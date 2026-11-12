# Pharmacy gap audit (PH-T1)

Audited **main** (B7 is on this branch). `git diff main feat/integrate-6` and `git diff main feat/b-b6` are empty for `apps/api/src/clinical/pharmacy`, `packages/db/migrations/0170_pharmacy_tables.sql`, and `apps/web/src/app/app/pharmacy`. `feat/integrate-6` definers (`0153_billing_definers.sql`) are OP bill, deposit, and cash (`hos_bill_*`, `hos_deposit_*`, `hos_cash_*`), not pharmacy stock or supplier payments. `feat/b-b6` adds patient payer tables, not supplier bills. No pharmacy checklist row is "done (pending merge)".

Procurement reuse is in `indents-purchase-gap.md`. Supplier payment reuse is in `bill-passing-gap.md`. This file is the pharmacy checklist.

Module key `pharmacy`. API prefix `/api/v1/tenant/m/pharmacy`. Sheet keys that have routes are the ones in `CLINICAL_FEATURES.pharmacy`. Catalogue keys with **no route**: `pharmacy.purchase-order` (r56), `pharmacy.payment-approvals` (r63), `pharmacy.bill-payment` (r64), `pharmacy.supplier-outstanding` (r74), `pharmacy.supplier-payment-register` (r75). They are seeded from Sheet1 via `buildFeatures()` in `packages/shared/src/catalog/index.ts`.

Stock moves are append-only (`0171`). On-hand changes go through `applyStock` (`apps/api/src/clinical/pharmacy/stock.ts`) with `FOR UPDATE`. Issue allocation is `allocateFefo` (expired batches skipped; only-expired stock is `422 expired_batch`).

## Matrix

| Kind | Item | Status | Evidence | Gap |
|---|---|---|---|---|
| checklist | S1 r56 Purchase Order | missing | No `purchase_orders` table, no route. `CLINICAL_FEATURES.pharmacy` has no PO key | Catalogue key `pharmacy.purchase-order` is unused. See indents audit. |
| checklist | S1 r57 Material Receipts | partial | `postGrn`; `pharmacy_grns`, `pharmacy_grn_lines`, `pharmacy_batches`; `POST …/grns` feature `pharmacy.material-receipts`; page `apps/web/src/app/app/pharmacy/grn/page.tsx` | Batch, expiry, MRP, purchase rate, qty, item GST. No supplier invoice no/date, free qty, accepted vs rejected qty, or PO link. Direct receipt only. Tax is one `tax_paise`, not CGST/SGST/IGST. |
| checklist | S1 r58 Material Returns | partial | `postSupplierReturn`; `pharmacy_supplier_returns` + lines; `POST …/supplier-returns`; form on `apps/web/src/app/app/pharmacy/stock/page.tsx` | Stock out by batch. Not tied to a GRN. No debit note. |
| checklist | S1 r59 Issue to IP Patients / Returns | partial | `postIpIssue`, `returnIpIssue`; `pharmacy_ip_issues` + lines (`charge_id`); `POST …/ip-issues` and `…/ip-issues/:id/return`; page `apps/web/src/app/app/pharmacy/ip-issues/page.tsx`; test `posts an exempt IP charge and reverses it on return` | FEFO, `gstTreatment: exempt_healthcare`, `gstRateBp: 0`, charge via `charges.post` (`apps/api/src/clinical/charges.ts`), return caps at issued qty and reverses the charge. Not linked to a medicine order. Charge write is an app insert, not `billing.post_patient_charge`. |
| checklist | S1 r60 Issue to OP Patients | partial | `postSale` kind `op` requires `patientId`; optional `orderItemId` updates fulfilment; `POST …/sales` feature `pharmacy.issue-to-op-patients`; `GET …/prescriptions/open` → `openPrescriptions`; counter `apps/web/src/app/app/pharmacy/sales/new/page.tsx` | MRP-inclusive GST split CGST+SGST (`halves`). `igstPaise` always 0. Payment is `cash.record` on counter `PHARMACY`, not an OP voucher. No concession. Schedule is not checked. |
| checklist | S1 r61 Outside Sales | partial | `postSale` kind `outside` requires `walkinName` or a patient; feature `pharmacy.outside-sales`; same counter page | Name only. No mobile, prescriber, Rx number. `pharmacy_items.schedule` (`H`, `H1`, `X`, `OTC`) is not enforced. No H1 register. |
| checklist | S1 r62 Stock Adjustments | partial | `postAdjustment`; `pharmacy_adjustments` + lines; `POST …/adjustments` feature `pharmacy.stock-adjustments`; form on the stock page | Posts immediately. No approval status. |
| checklist | S1 r63 Payment Approvals | missing | No table or route | Catalogue key only. See bill-passing audit. |
| checklist | S1 r64 Bill Payment | missing | No table or route | Catalogue key only. See bill-passing audit. |
| checklist | S1 r65 Stock Register Summary / Details | partial | `listStock`; `GET …/stock`; report key `stock-register` in `pharmacyReport` (`reports.ts`); pages stock and `apps/web/src/app/app/pharmacy/reports/page.tsx` | Batch rows (qty, move sum, expired, low). No item summary rollup. On-screen JSON only (no CSV/PDF, no `report.export`). |
| checklist | S1 r66 Purchase Register | partial | Report key `purchases` in `pharmacyReport`; feature `pharmacy.purchase-register`; test Lotus `403` on the purchase register | Same GRN header rows as the receipt register, retitled. There are no POs. Medium gate works. |
| checklist | S1 r67 Receipt Register | partial | Report key `receipts` | GRN header: number, date, supplier, taxable, tax, total. No invoice no, no lines. No export. |
| checklist | S1 r68 Rejection Register | partial | Report key `rejections` reads `pharmacy_supplier_returns` | Supplier returns, not GRN rejected qty. GRN has no reject columns. |
| checklist | S1 r69 Issue Register | partial | Report key `issues` unions `pharmacy_sales` and `pharmacy_ip_issues` | IP amount is blank. IP patient column is `patientId`. No export. |
| checklist | S1 r70 Issue Return Register | partial | Report key `issue-returns` unions `pharmacy_sale_returns` and IP lines with `returned_qty > 0` | One column mixes money and qty. No export. |
| checklist | S1 r71 Stock Adjustment register | partial | Report key `adjustments` | Header number, date, reason. Line qty is omitted. No export. |
| checklist | S1 r72 Patient Issue / Return Statement IP | partial | Report key `ip-statement`; query `patientId` | Issues with remaining qty in the line text. Patient is an id. Returns are not their own rows. No export. |
| checklist | S1 r73 Expiry Item Report | partial | Report key `expiry` filters `listStock` to expiry ≤ `todayPlus(90)` | Fixed 90 days. Spec tiers are 180/90/60/30. Sale/issue block is separate (`allocateFefo`) and is done. |
| checklist | S1 r74 Supplier Outstanding | missing | No balance table. `pharmacy_grns.total_paise` is the receipt total | Not an outstanding ledger. See bill-passing audit. |
| checklist | S1 r75 Supplier Payment Register | missing | No payment table or route | Catalogue key only. See bill-passing audit. |
| workflow | IP issue against medicine orders, FEFO, C1 charge, ward return reverses stock and charge | partial | `postIpIssue`, `returnIpIssue`, `allocateFefo`, `charges.post` / `charges.reverse` | Behaviour of stock and exempt charge is in place. No order link. Not a DB charge function. |
| workflow | OP sale against prescription, MRP, discount, pay via OP billing or pharmacy counter | partial | `openPrescriptions`, `postSale`, `saleInvoiceDoc` (`prints.ts`) | Counter cash/UPI/card/cheque/NEFT only. No Medicard/concession. Optional `orderItemId` only. |
| workflow | Outside sale with Rx capture; H1/X/NDPS register | missing | `walkin_name` on `pharmacy_sales`; schedule on `pharmacy_items` | No prescriber, address, Rx, attachment, or `controlled_drug_register`. No NDPS value in the schedule check. |
| workflow | Expiry tiers and block expired sales | partial | `allocateFefo` (`stock.ts`); stock DTO `expired`; expiry report | Block is done (`422 expired_batch`, test in `pharmacy.test.ts`). Tiers and a near-expiry alert are not. |
| workflow | GST: OP/outside at item HSN rate; IP exempt; effective-dated rate | partial | Sale lines store `gst_rate_bp` taken from the item at sale time (`postSale` + `splitInclusive`). IP uses `exempt_healthcare` and rate 0 | Item master rate is not effective-dated. No IGST (supplier/location state is not compared). GRN tax is a single amount. `PHARMACY_GST_NOTE` is a CA banner, not a rate table. |
| screen | `/app/pharmacy/sales` OP and outside counter | partial | `/app/pharmacy/sales/new` and queue `/app/pharmacy` | Counter works. No Rx fields for scheduled drugs. |
| screen | `/app/pharmacy/ip-issues` and `/app/pharmacy/ip-returns` | partial | Both actions on `/app/pharmacy/ip-issues` | No separate returns route. Return is full remaining qty of the first open line. |
| screen | `/app/pharmacy/reports/*` | partial | One page, select `PHARMACY_REPORTS` | All nine report keys render a table. No export. PO and supplier-payment reports are absent. |
| table | `pharmacy_sales` / lines | partial | `0170_pharmacy_tables.sql` kind `op\|outside`, modes, doc types, CGST/SGST/IGST columns | No customer mobile, prescriber, or Rx columns. IGST is unused (always 0). |
| table | `pharmacy_ip_issues` / lines | partial | Same migration, `charge_id` on the line | No `order_item_id`. |
| table | `items.controlled_schedule`, `high_alert`, `lasa` | partial | `pharmacy_items.schedule` check `H`, `H1`, `X`, `OTC` | No `none`, no `ndps`, no high-alert, no LASA. |
| table | `controlled_drug_register` | missing | — | PH-T5 not started. |
| table | `pharmacy_grns` / batches / stock / moves | done | `0170_pharmacy_tables.sql`; `applyStock`; move types `grn`, `supplier_return`, `sale`, `sale_return`, `ip_issue`, `ip_return`, `adjustment` | Ledger matches B7. It is one store per location (`pharmacy_stock` unique batch+location), not a multi-store ledger. |
| api | `POST …/ip-issues` and `…/ip-returns` | partial | `POST /api/v1/tenant/m/pharmacy/ip-issues` and `…/ip-issues/:id/return` | Both are in `IDEMPOTENT_POSTS` (`http.ts`). Feature `pharmacy.issue-to-ip-patients-returns`. See r59. |
| api | `POST …/sales {op\|outside}` and `…/sales/:id/return` | partial | `postSale`, `returnSale`; features split by kind | Idempotent. No schedule guard. `GET …/sales/:id` and print do not re-check the kind feature. |
| api | `GET …/reports/{issue,issue-return,patient-ip-statement,expiry,stock,adjustments}` | partial | `GET …/reports/:report` keys `issues`, `issue-returns`, `ip-statement`, `expiry`, `stock-register`, `adjustments` | Also `receipts`, `rejections`, `purchases`. Handler maps each key to a feature. No file export. |
| rule | No sale or issue of an expired batch | done | `allocateFefo` | Met, including the only-expired `422`. |
| rule | No negative stock | done | `applyStock` `409 insufficient_stock`; `pharmacy_stock.qty >= 0` | Met. Race test in `pharmacy.test.ts`. |
| rule | IP return cannot exceed qty issued for that batch | done | `returnIpIssue` compares `req.qty` to `qty - returned_qty` | Met. Return is same batch as the issue line. |
| rule | H1/X outside sale needs prescriber name and address, patient name, Rx, and a register row | missing | Schedule is master data only | No check and no register. |
| rule | Cash sale through `assert_cash_allowed` (SF-T9) | missing | `cash.record` in `postSale` / `returnSale` | No s.186 guard in `apps/api/src/clinical/cash.ts`. |
| rule | Sale return only within N days, with a reason | partial | `pharmacySaleReturnSchema` requires a reason | No day window. |
| rule | H1 register append-only, 3-year retention | missing | — | No table. |

## Reuse decisions

- Keep the B7 ledger: `pharmacy_items`, `pharmacy_batches`, `pharmacy_stock`, `pharmacy_stock_moves`, `applyStock`, `allocateFefo`. Indents must add a store id to this ledger (see indents audit), not a second stock table.
- Keep `postGrn` / `postSupplierReturn` / `postAdjustment` as the drug-store documents. PO, indent, and GRN-against-PO are extensions, not new pharmacy screens.
- Keep `charges.post` / `charges.reverse` for IP issues until a shared DB charge function exists. It is not on `feat/integrate-6` or `feat/b-b6`. Do not fork a pharmacy charge table.
- OP/outside sales stay on `pharmacy_sales` and the pharmacy counter. Do not route them through OP billing vouchers unless a later billing task says so; B7 already chose the counter (`cash.record`, counter `PHARMACY`).
- Controlled-drug rows (PH-T5) are a new append-only table written in the same transaction as `postSale` / `postIpIssue` / `postGrn`. Do not overload `pharmacy_stock_moves`.
- Supplier payments: nothing in B7 to reuse. Do not treat `pharmacy_grns.total_paise` as outstanding.
- `pharmacy_suppliers` (name, gstin, phone, city) is the supplier master to extend when bill passing is unblocked. No state code and no Udyam yet.

## Proposed next-task adjustments

- **PH-T2 shrinks** IP issue/return (FEFO, exempt charge, reversal, qty cap), OP/outside sale and sale return, expired-batch block, and idempotency on those posts. **PH-T2 still adds** order linkage on IP lines, Rx fields and schedule guard, cash-limit hook once SF-T9 exists, and IGST when the supplier/location state says so. Do not rewrite `applyStock`.
- **PH-T3 shrinks** the nine on-screen reports (routes and the reports page exist). **PH-T3 still adds** expiry tiers 180/90/60/30, export plus `report.export`, adjustment approval if the spec's approval is still required (today it posts immediately), line detail on the adjustment register, and a real rejection view once GRN can reject a qty. Purchase register stays a GRN listing until IND-T3 adds POs; do not fake POs inside PH-T3.
- **PH-T4 shrinks** counter, IP issue/return, GRN, stock, items, and the report screen. **PH-T4 still adds** Rx capture on the counter and a return that is not "first open line, full qty".
- **PH-T5 does not shrink.** `controlled_drug_register` and H1/X/NDPS writes are absent. Schedule values stop at `H/H1/X/OTC`.
