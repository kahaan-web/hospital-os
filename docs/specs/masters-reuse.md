# SF-T1 · Masters reuse (audit of main)

Audited `main` (`packages/db/src/schema.ts`, `packages/db/src/clinical/*`, migrations `0000`–`0191`). `feat/b-b6` is the only branch that adds a master (`payers`, migration `0160_ipbilling_tables.sql`). `feat/integrate-6` does not add masters.

The 10 masters are the Purpose list in `00-shared-foundations.md`. Decision: **reuse** = use the table as it is; **extend** = add columns or generalise this table; **new** = no table exists. Do not add a second table beside one marked extend.

| # | Master | Decision | Status | Existing tables (schema + migration) | Gap |
|---|---|---|---|---|---|
| 1 | Department and cost-centre structure | extend | partial | `departments` — `packages/db/src/schema.ts` `departments`, `migrations/0000_init.sql`. Columns: `location_id`, `name`, `sort_order`. Written only by onboarding (`apps/api/src/routes/onboarding.ts`). | No `cost_centres`. No `code`, `active`, or `cost_centre_id`. No masters CRUD. |
| 2 | Supplier master | extend | partial | `pharmacy_suppliers` — `packages/db/src/clinical/pharmacy.ts`, `migrations/0170_pharmacy_tables.sql`. Columns: `name`, `gstin`, `phone`, `city`, `active`. FKs from `pharmacy_batches`, `pharmacy_grns`, `pharmacy_supplier_returns`. GSTIN shape check in `packages/shared/src/clinical/pharmacy.ts`. | Pharmacy-only. No code, PAN, state, MSME, payment terms, bank, IFSC, contact. No `checkGstin` checksum on this form (`packages/shared/src/india.ts` `checkGstin` exists for facility GSTIN). |
| 3 | General item master and store ledger | extend | partial | `pharmacy_items`, `pharmacy_batches`, `pharmacy_stock`, `pharmacy_stock_moves` — same pharmacy schema and `0170`. Stock is `(batch_id, location_id)` qty. Moves: `grn`, `supplier_return`, `sale`, `sale_return`, `ip_issue`, `ip_return`, `adjustment`. | No `items`, `stores`, `stock_ledger`, `stock_balances`. No `item_class`, UOM, batch/expiry flags. No `inventory.move_stock`. Balance is a row, not a trigger. Qty is integer. |
| 4 | Employee master | new | missing | None. Closest: `users` (`schema.ts`, `0000_init.sql`: email, mobile, name, designation `owner\|manager`) and `doctors` (`schema.ts`: `user_id`, `department_id`, `registration_no`). | Login and clinician rows are not HR employees. No `emp_code`, PAN, UAN, ESIC, bank, joining/exit, `is_pwd`. |
| 5 | Payer master | extend | partial (pending merge: feat/b-b6) | Not on `main`. On `feat/b-b6`: `payers`, `encounter_payers`, `payer_receivables` — `packages/db/src/clinical/ipbilling.ts`, `migrations/0160_ipbilling_tables.sql`. `payers.kind` in `tpa\|insurer\|corporate\|scheme`. | No `self`, `medicard`, or `parent_payer_id`. One payer per encounter. GSTIN is a 15-char string, not `checkGstin`. `bills.payer_id` on `main` (`0150_billing_tables.sql`) has no FK and OP never sets it. |
| 6 | Service and tariff master | extend | partial | `services`, `tariffs` — `packages/db/src/clinical/foundation.ts`, `migrations/0101_clinical_tables.sql`. API: `listServiceMasters`, `createService`, `createTariff`, `patchService`, `patchTariff` in `apps/api/src/clinical/billing/masters.ts`. Resolver: `prices.priceFor` in `apps/api/src/clinical/charges.ts`. Screen: `/app/billing/services`. | No `service_rates`. Tariff key is `payer_class` (`general\|corporate\|tpa`) and `ward_class`, not `payer_id` or bed class. No `effective_to`. GST enum is `exempt_healthcare\|taxable\|room_rent_rule`, not the spec's `exempt\|taxable\|room_rent_threshold`. Categories omit `blood`. Rate is not resolved through `tax_rules`. |
| 7 | Number series | extend | partial | `number_series` — `foundation.ts`, `0101_clinical_tables.sql`. `hos_next_number` — `migrations/0103_numbering.sql`. Formatter: `formatDocNumber` / `DOC_SERIES` in `packages/shared/src/clinical/numbering.ts`, called by `apps/api/src/clinical/numbering.ts`. Cap `MAX_DOC_NUMBER_LENGTH = 16`. `bills.number` check `char_length <= 16` in `0150_billing_tables.sql`. Platform-only: `invoice_sequences` + `hos_next_invoice_number` (`0000_init.sql`, `0002_invoice_fn.sql`). | Clinical series already exist (`op_bill`, `ip_bill`, `deposit`, `refund`, `credit_note`, …). Rollback rewinds the counter (`0103` comment), so cancelled numbers are reused and there is no gap report. No separate receipt-voucher vs deposit series. Do not point clinical docs at `invoice_sequences`. |
| 8 | Notification outbox | extend | partial | `outbox_messages` — `schema.ts`, `0000_init.sql`. Mock writers: `mockSmsSender`, `mockEmailSender` in `apps/api/src/providers.ts`. Channels `sms\|email`. Columns: `recipient`, `template`, `subject`, `body`. | No whatsapp/push, `recipient_type`, `vars`, `consent_purpose`, or status. Body is free text (can hold clinical content). No `notify()` helper. |
| 9 | Attachments | new | missing | No `attachments`. Patient-only `patient_documents` — `packages/db/src/clinical/registration.ts`, `migrations/0110_registration_tables.sql` (`patient_id`, `kind`, `file_path`, `mime`, `size` ≤ 5 MB, `uploaded_by`). | Not entity-generic. No `sha256`, `object_key`, or `file_name`. Keep `patient_documents` for registration; do not widen it into the shared attachment store. |
| 10 | Report / export framework | new | missing | No shared report module. Each module queries its own SQL (`apps/api/src/clinical/billing/queries.ts`, `pharmacy/reports.ts`, `adt` register functions). Document print is `apps/api/src/clinical/print.ts` `letterhead` plus per-doc builders (OP: `print-bill.ts`). CSV exists only for the patient register (`registration/routes.ts` `GET …/reports/register.csv`). | No C6 helper (date + location + on-screen + print + CSV/XLSX + `report.export` audit). OP/IP billing reports are JSON only. |

