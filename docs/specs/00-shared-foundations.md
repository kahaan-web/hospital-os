# 00 · Shared foundations for the pending modules (masters before transactions)

Read `_CONVENTIONS.md` first. This isn't a doc module. It collects the masters and contracts that three or more pending modules need, so they're built once, before the modules that use them. Some may already exist from B0/B5/B7 [VERIFY-REPO]. Task SF-T1 is an audit that decides what to reuse.

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md` for the sources and the verification detail. [DOCS] items above and below are unchanged.

- **Tax rules.** GST treatment is per service and per item, and effective-dated (exempt / taxable / room-rent threshold). See _CONVENTIONS §3 "Clinical GST". [VERIFIED: Notif. 12/2017 entry 74; Notif. 03/2022 entry 31A] This adds `tax_rules` and the `gst_treatment` column (SF-T6 scope).
- **Cash-receipt limit.** Income-tax Act 2025 **s.186** (formerly s.269ST) bars receiving ₹2,00,000 or more in cash from one person in a day, for one transaction, or for one event. [VERIFIED: https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf] [RESEARCH: Perplexity, P1-24/25/26 CBDT pages]
  - It's a shared guard used by OP billing, IP deposits and settlement, pharmacy and Medicard (new **SF-T9**).
  - It's evaluated at the **legal-entity (GSTIN/PAN) level**, across all locations of that entity.
  - There is no override.
  - Refunds don't reset the counter.
  - The limit is a configuration row (`cash_limit_paise = 20000000`, effective-dated).
- **Suppliers.** Add an `msme_category enum micro|small|medium|none` and a `has_written_payment_agreement bool`. MSMED s.15 says pay within **15 days without an agreement, 45 days with one**. [RESEARCH-WEAK: Gemini, msme.gov.in homepage, verify] [CONFLICT: the Phase 1 default flagged 45 days only; now 15 or 45]
- **Employees.** Add `is_pwd bool` (it drives the ESI ₹25,000 ceiling). [VERIFIED: https://esic.gov.in/contribution]

## Purpose
Give every later module the same:
- department and cost-centre structure;
- supplier master;
- general item master and store ledger;
- employee master;
- payer master;
- service and tariff master;
- number series;
- notification outbox;
- attachments;
- report/export framework.

Cost-centre profitability and material MIS are named in [DOCS: ML A1]. The supplier side is named in [DOCS: S1 r63, r64, r74, r75].

## Users and roles
- Tenant Admin and Location Admin maintain the masters.
- Accounts maintains suppliers and cost centres.
- HR/Payroll Officer maintains employees.
- Insurance/TPA Desk maintains payers. [DEFAULT, to confirm by research]

## Workflows
1. **Department and cost centre setup.**
   - Each department maps to one cost centre.
   - Cost centres have types: revenue (OPD, IPD, OT, Lab, Radiology, Pharmacy, Blood Bank) or service/overhead (Linen, Maintenance, Admin). [DEFAULT, to confirm by research]
2. **Supplier onboarding.** Name, GSTIN (format-validated), PAN `enc`, MSME flag, payment terms (days), and bank details `enc` (record only, no payouts).
3. **Item master.** One item master with an `item_class` of `drug | consumable | general | linen | spare | implant | blood_component`.
   - Pharmacy items (B7) either become `drug`/`consumable` rows or stay separate behind a view. [VERIFY-REPO]
4. **Stores.** `store` rows are main store, pharmacy, ward sub-stores, OT store, linen store and so on. All stock moves go through contract C3.
5. **Employees.** An employee may or may not be a login user, linked by `user_id`, nullable.
6. **Payers.** Self, insurer, TPA, corporate, government scheme or medicard programme. Each has an optional payer tariff.
7. **Service and tariff master.** Services are grouped by category (consultation, bed, procedure, lab, radiology, OT, blood, nursing, misc), each with a default rate and a GST/exempt flag. Rates can be overridden per bed class and per payer.
   - B5/B6 probably created a service master already. Extend it rather than duplicate it. [VERIFY-REPO]

## Screens
- `/app/masters/departments`, `/cost-centres`, `/suppliers`, `/items`, `/stores`, `/employees`, `/payers`, `/services` (with a tariff grid by bed class and payer).
- Each screen has a list (search, filter, CSV export), a create/edit drawer, deactivate (no hard delete once referenced) and CSV import (shared with Data Migration).

## Data model (all tenant-scoped, composite FKs)
- `cost_centres(code, name, type enum revenue|service|overhead, active)` [DEFAULT, to confirm by research]
- `departments(…existing…, cost_centre_id FK)` [VERIFY-REPO: departments exist from onboarding]
- `suppliers(code, name, gstin, pan enc, state_code, msme_udyam_no, msme_category, has_written_payment_agreement, payment_terms_days, bank_account enc, ifsc, contact_name, mobile, email, active)`
- `items(code, name, item_class, uom, hsn_code, gst_rate_bp, is_batch_tracked, is_expiry_tracked, reorder_level, active)` [VERIFY-REPO B7]
- `stores(location_id, code, name, store_type enum main|pharmacy|ward|ot|linen|maintenance|blood, department_id FK null)`
- `stock_ledger(store_id FK, item_id FK, batch_id FK null, movement_type, qty, unit_cost_paise, ref_type, ref_id, moved_at)`, append-only, with `stock_balances` kept by trigger or function [VERIFY-REPO B7]
- `employees(emp_code, user_id FK null, first_name, last_name, dob, gender, mobile, email, department_id FK, designation, employment_type enum permanent|contract|consultant|trainee, date_of_joining, date_of_exit, pan enc, aadhaar_last4, uan, esic_ip_no, bank_account enc, ifsc, status)`. Store only the last 4 digits of Aadhaar. [DEFAULT, to confirm by research]
- `payers(code, name, payer_type enum self|insurer|tpa|corporate|govt_scheme|medicard, parent_payer_id FK null, gstin, credit_days, active)`
- `tax_rules(rule_key, effective_from, effective_to, params jsonb)`, for example `room_rent_gst {threshold_paise: 500000, rate_bp: 500, excluded_bed_classes: [icu,ccu,iccu,nicu], itc: false}` and `cash_receipt_limit {limit_paise: 20000000, scope: legal_entity}`. Seed rows are tagged `source` with the RESEARCH-LOG id. [VERIFIED: V1, V2, V8]
- `cash_receipt_tally(legal_entity_id, payer_person_ref, business_date, event_ref null, cash_paise)`, maintained by the money functions.
- `services(code, name, category, default_rate_paise, gst_treatment enum exempt|taxable|room_rent_threshold, gst_rate_bp, sac_code, active)` (replaces `gst_exempt bool`) and `service_rates(service_id FK, bed_class null, payer_id FK null, rate_paise, effective_from, effective_to)` [VERIFY-REPO B5/B6]
- `notification_outbox(channel, template_key, recipient_ref, recipient_type enum patient|employee|supplier|doctor, vars jsonb, consent_purpose, status enum queued|sent_mock|failed|suppressed, created_at)`. `vars` must not hold clinical results for SMS. [DEFAULT, to confirm by research]
- `attachments(entity_type, entity_id, object_key, file_name, mime, size_bytes, sha256, uploaded_by)`

## APIs (module key `masters`, no extra feature key; permission `masters.manage` or `masters.read`)

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/tenant/masters/{cost-centres,suppliers,items,stores,employees,payers,services}` | list/create |
| PATCH | `/tenant/masters/<entity>/:id` | edit/deactivate |
| GET/PUT | `/tenant/masters/services/:id/rates` | tariff grid |
| POST | `/tenant/masters/<entity>/import` | CSV, dry-run flag (reuses Data Migration staging) |
| POST | `/tenant/attachments` (multipart), GET `/tenant/attachments/:id` | entity permission is checked against the parent entity |

