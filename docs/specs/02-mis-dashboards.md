# 02 · Hospital MIS & Dashboards

Doc module "HOSPITAL MIS & DASHBOARDS" [DOCS: ML #25]. It's a name only in Group I. Its content comes from the Android MIS app bullets [DOCS: ML A1]:
- REVENUE MIS;
- MATERIAL MIS;
- OCCUPANCY / ADMISSIONS MIS & SNAPSHOTS;
- DOCTORS PERFORMANCE (SURGERY / OP CONSULTATIONS);
- PATIENT OUTSTANDING;
- COST CENTER PROFITABILITY.

LAB MIS is a Lab report [DOCS: S1 r84] and stays in Lab, though MIS links to it. Today's tenant dashboard has counts and a go-live checklist only [ARCH: handover appendix].

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md` for the sources and the verification detail. [DOCS] items above and below are unchanged.

KPI formulas and allocation (R8.7). [RESEARCH-WEAK: Gemini, formulas self-generated with no source; they're the standard textbook definitions, so verify against the NHSRC/NABH indicator definitions]
- **Bed occupancy %** = inpatient bed-days ÷ available bed-days × 100.
- **ALOS** = inpatient bed-days ÷ discharges (including deaths).
- **Bed turnover** = discharges ÷ beds (per period).
- **ARPOB** = IP revenue ÷ occupied bed-days.
- **OPD→IPD conversion %** = admissions from OPD ÷ OPD consults × 100.
- **Cost-centre allocation:** overheads (housekeeping, admin) are allocated to revenue centres by **floor area** or by **% of direct revenue**. That becomes a configurable allocation basis per overhead centre: `area|revenue_share|headcount|fixed_pct`.
- Worked example (30 beds, 1 month): 900 available bed-days, 680 occupied, 145 discharges, ₹85 lakh revenue, 3,200 OPD consults, 110 admissions from OPD → occupancy 75.6%, ALOS 4.7, turnover 4.8, ARPOB ₹12,500, conversion 3.4%. [RESEARCH-WEAK: Gemini] This is used as the **MIS-T2 fixture**.
- The occupancy census is a **midnight census** for statistics only; it doesn't drive charging. [RESEARCH: Perplexity, R1.1 (see 01)]

## Purpose
Give owners and managers one place, on the web and on Android A1, to see:
- revenue;
- material consumption;
- occupancy;
- doctor performance;
- outstanding dues;
- cost-centre profitability.

It covers each location and the whole hospital. [DOCS: ML A1]

## Users and roles
- Tenant Admin and Location Admin: everything.
- MIS Viewer (new, read-only).
- Accounts: revenue, outstanding and profitability.
- Doctor: their own performance only. [DEFAULT, to confirm by research]

## Workflows
1. **Nightly snapshot.**
   - Night Audit (or a scheduled job if Night Audit isn't enabled) writes daily aggregate rows per location.
   - Dashboards read the snapshots plus today's live delta. [DEFAULT, to confirm by research]
2. **Drill-down.** Each tile opens a report with date range, location and group-by options. Drill-down stops at the document level: bill, GRN or admission. There are no patient names in the MIS views; UHIDs show only where the user has billing read permission. [DEFAULT, to confirm by research]
3. **Snapshot ("SNAPSHOTS" in A1).** A point-in-time census: beds occupied, vacant and blocked, admissions and discharges today, by ward. [DOCS: ML A1] What exactly "SNAPSHOTS" means is **OPEN – to confirm with Ajay Sheth** (#45). Candidate content below, not a decision:
4. **Export** to CSV/XLSX and print, using C6.

## Screens (web `/app/mis/*`; the same data feeds A1)

| Screen | Content | Source |
|---|---|---|
| Overview | Today's and month-to-date revenue, collections, occupancy %, admissions, discharges, OPD visits, outstanding | [DOCS: ML A1 bullets 1,3,5] |
| Revenue MIS | By day, month, department, service category, payer and location; OP vs IP; gross, concession and net | [DOCS: ML A1 b1] |
| Material MIS | Consumption by store, department and item class; purchases vs issues; near-expiry and stock value | [DOCS: ML A1 b2] |
| Occupancy / Admissions | Bed occupancy %, ALOS, admissions and discharges trend, ward census snapshot | [DOCS: ML A1 b3]; formulas: occupancy = inpatient bed-days ÷ available × 100; ALOS = bed-days ÷ discharges; turnover; ARPOB [RESEARCH-WEAK: Gemini, R8.7] |
| Doctor performance | Per doctor: OP consultations count and revenue, surgeries count and revenue, IP admissions | [DOCS: ML A1 b4] |
| Patient outstanding | Ageing buckets (0–30/31–60/61–90/90+) for OP, IP and payer dues | [DOCS: ML A1 b5]; the buckets are [DEFAULT, to confirm by research] |
| Cost-centre profitability | Revenue minus direct costs (material issues, payroll allocation, linen, maintenance) per cost centre per month | [DOCS: ML A1 b6]; allocation basis configurable per overhead centre (area / revenue share / headcount / fixed %); seed **revenue share** [RESEARCH-WEAK: Gemini, R8.7] |

## Data model (tenant-scoped snapshot tables, written only by the snapshot function)
- `mis_daily_revenue(location_id, business_date, department_id, service_category, payer_type, encounter_type enum op|ip, gross_paise, concession_paise, net_paise, collections_paise)`
- `mis_daily_census(location_id, business_date, ward_id, beds_total, beds_occupied, beds_blocked, admissions, discharges, transfers_in, transfers_out, patient_days)`
- `mis_daily_material(location_id, business_date, store_id, item_class, department_id, receipts_value_paise, issues_value_paise, closing_value_paise, near_expiry_value_paise)`
- `mis_daily_doctor(location_id, business_date, doctor_id, op_visits, op_revenue_paise, surgeries, surgery_revenue_paise, ip_admissions)`
- `mis_outstanding_snapshot(location_id, business_date, party_type enum patient_op|patient_ip|payer, bucket, amount_paise, count)`
- `mis_cost_centre_month(location_id, month, cost_centre_id, revenue_paise, material_cost_paise, payroll_cost_paise, other_cost_paise)`
- `mis_snapshot_runs(location_id, business_date, status, started_at, finished_at, error)`

The unique key is `(tenant_id, location_id, business_date, …dims)`. Re-running replaces that day's rows inside one transaction.

## APIs (module `mis`; feature keys `mis.revenue`, `mis.material`, `mis.occupancy`, `mis.doctor_performance`, `mis.outstanding`, `mis.cost_centre` [DEFAULT, to confirm by research])

| Method | Path | Feature | Roles |
|---|---|---|---|
| GET | `/tenant/mis/overview?locationId&date` | any `mis.*` | Admin, MIS Viewer |
| GET | `/tenant/mis/revenue?from&to&groupBy` | `mis.revenue` | Admin, MIS Viewer, Accounts |
| GET | `/tenant/mis/material?from&to&groupBy` | `mis.material` | Admin, MIS Viewer, Store Keeper |
| GET | `/tenant/mis/occupancy?from&to` and `/tenant/mis/census?at` | `mis.occupancy` | Admin, MIS Viewer, Nurse in-charge |
| GET | `/tenant/mis/doctors?from&to&doctorId` | `mis.doctor_performance` | Admin; a Doctor sees self only |
| GET | `/tenant/mis/outstanding?asOf` | `mis.outstanding` | Admin, Accounts |
| GET | `/tenant/mis/cost-centres?month` | `mis.cost_centre` | Admin, Accounts |
| POST | `/tenant/mis/snapshots/run` `{locationId,date}` (Idem) | `mis.*` | Tenant Admin |

## Business rules and edge cases
- Snapshots are derived data. They're never edited by hand, and a re-run is idempotent.
- Back-dated postings, such as a reversal on an earlier date, mark that day stale. The next run recomputes stale days, up to 35 days back [DEFAULT, to confirm by research].
- **Doctor self-view:** the server filters by the caller's doctor id.
- **Small-number suppression:** none is needed, because there are no patient-level data in MIS.
- A module that isn't enabled (for example, OT on Basic) means its tiles are hidden, not shown as zero.
- The money totals have to match the source registers (IP and OP bill registers) for the same filters.

## Integrations
- Reads: OP and IP billing, ADT, Pharmacy and stores, OT, Payroll (cost), Linen and Maintenance (cost), Insurance (payer dues).
- Night Audit triggers the snapshots.
- Android A1 uses these APIs.

## Tier
Not in Sheet1. **OPEN – to confirm with Ajay Sheth.** No default tier is set. (OPEN-QUESTIONS-AJAY #15) Feature keys exist so App Admin can assign any tier once decided.
Android A1 uses the same feature keys.

## Acceptance criteria
- On seeded demo data, Overview and Revenue totals equal the OP and IP bill registers for the same day and location.
- A snapshot re-run is idempotent, and a back-dated reversal shows up after the next run.
- A Doctor role sees only their own row, and the API refuses other doctor ids with 403.
- Hidden tiles for un-entitled modules; `mis.cost_centre` returns 403 on Medium.
- RLS fixtures exist for all `mis_*` tables.

## Build order and tasks (migrations 1040–1049)
### MIS-T1 Snapshot tables and run log
- **Scope:** migration, RLS, and the `mis_run_snapshot(location, date)` skeleton.
- **Accept:** an idempotent re-run test.
- **Model:** grok.
- **Depends:** IPB-T2, SF-T2.
### MIS-T2 Revenue and census aggregations
- **Scope:** fill `mis_daily_revenue` and `mis_daily_census` from billing and ADT.
- **Accept:** reconciles with the bill register in a test.
- **Phase 2 fixture:** the 30-bed worked example in Research updates must reproduce exactly.
- **Model:** grok.
- **Depends:** MIS-T1.
### MIS-T3 Material, doctor and outstanding aggregations
- **Scope:** the remaining daily tables.
- **Accept:** matches the stock register and OP/IP outstanding.
- **Model:** grok.
- **Depends:** MIS-T1, SF-T4.
### MIS-T4 Cost-centre month
- **Scope:** direct-cost allocation by the default method (revenue by department to cost centre; material issues by department; payroll by employee department), documented as provisional.
- **Accept:** totals tie to inputs.
- **Model:** grok.
- **Depends:** MIS-T3, PAY tables optional.
### MIS-T5 MIS API and guards
- **Scope:** all GET routes, the doctor self-filter, and feature guards.
- **Accept:** the guard and self-view tests.
- **Model:** grok.
- **Depends:** MIS-T2, MIS-T3.
### MIS-T6 Web dashboards
- **Scope:** Overview plus 6 report screens with charts (restrained, per the design guide), drill-down to the register.
- **Accept:** all screens load on demo data; export works.
- **Model:** composer.
- **Depends:** MIS-T5.
