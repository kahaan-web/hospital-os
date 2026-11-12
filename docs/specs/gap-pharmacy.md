# GAP · Pharmacy & Stores (B7 on main: complete it)

Doc module "PHARMACY AND STORES INVENTORY" [DOCS: ML #13]. Sheet module "Pharmacy", 20 rows [DOCS: S1 r56–r75]. Stage 3 in Sheet3. **Status:** B7 is merged per the notes and was not seen in the demo [ARCH: handover appendix]. **All items are [VERIFY-REPO when the Dell is back].** Procurement (PO, GRN, returns) is generalised in `07-indents-purchase.md`, and supplier bills and payments in `08-bill-passing.md`. This file covers the pharmacy-specific sales and issue side, and the overall checklist.

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md`. [DOCS] items are unchanged.
- **Schedule H1 register** (R5.3): every H1 supply is entered at the time of supply in a **separate register** with the prescriber's name and address, the patient's name, the drug name and the quantity, **kept 3 years**, open to inspection. [VERIFIED: Drugs Rules 1945 r.65, CDSCO PDF; NHSRC register format https://nhsrcindia.org/sites/default/files/2021-07/Attachment%20A%2C%20Schedule%20H1%20register%20and%20NDPS%20Forms.pdf] New **PH-T5**.
- **Schedule X:** the prescription is in duplicate and one copy is retained; a separate register; kept 2 years. [RESEARCH-WEAK: Gemini, verify] **NDPS** (morphine, fentanyl and so on) needs RMI registers and daily balance, kept 2 years. The form numbers (3E/3F and others) vary by state. [RESEARCH-WEAK: Gemini, verify per state] These are config-driven register definitions.
- **IP drug chart = prescription** for in-patients. [RESEARCH-WEAK: Gemini, R5.3]
- **GST** (R1.2, R5.4):
  - **IP issues** are part of the exempt composite supply, so no GST is charged.
  - **OP and outside sales** are taxable at the item's HSN rate, mostly **5% (some nil) from 22 Sep 2025**.

  [RESEARCH: Perplexity, P1-1 Delhi Drugs Control circular, Notifications 09/2025 and 10/2025-CT(R)] [RESEARCH-WEAK: Gemini, CBIC homepage]

  ITC: purchases for exempt IP use are blocked, and common ITC is apportioned under CGST Rules 42/43. [RESEARCH-WEAK: Gemini, verify with a CA]
- **Cash limit:** a cash sale goes through the SF-T9 guard (s.186). [VERIFIED: V8]
- **Expiry:** FEFO; near-expiry alert 3–6 months; short-expiry acceptance at GRN as under 60–75% of shelf life left. [RESEARCH-WEAK: Gemini, R5.7, NABH homepage, verify]

## Purpose
The pharmacy counter and the IP drug supply:
- receive stock;
- issue to inpatients (and take returns);
- sell to outpatients and outside customers;
- adjust stock;
- track expiry;
- pay suppliers. [DOCS: S1 r56–r75]

## Users and roles
- Pharmacist: sales, issues, receipts.
- Store Keeper: procurement.
- Accounts: supplier payments.
- Nurse: IP returns.

## Docs checklist with likely gaps

| Row | Item | Tier B/M/P | Likely state |
|---|---|---|---|
| S1 r56 | Purchase Order (Status "Change") | N/Y/Y | likely gap; see 07 |
| S1 r57 | Material Receipts ("Change") | Y/Y/Y | verify the batch/expiry/free qty |
| S1 r58 | Material Returns ("Change") | Y/Y/Y | likely gap; see 07 |
| S1 r59 | Issue to IP Patients / Returns | Y/Y/Y | verify the returns half |
| S1 r60 | Issue to OP Patients | Y/Y/Y | verify (against prescription) |
| S1 r61 | Outside Sales | Y/Y/Y | likely gap (a non-registered customer, Rx capture for Schedule H) |
| S1 r62 | Stock Adjustments | Y/Y/Y | verify the approval |
| S1 r63 | Payment Approvals ("New") | Y/Y/Y | likely gap; see 08 |
| S1 r64 | Bill Payment ("New") | Y/Y/Y | likely gap; see 08 |
| S1 r65 | Stock Register Summary / Details | Y/Y/Y | verify |
| S1 r66 | Purchase Register | N/Y/Y | likely gap |
| S1 r67 | Receipt Register | Y/Y/Y | verify |
| S1 r68 | Rejection Register | Y/Y/Y | likely gap |
| S1 r69 | Issue Register | Y/Y/Y | verify |
| S1 r70 | Issue Return Register | Y/Y/Y | likely gap |
| S1 r71 | Stock Adjustment register | Y/Y/Y | verify |
| S1 r72 | Patient Issue / Return Statement IP | Y/Y/Y | likely gap |
| S1 r73 | Expiry Item Report | Y/Y/Y | verify |
| S1 r74 | Supplier Outstanding ("New") | Y/Y/Y | likely gap; see 08 |
| S1 r75 | Supplier Payment Register ("New") | Y/Y/Y | likely gap; see 08 |

## Workflows to finish (pharmacy-specific)
1. **Issue to an IP patient** against medicine orders (CPOE or Nurse Station), FEFO, posting C1 charges to the IP account. **Returns** from the ward reverse the stock and the charge [S1 r59, r72].
2. **OP sale** against an OP prescription (or a walk-in with the Rx details), with MRP-based pricing, discount (Medicard/concession) and payment through OP billing or the pharmacy's own counter [VERIFY-REPO B7 choice] [S1 r60].
3. **Outside sale** [S1 r61] to a non-registered customer: name, mobile, and the prescriber and Rx number for scheduled drugs. An **H1** sale writes a Schedule H1 register row (prescriber name and address, patient name, drug, qty, date) [VERIFIED: r.65]. **X** keeps the duplicate Rx as an attachment (C5) plus a register row [RESEARCH-WEAK: Gemini]. **NDPS** keeps a register row with the daily balance [RESEARCH-WEAK: Gemini, form per state].
4. **Expiry management** [S1 r73]: near-expiry list with configurable tiers, seed **180/90/60/30 days**, and expired items blocked from sale. [RESEARCH-WEAK: Gemini, R5.7 says 3–6 months; CONFLICT with the Phase 1 seed 90/60/30, so both tiers are kept by adding 180]
5. **GST on medicine sales:** OP and outside sales are taxable at the item's **effective-dated** HSN rate (mostly 5% from 22 Sep 2025). **IP issues carry no GST**, being part of the exempt composite supply. [RESEARCH: Perplexity, R1.2, P1-1] The rates sit on the item master with an effective date, so a rate change never edits old bills.

## Screens (add if missing [VERIFY-REPO])
- `/app/pharmacy/sales`: the OP and outside-sale counter, with Rx capture for scheduled drugs [S1 r60, r61].
- `/app/pharmacy/ip-issues` and `/app/pharmacy/ip-returns` [S1 r59].
- `/app/pharmacy/reports/*`: issue, issue-return, patient IP statement, expiry, stock and adjustments [S1 r65, r69–r73].
- Procurement screens are in 07 and supplier bill screens in 08.

## Data model additions [VERIFY-REPO]
- `pharmacy_sales(location_id, sale_no, sale_type enum op|outside, patient_id FK null, customer_name enc null, customer_mobile enc null, prescriber_name null, rx_no null, …totals)` with lines (item, batch, qty, mrp, discount, gst)
- `pharmacy_ip_issues` / `pharmacy_ip_returns` with lines, linked to `charge_id`
- `items.controlled_schedule enum none|h|h1|x|ndps`, plus `items.high_alert`, `items.lasa` (Phase 2, from the nurse station)
- `controlled_drug_register(location_id, schedule, entry_at, item_id FK, batch_id FK, qty, direction enum in|out, balance_after, patient_name enc, patient_id FK null, prescriber_name, prescriber_address, rx_ref, rx_attachment_id FK null, sale_id/issue_id, retain_until)`, append-only. [VERIFIED for the H1 fields: r.65] [RESEARCH-WEAK for X and NDPS]

## APIs (module `pharmacy`; feature keys per S1 row [VERIFY-REPO])
- POST `/tenant/pharmacy/ip-issues` (Idem) and `/ip-returns` (Idem) [S1 r59]
- POST `/tenant/pharmacy/sales` `{type: op|outside}` (Idem) [S1 r60, r61]; POST `/sales/:id/return` (Idem)
- GET `/tenant/pharmacy/reports/{issue,issue-return,patient-ip-statement,expiry,stock,adjustments}` [S1 r65, r69–r73]
- Procurement and supplier routes: see 07 and 08.

## Business rules and edge cases
- No sale or issue of an expired batch.
- No negative stock.
- An IP return can't exceed the qty issued to that patient for that batch.
- A Schedule H1 or X outside sale needs the prescriber's name **and address**, the patient's name and the Rx reference. It writes a register row in the same transaction. [VERIFIED: r.65 for H1] The register has `retain_until` = 3 years (H1) or 2 years (X, NDPS), and is never deleted.
- A cash sale goes through `assert_cash_allowed` (SF-T9).
- Sale returns within N days only, with a reason [DEFAULT, to confirm by research].

## Integrations
CPOE and Nurse Station (orders), IP and OP billing (C1 and vouchers), Indents & Purchase (07), Bill Passing (08), Medicard (discounts), MIS (Material MIS), Night Audit (issued-but-uncharged check).

## Tier (Sheet1)
- **Basic:** everything except PO [r56] and Purchase Register [r66].
- **Medium and Premium:** all 20 rows.

## Acceptance criteria
- Every checklist row has a route, a screen and a test.
- An IP issue → ward return reverses both the stock and the charge.
- An outside sale of a scheduled drug without Rx details → 422.
- The expiry report lists seeded near-expiry batches.
- (Phase 2) An H1 outside sale without the prescriber address → 422. With it, it creates an H1 register row; the H1 register report prints with the r.65 columns and exports.
- (Phase 2) An OP sale of a 5% item shows CGST 2.5% + SGST 2.5%. The same item issued to an IP patient shows no GST.

## Build order and tasks
### PH-T1 Audit B7 against the checklist
- **Scope:** write `docs/specs/pharmacy-gap.md`. Coordinate with IND-T1 and BP-T1 (one audit run can cover all three).
- **Model:** grok.
- **Depends:** Dell back.
### PH-T2 IP issue and return with C1 charge and reversal, OP and outside sales with returns, scheduled-drug guard
- **Model:** grok.
- **Depends:** PH-T1, IPB-T2.
### PH-T3 Missing registers
- **Scope:** issue, issue-return, patient IP statement, expiry tiers, adjustments.
- **Model:** grok.
- **Depends:** PH-T2.
### PH-T4 Web: sales counter, IP issue and return, report screens
- **Model:** composer.
- **Depends:** PH-T2, PH-T3.
### PH-T5 Controlled-drug registers: Schedule H1, X and NDPS (Phase 2)
- **Scope:** `controlled_drug_register`, writes from sales and issues in the same DB transaction, the register reports (H1 per r.65; X and NDPS as configurable column sets), and retention dates.
- **Accept:** the Phase 2 acceptance bullets; append-only (hos_app can't UPDATE or DELETE).
- **Model:** grok.
- **Depends:** PH-T2.
