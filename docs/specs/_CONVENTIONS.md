# Hospital OS module specs: conventions, tags and shared rules

Every spec in `/workspace/hmis-specs/` follows this file. Read it once before any module spec. Phase 1 is docs-backed only: written 12 Nov 2026 while the Dell (and so the live repo) was offline. No outside research was done for Phase 1. **Phase 2 (same day)** folded in Perplexity batches 1–2 and Gemini batches 3–8, plus 13 official-source checks. The tags `[GAP]` and `[DEFAULT]` that research answered are now `[RESEARCH…]`, `[VERIFIED…]` or `[CONFLICT…]`. Anything still tagged `[GAP]` or `[DEFAULT]` is still open.

## 1. Tag legend

| Tag | Meaning |
|---|---|
| `[DOCS: S1 rNN]` | Kahaan's tier spreadsheet `hmis-features-by-tier.xlsx`, **Sheet1** (the tier source of truth), spreadsheet row NN (row 1 is the header). The same rows are in `features-by-tier.csv`. |
| `[DOCS: S3 rNN]` | Sheet3 of the same workbook. Where Sheet1 and Sheet3 differ, specs show the Sheet1 value (PLAN.md calls Sheet1 the source of truth), but every such conflict is **OPEN – to confirm with Ajay Sheth** (OPEN-QUESTIONS-AJAY #24). |
| `[DOCS: ML #n]` | Kahaan's module list `hmis-modules.pdf` / `hmis-modules.txt`, "HMIS Group I Modules", item n. Most items are a **name only**. |
| `[DOCS: ML An]` | The same doc, "MOBILE APPS" section, app n with its bullet list. |
| `[ARCH: file]` | The existing Hospital OS architecture and conventions, taken from repo doc copies on the box (`/workspace/hos/CONTRACTS.md`, `phaseb-head.md`, `pb-B*.md`, `orchestrator-state.md`, `/workspace/hospital-os/staging/PLAN.md`, `PHASE_A_BRIEF.md`, `CLAUDE.md`, `/workspace/mt/MULTITENANCY_AUDIT.md`, `/workspace/handson/SECURITY_AND_COMPLIANCE.md`, `/workspace/hmis-handover/HMIS-handover.md`). These are constraints, not product requirements. |
| `[GAP: needs research]` | The docs are silent. The item is open, and a question for it is in `RESEARCH-QUESTIONS.md`. |
| `[DEFAULT, to confirm by research]` | The docs are silent, but a conservative, India-oriented default has been filled in so the spec stays build-ready. Build it as written, but keep it configurable and confirm it before production. |
| `[RESEARCH: <tool>, <source>]` | Phase 2. Outside research (Perplexity or Gemini) answered the item **with a specific citation**. Source keys (P1-n, P2-n, G3-n…) are listed in `RESEARCH-LOG.md`. Build as written. Rates stay configuration. |
| `[RESEARCH-WEAK: <tool>, verify]` | Phase 2. Research gave an answer, but with no citation, only a homepage, a vendor/blog source or a foreign source. Build it as **configuration with the research value as the seed**, never hard-coded, and verify it before production. |
| `[VERIFIED: <url>]` | Phase 2. Checked by me against an official text (gazette, CBIC, CBDT, IRDAI, EPFO/MoLE, ESIC, NACO, CDSCO, MeitY). See RESEARCH-LOG V1–V13. Values are still stored as **effective-dated configuration**, because the law changes. |
| `[CONFLICT: …]` | Phase 2. The tools disagree, or research disagrees with a Phase 1 default or an official text. Both positions are written down. The chosen seed is stated, and it stays configurable. |
| `OPEN – to confirm with Ajay Sheth` | Phase 2 steering rule (Kahaan, 12 Nov 2026). Product or doc-meaning questions owned by Kahaan's docs: module meanings, tiers missing from Sheet1, seats, Android add-ons, Sheet3 Stage/Status, blood centre mode, Sheet1 vs Sheet3 conflicts. **No default or guess is set.** Every item is numbered in `OPEN-QUESTIONS-AJAY.md`. `[DEFAULT]` remains only for pure engineering choices. |
| `[VERIFY-REPO]` | Depends on code that exists on the Dell but can't be read now (B3–B9, B6 in flight, Phase B plan). Check against `main` before building. |

**Shorthand and inheritance.**
- Inside tables and API rows, `[S1 rNN]`, `[S3 rNN]` and `[ML …]` without the `DOCS:` prefix mean the same as `[DOCS: …]`.
- When a module header says "everything functional is [DEFAULT, to confirm by research] unless tagged otherwise", every untagged workflow, screen, table, rule and tier line in that file carries that tag. Items that came from the docs are tagged explicitly.
- In docs-backed files (IP Billing, Doctor Accounting, the gap specs), an untagged item under a heading that cites Sheet1 rows comes from those rows. Implementation detail added to make it buildable (column names, state machines, limits) is a default unless it is tagged `[ARCH]`.

Typos are copied exactly from the docs where a doc label is quoted (for example "Satatisitcs", "WORKBANCH").

## 2. What the docs actually cover

- **Sheet1** (112 rows) gives function and report detail plus Basic/Medium/Premium flags for only 10 modules: Patient Registration, Doctor Appointment / Visit, OP Billing, ADT, IP Billing, Pharmacy, LAB, Nurse Station, Doctor Accounting and CPOE. [DOCS: S1]
- **The module list** names 27 Group I modules and 7 Android apps. Only the Android apps A1–A5 carry feature bullets. A6 (HR & Payroll) and A7 (Maintenance Tracker) are names only. [DOCS: ML]
- **So** 17 Group I modules have no feature list and no tier. In those specs, almost every functional item is `[DEFAULT, to confirm by research]` or `[GAP: needs research]`, and the tier is **OPEN – to confirm with Ajay Sheth**; no default tier is set (Phase 2 steering rule). Tiers stay editable in App Admin either way. [ARCH: PLAN.md decision 1]

## 3. Platform rules every module inherits [ARCH: CONTRACTS.md, phaseb-head.md, CLAUDE.md, MULTITENANCY_AUDIT.md]

**Data model**
- Every tenant-owned table has these columns:
  - `id uuid` (PK);
  - `tenant_id uuid not null`;
  - `UNIQUE (tenant_id, id)`;
  - `location_id uuid` where the record belongs to a branch;
  - `created_at`, `created_by` (user id), `updated_at`;
  - `is_sample boolean` on seedable rows.
- Every FK to another tenant table is **composite** `(tenant_id, x_id) → x(tenant_id, id)`.
- Table specs below list only the business columns. The standard columns are implied, and "FK" always means a composite FK.
- **FORCE RLS** on every table, with the policy `tenant_id = current_setting('app.tenant_id')::uuid`. Requests run in a transaction with `SET LOCAL app.tenant_id`. The app connects as `hos_app` (no BYPASSRLS). Platform writes use `hos_platform`.
- Every new table needs:
  - an RLS fixture in `tests/db-rls/fixtures/<module>.ts`, registered in `tests/db-rls/fixtures/index.ts`;
  - a row in the matrix in `tests/db/rls.test.ts`.

**Money**
- Amounts are integer paise (`*_paise bigint`). GST rates are in basis points (`gst_rate_bp`).
- Money writes go through **DB functions** (the bills-definer pattern) that take row locks with `SELECT … FOR UPDATE` and an idempotency key.
- `hos_app` cannot UPDATE or DELETE invoices or payments (migration 0020).
- Corrections are new rows (reversals, credit notes), never edits.

**Clinical GST**
- Clinical services are exempt, and rates are configuration (Phase B plan section 3.2). [VERIFY-REPO]
- **Healthcare services by a clinical establishment are Nil-rated (exempt)**: Entry 74, Notification 12/2017-CT(R). [VERIFIED: https://cbic-gst.gov.in/hindi/pdf/central-tax-rate/Notification12-CGST.pdf]
- **Room rent above ₹5,000 per day, other than ICU/CCU/ICCU/NICU**, is taxable at 5% (2.5% + 2.5%) with no ITC: Entry 31A, Notification 03/2022-CT(R), from 18 Jul 2022. The **whole** room charge is taxed, and exactly ₹5,000 is not. [VERIFIED: https://gstcouncil.gov.in/sites/default/files/2024-05/03_2022-ctr-eng_1.pdf]
- **Inpatient medicines, consumables and food** are part of the exempt composite healthcare supply. [RESEARCH: Perplexity, CGST Act s.2(30)/s.8; Kerala AAR (non-binding); Circular 32/06/2018]
- **OP and outside pharmacy sales** are taxable at the item's HSN rate, mostly 5% (some nil) from 22 Sep 2025 under Notifications 09/2025 and 10/2025-CT(R). [RESEARCH: Perplexity, P1-1 Delhi Drugs Control circular 22-09-2025]
- **Cosmetic or plastic surgery and hair transplant** (except reconstruction) are outside the exemption; 18% is the research figure. [VERIFIED for the exclusion, in the same notification's definitions; RESEARCH-WEAK for the rate]
- **Rule:** every service and item carries an **effective-dated** `gst_treatment` (exempt / taxable / room_rent_threshold) and a `gst_rate_bp`. The ₹5,000 threshold and the ICU exclusion are configuration rows (`tax_rules`), not code.

**API**
- Base `/api/v1`. Mutations need `x-hos-csrf: 1`.
- Money and booking POSTs need an `Idempotency-Key` and must be added to the list in `apps/api/src/http.ts`.
- Errors use the `{ error: { code, message, fields? } }` shape: 400, 401, 403 `not_entitled`, 404, 409, 422.
- Lists take `?page&pageSize&q&sort` and return `{ items, total, page, pageSize }`.
- Request bodies are zod schemas and response bodies are DTOs, both in `packages/shared`.

**Guards**
- Every tenant route is registered in `apps/api/src/route-guards.ts` (`TENANT_GUARDS`) with a permission, a module key and, where named, a feature key (`requireFeature`). Unregistered routes fail closed, and `route-inventory.test.ts` enforces this.

**Audit**
- Each mutation writes one row to the hash-chained `audit_log` (actor, tenant, location, IP, action, entity type and id, before and after).
- **No patient data in audit details**: ids, codes, amounts and states only, never names, diagnoses or results.
- Reading patient records is not audited yet. That's a known gap in the handover doc, and new clinical read routes should call the read-audit hook once it exists. [VERIFY-REPO]

**Data and privacy**
- Mock or sample data only. Seeds follow the CLAUDE.md naming rule: fictional Indian names, `is_sample`, `DEMO-` UHIDs, `00-` ABHA, `@sbx` emails and `+91 90000` mobiles.
- Patient data is sensitive health data under the DPDP Act 2023, and employee PII (PAN, Aadhaar, bank) is sensitive too.
- **DPDP timeline**:
  - The Rules were notified on 13 Nov 2025.
  - Rule 4 (Consent Managers) applies from **13 Nov 2026**.
  - Notice, consent, security, breach, retention and the other duties (Rules 3, 5–16, 22, 23) apply from **13 May 2027**.
  - **Breach:** tell the affected principals and the Board without delay, then send the Board a detailed report **within 72 h** (Rule 7).
  - **Security logs** are kept for **1 year** (Rule 6(1)(e)).

  [VERIFIED: https://egazette.gov.in/WriteReadData/2025/267647.pdf ; Rule 7 text https://www.dpdpa.in/dpdpa_rules_2025/dpdpa_rules_english_2.pdf]
- **Roles:** the hospital (tenant) is the **Data Fiduciary**, and Hospital OS is its **Data Processor** under contract. [RESEARCH: Gemini, EY/AMLEGALS (secondary)] The DPA template is a commercial and legal deliverable outside the code.
- **Retention beats erasure.** A DPDP erasure request doesn't override statutory retention, so the system shows "retained until <date> (statutory)" and purges after. [RESEARCH: Gemini, G8 NMC 2002 regs + Avinya] The retention table is configuration:

  | Record class | Seed retention | Tag |
  |---|---|---|
  | IP case records | 3 years from the start of treatment | [RESEARCH: Gemini, NMC/MCI Code of Ethics Regs 2002 1.3.1] |
  | Medico-legal case (MLC) records | 10 years or until final disposal | [RESEARCH-WEAK: Gemini, DGHS OM 2014, verify] |
  | PC-PNDT Form F and records | 2 years from the procedure (until disposal if litigation) | [VERIFIED: PC-PNDT Rules r.9(6), https://dhsr.hp.gov.in/Files/PC-PNDT%20RULES%20-1996_0.pdf] |
  | Schedule H1 register | 3 years | [VERIFIED: Drugs Rules r.65, CDSCO PDF] |
  | Blood bank registers | 5 years | [RESEARCH-WEAK: Gemini, vendor blog, verify] |
  | BMW records | 5 years | [RESEARCH-WEAK: Gemini, verify] |
  | Security / access logs | 1 year minimum | [VERIFIED: DPDP Rule 6(1)(e)] |
  | Tax invoices and accounts | per GST/IT law (seed 8 years) | [DEFAULT, to confirm by research] |
  - Field-level encryption is designed but not built [ARCH: handover §6].
  - Specs mark the columns that should use it once it exists, as `enc`.

**Formats**
- Dates show as DD/MM/YYYY, money as ₹ en-IN, in the IST timezone.
- UI follows `docs/DESIGN_GUIDE.md`: calm, dense tables, lucide icons, no "AI slop".

**Seats**
- Basic 8, Medium 25, Premium 80 users. New roles count against seats.

## 4. Naming used in these specs (proposed, [VERIFY-REPO])

The Phase B plan (`docs/PHASE_B_PLAN.md`) set the real module and feature keys, routes, migration ranges and the charge-capture contract. It isn't on the box, so these specs use the names below. Rename them to match `main` before building.

- **Module key:** snake_case, for example `ip_billing`, `ot`, `radiology`. **Feature key:** `<module_key>.<slug>`, one per Sheet1 row where the sheet has rows, for example `ip_billing.posting_charges`.
- **API path:** `/api/v1/tenant/<module-path>/…`. CONTRACTS.md reserved `/tenant/m/:moduleKey/*` for future modules, but Phase B may have used flat paths. Follow `main`.
- **Web route:** `/app/<module-path>/…` in `apps/web/src/app/app/`.
- **Files:** `packages/db` (schema plus `migrations/NNNN_<module>.sql`), `apps/api/src/routes/<module>.ts`, `packages/shared/src/<module>.ts` (zod plus DTO), `apps/web/src/app/app/<module>/**`, `apps/mobile/app/<app>/**`, `packages/db/src/seed-clinical/<module>.ts`, `tests/db-rls/fixtures/<module>.ts`.
- **Migration ranges** are proposed at 1000 and up (to clear 0028, 0900 and 0901). Each module reserves its range in INDEX.md. Use the next free number on `main`.
- **Number series:** use the shared numbering series built in B0 [VERIFY-REPO]. Per-location series in the form `<LOC>/<DOC>/<FY>/<seq>`. **GST documents must be at most 16 characters and unique per financial year, and cancelled numbers are never reused**: CGST Rules 46 and 49; the bill of supply also needs a consecutive serial. [RESEARCH: Perplexity, CGST Rules 46/49 (P1-12/13/28)] So the series uses short codes and fails validation if the configured pattern can exceed 16, for example `MUM/IP/2627/0001` (16). Every series has a **gap report**. The SaaS invoice format `HOS/2627/000001` belongs to the platform only.

## 5. Roles

- **Existing (9):** Tenant Admin, Location Admin, Front Desk, Doctor, Nurse, Cashier/Billing, Pharmacist, Lab Tech, Accounts. [ARCH: PHASE_A_BRIEF §3]
- **Proposed new roles** for pending modules, each a configurable permission bundle [DEFAULT, to confirm by research]:
  - OT Coordinator, Radiologist, Radiology Tech;
  - Insurance/TPA Desk;
  - Store Keeper, Purchase Officer;
  - Blood Bank Officer (Medical Officer), Blood Bank Tech;
  - Linen Supervisor;
  - Biomedical Engineer, Maintenance Staff, Maintenance Supervisor;
  - HR/Payroll Officer;
  - Marketing Executive;
  - Grievance Officer;
  - Employee (self-service: attendance, payslip, complaints);
  - MIS Viewer (management, read-only).
- Self-service Employee users would quickly exhaust the seat limits, so whether they count as seats is `[GAP: Kahaan decision R9.3]` (a commercial decision; research can't answer it).

## 6. Cross-module contracts used by these specs

- **C1 Charge capture:** `billing.post_patient_charge(tenant, encounter_id, service_id, qty, unit_price_paise, source_module, source_ref_id, ordered_by, performed_by, idem_key)`, a DB function that returns `charge_id`. OT, radiology, lab, pharmacy IP issues, blood bank, bed charges (night audit) and medicard all post through it. Reversal is `billing.reverse_patient_charge(charge_id, reason, idem_key)`. B0/B5/B6 may already define this. [VERIFY-REPO]
- **C2 Doctor attribution:** every charge carries `performed_by_doctor_id` / `referring_doctor_id`, so Doctor Accounting can compute shares. [DEFAULT, to confirm by research]
- **C3 Stock movement:** `inventory.move_stock(store_id, item_id, batch_id, qty, movement_type, ref, idem_key)`, a single stock ledger for pharmacy and general stores (B7 has a pharmacy ledger). [VERIFY-REPO]
- **C4 Notification outbox:** `notify(channel: sms|email|whatsapp|push, template_key, to_ref, vars)` writes to an outbox. The mock provider only logs. Patient messages need a purpose-tagged consent check. [DEFAULT, to confirm by research]
- **C5 Attachments:** `attachments(entity_type, entity_id, object_key, mime, size, sha256)`, with local storage in dev. [DEFAULT, to confirm by research]
- **C6 Reports:** every report takes a date range, location filter, on-screen table, print HTML/PDF and CSV/XLSX export. Exports are a mutation-like event and get audited as `report.export` with no row contents. [DEFAULT, to confirm by research]

## 7. Task sizing

Each task is about half a day for one Grok (logic, DB or API heavy) or Composer (UI heavy) worker. Each lists:
- **Scope;**
- **Files/areas;**
- **Accept** (narrow, testable);
- **Model;**
- **Depends.**

Standard "done" for every task:
- typecheck of touched workspaces;
- vitest for touched paths green, with the worker's own `HOS_TEST_DB`;
- RLS fixture added;
- routes registered in `TENANT_GUARDS`;
- whole-repo `npm test` green;
- everything committed.