## Related tables that are not a new master

| Object | Where | Use |
|---|---|---|
| `charges` | `foundation.ts`, `0101_clinical_tables.sql` | Shared OP and IP charge lines. See `ip-billing-gap.md`. |
| `cash_ledger` | `foundation.ts`, `0101` | Shared cash book. `counter_code` defaults to `''`. No `counter_sessions`. |
| `idempotency_keys` | `schema.ts`, `0000_init.sql` | Replay store. Clinical money POSTs are listed in `apps/api/src/http.ts`. |
| `doctors` | `schema.ts`, `0000_init.sql` | Clinician master. Not an employee row. |
| `consents` | `schema.ts`, `0000_init.sql` | DPDP consent rows. Outbox does not read them. |
| GST helpers | `packages/shared/src/clinical/gst-health.ts` `resolveLineGst` | Hard-coded ₹5,000 / 5% (`ROOM_RENT_THRESHOLD_PAISE`, `ROOM_RENT_RATE_BP`). Not `tax_rules`. |

`tax_rules` and `cash_receipt_tally` (SF-T9) do not exist. No `assert_cash_allowed` or `resolve_gst()` function.

## Reuse decisions

1. **Departments stay `departments`.** Add `cost_centres` and `departments.cost_centre_id`. Do not recreate departments.
2. **Suppliers stay `pharmacy_suppliers`.** Add the spec columns on that table so GRN FKs keep working. Rename in a view only if pharmacy code cannot say "supplier".
3. **Items and stock stay the pharmacy tables.** Add `item_class` and a `stores` table; point stock at `store_id` (pharmacy store per location is the first store). One `move_stock` function must accept the existing pharmacy move types so B7 tests stay valid.
4. **Employees are a new `employees` table** with nullable `user_id` → `users`. Do not store PAN/UAN on `users` or `doctors`.
5. **Payers: extend `feat/b-b6` `payers` after it merges.** Do not create a second payer table. Widen `kind` (add `self`, `medicard`; keep `scheme` as the government-scheme value) and add `parent_payer_id`. FK `bills.payer_id` to `payers`.
6. **Tariffs stay `tariffs`.** Do not add `service_rates`. Extend `prices.priceFor` for `payer_id`, `effective_to`, and the existing precedence (location, ward class, payer). Keep GST enum values `exempt_healthcare` and `room_rent_rule` (map spec names onto these; do not rename stored values).
7. **Series stay `number_series` + `hos_next_number`.** Add gap retention on top. Leave `invoice_sequences` as the SaaS invoice counter only.
8. **Outbox stays `outbox_messages`.** Add channel, status, consent purpose, and structured `vars`. Keep the mock senders in `providers.ts`.
9. **`attachments` is new.** `patient_documents` remains the registration upload.
10. **Report framework is new.** Do not wrap the one-off CSV in registration as the framework. Billing reports should call it later rather than grow more ad-hoc queries.
11. **SF-T9 tables are new** (`tax_rules`, `cash_receipt_tally`). `resolveLineGst` becomes a reader of `tax_rules`, not a second implementation.

## Proposed next-task adjustments

- **SF-T2 shrinks.** Departments already exist. Build `cost_centres`, the department FK, and `stores` only.
- **SF-T3 shrinks.** Extend `pharmacy_suppliers`. Payer CRUD already exists on `feat/b-b6` (`createPayer` / `patchPayer` / `listPayers`, `/app/ip-billing/payers`). After merge, add columns and masking; do not rewrite the API. Reuse `checkGstin`. PAN validation is still new (`india.ts` has no PAN helper).
- **SF-T4 stays a generalisation**, not a new ledger. Pharmacy tests must keep passing against the same move rows.
- **SF-T5 stays** (greenfield `employees`), plus the `user_id` link.
- **SF-T6 shrinks** to columns and precedence tests on `tariffs` / `prices.priceFor`. Drop the new `service_rates` table from the task.
- **SF-T7 shrinks** on the outbox (table and mock sender exist) and stays for `attachments` and the consent hook.
- **SF-T8 shrinks** for services (screen is `/app/billing/services`, not `/app/masters/services`). Keep that path. The other seven screens are still missing. Departments are onboarding-only.
- **SF-T9 stays.** Nothing in `main` or either branch evaluates s.186 or reads GST thresholds from a table. ICU exemption is hard-coded in `gstTreatmentFor` (`apps/api/src/clinical/adt/service.ts`).
