# Indents & Purchase gap audit (IND-T1)

Audited **main** against `docs/specs/07-indents-purchase.md`, using the B7 pharmacy ledger (see `pharmacy-gap.md` for the sales side). `git diff main feat/integrate-6` and `git diff main feat/b-b6` do not change pharmacy procurement tables or routes. No indent, PR, or PO exists on those branches. No row is "done (pending merge)".

The spec asked for `stores-reuse.md`. This file is `indents-purchase-gap.md` as the W0 worker brief names it.

Departmental indents are **OPEN – to confirm with Ajay Sheth (#5)**. Sheet1 still says PO and Purchase Register are Medium+ (r56, r66) and GRN, returns, adjustments, and the other registers are Basic. B7 already posts a direct GRN with no PO, which is the Basic shape.

B7 stock is one balance per `(batch, location)` (`pharmacy_stock`). There is no `store_id`, no ward sub-store, and no departmental issue document.

## Matrix

| Kind | Item | Status | Evidence | Gap |
|---|---|---|---|---|
| checklist | S1 r56 Purchase Order | missing | No PO table or route. Catalogue key `pharmacy.purchase-order` is unused | Nothing to approve, amend, print, or short-close. |
| checklist | S1 r57 Material Receipts (GRN) | partial | `postGrn` (`apps/api/src/clinical/pharmacy/service.ts`); `pharmacy_grns` / `pharmacy_grn_lines` / `pharmacy_batches` (`packages/db/migrations/0170_pharmacy_tables.sql`); `POST /api/v1/tenant/m/pharmacy/grns` | Direct receipt: batch, expiry, MRP, rate, qty. No PO, supplier invoice no/date, free qty, accepted/rejected split, or duplicate-invoice 409. |
| checklist | S1 r58 Material Returns | partial | `postSupplierReturn`; `pharmacy_supplier_returns` + lines; `POST …/supplier-returns` | Batch stock out and a reason. No GRN link and no debit note. |
| checklist | S1 r62 Stock Adjustments | partial | `postAdjustment`; `pharmacy_adjustments` + lines; `POST …/adjustments` | Writes stock immediately. No `approved_by` and no draft/approved status. |
| checklist | S1 r65 Stock Register | partial | `listStock`; report `stock-register` (`apps/api/src/clinical/pharmacy/reports.ts`) | Pharmacy location only. No store filter. No summary vs detail split. |
| checklist | S1 r66 Purchase Register | partial | Report `purchases` lists GRN headers; feature `pharmacy.purchase-register` | Not a PO register. Medium 403 is tested (`pharmacy.test.ts`). |
| checklist | S1 r67 Receipt Register | partial | Report `receipts` | GRN headers only. |
| checklist | S1 r68 Rejection Register | partial | Report `rejections` reads `pharmacy_supplier_returns` | Not qty rejected on a GRN. |
| checklist | S1 r71 Stock Adjustment register | partial | Report `adjustments` | Header reason only. |
| workflow | Indent draft → submitted → approved → issued → closed | missing | — | No `indents` table or `/tenant/stores/indents`. Tier open (#5). |
| workflow | Issue against indent, FEFO, sub-store or cost centre, short issue stays open | partial | `allocateFefo` (`apps/api/src/clinical/pharmacy/stock.ts`) is FEFO for sales and IP issues | No `stock_issues`, no second store, no indent balance. |
| workflow | PR from indent shortfall or reorder | missing | `pharmacy_items.reorder_level` is stored and `listStock` flags `low` | No PR document and no auto-suggest API. |
| workflow | PO per supplier, GST, slabs, print/email, amend, short-close | missing | — | Seed slabs in the spec are not in code. |
| workflow | GRN against PO or direct; accept/reject; stock via C3 | partial | `postGrn` calls `applyStock` move type `grn` | Direct only. `applyStock` is TypeScript, not `inv_post_grn`. |
| workflow | Return to supplier (debit note) via C3 | partial | `postSupplierReturn` move type `supplier_return` | No debit note, no GRN line. |
| workflow | Adjustment with approval | partial | `postAdjustment` move type `adjustment` | No approval step. |
| workflow | Indent register, pending indents, PO pending delivery | missing | — | Not in `PHARMACY_REPORTS`. |
| workflow | Short-expiry at GRN (6 months or 60%, warn or block) | missing | Expiry is stored on `pharmacy_batches`. Sale block is `allocateFefo` | GRN accepts any future or past expiry. No manufacturing date, no override. |
| workflow | ITC eligibility on the GRN line | missing | GRN line has `gst_rate_bp` and the header has `tax_paise` | No `itc_eligibility`. No ITC report. |
| screen | `/app/stores/indents` | missing | — | Pharmacy nav has no indents (`PharmacyNav.tsx`). |
| screen | `/app/stores/requisitions` | missing | — | — |
| screen | `/app/stores/purchase-orders` | missing | — | — |
| screen | `/app/stores/grn` | partial | `/app/pharmacy/grn` | Pharmacy direct GRN. Not a stores GRN against a PO. |
| screen | `/app/stores/returns` | partial | Return form on `/app/pharmacy/stock` | Not a stores return note. |
| screen | `/app/stores/adjustments` | partial | Adjustment form on `/app/pharmacy/stock` | Immediate post. |
| screen | `/app/stores/stock` | partial | `/app/pharmacy/stock` | One location, no store picker. |
| screen | `/app/stores/reports/*` | partial | `/app/pharmacy/reports` | Pharmacy report keys only. |
| table | `indents`, `indent_lines` | missing | — | — |
| table | `stock_issues`, `stock_issue_lines` | missing | IP and counter issues are `pharmacy_ip_issues` and `pharmacy_sales` | Those are patient issues, not department issues. |
| table | `purchase_requisitions`, `pr_lines` | missing | — | — |
| table | `purchase_orders`, `po_lines` | missing | — | — |
| table | `grns`, `grn_lines` | partial | `pharmacy_grns`, `pharmacy_grn_lines` | Missing PO, invoice identity, free qty, accept/reject, ITC. |
| table | `batches` | done | `pharmacy_batches` unique `(tenant_id, item_id, batch_no)` | Drug batch. No manufacturing date. |
| table | `supplier_returns` | partial | `pharmacy_supplier_returns` + lines | No `grn_id`. |
| table | `stock_adjustments` | partial | `pharmacy_adjustments` + lines | No approval columns. |
| api | Indents CRUD, submit, approve, cancel, issue | missing | — | Feature `stores.indents` does not exist. |
| api | Requisitions | missing | — | — |
| api | Purchase orders submit/approve/amend/short-close/cancel | missing | — | Key `pharmacy.purchase-order` is catalogue-only. |
| api | `POST /tenant/stores/grns` and `…/post` | partial | `POST /api/v1/tenant/m/pharmacy/grns` posts in one call (`postGrn`) | No draft, no stores path. Idempotent (`http.ts`). Feature `pharmacy.material-receipts`. |
| api | Supplier returns post | partial | `POST …/pharmacy/supplier-returns` | Idempotent. Feature `pharmacy.material-returns`. |
| api | Adjustments approve and post | partial | `POST …/pharmacy/adjustments` posts immediately | No approve route. Idempotent. |
| api | `GET /tenant/stores/stock` | partial | `GET …/pharmacy/stock` → `listStock` | No `storeId`. Feature `pharmacy.stock-register-summary-details`. |
| api | Reports purchase, receipt, rejection, stock, indent, pending-po | partial | `GET …/pharmacy/reports/:report` keys `purchases`, `receipts`, `rejections`, `stock-register` | Indent and pending-PO keys absent. |
| rule | FEFO; no negative stock; no expired issue | done | `allocateFefo`, `applyStock` | True for pharmacy sale and IP issue. Not wired to a departmental issue, because that document does not exist. |
| rule | GRN `accepted + rejected = received`; over-PO 422; duplicate supplier invoice 409 | missing | `postGrn` takes a single `qty` and adds it all to stock | No split, no PO balance, no invoice number column. |
| rule | PO immutable after approval; amend creates a revision | missing | — | — |
| rule | Basic has no PO and can post a direct GRN | done | The only GRN path is direct. PO routes do not exist, so they cannot return 403 | When PO routes are added they must 403 on Basic. Today's direct GRN is the Basic behaviour. |
| rule | Intra-state CGST+SGST vs inter-state IGST from supplier state | missing | `pharmacy_suppliers` has `city` and `gstin`, no `state_code`. GRN stores `tax_paise` only | Not calculated. |
| rule | Controlled-drug receipt writes the register (`direction = in`) | missing | `pharmacy_items.schedule` only | Register is PH-T5. GRN does not write it. |

## Reuse decisions

- **Reuse, do not copy:** `pharmacy_items`, `pharmacy_batches`, `pharmacy_stock`, `pharmacy_stock_moves`, `pharmacy_suppliers`, `pharmacy_grns`, `pharmacy_grn_lines`, `pharmacy_supplier_returns`, `pharmacy_adjustments`, `applyStock`, `allocateFefo`, and the pharmacy report route. Patient sales and IP issues stay pharmacy documents.
- **Generalise the ledger in place.** Add `store_id` (main store vs ward/OT/lab sub-store) to `pharmacy_stock` and `pharmacy_stock_moves`. A location-only balance cannot represent departmental stock. Do not create a second movement table beside `pharmacy_stock_moves`.
- **Generalise GRN in place.** Add supplier invoice no/date (unique per supplier), free qty, qty accepted/rejected, reject reason, PO line id, and `itc_eligibility` on `pharmacy_grn_lines`. Keep `postGrn` as the post path for pharmacy and for stores. A draft-then-post split can sit on the same table.
- **Generalise returns and adjustments in place.** Add `grn_id` on supplier returns. Add approval columns on adjustments. Do not add `supplier_returns` / `stock_adjustments` as parallel tables.
- **New tables, because B7 has no row to extend:** `indents`, `indent_lines`, `stock_issues`, `stock_issue_lines`, `purchase_requisitions`, `pr_lines`, `purchase_orders`, `po_lines`.
- **C3 is `applyStock` today**, not a SQL function. Spec functions `inv_post_grn`, `inv_post_issue`, `inv_post_return`, `inv_post_adjustment` are not in the repo. Either move the existing TypeScript under those names or keep `applyStock` and stop specifying a second API. Decision: keep `applyStock` as the single writer and add the document rules around it. Do not introduce a second stock writer.
- **Purchase register:** point the existing `purchases` report at PO/GRN once POs exist. Do not add a second report key for the same GRN list.
- **Rejection register:** once GRN lines can reject a qty, stop using supplier returns as the rejection report. Supplier returns stay the r58 document.
- **Suppliers:** extend `pharmacy_suppliers` with `state_code` when GST place-of-supply is built. One supplier master for pharmacy and stores.
- **Number series:** GRN already uses `numbering.next(ctx, 'grn')`. Returns and adjustments use `localNumber`. New documents (indent, PR, PO, issue) should use the shared numbering helper, not another local counter.
- **#5:** build indent feature keys with no tier until Ajay answers. Do not block IND-T2 on the tier. Basic must keep direct GRN and must 403 on PO.

## Proposed next-task adjustments

- **IND-T2 does not shrink to zero.** Indents and departmental issues are absent. **Shrink the FEFO/negative/expired work:** call `allocateFefo` and `applyStock`. Grow the task for `store_id` on the existing stock tables.
- **IND-T3 does not shrink.** PR, PO, slabs, revisions, and print are absent. Reuse `pharmacy_suppliers` and the numbering helper.
- **IND-T4 shrinks** the happy-path direct GRN (`postGrn` already stocks a batch). **IND-T4 grows** invoice identity, accept/reject, PO match, free qty, short-expiry, and ITC on those columns. Do not add `inv_post_grn` as a second writer.
- **IND-T5 shrinks** the stock effect of returns and adjustments. **IND-T5 still adds** GRN linkage, debit note, and approval.
- **IND-T6 shrinks** receipt, stock, adjustment, and the current purchase (GRN) reports, which already render. **IND-T6 still adds** a real purchase (PO) register, rejection-at-receipt, indent, pending PO, ITC, and short-expiry. Fix the rejection report so it is not the supplier-return list.
- **IND-T7 and IND-T8 do not shrink.** `/app/stores/*` does not exist. Pharmacy GRN and stock pages stay until the stores screens replace them for the shared documents. Do not rebuild the pharmacy counter in these tasks.
