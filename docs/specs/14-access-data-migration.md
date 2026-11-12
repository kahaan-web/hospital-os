# 14 · Access Data Migration

Doc module "ACCESS DATA MIGRATION" [DOCS: ML #22]. It's a **name only**. What it means isn't in the docs. Research (R8.8) says MS Access (.mdb/.accdb) is common in older Indian hospital set-ups, which is consistent with the MS Access reading (not a decision) [RESEARCH-WEAK: Gemini, no source]. Meaning: **OPEN – to confirm with Ajay Sheth** (#26). PLAN.md asked Kahaan: "is Access Data Migration about MS Access?" (open question 10). The Sheet1 Status values (Change / No Change / New) suggest an existing legacy system [ARCH: PLAN.md ambiguity notes].

Meaning **OPEN – to confirm with Ajay Sheth** (#26). The text that follows is a *candidate reading only*, kept so work can start fast once confirmed. It is **not a decision**: no task in this module may be built on it until the meaning is confirmed. Candidate reading: **import a hospital's data from its legacy system (likely a Microsoft Access database) at onboarding**, through a generic, validated, reversible import pipeline. CSV/XLSX upload comes first. Reading a `.mdb`/`.accdb` file directly is an optional later task.

**Data rule:** no real patient data until Kahaan approves production go-live [ARCH: CLAUDE.md]. Until then the importer only accepts files from tenants flagged `sandbox`, and only sample files are used. Enforce this on the server.

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md` for the sources and the verification detail. [DOCS] items above and below are unchanged.

R8.8. [RESEARCH-WEAK: Gemini, no source]
- **Dedup:** exact match on **mobile + name** (or ABHA if present) before import. That's looser than Phase 1's rule. [CONFLICT: Phase 1 uses mobile + name + DOB. Keep Phase 1 as the **auto-merge** rule, and use research's mobile + name as a **"possible duplicate" review** rule.]
- **Financial cut-over:** don't import invoice history; import the **outstanding A/R as one opening-balance entry per patient/TPA**. This confirms the Phase 1 scope.
- **Inventory:** a **physical stock count before go-live**; import the current stock as opening batches, not legacy POs. This confirms the Phase 1 scope, and adds a "stock count sign-off" checkbox (who counted, date) to the opening-stock batch.
- **Retention:** imported legacy clinical records inherit the statutory retention table (_CONVENTIONS); a DPDP erasure request doesn't purge them early. [RESEARCH: Gemini, R8.2]

## Purpose
Move masters, open balances and history from a legacy HMIS into Hospital OS:
- without retyping;
- with mapping, validation, a dry run, a commit and per-batch rollback;
- with a full audit trail.

PLAN.md's go-live checklist names "optional Access data migration import" [ARCH: PLAN.md §2].

## Users and roles
- Tenant Admin: runs imports.
- Platform App Admin: can run an assisted import for a tenant. This needs the hos_platform role and an audited reason.
- Accounts: approves the opening balances.

## Workflows
1. **Choose entity:**
   - doctors;
   - departments;
   - services/tariff;
   - suppliers;
   - items and opening stock (with batch/expiry);
   - patients (demographics only);
   - patient outstanding balances;
   - supplier outstanding;
   - employees;
   - equipment;
   - payers.

   Visit and clinical history import stays **out of scope** for v1 (research gave no legacy-format detail; still [GAP]).
2. **Upload** CSV/XLSX (a template can be downloaded per entity). Optionally upload a `.mdb`/`.accdb`, converted on the server to CSVs. The library choice and its safety are [GAP: needs research].
3. **Map columns.** Auto-suggest by header name. Saved mapping profiles are reusable.
4. **Validate (dry run).** Per row: required fields, formats (mobile, GSTIN, dates DD/MM/YYYY), referential lookups (department code exists), duplicates (patient matching on mobile + name + DOB), and value ranges. The output is an error report with row numbers.
5. **Commit.** Valid rows are inserted in a single transaction per batch. Legacy ids are kept in `external_refs`. UHIDs: keep the legacy number as an alias and issue a new UHID from the series [DEFAULT, to confirm by research].
6. **Rollback.** A batch can be rolled back only if none of its rows were referenced afterwards (for example, no bill against an imported patient). Otherwise rollback is blocked with a list of the blockers.
7. **Opening balances** post through the proper DB functions (stock through C3 `opening` movements, outstanding through billing functions) on the cut-over date.

## Screens
- `/app/settings/data-import`: entity cards with status.
- `/app/settings/data-import/new`: upload → map → validate (error grid, download errors CSV) → commit.
- `/app/settings/data-import/batches/[id]`: summary, rows, rollback.

## Data model
- `import_batches(entity, file_name, file_sha256, row_count, valid_count, error_count, status enum uploaded|mapped|validated|committed|rolled_back|failed, mapping_profile_id FK null, cutover_date null, committed_by, committed_at)`
- `import_mapping_profiles(entity, name, mapping jsonb)`
- `import_rows(batch_id FK, row_no, raw jsonb enc, normalized jsonb enc, errors jsonb, status enum valid|invalid|committed|skipped, target_id uuid null)`. Raw patient rows are `enc` and **purged N days after commit** (default 30) [DEFAULT, to confirm by research].
- `external_refs(entity, target_id, legacy_system, legacy_id)`, with UNIQUE (tenant_id, entity, legacy_system, legacy_id)

## APIs (module `data_migration`; feature `data_migration.import` [DEFAULT])

| Method | Path | Roles |
|---|---|---|
| GET | `/tenant/data-import/templates/:entity.csv` | Tenant Admin |
| POST | `/tenant/data-import/batches` (multipart) | Tenant Admin |
| PUT | `/tenant/data-import/batches/:id/mapping` | Tenant Admin |
| POST | `/tenant/data-import/batches/:id/validate` | Tenant Admin |
| GET | `/tenant/data-import/batches/:id/rows?status=invalid` ; `/errors.csv` | Tenant Admin |
| POST | `/tenant/data-import/batches/:id/commit` (Idem) | Tenant Admin (+Accounts for balances) |
| POST | `/tenant/data-import/batches/:id/rollback` (Idem) | Tenant Admin |
| POST | `/admin/tenants/:id/data-import/...` (assisted) | App Admin (hos_platform, reason required) |

## Business rules and edge cases
- The file limit is 20 MB / 100k rows per batch [DEFAULT, to confirm by research]. Larger files need splitting.
- Sandbox-only guard until go-live (returns 422 with code `real_data_blocked`).
- Commit is all-or-nothing per batch. Re-uploading the same file (by sha256) warns about a possible duplicate.
- Patient dedupe: exact match → skip with a link. Fuzzy match → flag for review, never auto-merge.
- Imported rows carry `is_sample` from the tenant's sandbox flag.
- Audit: one row per batch action (counts only, no row contents).
- Imports can't bypass RLS: all writes run as `hos_app` in a tenant transaction.

## Integrations
- Shared Foundations (SF-T8 CSV import reuses this pipeline).
- Registration (patients).
- Stores (opening stock).
- Billing (opening outstanding).
- Payroll (employees).
- Equipment.
- Onboarding go-live checklist.

## Tier
Not in Sheet1. **OPEN – to confirm with Ajay Sheth.** No default tier is set. (OPEN-QUESTIONS-AJAY #12) Feature keys exist so App Admin can assign any tier once decided.
Whether assisted import is a paid service: **OPEN – to confirm with Ajay Sheth.**

## Acceptance criteria
- A sample patients CSV of 200 rows with 7 bad rows: the dry run lists exactly the 7 errors, commit inserts 193 with legacy ids, and a rollback before any use removes all 193.
- Rollback is blocked once one imported patient has a bill.
- A non-sandbox tenant gets 422 `real_data_blocked`.
- Opening stock import creates `opening` ledger movements and the correct balances.
- RLS fixtures exist. Raw rows are purged after the retention window (job test).

## Build order and tasks (migrations 1280–1289)
### DM-T1 Batch, row and mapping schema, upload, CSV/XLSX parse, sandbox guard and RLS
- **Model:** grok.
- **Depends:** SF-T7.
### DM-T2 Validation framework and entity validators
- **Scope:** patients, doctors, services, suppliers, items.
- **Model:** grok.
- **Depends:** DM-T1, SF-T2 to SF-T6.
### DM-T3 Commit and rollback, external refs, opening stock and outstanding through the DB functions
- **Model:** grok.
- **Depends:** DM-T2.
### DM-T4 Remaining entity validators
- **Scope:** employees, equipment, payers, supplier outstanding; the purge job.
- **Model:** grok.
- **Depends:** DM-T3.
### DM-T5 Web: the import wizard (upload, map, validate grid, commit, batch history, rollback)
- **Model:** composer.
- **Depends:** DM-T3.
### DM-T6 Optional Access file conversion
- **Scope:** `.mdb`/`.accdb` → CSVs on the server, as a spike behind a flag.
- **Model:** grok.
- **Depends:** DM-T3. Run only after research confirms the MS Access meaning.
