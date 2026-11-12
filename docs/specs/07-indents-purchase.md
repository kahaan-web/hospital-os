# 07 · Indents & Purchase Management

Doc module "INDENTS & PURCHASE MANAGEMENT" [DOCS: ML #14]. Group I has the name only. The procurement rows that exist sit under Pharmacy in Sheet1:

| Item | Sheet1 row | Tier |
|---|---|---|
| Purchase Order | r56 | Medium+ |
| Material Receipts | r57 | Basic |
| Material Returns | r58 | Basic |
| Stock Adjustments | r62 | Basic |
| Purchase Register | r66 | Medium+ |
| Receipt Register | r67 | Basic |
| Rejection Register | r68 | Basic |
| Stock Register | r65 | Basic |

The module title in the doc is "PHARMACY AND STORES INVENTORY" [DOCS: ML #13], so stores (non-pharmacy) inventory is in scope. B7 pharmacy may already have POs and GRNs for drugs [VERIFY-REPO]. This module **generalises them to all stores and adds departmental indents**.

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md`. [DOCS] items are unchanged.
- **Flow** (R5.2): indent → store issue → PR (auto from reorder level) → PO → GRN. This confirms the Phase 1 flow. **PO approval slab examples:** Store Manager up to ₹50,000, Finance Head up to ₹2,00,000, MD above. [RESEARCH-WEAK: Gemini, NABH homepage] These become seed slabs, editable.
- **ITC** (R5.4): GST on inputs used **exclusively for exempt** IP/clinical supplies is **blocked**; inputs for taxable OP and outside pharmacy sales are creditable; **common** ITC is apportioned under CGST Rules 42/43. [RESEARCH-WEAK: Gemini, CBIC homepage, verify with a CA] Stores records the GST paid with a `itc_eligibility enum blocked|eligible|common` per GRN line (from the destination store type). The Rule 42/43 reversal is an **accounting report**, not an automatic posting.
- **Short expiry** (R5.7): a delivery with **less than 60–75% of total shelf life left** is "short-expiry"; it's often auto-rejected unless the chief pharmacist overrides. [RESEARCH-WEAK: Gemini, verify] [CONFLICT: the Phase 1 rule was "<6 months → warning". Now configurable as months **or** % of shelf life, mode `warn|block_with_override`, with the seed `warn` at 6 months or 60%, whichever comes first.]
- **Controlled drugs:** the register is now specified in gap-pharmacy (PH-T5). [VERIFIED: H1 r.65]

## Purpose
- Let departments (wards, OT, lab, housekeeping) **indent** (requisition) materials from the main store.
- Let the store issue them, or convert shortfalls into purchase requisitions, **purchase orders**, **goods receipts (GRN)** with quality acceptance or rejection, and **returns to supplier**.
- Feed Bill Passing with matched documents.

## Users and roles
- Department in-charge or Nurse in-charge: raises indents.
- Store Keeper (new): issues, GRN, returns.
- Purchase Officer (new): PR → PO.
- Approver (Location Admin / Tenant Admin): PO approval by value limit.
- Pharmacist: the same flows for the pharmacy store.

[DEFAULT, to confirm by research]

## Workflows
1. **Indent.**
   - Department → store, with items, qty, required-by date and priority.
   - Status: draft → submitted → approved (HOD optional) → partially or fully issued → closed or cancelled.
2. **Issue against an indent.**
   - The store issues from stock by FEFO for batch items, through C3.
   - The department's sub-store is credited (or charged straight to the department's cost centre).
   - A short issue leaves the balance open.
3. **Purchase requisition (PR).** Created from indent shortfalls or from items below reorder level (an auto-suggest list).
4. **Purchase Order.** [DOCS: S1 r56 (pharmacy), Medium+]
   - PR lines → PO per supplier.
   - Rate, discount, GST per line.
   - Delivery date and terms.
   - Approval by value slab. Seed: Store Manager ≤ ₹50,000; Finance Head ≤ ₹2,00,000; Tenant Admin/MD above. [RESEARCH-WEAK: Gemini, R5.2]
   - Print or email to the supplier (outbox, mock).
   - Amend → new revision. Cancel or short-close.
5. **Material Receipt (GRN).** [DOCS: S1 r57]
   - Against a PO, or direct (Basic, which has no PO feature).
   - Captures supplier invoice no. and date, batch, expiry, MRP (drugs), qty received, qty accepted and qty rejected with a reason.
   - Accepted qty goes into stock (C3).
   - Rejection → Rejection Register [DOCS: S1 r68].
6. **Material Return to supplier.** [DOCS: S1 r58] Select GRN batches → a return note (debit note), with stock out through C3.
7. **Stock adjustment.** [DOCS: S1 r62] Write-off, breakage, expiry or physical-count variance, with approval.
8. **Reports:**
   - Purchase Register [DOCS: S1 r66];
   - Stock Adjustment register [DOCS: S1 r71];
   - Receipt Register [r67];
   - Rejection Register [r68];
   - Stock Register Summary/Detail [r65];
   - Indent Register, pending indents, and PO pending delivery (these three are [DEFAULT, to confirm by research]).

## Screens
- `/app/stores/indents`: list, new, detail, issue.
- `/app/stores/requisitions`.
- `/app/stores/purchase-orders`: list, new from PR, approve, print.
- `/app/stores/grn`: new against a PO or direct, with batch/expiry grid, accept and reject.
- `/app/stores/returns`.
- `/app/stores/adjustments`.
- `/app/stores/stock`: by store, item and batch.
- `/app/stores/reports/*`.

## Data model (reuse B7 tables where they exist [VERIFY-REPO])
- `indents(location_id, indent_no, from_department_id FK, to_store_id FK, priority, required_by, status, approved_by)` and `indent_lines(indent_id FK, item_id FK, qty_requested, qty_issued, status)`
- `stock_issues(location_id, issue_no, from_store_id FK, to_store_id FK null, to_department_id FK null, indent_id FK null, issued_by)` and `stock_issue_lines(issue_id FK, item_id FK, batch_id FK, qty, unit_cost_paise)`
- `purchase_requisitions(location_id, pr_no, source enum indent|reorder|manual, status)` and `pr_lines(pr_id FK, item_id FK, qty, indent_line_id FK null)`
- `purchase_orders(location_id, po_no, revision int, supplier_id FK, status enum draft|pending_approval|approved|partially_received|received|short_closed|cancelled, delivery_by, terms, subtotal_paise, gst_paise, total_paise, approved_by, approved_at)` and `po_lines(po_id FK, item_id FK, qty, rate_paise, discount_bp, gst_rate_bp, qty_received, pr_line_id FK null)`
- `grns(location_id, grn_no, supplier_id FK, po_id FK null, store_id FK, supplier_invoice_no, supplier_invoice_date, status enum draft|posted|cancelled, posted_at)` and `grn_lines(grn_id FK, po_line_id FK null, item_id FK, batch_no, expiry_date null, mrp_paise null, qty_received, qty_accepted, qty_rejected, reject_reason_code, rate_paise, gst_rate_bp, free_qty)`
- `batches(item_id FK, batch_no, expiry_date, mrp_paise)` [VERIFY-REPO B7]
- `supplier_returns(location_id, return_no, supplier_id FK, grn_id FK null, reason, status)` and `supplier_return_lines(return_id FK, grn_line_id FK, batch_id FK, qty, rate_paise)`
- `stock_adjustments(location_id, adj_no, store_id FK, reason_code, status, approved_by)` and `stock_adjustment_lines(adj_id FK, item_id FK, batch_id FK, qty_delta, unit_cost_paise)`
- Posting is a DB function per document (`inv_post_grn`, `inv_post_issue`, `inv_post_return`, `inv_post_adjustment`), with FOR UPDATE on balances and an idempotency key.

## APIs (module `stores`; features below)

| Method | Path | Feature | Roles |
|---|---|---|---|
| GET/POST | `/tenant/stores/indents`; POST `/:id/{submit,approve,cancel}` | `stores.indents` [DEFAULT] | Dept in-charge, Store Keeper |
| POST | `/tenant/stores/indents/:id/issue` (Idem) | `stores.indents` | Store Keeper |
| GET/POST | `/tenant/stores/requisitions` | `stores.purchase_order` | Purchase Officer |
| GET/POST/PATCH | `/tenant/stores/purchase-orders`; POST `/:id/{submit,approve,amend,short-close,cancel}` | `pharmacy.purchase_order` [S1 r56] (shared key [VERIFY-REPO]) | Purchase Officer, Approver |
| POST | `/tenant/stores/grns` ; POST `/grns/:id/post` (Idem) | `pharmacy.material_receipts` [S1 r57] | Store Keeper, Pharmacist |
| POST | `/tenant/stores/returns`; POST `/:id/post` (Idem) | `pharmacy.material_returns` [S1 r58] | Store Keeper |
| POST | `/tenant/stores/adjustments`; POST `/:id/{approve,post}` (Idem) | `pharmacy.stock_adjustments` [S1 r62] | Store Keeper, Approver |
| GET | `/tenant/stores/stock?storeId&itemId` | `pharmacy.stock_register` [S1 r65] | Store staff |
| GET | `/tenant/stores/reports/{purchase,receipt,rejection,stock,indent,pending-po}` | per Sheet1 row [S1 r65–r68]; indent reports `stores.indents` | Store, Accounts |

## Business rules and edge cases
- **Issue** is FEFO by default and can't take a store negative (422). Expired batches can't be issued.
- **GRN:**
  - `qty_accepted + qty_rejected = qty_received`;
  - received can't exceed the PO balance + tolerance (default 0%) [DEFAULT, to confirm by research];
  - a duplicate supplier invoice no. for the same supplier → 409.
- **Short expiry:** `remaining_shelf_life` is checked at GRN against `min_months` (6) **and** `min_pct_of_total_shelf_life` (60%), when the manufacturing date is captured. The mode is `warn` (seed) or `block_with_override` (chief pharmacist, with a reason). [RESEARCH-WEAK: Gemini, R5.7] [CONFLICT: noted above]
- **PO approval** by value slab, configurable. An approved PO is immutable; amend makes a revision.
- **Basic tier** has no PO feature [S1 r56], so it records GRNs as direct receipts only.
- **GST:**
  - intra-state → CGST+SGST, inter-state → IGST, from the supplier `state_code` vs the location state;
  - **ITC:** each GRN line records `itc_eligibility` (blocked for exempt IP and clinical use, eligible for the taxable OP/outside pharmacy store, common otherwise). No automatic ITC ledger postings; an **ITC eligibility report** (by month and category) supports the accountant's Rule 42/43 working. [RESEARCH-WEAK: Gemini, R5.4]
- **Controlled drugs** (Schedule H1, X, NDPS): `items.controlled_schedule` is set here; receipts write `direction=in` rows to the controlled-drug register (PH-T5). [VERIFIED: H1 r.65] [RESEARCH-WEAK: X/NDPS]

## Integrations
- Pharmacy (B7): shares the item, batch, ledger and PO/GRN tables.
- Bill Passing: GRN + PO + supplier invoice → 3-way match.
- Linen, Equipment and Maintenance: spares and linen purchases.
- OT and Nurse Station: ward sub-store issues.
- MIS: Material MIS.
- Night Audit: pending indent alerts.

## Tier (Sheet1 rows and defaults)
- **PO and Purchase Register:** Medium+ [S1 r56, r66].
- **GRN, Returns, Adjustments, Receipt/Rejection/Stock registers:** Basic [S1 r57, r58, r62, r65, r67, r68].
- **Departmental indents and requisitions:** not in Sheet1. **OPEN – to confirm with Ajay Sheth.** (OPEN-QUESTIONS-AJAY #5)

## Acceptance criteria
- An indent of 3 items → partial issue (FEFO) → the shortfall becomes a PR → PO → approve → GRN with 1 line partly rejected → stock and registers correct.
- Negative-stock and expired-batch issue are both rejected (422).
- A duplicate supplier invoice is rejected (409).
- A Basic tenant gets 403 on PO routes but can post a direct GRN.
- Pharmacy (B7) tests stay green after the generalisation.
- RLS fixtures exist for all new tables.

## Build order and tasks (migrations 1140–1159)
### IND-T1 Diff B7 procurement and decide reuse
- **Scope:** write `docs/specs/stores-reuse.md`.
- **Model:** grok.
- **Depends:** Dell back.
### IND-T2 Indents, issues and FEFO through C3
- **Accept:** FEFO and negative-stock tests.
- **Model:** grok.
- **Depends:** SF-T4, IND-T1.
### IND-T3 PR and PO with approval slabs, revisions and print
- **Model:** grok.
- **Depends:** IND-T1, SF-T3.
### IND-T4 GRN against PO or direct, rejection, and posting DB function
- **Model:** grok.
- **Depends:** IND-T3.
### IND-T5 Supplier returns and stock adjustments
- **Model:** grok.
- **Depends:** IND-T4.
### IND-T6 Reports
- **Scope:** purchase, receipt, rejection, stock, indent and pending-PO, plus the ITC eligibility report and the short-expiry receipt report (Phase 2).
- **Model:** grok.
- **Depends:** IND-T5.
### IND-T7 Web: indents, issue and requisitions
- **Model:** composer.
- **Depends:** IND-T2.
### IND-T8 Web: PO, GRN, returns, adjustments and reports screens
- **Model:** composer.
- **Depends:** IND-T4 to IND-T6.