Employees: `hr.employees.read/manage`. They're owned here but used by Payroll.

## Business rules and edge cases
- GSTIN is a 15-character format check, and its state code must match `state_code`. PAN format check.
- A referenced master is deactivated, never deleted.
- Changing a service rate creates a new `service_rates` row with `effective_from`, and bills keep the rate they posted at.
- An employee's exit date blocks new attendance and payroll after that date.
- An `enc` column shows masked in lists (`XXXX1234`), and unmasking needs a permission, and that is audited.

## Integrations
- Used by:
  - IP Billing, Insurance and Medicard (payers, services);
  - Indents, Bill Passing, Linen and Equipment (suppliers, items, stores);
  - Payroll and the Complaint Tracker (employees);
  - MIS (cost centres);
  - Marketing and Lab email (outbox).

## Tier
- Tier availability of the masters: **OPEN – to confirm with Ajay Sheth.** (OPEN-QUESTIONS-AJAY #1). Masters are a technical prerequisite of every module, but which tiers expose the masters screens is a product decision.
- Which masters show depends on which modules are enabled.

## Acceptance criteria
- All tables have RLS fixtures.
- Cross-tenant reads and writes fail.
- Deactivated masters are hidden from pickers but still resolve on old documents.
- Rate history is honoured: a bill posted before a rate change keeps its old rate.
- `enc` columns are masked in list DTOs.
- CSV import dry-run reports row errors without writing anything.

## Acceptance criteria added in Phase 2
- A ₹1,50,000 cash deposit followed by a ₹60,000 cash payment from the same patient on the same day, at **any** location of the same legal entity, gets 422 `cash_limit_exceeded` on the second. The same split by UPI succeeds. A refund in between doesn't reset the tally.
- `resolve_gst(service, bed_class, rate, date)` returns 5% for a non-ICU room at ₹5,001/day, exempt at ₹5,000, and exempt for an ICU at ₹9,000. Both cases are driven only by `tax_rules` rows.

## Build order and tasks (migration range 1000–1019, proposed)
### SF-T1 Audit existing masters vs this spec
- **Scope:** read `main` (schema.ts, B0/B5/B6/B7 tables), and write `docs/specs/masters-reuse.md` mapping each master above to reuse, extend or new.
- **Files:** docs only.
- **Accept:** a table with all 10 masters, the decision, and exact existing table names.
- **Model:** grok.
- **Depends:** Dell back.
### SF-T2 Cost centres, departments link, stores
- **Scope:** migration, schema, zod/DTO, CRUD API, RLS fixtures.
- **Files:** packages/db, apps/api/src/routes/masters.ts, packages/shared/src/masters.ts.
- **Accept:** CRUD tests and an RLS cross-tenant test.
- **Model:** grok.
- **Depends:** SF-T1.
### SF-T3 Suppliers and payers
- **Scope:** both masters, GSTIN/PAN validators in shared, masked DTOs.
- **Accept:** validator unit tests; masked output test.
- **Model:** grok.
- **Depends:** SF-T1.
### SF-T4 Items and stock ledger generalisation
- **Scope:** extend the B7 ledger to general stores (`item_class`, `store_type`), and the `inventory.move_stock` DB function with FOR UPDATE on the balance row.
- **Accept:** negative stock rejected (422); concurrent issue test; pharmacy tests still green.
- **Model:** grok.
- **Depends:** SF-T2.
### SF-T5 Employees master
- **Scope:** table, API, masked PII, link to users.
- **Accept:** create, edit and exit; unmask permission audited.
- **Model:** grok.
- **Depends:** SF-T2.
### SF-T6 Service rates by bed class and payer
- **Scope:** `service_rates` plus a resolver function `resolve_rate(service, bed_class, payer, at)`.
- **Accept:** precedence tests (payer+class > payer > class > default), and effective-date tests.
- **Model:** grok.
- **Depends:** SF-T3.
### SF-T7 Outbox and attachments
- **Scope:** `notification_outbox` with a mock sender and consent check hook, and `attachments` with local storage.
- **Accept:** suppressed when consent is missing; sha256 stored; size limit enforced.
- **Model:** grok.
- **Depends:** none.
### SF-T8 Masters web screens
- **Scope:** 8 list/drawer screens, plus a CSV import dialog that uses the dry-run.
- **Files:** apps/web/src/app/app/masters/**.
- **Accept:** each screen lists, creates, edits and deactivates against the API; follows the design guide.
- **Model:** composer.
- **Depends:** SF-T2 to SF-T6.
### SF-T9 Shared statutory guards: cash-receipt limit and tax rules (Phase 2)
- **Scope:** `tax_rules`, `cash_receipt_tally`, `assert_cash_allowed(legal_entity, person_ref, date, event_ref, amount)` called inside every money DB function that takes cash, and `resolve_gst()`.
- **Accept:** the two Phase 2 acceptance bullets above. Rules are changeable by effective date with no deploy.
- **Model:** grok.
- **Depends:** SF-T6.
