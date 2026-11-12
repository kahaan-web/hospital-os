# 06 · Doctors Accounting

Doc module "DOCTORS ACCOUNTING" [DOCS: ML #11]. Sheet module "Doctor Accounting" has 7 rows [DOCS: S1 r92–r94, r105–r108], all **Premium only** in Sheet1. Sheet3 marks all 7 as Medium+ [DOCS: S3 r104–r111], but Sheet1 wins (PLAN.md). Two related **Basic** reports live in billing: "Doctor Sharing / Detail" in OP [DOCS: S1 r29] and IP [DOCS: S1 r52]. Stage 2 in Sheet3 [DOCS: S3 r104]. Status: catalogue entry only [ARCH: handover appendix].

## Purpose
Work out what each doctor (mostly visiting consultants) earns from the services they performed or were credited with:
- set up the sharing rules;
- generate the payable for a period;
- issue the doctor invoice and payment statement;
- export to Excel. [DOCS: S1 r92–r94, r105–r108]

## Users and roles
- Accounts: runs the payables and statements.
- Tenant Admin: sets up the sharing rules.
- Doctor: views their own statement (web and A4).

[DEFAULT, to confirm by research]

## Workflows
1. **Setup Doctor Sharing.** [DOCS: S1 r92]
   - A rule per doctor (or doctor category) × service, service category or "all" × encounter type (OP/IP) × payer type (optional).
   - Share type: % of net, % of gross, or a fixed amount per unit.
   - Effective-dated.
   - The basis (gross vs net of concession, billing vs collection basis) is **OPEN – to confirm with Ajay Sheth** (OPEN-QUESTIONS-AJAY #39). No default is set. The engine must take the basis as a per-tenant setting with **no seed value**, and DA-T2 can't be accepted until it's decided.
2. **Generate Doctor Payable.** [DOCS: S1 r93]
   - For a period and location, for each settled charge line with doctor attribution (C2), apply the most specific active rule and write payable lines.
   - Runs in draft, then is approved and **locked**.
   - Reversals after the lock flow into the next period as negative lines.
3. **Doctor Invoice.** [DOCS: S1 r107] A per-doctor document for the period: lines and total. TDS on professional fees to visiting/consultant doctors: **10% under Income-tax Act 2025 s.393(1) Table Sl. 6(iii) (formerly s.194J), on the whole amount once the year's aggregate exceeds ₹50,000** (director fees: nil threshold). It's read from the shared `tds_sections` master (see 08), effective-dated, with per-doctor lower-deduction certificates. [VERIFIED: https://www.incometaxindia.gov.in/w/section-393-6]
4. **Doctor Payment Statement.** [DOCS: S1 r108]
   - Payments recorded against the approved payables (mode and reference, record only, no real payout).
   - Running balance per doctor.
   - Payment approval may route through Bill Passing [DEFAULT, to confirm by research].
5. **Reports.**
   - Doctor Transaction Details [DOCS: S1 r105] (line level).
   - Doctor Transaction Summary [DOCS: S1 r106] (by doctor, service category).
6. **Generate Excel Data.** [DOCS: S1 r94] An XLSX export of the payable lines and summaries for the period.
7. **Basic-tier sharing reports** [DOCS: S1 r29, r52] use the same rule engine in "preview" mode with no locking. If no rules exist, they show gross attribution.

## Screens
- `/app/doctor-accounting/rules`: a grid with filters and an effective-date history.
- `/app/doctor-accounting/runs`: create a run (period, location), review, approve and lock.
- `/app/doctor-accounting/runs/[id]`: lines per doctor, exceptions (charges without a doctor, no rule).
- `/app/doctor-accounting/doctors/[id]`: statement, invoices, payments.
- Reports: transaction details, transaction summary, doctor invoice (print), payment statement (print), Excel export.

## Data model
- `doctor_share_rules(doctor_id FK null, doctor_category null, service_id FK null, service_category null, encounter_type enum op|ip|any, payer_type null, share_type enum pct_net|pct_gross|fixed_per_unit, share_value int, effective_from, effective_to, priority int)`
- `doctor_payable_runs(location_id, period_from, period_to, status enum draft|approved|locked, approved_by, locked_at)`
- `doctor_payable_lines(run_id FK, doctor_id FK, charge_id FK, service_id FK, encounter_type, base_paise, share_paise, rule_id FK, is_adjustment bool)`, with UNIQUE (charge_id, doctor_id, is_adjustment, run_id)
- `doctor_invoices(run_id FK, doctor_id FK, invoice_no, gross_paise, tds_bp, tds_paise, net_paise)`
- `doctor_payments(doctor_id FK, invoice_id FK null, amount_paise, mode, mode_ref, paid_on, recorded_by)`, through the DB function `da_record_payment`

## APIs (module `doctor_accounting`)

| Method | Path | Feature | Roles |
|---|---|---|---|
| GET/POST/PATCH | `/tenant/doctor-accounting/rules` | `doctor_accounting.setup_doctor_sharing` [S1 r92] | Tenant Admin, Accounts |
| POST | `/tenant/doctor-accounting/runs` (Idem) ; POST `/runs/:id/{recompute,approve,lock}` | `doctor_accounting.generate_doctor_payable` [S1 r93] | Accounts |
| GET | `/tenant/doctor-accounting/runs/:id/export.xlsx` | `doctor_accounting.generate_excel_data` [S1 r94] | Accounts |
| GET | `/tenant/doctor-accounting/reports/transaction-details` | `doctor_accounting.doctor_transaction_details` [S1 r105] | Accounts; a Doctor sees self |
| GET | `/tenant/doctor-accounting/reports/transaction-summary` | `doctor_accounting.doctor_transaction_summary` [S1 r106] | Accounts; a Doctor sees self |
| GET | `/tenant/doctor-accounting/invoices/:id/print` | `doctor_accounting.doctor_invoice` [S1 r107] | Accounts; a Doctor sees self |
| POST | `/tenant/doctor-accounting/payments` (Idem); GET `/doctors/:id/statement` | `doctor_accounting.doctor_payment_statement` [S1 r108] | Accounts; a Doctor sees self |

The Basic reports stay at `/tenant/op-billing/reports/doctor-sharing` and `/tenant/ip-billing/reports/doctor-sharing` with their billing feature keys [S1 r29, r52] [VERIFY-REPO].

## Business rules and edge cases
- Most-specific rule wins: doctor + service > doctor + category > doctor + any > category-level. Ties are broken by `priority`. Two rules at the same specificity and priority are rejected when saved.
- A locked run is immutable. Late reversals become adjustment lines in the next run.
- A charge with no attributed doctor, or no matching rule, shows on the exceptions list and creates no payable.
- A payment can't exceed the outstanding approved payable for that doctor (422).
- Salaried doctors (on payroll) are usually excluded; there's a flag on the doctor master [DEFAULT, to confirm by research].
- Paying referral fees to doctors who refer patients is an ethics and legal risk. Gemini reports an NMC update ("Oct 2026") barring referral fees, pay-per-patient arrangements and purchased reviews. [RESEARCH-WEAK: Gemini, R8.5, nmc.org.in download 1874, no regulation number, verify] Referral-based rules therefore **stay disabled with no UI to enable them**, and the rules engine only supports doctors who **performed** the service.

## Integrations
- Reads OP and IP charges and settlements (C2).
- OT: surgeon and anaesthetist lines.
- Radiology and Lab: reporting-doctor lines.
- Bill Passing: optional payment approval.
- MIS: doctor performance.
- A4 Doctor portal: own statement.

## Tier (Sheet1)
- **Premium:** all 7 items [S1 r92–r94, r105–r108].
- **Basic and Medium:** only the billing "Doctor Sharing / Detail" reports [S1 r29, r52].

Sheet3 says Medium. The Sheet1/Sheet3 conflict is **OPEN – to confirm with Ajay Sheth.** (#24). Sheet1 is shown because PLAN.md names it the source of truth, but it is not treated as settled.

## Acceptance criteria
- With 3 rules (one specific, one category, one fixed per unit), a run over seeded charges produces the expected share per line in a unit test.
- Approve → lock. Then a reversal of a locked charge appears as a negative adjustment in the next run.
- The Excel export opens with the summary and detail sheets.
- A Doctor login sees only their own statement (403 for others).
- Feature guard: 403 on Medium for all 7 endpoints.

## Build order and tasks (migrations 1120–1129)
### DA-T1 Schema, rules CRUD, conflict validation and RLS
- **Model:** grok.
- **Depends:** IPB-T2 (charges with attribution).
### DA-T2 Rule engine and payable run
- **Scope:** draft, recompute, approve, lock, adjustments.
- **Accept:** engine unit tests; lock immutability.
- **Model:** grok.
- **Depends:** DA-T1.
### DA-T3 Invoices, payments DB function, statement and TDS config
- **Model:** grok.
- **Depends:** DA-T2.
### DA-T4 Reports and XLSX export
- **Scope:** also switch the OP/IP doctor-sharing reports to the engine preview.
- **Model:** grok.
- **Depends:** DA-T2.
### DA-T5 Web: rules grid, runs, doctor statement and print layouts
- **Model:** composer.
- **Depends:** DA-T3, DA-T4.
