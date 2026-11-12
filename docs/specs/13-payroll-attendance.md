# 13 · Payroll & Attendance

Doc module "PAYROLL & ATTENDANCE" [DOCS: ML #20]. Android app "ANDROID MOBILE: HR & PAYROLL" [DOCS: ML A6]. **Both are names only.** All functional and statutory content is [DEFAULT, to confirm by research] or [GAP: needs research]. That includes PF, ESI, Professional Tax by state (the PDF names Maharashtra, Madhya Pradesh and Rajasthan locations [DOCS: ML title]), LWF, TDS on salary, gratuity, bonus, and the status of the new labour codes. Phase 2 answered these; see Research updates.

**Statutory computation must not ship to a real customer until the payroll research batch is answered.** Phase 2 status: **EPF and ESI are verified** against official sources and can be seeded with `is_placeholder=false`. **PT, LWF, TDS-on-salary details, leave norms and gratuity are still weak**, so those rows stay `is_placeholder=true` with the banner. All rates are effective-dated configuration rows; nothing is hard-coded.

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md` for the sources and the verification detail. [DOCS] items above and below are unchanged.

- **Labour Codes** (R6.1): the Code on Social Security 2020 (which subsumes the EPF and ESI Acts) has been **in force since 21 Nov 2025**. [VERIFIED: Lok Sabha Unstarred Q.1345, 27.07.2026, https://sansad.in/getFile/lsapps/loksabhaquestions/annex/188/AU1345_TBAsOH.pdf] [RESEARCH: Gemini, Mercans/KPMG, for all four codes from 21 Nov 2025, with central rules by May 2026]
  - The **50% wage rule**: "wages" for PF, ESI, gratuity and bonus are basic + DA + retaining allowance. If the excluded allowances (HRA, special and so on) exceed **50% of total remuneration**, the excess is added back into wages. [RESEARCH-WEAK: Gemini, Mercans (secondary), verify against Code on Wages s.2(y)]
  - This adds a **wage-definition step** to PAY-T4: `statutory_wage = basic + da + retaining + max(0, excluded − 50% × total)`.
- **EPF** (R6.2):
  - wage ceiling **₹25,000/month from 17 Sep 2026** (S.O. 5109(E), superseding S.O. 2702(E) of 29 May 2026; the previous ₹15,000 dated from Sep 2014);
  - employee **12%**;
  - employer 12%, split **8.33% to EPS (capped at 8.33% × ₹25,000 = ₹2,082.50, rounded per EPFO rules)** with the balance (3.67%) to EPF.

  [VERIFIED: https://www.labour.gov.in/static/uploads/2026/09/2b0f1dbbd3769fc388416186ec145328.pdf ; PIB https://www.pib.gov.in/PressReleasePage.aspx?PRID=2314111] [RESEARCH: Gemini, KPMG flash alert 2026-253]

  **Mid-month change:** September 2026 wages straddle the change, so the ceiling is effective-dated, and the engine applies the rule active on the wage-period end date (configurable `apply_on enum period_end|pro_rata`; seed period_end). **This needs a CA or EPFO FAQ check.** [CONFLICT: none between the tools; the open point is the method]

  Still open: the **EDLI** rate and admin charges (Gemini omitted them), and the **ECR file layout** (columns, delimiter). Those rows are placeholders; the ECR export is a later task once the layout is verified from the EPFO ECR user guide.
- **ESI** (R6.3):
  - employee **0.75%**, employer **3.25%**;
  - coverage up to **₹21,000** gross/month (**₹25,000 for persons with disability**);
  - employees at **₹176/day or less** pay no employee share, but the employer still pays its share;
  - contribution periods **Apr–Sep and Oct–Mar**: an employee covered at the start of a period stays covered for the whole period even if their wages cross the ceiling;
  - pay by the 15th of the following month.

  [VERIFIED: https://esic.gov.in/contribution ; ESIC Standard Note 01.01.2026] [RESEARCH: Gemini, SharDhan]
- **Professional Tax and LWF** (R6.4):
  - **Maharashtra:** ₹200/month (₹300 in February); women exempt up to ₹25,000/month (Gemini's wording).
  - **MP:** ₹208 × 11 + ₹212 for income over ₹3 lakh/year; the lower slabs were not given.
  - **Rajasthan:** **no PT**.
  - LWF: Maharashtra half-yearly (June/December); MP "periodic"; Rajasthan "largely inapplicable".
  - **The full slabs and LWF amounts are missing.**

  [RESEARCH-WEAK: Gemini, factoHR/Tradeviser, verify against the MH/MP PT Acts and LWF Acts] All PT and LWF rows stay `is_placeholder=true`.
- **TDS on salary** (R6.5): from **1 Apr 2026**, under the **Income-tax Act 2025 (s.392)**; new regime default with a ₹75,000 standard deduction; quarterly statement Form 138 (replacing 24Q) and new challan codes. [RESEARCH-WEAK: Gemini, Finin2min, verify] [VERIFIED (partly): the s.393 text excludes salary "on which tax is deductible under section 392", which is consistent] v1 keeps the **declared-regime monthly projection** as configuration (slabs as rows) and **doesn't generate Form 138/16** (out of scope).
- **Working hours, OT and paid days** (R6.6): 8 h/day, 48 h/week; 30-minute rest after 5 h; overtime at **2×** the ordinary rate, max **144 h/quarter** (OSH rules); daily minimum wage = monthly ÷ **26**. [RESEARCH-WEAK: Gemini, Wisemonk, verify]
- **Leave** (R6.7): Maharashtra S&E gives **18 days EL** (after 240 days worked) and **8 days CL**; SL is hospital policy. MP and Rajasthan weren't given. [RESEARCH-WEAK: Gemini, Wisemonk] Leave types are seeded **per state** as configuration.
- **Exit** (R6.8): wages due on exit are paid within **2 working days** (Code on Wages s.17(2)); gratuity within **30 days**; **fixed-term staff get pro-rata gratuity after 1 year**. [RESEARCH-WEAK: Gemini, Wisemonk, verify] F&F gets due-date tracking.
- **Biometric and geofenced attendance** (R6.10): explicit consent and purpose limitation under DPDP; **biometric templates aren't stored by us** (the device keeps them; we import punches only); location only at punch time, never tracked continuously. [RESEARCH-WEAK: Gemini, HelloTime] DPDP duties apply from 13 May 2027. [VERIFIED: V10]

## Purpose
Run hospital staff attendance (shifts and rosters, especially nursing), leave, and monthly payroll with statutory deductions, payslips and registers.

## Users and roles
- HR/Payroll Officer (new): masters, payroll runs.
- Department head / Nursing Superintendent: rosters, leave approval.
- Employee (new self-service role): attendance on mobile, leave requests, payslips (A6).
- Accounts: salary payment records.
- Tenant Admin: approves payroll.

## Workflows
1. **Employee master.** From SF-T5: joining date, department, designation, employment type, statutory ids `enc`, bank `enc`.
2. **Salary structure.** Components (Basic, DA, HRA, special allowance, night-shift allowance, other allowances; deductions) with a calculation type: fixed, % of another component, or per-day/per-shift. Assigned per employee with an effective date.
3. **Shifts and rosters.** Shift master (Morning, Evening, Night, General) and a weekly roster per ward or department. Night-shift counts feed allowances.
4. **Attendance capture:**
   - a biometric device CSV import with a **column-mapping template per vendor** (no vendor formats researched, so mapping is configuration [GAP: still open]). We never import or store biometric templates, only punches. [RESEARCH-WEAK: Gemini, R6.10]
   - mobile check-in on A6 (optional geofence to the location);
   - manual entry by HR, with a reason.

   Daily status: present, absent, half-day, on leave, week-off, holiday, on duty.
5. **Leave.** Leave types with entitlements per year **seeded per state**: Maharashtra EL 18 (accrual 1 per 20 days worked, eligibility after 240 days) and CL 8 [RESEARCH-WEAK: Gemini, R6.7]; SL by hospital policy [DEFAULT]; MP and RJ seeded as placeholders [GAP: still open]. Accrual and carry-forward rules are config, with an apply → approve/reject flow.
6. **Monthly payroll run:**
   - lock attendance for the month → compute paid days → gross by component;
   - statutory deductions from the config tables (PF, ESI, PT by state, LWF, TDS);
   - other deductions (advances, loans);
   - net pay.

   The run goes draft → review → approved → **locked**. Arrears and corrections go into the next month.
7. **Outputs:**
   - payslip PDF (A6 and web);
   - salary register;
   - bank transfer CSV (record only, no bank integration);
   - statutory summaries: PF (EE/ER/EPS split per employee), ESI (EE/ER, contribution period), PT and LWF. **The PF ECR text-file layout is still open** (R6.2; take it from the EPFO ECR guide); ESI and PT return formats are open too. v1 exports summaries as XLSX/CSV, and the ECR file is a follow-up task (PAY-T8);
   - Form 16 is out of scope for v1.
8. **Full and final settlement** at exit: wages due within **2 working days** of the last day; gratuity within **30 days**; gratuity eligibility 5 years (permanent), or **pro-rata after 1 year for fixed-term**. The formula (15/26 × last wages × years) is configuration. [RESEARCH-WEAK: Gemini, R6.8, verify] F&F due dates appear on the HR dashboard.

## Screens
- `/app/hr/employees` (shared master view with HR fields).
- `/app/hr/salary-structures`.
- `/app/hr/shifts`, `/app/hr/rosters` (a grid of employees × days).
- `/app/hr/attendance`: daily view, monthly grid, imports.
- `/app/hr/leave`.
- `/app/hr/payroll`: runs → run detail with an employee table, exceptions and approve/lock.
- `/app/hr/statutory-config`: rates by effective date and state; only the HR/Payroll Officer can edit them.
- Reports: salary register, attendance muster, leave register, PF/ESI/PT summaries, payroll cost by department (for MIS).

## Data model
- `salary_components(code, name, kind enum earning|deduction, calc enum fixed|percent_of|per_day|per_shift, base_component_id FK null, taxable bool, pf_wage bool, esi_wage bool)`
- `employee_salary(employee_id FK, effective_from, components jsonb [{component_id, value}], ctc_paise)`
- `shifts(location_id, code, name, start_time, end_time, is_night bool)` and `rosters(location_id, department_id FK, employee_id FK, date, shift_id FK)`, with UNIQUE (tenant_id, employee_id, date, shift_id)
- `attendance_punches(employee_id FK, punched_at, source enum device|mobile|manual, device_ref, lat null, lng null, reason null)`
- `attendance_days(employee_id FK, date, status enum present|absent|half_day|leave|week_off|holiday|on_duty, shift_id FK null, worked_minutes, overtime_minutes, locked bool)`, with UNIQUE (employee_id, date)
- `leave_types(code, name, annual_quota, carry_forward_max, encashable bool)`, `leave_balances(employee_id FK, leave_type_id FK, year, opening, accrued, used)`, and `leave_requests(employee_id FK, leave_type_id FK, from_date, to_date, half_day bool, reason, status, approver_user_id)`
- `statutory_rates(code enum pf_ee|pf_er|eps|edli|esi_ee|esi_er|pt|lwf_ee|lwf_er, state_code null, effective_from, effective_to null, wage_ceiling_paise null, rate_bp null, slabs jsonb null, params jsonb null, is_placeholder bool, source_ref)`. Phase 2 seed:

  | code | ceiling | rate | from | placeholder | source |
  |---|---|---|---|---|---|
  | pf_ee | ₹15,000 | 1200 bp | 2014-09-01 → 2026-09-16 | false | historical |
  | pf_ee | ₹25,000 | 1200 bp | 2026-09-17 | false | V5 |
  | eps | ₹25,000 | 833 bp | 2026-09-17 | false | V5 |
  | pf_er (EPF part) | ₹25,000 | 367 bp (= 12% − EPS) | 2026-09-17 | false | V5 |
  | edli, admin | — | — | — | **true** | open |
  | esi_ee | ₹21,000 (PwD ₹25,000) | 75 bp; exempt ≤ ₹176/day | 2019-07-01 | false | V6 |
  | esi_er | ₹21,000 (PwD ₹25,000) | 325 bp | 2019-07-01 | false | V6 |
  | pt MH | slabs (₹200; Feb ₹300; women exempt ≤ ₹25k) | — | — | **true** | R6.4 weak |
  | pt MP | slabs (₹208×11 + ₹212 above ₹3L/yr; lower slabs missing) | — | — | **true** | R6.4 weak |
  | pt RJ | none | — | — | **true** (verify) | R6.4 weak |
  | lwf MH/MP/RJ | — | — | — | **true** | open |

  `params` carries `esi_contribution_periods`, `esi_daily_exempt_paise`, `labour_code_wage_rule {excluded_cap_bp: 5000}`, `pf_restrict_to_ceiling` (employer choice), and `ceiling_apply_on`.
- `payroll_runs(location_id null, month, status enum draft|review|approved|locked, approved_by, locked_at)` and `payroll_lines(run_id FK, employee_id FK, paid_days, earnings jsonb, deductions jsonb, gross_paise, total_deductions_paise, net_paise, employer_contrib jsonb)`, with UNIQUE (run_id, employee_id)
- `salary_advances(employee_id FK, amount_paise, given_on, emi_paise, balance_paise)`
- Payroll lines and the money tables are written only by `pay_compute_run` and `pay_lock_run` (DB functions).

## APIs (module `payroll`; features `payroll.attendance`, `payroll.leave`, `payroll.payroll`, `payroll.statutory`, `payroll.self_service` [DEFAULT, to confirm by research])

| Method | Path | Feature | Roles |
|---|---|---|---|
| GET/POST/PATCH | `/tenant/hr/salary-components`, `/tenant/hr/employees/:id/salary` | payroll.payroll | HR Officer |
| GET/POST | `/tenant/hr/shifts`, `/tenant/hr/rosters` (bulk PUT) | payroll.attendance | HR, Dept head |
| POST | `/tenant/hr/attendance/import` (CSV, dry-run) | payroll.attendance | HR |
| POST | `/tenant/hr/attendance/punch` | payroll.self_service | Employee (self) |
| GET/PUT | `/tenant/hr/attendance?month&employeeId` ; POST `/attendance/lock` | payroll.attendance | HR |
| GET/POST | `/tenant/hr/leave-requests` ; POST `/:id/{approve,reject,cancel}` | payroll.leave | Employee, Dept head |
| POST | `/tenant/hr/payroll-runs` ; POST `/:id/{compute,submit,approve,lock}` (Idem) | payroll.payroll | HR; Tenant Admin approves |
| GET | `/tenant/hr/payroll-runs/:id/{register.xlsx,bank.csv}` | payroll.payroll | HR, Accounts |
| GET | `/tenant/hr/payslips/:runId/:employeeId.pdf` | payroll.self_service / payroll.payroll | Employee (self), HR |
| GET/PUT | `/tenant/hr/statutory-rates` | payroll.statutory | HR Officer |
| GET | `/tenant/hr/reports/{muster,leave,pf,esi,pt,cost-by-dept}` | payroll.statutory / payroll.payroll | HR |

## Business rules and edge cases
- A locked month is immutable. Corrections are arrears lines in a later run.
- Paid days = present + paid leave + week-offs/holidays per policy. The month-days basis is configurable (`calendar|fixed_26|fixed_30`). Seed **calendar days**. [CONFLICT: research says the minimum-wage **daily rate** uses ÷26 (RESEARCH-WEAK: Gemini, R6.6). That's kept separate: the minimum-wage compliance check uses ÷26, while LOP deduction follows the tenant's basis.]
- **Statutory wage** (Labour Codes): PF/ESI/gratuity wages = basic + DA + retaining allowance, plus any excluded allowances above 50% of total remuneration. [RESEARCH-WEAK: Gemini, R6.1] [VERIFIED: codes in force]
- **ESI period lock:** an employee within the ceiling at the start of a contribution period (Apr or Oct) keeps deducting ESI to the period end, even after a raise. [VERIFIED: esic.gov.in contribution periods; RESEARCH: Gemini, R6.3]
- **Overtime** = 2× the ordinary hourly rate, capped at 144 h/quarter with a warning. [RESEARCH-WEAK: Gemini, R6.6] Rest of 30 min after 5 h is a roster warning.
- Deductions can't push net pay below 0. An advance EMI is skipped with a warning if it would.
- Rosters: an employee can't have overlapping shifts on the same date. Rest between a night shift and the next morning shift gives a warning [DEFAULT, to confirm by research].
- Mobile punch: one punch-in and one punch-out per shift. Duplicates within 5 minutes are ignored. The geofence is optional.
- Employee PII and salary are sensitive personal data:
  - PAN, UAN, ESIC, bank, and salary amounts are visible only to HR/Payroll and the employee themselves;
  - audit holds ids only;
  - exports are audited.
- Doctors who are consultants aren't on payroll; they're paid through Doctor Accounting.
- Self-service employees counting against seat limits is a commercial decision for Kahaan (**R9.3**); research doesn't answer it.

## Integrations
- Employees master (SF-T5).
- Users (an employee may log in).
- MIS: payroll cost by cost centre.
- Doctor Accounting: exclude salaried doctors.
- Nurse Station: the roster gives the on-duty nurse.
- A6 Android.

## Tier
Not in Sheet1. **OPEN – to confirm with Ajay Sheth.** No default tier is set. (OPEN-QUESTIONS-AJAY #11) Feature keys exist so App Admin can assign any tier once decided.

## Acceptance criteria
- With placeholder rates, a 3-employee run (one with an advance, one with 2 days LOP) computes as the expected fixtures. Lock → payslip PDFs. Re-compute after the lock returns 409.
- A biometric CSV dry-run reports bad rows without writing anything. Commit creates punches and day statuses.
- An employee sees only their own payslips and attendance (403 otherwise).
- A placeholder statutory rate shows a "placeholder — confirm before use" banner on every payroll screen.
- (Phase 2) For an October 2026 run: an employee with basic + DA of ₹30,000 and `pf_restrict_to_ceiling = true` → PF wage ₹25,000, employee ₹3,000, EPS ₹2,083 (rounded), EPF employer ₹917. The same employee in an August 2026 run → PF wage ₹15,000, employee ₹1,800, EPS ₹1,250, employer EPF ₹550.
- (Phase 2) ESI: gross ₹20,000 → EE ₹150, ER ₹650. A raise to ₹22,000 in November still deducts ESI until March (period lock). A daily wage of ₹170 → EE ₹0, ER still charged.
- (Phase 2) Labour-code wage: basic ₹10,000 + HRA ₹8,000 + special ₹7,000 (total ₹25,000; excluded ₹15,000 = 60%) → statutory wage ₹10,000 + (₹15,000 − ₹12,500) = ₹12,500.
- RLS fixtures exist. No salary figures in the audit log.

## Build order and tasks (migrations 1260–1279)
### PAY-T1 Components, salary structures, statutory rate tables (placeholder seed) and RLS
- **Model:** grok.
- **Depends:** SF-T5.
### PAY-T2 Shifts, rosters, punches, CSV import and day-status derivation
- **Model:** grok.
- **Depends:** PAY-T1.
### PAY-T3 Leave types, balances and request flow
- **Model:** grok.
- **Depends:** PAY-T1.
### PAY-T4 Payroll compute engine
- **Scope:** earnings, the **labour-code statutory wage step**, statutory from effective-dated config (EPF ceiling change on 17 Sep 2026, ESI period lock, PwD ceiling, ₹176/day exemption), OT 2× cap warning, advances, net. `pay_compute_run` / `pay_lock_run`. (Phase 2 scope)
- **Accept:** fixture tests, including the 3 Phase 2 acceptance examples.
- **Model:** grok.
- **Depends:** PAY-T2, PAY-T3.
### PAY-T5 Outputs
- **Scope:** payslip PDF, register XLSX, bank CSV, statutory summaries.
- **Model:** grok.
- **Depends:** PAY-T4.
### PAY-T6 Web: HR masters, rosters grid and attendance
- **Model:** composer.
- **Depends:** PAY-T2.
### PAY-T7 Web: leave, payroll runs, statutory config, reports and seed
- **Model:** composer.
- **Depends:** PAY-T3 to PAY-T5.
### PAY-T8 PF ECR file and ESI/PT return exports (Phase 2, research-gated)
- **Scope:** generate the EPFO ECR text file and the ESI monthly contribution upload file from a locked run.
- **Gate:** the file layouts must be taken from the official EPFO ECR user guide and the ESIC portal format (R6.2/R6.3 sub-parts still open). Until then, this task is **held**.
- **Model:** grok.
- **Depends:** PAY-T5.
