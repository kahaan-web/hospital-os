# 10 · Linen & Laundry

Doc module "LINEN & LAUNDRY" [DOCS: ML #17]. It's a **name only**. Everything functional is [DEFAULT, to confirm by research]. Infection-control handling was [GAP: needs research]; Phase 2 has a weak answer, below.

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md` for the sources and the verification detail. [DOCS] items above and below are unchanged.

All from R7.6. [RESEARCH-WEAK: Gemini, no source; verify against the NABH HIC chapter, BMW Rules 2016 and the CPCB guidance]
- **Segregation at source:** soiled (non-infectious) linen goes in standard laundry bags. **Infected** linen (blood or body fluids) goes in **leak-proof yellow bags**, often water-soluble alginate.
- **Wash standard for infected linen:** thermal disinfection at **≥70 °C for ≥25 min**, or chemical disinfection (e.g. 1% sodium hypochlorite), before the normal cycle.
- **Par level:** **4–6 sets per bed** (in use, ward store, in transit, laundry/reserve).
- **Condemnation:** a documented policy for torn, frayed or stained items.
- **Outsourced laundry billing:** **per kg** for flatwork (sheets, blankets, pillow covers) and **per piece** for specials (OT gowns, drapes, aprons).

## Purpose
Track hospital linen (bedsheets, gowns, OT drapes, towels and so on):
- issue to wards and OT;
- collect soiled and infected linen;
- send it to an in-house or outsourced laundry;
- check it back in;
- control loss, damage and condemnation;
- support laundry vendor billing.

## Users and roles
- Linen Supervisor (new): stock, laundry dispatch and receipt.
- Ward Nurse in-charge: requests, soiled hand-over.
- Laundry vendor: no login in v1.
- Accounts: vendor bills, through Bill Passing.

## Workflows
1. **Linen master and par levels.**
   - Linen items are an `item_class=linen` item with size and colour.
   - Each ward or department has a par level per item. The default suggestion is **4 sets × beds** (range 4–6). [RESEARCH-WEAK: Gemini, R7.6]
2. **Purchase and new stock.** GRN into the linen store (Indents & Purchase).
3. **Issue to ward.** Against a ward request, or a par-level top-up. Clean stock moves linen store → ward (C3).
4. **Soiled collection.**
   - Count per item per ward, with categories `soiled` or `infected` (infected bags tracked separately).
   - Ward stock → "in laundry" status.
5. **Laundry dispatch.** A batch to an in-house or outsourced laundry, with a challan number, the item counts and the weight in kg (if the vendor bills by weight).
6. **Laundry receipt.**
   - Counts returned, with shortages and damaged items noted.
   - Clean stock goes back to the linen store.
   - Variance → loss register.
7. **Condemnation.** Damaged or worn-out linen is written off with approval (C3 adjustment).
8. **Vendor billing.** The dispatch/receipt log for a period × the vendor rate gives the expected bill, which goes to Bill Passing for 3-way-style matching. Each linen item carries a **billing basis** (per kg for flatwork, per piece for specials), so one vendor statement can mix both. [RESEARCH-WEAK: Gemini, R7.6]

## Screens
- `/app/linen/stock`: by location (store, each ward, in laundry).
- `/app/linen/issues`.
- `/app/linen/collections`.
- `/app/linen/laundry-batches`: dispatch and receive.
- `/app/linen/condemnation`.
- `/app/linen/masters`: items, par levels, vendor rates.
- Reports:
  - linen movement register;
  - loss/damage;
  - laundry vendor statement;
  - par vs actual;
  - cost per patient-day (needs census) [DEFAULT, to confirm by research].

## Data model
- `linen_par_levels(department_id FK, item_id FK, par_qty)`
- `linen_collections(location_id, collection_no, department_id FK, collected_at, collected_by)` and `linen_collection_lines(collection_id FK, item_id FK, qty, category enum soiled|infected)`
- `laundry_vendors` = `suppliers` with `laundry_rate_basis enum per_piece|per_kg` and `laundry_rates(supplier_id FK, item_id FK null, rate_paise, basis)`
- `laundry_batches(location_id, batch_no, vendor_supplier_id FK null (null = in-house), dispatched_at, challan_no, weight_kg numeric(8,2), status enum dispatched|partly_received|received|closed)` and `laundry_batch_lines(batch_id FK, item_id FK, qty_sent, qty_returned, qty_damaged, qty_missing, category)`
- `linen_condemnations(location_id, cond_no, approved_by, reason)`, with lines
- Stock positions come from `stock_ledger`, with the virtual stores `ward:<dept>` and `in_laundry` (store_type `linen`).

## APIs (module `linen`; features `linen.core`, `linen.laundry_vendor`, `linen.reports` [DEFAULT, to confirm by research])

| Method | Path | Feature | Roles |
|---|---|---|---|
| GET | `/tenant/linen/stock` | linen.core | Linen Supervisor, Nurse |
| POST | `/tenant/linen/issues` (Idem) | linen.core | Linen Supervisor |
| POST | `/tenant/linen/collections` (Idem) | linen.core | Nurse, Linen Supervisor |
| POST | `/tenant/linen/laundry-batches`; POST `/:id/receive` (Idem) | linen.core | Linen Supervisor |
| POST | `/tenant/linen/condemnations`; POST `/:id/approve` | linen.core | Linen Supervisor, Approver |
| GET/PUT | `/tenant/linen/masters/{par-levels,vendor-rates}` | linen.core / linen.laundry_vendor | Location Admin |
| GET | `/tenant/linen/vendor-statement?vendorId&from&to` | linen.laundry_vendor | Accounts |
| GET | `/tenant/linen/reports/{movement,loss,par,cost-per-patient-day}` | linen.reports | Admin |

## Business rules and edge cases
- Received + damaged + missing can't exceed sent per line. Missing becomes a loss after N days (default 7) [DEFAULT, to confirm by research].
- Infected linen is counted and batched separately, in **yellow-bag** batches, and can't be mixed into a regular batch.
- The laundry receipt for an infected batch must record the **disinfection method** (thermal: temperature and minutes; or chemical: agent and concentration). With thermal below 70 °C or under 25 min, the batch can't be received as clean without a supervisor override.

[RESEARCH-WEAK: Gemini, R7.6, verify] Thresholds are configuration.
- No negative ward stock. A collection over the issued qty gives a warning (linen may arrive from other wards).
- The vendor statement is derived and read-only. The bill itself is entered in Bill Passing.

## Integrations
- Indents & Purchase: buying linen.
- Bill Passing: the vendor bill.
- ADT census: cost per patient-day.
- MIS: cost centre.
- Maintenance Tracker: in-house laundry machine breakdowns.

## Tier
Not in Sheet1. **OPEN – to confirm with Ajay Sheth.** No default tier is set. (OPEN-QUESTIONS-AJAY #8) Feature keys exist so App Admin can assign any tier once decided.

## Acceptance criteria
- Issue 50 sheets to Ward A → collect 20 soiled + 2 infected → dispatch → receive 19 + 1 damaged, 2 missing → the stock positions and loss register are correct.
- The vendor statement for a period equals the sum of the batch qty × rate.
- 403 on Basic and Medium by default. RLS fixtures exist.

## Build order and tasks (migrations 1200–1209)
### LIN-T1 Schema, par levels, vendor rates and the virtual linen stores on the C3 ledger
- **Model:** grok.
- **Depends:** SF-T4.
### LIN-T2 Issue, collection, laundry dispatch/receive and condemnation API
- **Accept:** the worked example as a test.
- **Model:** grok.
- **Depends:** LIN-T1.
### LIN-T3 Reports and vendor statement
- **Model:** grok.
- **Depends:** LIN-T2.
### LIN-T4 Web: all linen screens and seed
- **Model:** composer.
- **Depends:** LIN-T2, LIN-T3.
