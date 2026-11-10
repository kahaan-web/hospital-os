# Phase B plan: clinical modules (OPD, IPD/ADT, Billing, Pharmacy, Lab, Nurse, mobile A3/A4/A5)

Read this with `CLAUDE.md`, `docs/PLAN.md`, `docs/CONTRACTS.md` (its Tenancy/RLS design and Addenda stay authoritative)
and `docs/DESIGN_GUIDE.md`. One foundation task (B0) merges first. After it, 11 worker tasks (B1–B11) run in waves (§5).
Use mock data only, with obviously fictional seed names (`Aarav Sample`, `Meera Demo`). No real gateway, SMS or email.

## 0. Decisions (made while planning; a reviewer can overturn them)
1. **Routes.** Module routes live under `/api/v1/tenant/m/<moduleKey>/…` (the CONTRACTS "Module guard" rule). A B0
   helper applies `requireModule` to the whole prefix. Cross-module resources live under `/api/v1/tenant/clinical/…`:
   patients, encounters, orders, vitals, notes, charges and codes. Mobile keeps the `/patient/*` and `/doctor/*` routes
   from `apps/mobile/API_PROPOSAL.md` and adds `/nurse/*`.
2. **Parallel-safe files.** Some files are shared by every task: `schema.ts`, `seed.ts`, `app.ts`, `i18n.ts`, the
   sidebar and the API registry. B0 creates one stub per task and the barrels that import the stubs. Each task edits
   only its own stubs.
3. **Hand-written SQL migrations from 0100.** Do not use drizzle-kit `generate`: parallel snapshots would conflict.
   Each task writes Drizzle definitions in its own file and matching SQL in its own number range. `migrate.ts` already
   sorts migrations by name.
4. A task may add FKs or indexes to tables owned by tasks it depends on, but never columns. B0 creates up front any
   column that several modules share (for example `encounters.current_bed_label`, which ADT maintains).
5. **One charge ledger.** Modules post charges, and only Billing turns charges into bills.
   - `OrderService.place` charges service items (lab, procedure).
   - Pharmacy charges medicines when it dispenses (IP) or sells (OP).
   - ADT charges bed-days.
6. **One cash ledger** records every money movement, including pharmacy counter sales, so the cash summary reads one table.
7. **Prescriptions** are `clinical_orders` of kind `medicine`, written by generic (`generic_code`). Pharmacy maps each
   generic to its item master when it dispenses.
8. **Stubbed contracts.** B0 writes a stub in `apps/api/src/clinical/<dir>/public.ts` for each contract in §3. The
   owning task replaces its stub, so callers compile before the owner merges.
9. **Aadhaar** is stored only as ID type plus last 4 digits. ABHA fields are optional, and `AbdmGateway` is an
   interface only. "Excel" exports are CSV files with a UTF-8 BOM.
10. **Dev entitlements.**
    - The B0 seed grants demo tenant Sunrise (Medium) `nurse-station`, `cpoe` and Android A3/A4/A5 through module
      overrides. Per `computeEntitlements`, a module override grants all of that module's features.
    - The seed also sets those Android modules to `available`; the App Admin can revert this.
    - **Lotus Demo Clinic** (Basic, `owner@lotus.demo` / `Demo@12345`) is the second tenant, used for isolation and
      `not_entitled` tests.

## 1. B0 Shared foundations
Branch `feat/b-b0-foundations` · model **grok-4.7-high** · about 90 min · migrations **0100–0109** · depends on Phase A `main`.

### 1.1 Tables
All tables below are class **T** and follow the CONTRACTS §3 template: forced RLS, `_owner` and `_tenant` policies,
explicit grants and the `updated_at` trigger. Every table has `tenant_id NOT NULL` and `UNIQUE (tenant_id, id)`.
Parents are referenced by composite `(tenant_id, x_id)` FKs. Enum columns have CHECK constraints. Money is in paise and
GST rates are in basis points.

| Table | Columns (besides id, tenant_id, created_at, updated_at) |
|---|---|
| `number_series` | location_id (null = tenant-wide), series_key, period (`''`, `'2627'` or a date), last_no; UNIQUE NULLS NOT DISTINCT (tenant_id, location_id, series_key, period) |
| `patients` | uhid UNIQUE(tenant_id, uhid), registered_location_id, title, first/middle/last_name, full_name (generated), gender (`GENDERS`), dob null, age_years_at_reg, dob_estimated, mobile, alt_mobile, email, address_line1/2, city, district, state_code, pincode, blood_group, marital_status, guardian_name/relation, emergency_name/mobile, id_type, id_last4, abha_number, abha_address, photo_path, status (active/merged/inactive), merged_into_id, is_sample, created_by; indexes (tenant_id, mobile), (tenant_id, lower(full_name)) |
| `patient_alerts` | patient_id, kind (allergy/condition/alert), text, severity (low/high), recorded_by, inactive_at |
| `encounters` | location_id, patient_id, kind (opd/ipd/daycare/emergency), number UNIQUE(tenant_id, kind, number), status (open/closed/cancelled), doctor_id, department_id, visit_type (new/follow_up), appointment_id (FK added by B2), payer_type (self/corporate/tpa/scheme/free), is_mlc, current_ward_code, current_bed_label, referred_by, started_at, ended_at, created_by |
| `services` | code UNIQUE(tenant_id, code), name, category (consultation/procedure/lab/radiology/bed/nursing/ot/package/misc), doctor_id null, hsn_sac, gst_treatment, gst_rate_bp, active |
| `tariffs` | service_id, location_id null, ward_class null, payer_class (general/corporate/tpa), price_paise, effective_from |
| `clinical_orders` | location_id, encounter_id, patient_id, kind (lab/medicine/procedure/diet/radiology), number, source (opd/ipd/cpoe/nurse/mobile), priority (routine/urgent/stat), status (placed/in_progress/completed/cancelled), ordering_doctor_id, ordered_by_user_id, notes, placed_at, cancelled_at, cancel_reason |
| `clinical_order_items` | order_id, line_no, service_id null, drug_name, generic_code, strength, dose_form, dose, frequency_code, route_code, duration_days, quantity, diet_code, instructions, status (pending/in_progress/done/cancelled), fulfilled_qty, fulfilled_ref_type, fulfilled_ref_id |
| `vital_signs` | location_id, encounter_id, patient_id, recorded_at, recorded_by, bp_systolic, bp_diastolic, pulse, resp_rate, temp_c_x10, spo2, weight_g, height_mm, pain_score, grbs_mg_dl, notes, entered_in_error_at, error_reason (append-only except the error mark) |
| `clinical_notes` | encounter_id, patient_id, kind (chief_complaint/history/examination/diagnosis/plan/advice/progress/nursing/procedure), body, code (ICD-10), code_display, author_user_id, supersedes_id (amend by adding a row; never update) |
| `charges` | location_id, encounter_id, patient_id, service_id null, description, qty, unit_price_paise, amount_paise, discount_paise, gst_treatment, gst_rate_bp, hsn_sac, service_date, performing_doctor_id, referring_doctor_id, source_module, source_type, source_id, source_line (default `''`), status (unbilled/billed/reversed), bill_id, reversal_of_id, posted_by; UNIQUE (tenant_id, source_type, source_id, source_line) WHERE reversal_of_id IS NULL, so posting is idempotent |
| `cash_ledger` | location_id, counter_code, entry_type (receipt/refund/deposit/deposit_refund/deposit_adjust), direction (in/out), mode (cash/upi/card/cheque/neft), amount_paise > 0, number, patient_id, encounter_id, ref_type (bill/deposit/pharmacy_sale/pharmacy_return), ref_id, instrument_ref (UTR or card last 4 only), received_by, received_at, voided_at, void_reason |

Further B0 migration work:
- **0100** adds `locations.doc_prefix` (CHECK `^[A-Z0-9]{2,3}$`, backfilled from `code`, for example `MUM`). It also adds
  `doctors.user_id` (composite FK to users), `department_id`, `registration_no` and `active`.
- **0105** seeds the §1.3 permissions and role grants.
- **`hos_next_number(series, location, period) RETURNS int`** is SECURITY INVOKER, so it runs under RLS using
  `hos_tenant_id()`. It does `INSERT … ON CONFLICT DO UPDATE SET last_no = last_no + 1 RETURNING`. Call it last in the
  transaction (CONTRACTS §8), so numbering has no gaps.

### 1.2 Numbering
- **Format.** `{doc_prefix}{docCode}/{yy}{yy}/{5-digit seq}`, for example `MUMOB/2627/00042`. Numbers are at most 16
  characters (GST Rules 46/49). Series reset on 1 April IST. If the next number would exceed 16 characters, return 422
  `series_exhausted`.
- **Doc codes.** OV opd_visit, IP ip_admission, OB op_bill, IB ip_bill, RC receipt, DP deposit, RF refund, CN
  credit_note, PS pharmacy_sale, PR pharmacy_return, GR grn, LA lab_accession, ML mlc, OR clinical_order.
- **UHID.** One tenant-wide series with no period: `UH` + 9 digits (`UH000000123`).
- **OPD token.** Series `opd_token:<doctorId>` with the date as its period; the token is a plain integer.

### 1.3 Shared code (`packages/shared/src/clinical/*`, re-exported from `index.ts`)
- **`codes.ts`:**
  - `BLOOD_GROUPS`, `ID_TYPES` (aadhaar_last4/pan/voter/passport/dl/none), `RELATIONS`, `VISIT_TYPES`, `ROUTES`,
    `DOSE_FORMS`, `BED_STATUSES`, `SPECIMENS`, `PAYMENT_MODES`, `PAYER_TYPES`.
  - `FREQUENCIES`: OD, BD, TDS, QID, HS, SOS, STAT, each with times per day.
  - `DIET_CODES` (normal/soft/liquid/diabetic/renal/low_salt/NBM) and `WARD_TYPES`
    (general/semi_private/private/icu/nicu/hdu/daycare).
  - `DISCHARGE_TYPES` (normal/lama/dama/referred/death/absconded).
  - `ICD10_SAMPLE` (about 60 WHO codes) and `DRUG_GENERICS_SAMPLE` (about 80 generics).
- **`patient.ts`:** `PatientDto`, `PatientSummaryDto` (id, uhid, fullName, gender, ageLabel, mobileMasked, city),
  `PatientAlertDto`, `patientCreateSchema`, `patientUpdateSchema`, `patientSearchQuery`, `patientAlertSchema`, and
  `ageLabel(dob, at)`, which returns `34 Y`, `8 M` or `12 D`.
- **`encounter.ts`:** `EncounterDto`, `EncounterDetailDto` (includes the banner and alerts), `EncounterKind`, `PayerType`.
- **`orders.ts`:** `ClinicalOrderDto`, `ClinicalOrderItemDto`, `placeClinicalOrderSchema` (discriminated on `kind`),
  `PlaceClinicalOrderInput`, `cancelOrderSchema`, `OrderWorklistQuery`.
- **`vitals.ts`:** `VitalSignsDto`, `recordVitalsSchema`, `VITAL_RANGES` (normal and critical; shown next to values).
- **`notes.ts`:** `ClinicalNoteDto`, `addClinicalNoteSchema`.
- **`charges.ts`:** `ChargeDto`, `ChargeInput`, `ChargeSource`, `CashEntryDto`, `CashEntryInput`, `ServiceDto`,
  `DoctorDto`.
- **`gst-health.ts`** (§3.2): `GstTreatment` (exempt_healthcare/taxable/room_rent_rule), `resolveLineGst`,
  `splitInclusive`, `documentTypeFor`, `placeOfSupply`.
- **`numbering.ts`:** `SeriesKey`, `formatDocNumber`, `fyCode(date)` (returns `'2627'`).
- **`print.ts`:** `PrintDoc = { size: 'A4' | 'A5' | 'label_50x25'; letterhead: LetterheadDto; blocks: PrintBlock[] }`.
  Block kinds: heading, keyValues, table, paragraph, totals, amountInWords, barcode, signature, spacer.
- **`features.ts`:** `CLINICAL_FEATURES`, typed constants for every key in §2. A test asserts each one exists in
  `FEATURE_DEFS`.
- **`contracts.ts`** holds the §3 interfaces and **`contract-dtos.ts`** the DTOs they name. Owning tasks may only add
  optional fields to those DTOs.
- **`i18n/<dir>.ts`:** one stub per task, merged into `en.clinical.<dir>`.
- **`mobile.ts` (additive):** `WardPatient`, `MarDose`, `DietOrderView`, `GiveDoseInput`, `giveDoseSchema`,
  `recordVitalsMobileSchema`, `patientSignupSchema`.
- **`rbac.ts`:**
  - New permissions: `patients.view`, `clinical.view`, `lab.verify`, `portal.self`.
  - New grants: front_desk, cashier and pharmacist get patients.view; doctor and nurse get patients.view and
    clinical.view; lab_tech gets patients.view and lab.verify.
  - New system role `patient` (`staff: false`, with `portal.self`), hidden from the staff invite UI.

### 1.4 API
B0 owns `apps/api/src/clinical/{index,registry,module-routes,numbering,charges,cash,orders,encounters,patients-read,print,testkit}.ts`.
It also writes the per-task stubs `apps/api/src/clinical/<dir>/{routes,public}.ts`. Task dirs: `registration`,
`appointments`, `doctor`, `adt`, `billing`, `ipbilling`, `pharmacy`, `lab`, `nursing`, `portal`.
- **`guard.ts`:** adds `requireFeature`, `requireAnyModule` and `requireAnyPermission`. Entitlements are memoised per
  request; today `assertModule` recomputes them on every call.
- **`http.ts`:**
  - `resolveSession` also accepts an `x-hos-session` header, for native apps. Sending both the cookie and the header
    returns 400.
  - `POST /auth/login` with `x-hos-client: native` adds `sessionToken` to `Me`. CSRF rules are unchanged.
- **`app.ts`:** one added line, `registerClinical(app, deps)`.
- **`print.ts`:**
  - `renderPdf` uses pdf-lib with IBM Plex Sans embedded through `@pdf-lib/fontkit`, so `₹` renders, and draws Code128B
    barcodes.
  - `renderHtml` renders the same layout for preview.
  - `letterhead(tx, locationId)` returns the name, address, GSTIN, registration number and logo.

Routes under `/api/v1/tenant/clinical` (audit action `clinical.<entity>.<verb>`):

| Method | Path | Body → response | Permission | Module |
|---|---|---|---|---|
| GET | `/patients?q=&page=`, `/patients/:id` | → `PageDto<PatientSummaryDto>`, `PatientDto` | patients.view or patients.manage | patient-registration |
| GET, POST | `/patients/:id/alerts` | `patientAlertSchema` → `PatientAlertDto` | clinical.view / clinical.order or patients.manage | patient-registration |
| GET | `/encounters?patientId&kind&status&mine`, `/encounters/:id` | → `PageDto<EncounterDto>`, `EncounterDetailDto` | clinical.view, opd.manage or adt.manage | opd-visit or adt |
| GET, POST | `/encounters/:id/orders`; POST `/orders/:id/cancel` | `placeClinicalOrderSchema` / `cancelOrderSchema` → `ClinicalOrderDto` | clinical.order (opd.manage for counter lab orders, nursing.manage for diet) | by kind, see below |
| GET, POST | `/encounters/:id/vitals`; POST `/vitals/:id/entered-in-error` | `recordVitalsSchema` / `{ reason }` → `VitalSignsDto` | clinical.order, nursing.manage or opd.manage | opd-visit, nurse-station or cpoe |
| GET, POST | `/encounters/:id/notes` | `addClinicalNoteSchema` → `ClinicalNoteDto` | clinical.view / clinical.order or nursing.manage | opd-visit, cpoe or nurse-station |
| GET | `/encounters/:id/charges` | → `ChargeDto[]` | billing.op.post or billing.ip.manage | op-billing |
| GET | `/codes`, `/doctors`, `/services?category&q` | → `ClinicalCodesDto`, `DoctorDto[]`, `ServiceDto[]` (with price) | any tenant user | — |

Order gates by `kind`:
- lab needs `lab`.
- medicine and procedure need `opd-visit` or `cpoe`.
- diet needs `nurse-station` or `adt`.
- radiology returns 422 `not_available` (Phase C).

### 1.5 Web, DB scaffolding, tests, acceptance
- **Web:**
  - `apps/web/src/features/clinical/nav.ts` registers every §4 screen with its moduleKey and permission. `TenantShell`
    reads this registry; that is B0's only edit to the shell.
  - `features/clinical/common/` holds `PatientPicker`, `PatientBanner` (alerts shown in danger colour with a label),
    `PrintPreview` (HTML iframe plus "Download PDF") and `clinicalApi.ts` (`apiRequest<T>`).
- **DB:**
  - Drizzle definitions: `packages/db/src/clinical/{foundation,<dir>…}.ts` plus an `index.ts` barrel. `schema.ts` gets
    one line, `export * from './clinical';`.
  - Seed stubs: `packages/db/src/seed-clinical/<dir>.ts`, called from `seedDemo`.
  - The B0 seed creates the Lotus tenant and the overrides from decision 10, and links `doctor@sunrise.demo` to a
    doctor record. It also adds 12 fictional patients, about 30 services with tariffs, 3 open OPD encounters and 1 open
    IPD encounter.
- **Tests:**
  - `testkit.ts` provides `clinicalFixture()` (Sunrise A and Lotus B sessions plus seeded ids) and
    `expectIsolation(table, idOfB)`. The latter runs the CONTRACTS §10 checks: row count, UPDATE/DELETE affecting 0
    rows, INSERT failing with 42501.
  - `rls-coverage.test.ts` asserts that every `public` table with `tenant_id` has forced RLS, a `hos_tenant_id()`
    policy and `UNIQUE (tenant_id, id)`. Every later task's tables are covered automatically.
- **Acceptance:**
  - Migrations 0100–0109 apply both to a clean database and to a Phase A database.
  - These commands pass: `npm run typecheck`,
    `npx eslint packages apps/api/src/clinical apps/web/src/features/clinical`,
    `npm test -- apps/api/src/clinical packages/shared`.
  - Numbering: 20 concurrent `next('op_bill')` calls yield 00001–00020. Every number is at most 16 characters, and
    31/03 23:59 IST belongs to FY 2526.
  - Charges: posting is idempotent on its source. A lab order posts one charge per service item, and cancelling the
    order reverses them.
  - Isolation: a cross-tenant `/clinical/patients/:id` returns 404, and a Lotus cpoe order returns 403 `not_entitled`.
  - `resolveLineGst` table tests and `x-hos-session` login tests pass.

## 2. Module keys → sheet features (key = `<moduleKey>.<slug>`; use `CLINICAL_FEATURES`; tiers from Sheet1)
Where a module's features span tiers, gate each route on the feature, not only the module.

| Module key (tasks) | Feature slugs (lowest tier) |
|---|---|
| `patient-registration` (B1) | new-registration, edit-registration, print-case-paper, print-register-by-date-range-by-city-state-gender-age, print-stickers (B); attach-patient-documents, print-patient-photo-id, patient-excel-data, send-mailers-via-email-sms (M); print-barcode, mlc-registration, mlc-case-register (P) |
| `appointments` (B2) | take-appointment, phone-appointment-without-registration, cancel-reschedule-appointment, counter-new-repeate-patients, appointment-diary-for-single-doctor-all-doctors (B) |
| `opd-visit` (B2, B3) | visit-registration, visit-satatisitcs-summary-by-clinic, visit-detail-by-doctor, visit-register (B) |
| `op-billing` (B5) | accept-deposit, refund-deposit, op-voucher-posting-cash-credit-free, op-refund, op-settlements, concessions, op-voucher-document, cash-summary-detail, revenue-summary-detail, doctor-sharing-detail, patient-outstanding, deposit-register (B); visit-statistics-for-the-period (M) |
| `adt` (B4) | admission, transfer, discharge, admission-register, transfer-register, discharge-register, discharge-summary-report, patient-stickers (B); discharge-summary (M) |
| `ip-billing` (B6) | posting-charges-for-services, accept-deposit, refund-deposit, posting-reversals, bill-preparation, concessions, bill-settlement, patient-statement-of-account-summary-detail, revenue-summary-detail, bill-register, concession-register, doctor-sharing-detail, deposit-register, cash-summary-detail (B); patient-outstanding (M) |
| `pharmacy` (B7) | material-receipts, material-returns, issue-to-ip-patients-returns, issue-to-op-patients, outside-sales, stock-adjustments, stock-register-summary-details, receipt-register, rejection-register, issue-register, issue-return-register, stock-adjustment-register, patient-issue-return-statement-ip, expiry-item-report (B); purchase-register (M). Deferred to Phase C: purchase-order, payment-approvals, bill-payment, supplier-outstanding, supplier-payment-register |
| `lab` (B8) | sample-collection, result-entry, master-template, lab-result-report, patient-history, sample-status, lab-mis (M); send-result-on-email, 2-lab-equipments (P) |
| `nurse-station` (B9) | lab-orders, medicine-orders, view-test-results, investigation-prescription, medicine-prescription, doctors-notes, patient-vitals-table-graph (P). MAR and diet are gated by the module (no sheet rows) |
| `cpoe` (B3) | chief-complaints, diagnostic-orders, medicine-orders, procedure-orders, appointment-diary, request-reservation-admission, investigation-prescription, medicine-prescription, doctors-notes, patient-vitals-table-graph, patient-vitals (P) |
| `android-patient-portal` (B10, B11) | patient-registration, doctors-appointments, medical-data-for-visits-to-hospital, accounts-details, feedback |
| `android-doctor-portal` (B10, B11) | appointment-diary, medical-diary-facility-to-order-tests-medicines |
| `android-nurses-workbench` (B10, B11) | doctors-order-entry-view-for-investigation-medicine, vital-sign-entry-view, medicine-administration, diet-order-entry-view |

Basic and Medium tenants write the OPD case paper and prescription under `opd-visit.visit-registration`. CPOE (Premium)
adds the IPD doctor workspace, procedure orders, admission requests, order sets and the vitals graph.

## 3. Interface contracts (`packages/shared/src/clinical/contracts.ts`; implemented in `apps/api/src/clinical/**`)
```ts
export interface ClinicalCtx<TX = unknown> {
  tx: TX; tenantId: string; locationId: string; userId: string;
  audit(action: string, entityType: string, entityId: string | null, before: unknown, after: unknown): Promise<void>;
}
export type ChargeModule = 'opd' | 'adt' | 'lab' | 'pharmacy' | 'billing' | 'cpoe' | 'nursing';
export interface ChargeSource { module: ChargeModule; type: string; id: string; line?: string }
export interface ChargeInput {
  encounterId: string; patientId: string; serviceId: string | null; description: string;
  qty: number; unitPricePaise: number; discountPaise?: number; gstTreatment: GstTreatment; gstRateBp: number;
  hsnSac: string; serviceDate: string; performingDoctorId?: string | null; referringDoctorId?: string | null;
  source: ChargeSource;
}
// ---- Implemented by B0 ----
export interface ChargeCapture<TX = unknown> {
  post(ctx: ClinicalCtx<TX>, input: ChargeInput): Promise<ChargeDto>;                    // idempotent on source
  reverse(ctx: ClinicalCtx<TX>, chargeId: string, reason: string): Promise<ChargeDto>;   // 409 if on a final bill
  reverseBySource(ctx: ClinicalCtx<TX>, source: ChargeSource, reason: string): Promise<ChargeDto[]>;
  listUnbilled(ctx: ClinicalCtx<TX>, encounterId: string): Promise<ChargeDto[]>;
  markBilled(ctx: ClinicalCtx<TX>, chargeIds: string[], billId: string | null): Promise<void>; // Billing only; null = unbill
}
export interface PriceLookup<TX = unknown> {
  priceFor(ctx: ClinicalCtx<TX>, q: { serviceId: string; wardClass?: string; payerClass?: string; on?: string }):
    Promise<{ unitPricePaise: number; gstTreatment: GstTreatment; gstRateBp: number; hsnSac: string }>;
}
export interface NumberSeries<TX = unknown> {
  next(ctx: ClinicalCtx<TX>, key: SeriesKey, opts?: { at?: Date; scope?: string }): Promise<string>;
}
export interface EncounterService<TX = unknown> {
  openOpd(ctx: ClinicalCtx<TX>, i: { patientId: string; doctorId: string; departmentId?: string; appointmentId?: string;
    visitType: 'new' | 'follow_up'; payerType?: PayerType }): Promise<EncounterDto>;
  openIpd(ctx: ClinicalCtx<TX>, i: { patientId: string; doctorId: string; departmentId?: string; number: string;
    payerType: PayerType; isMlc: boolean }): Promise<EncounterDto>;
  setBedLabels(ctx: ClinicalCtx<TX>, encounterId: string, l: { wardCode: string | null; bedLabel: string | null }): Promise<void>;
  close(ctx: ClinicalCtx<TX>, encounterId: string, at?: Date): Promise<EncounterDto>;
}
export interface OrderService<TX = unknown> {     // place() posts charges for service items; cancel() reverses them
  place(ctx: ClinicalCtx<TX>, encounterId: string, input: PlaceClinicalOrderInput): Promise<ClinicalOrderDto>;
  cancel(ctx: ClinicalCtx<TX>, orderId: string, reason: string): Promise<ClinicalOrderDto>;
  worklist(ctx: ClinicalCtx<TX>, q: OrderWorklistQuery): Promise<PageDto<ClinicalOrderItemDto>>;
  recordFulfilment(ctx: ClinicalCtx<TX>, itemId: string,
    f: { status: 'in_progress' | 'done'; qty?: number; refType: string; refId: string }): Promise<ClinicalOrderItemDto>;
}
export interface CashLedger<TX = unknown> {
  record(ctx: ClinicalCtx<TX>, e: CashEntryInput): Promise<CashEntryDto>;               // assigns the RC/DP/RF number
  void(ctx: ClinicalCtx<TX>, entryId: string, reason: string): Promise<CashEntryDto>;
}
// ---- Stubbed by B0 in apps/api/src/clinical/<dir>/public.ts; the owning task replaces the stub ----
export interface BillingStatusReader<TX = unknown> {     // B5; stub: everything settled, no bills
  settledSources(ctx: ClinicalCtx<TX>, sources: ChargeSource[]): Promise<Set<string>>;  // keys `${type}:${id}:${line}`
  billsForPatient(ctx: ClinicalCtx<TX>, patientId: string): Promise<BillDto[]>;
}
export interface DischargeClearance<TX = unknown> {      // B6; stub: { ok: true, balancePaise: 0, reasons: [] }
  check(ctx: ClinicalCtx<TX>, encounterId: string): Promise<{ ok: boolean; balancePaise: number; reasons: string[] }>;
}
export interface AdmissionRequestSink<TX = unknown> {    // B4; stub: 422 not_available
  request(ctx: ClinicalCtx<TX>, r: { patientId: string; fromEncounterId: string; doctorId: string; reason: string;
    plannedOn: string; wardType?: WardType }): Promise<AdmissionRequestDto>;
}
export interface DiaryReader<TX = unknown> {             // B2; stub: []
  diary(ctx: ClinicalCtx<TX>, q: { doctorId: string; date: string }): Promise<AppointmentDto[]>;
  slots(ctx: ClinicalCtx<TX>, q: { doctorId: string; date: string }): Promise<SlotDto[]>;
  book(ctx: ClinicalCtx<TX>, i: BookAppointmentInput & { patientId: string; channel: 'counter' | 'phone' | 'portal' }): Promise<AppointmentDto>;
  cancel(ctx: ClinicalCtx<TX>, appointmentId: string, reason: string): Promise<AppointmentDto>;
}
export interface LabResultsReader<TX = unknown> {        // B8; stub: empty
  summaries(ctx: ClinicalCtx<TX>, orderItemIds: string[]): Promise<Map<string, LabResultSummaryDto>>;
  reportsForPatient(ctx: ClinicalCtx<TX>, patientId: string): Promise<LabReportListItem[]>;
}
export interface NursingService<TX = unknown> {          // B9; stub: []
  wardPatients(ctx: ClinicalCtx<TX>, q: { wardCode?: string }): Promise<WardPatient[]>;
  marFor(ctx: ClinicalCtx<TX>, encounterId: string, date: string): Promise<MarDose[]>;
  giveDose(ctx: ClinicalCtx<TX>, doseId: string, i: GiveDoseInput): Promise<MarDose>;
  dietOrders(ctx: ClinicalCtx<TX>, q: { wardCode?: string; encounterId?: string }): Promise<DietOrderView[]>;
}
```
`apps/api/src/clinical/registry.ts` exports `clinical(gate): ClinicalServices`, with one property per interface above.
Tasks call each other only through this registry, never through another task's internals.

### 3.2 Healthcare GST rules (`gst-health.ts`; rates are configuration, labelled "confirm with CA" in the UI)
| Treatment | Applies to | Tax |
|---|---|---|
| `exempt_healthcare` (SAC 9993, Notification 12/2017-CT(Rate) Sl. 74) | Consultation, procedures, diagnostics, nursing, OT, ICU/CCU/NICU stays, and in-patient medicines and consumables (a composite supply) | 0% |
| `room_rent_rule` | IPD room rent outside ICU/CCU/ICCU/NICU, evaluated per bed-day | 5% without ITC if over ₹5,000 per day per patient; otherwise 0% |
| `taxable` | Pharmacy counter sales, cosmetic procedures, attendant food | Item's HSN rate (pharmacy) or the service rate |

Pharmacy MRP includes GST, so `splitInclusive` extracts the tax, rounding half-up to the paise. `documentTypeFor`
picks the document type:
- only exempt lines → `bill_of_supply` (Rule 49).
- only taxable lines → `tax_invoice`.
- a mix, for an unregistered patient → `invoice_cum_bill_of_supply` (Rule 46A).

`placeOfSupply` uses the location's state, so tax is CGST + SGST. IGST applies only when a registered corporate or TPA
whose GSTIN is in another state is billed. Bill totals round to the rupee through a separate `roundOffPaise` line.

## 4. Worker tasks
Rules for every task:
- **Ownership.** A task owns `apps/api/src/clinical/<dir>/**`, `packages/db/src/clinical/<dir>.ts`,
  `packages/db/src/seed-clinical/<dir>.ts`, `packages/shared/src/clinical/<dir>.ts` and
  `packages/shared/src/clinical/i18n/<dir>.ts`. It also owns its migration range and its listed web routes. Everything
  else is read-only.
- **Writes.** Every mutation writes one audit row. Mutations that create money or numbered documents require an
  `Idempotency-Key`.
- **Tests.** Cover every table with `expectIsolation`, and every feature above Basic with a Lotus `not_entitled` test.
- **UI.** Follow DESIGN_GUIDE: dense tables, DD/MM/YYYY, ₹ in en-IN, keyboard use, and empty, loading and error states.
- **Checks.** `npm run typecheck`, `npx eslint <owned paths>`, `npm test -- apps/api/src/clinical/<dir>`.

### B1 Patient registration
`feat/b-b1-registration` · depends on B0 · **composer-2.5** · migrations **0110–0119** · dir `registration`
- **Tables:**
  - `patient_documents`: patient_id, kind, file_path, mime, size, uploaded_by. Dev storage is local, ≤ 5 MB,
    pdf/jpg/png.
  - `mlc_cases`: patient_id, encounter_id, number (ML), police_station, brought_by, injury_summary, reported_at.
- **API** (`/tenant/m/patient-registration`):
  - `POST /patients` `patientCreateSchema` → `PatientDto` (permission patients.manage). If the mobile matches and the
    name or DOB is similar, it returns 409 `possible_duplicate` with `PatientSummaryDto[]`, unless `confirmNew: true`.
  - `PATCH /patients/:id` `patientUpdateSchema`; `POST /patients/:id/photo`.
  - `GET|POST /patients/:id/documents`; `DELETE …/documents/:docId`.
  - `GET /patients/:id/print/{case-paper|sticker|photo-id|barcode}.{pdf|html}`.
  - `GET /reports/register?from&to&city&state&gender&ageMin&ageMax`, plus a `.csv` export.
  - `POST /patients/:id/mailer` (mock).
  - `GET|POST /mlc`; `GET /reports/mlc`.
- **Web:** `/app/patients`, `/app/patients/new`, `/app/patients/[id]`, `/app/patients/[id]/edit`,
  `/app/patients/mlc`, `/app/patients/reports`.
- **Acceptance:**
  - 10 concurrent creates get unique UHIDs.
  - The duplicate rule returns 409.
  - A 12-digit Aadhaar is rejected.
  - The sticker is 50 × 25 mm with a Code128 UHID.
  - Lotus gets 403 on documents and MLC.

### B2 Appointments, OPD visit registration and queue
`feat/b-b2-appointments` · depends on B0 · **grok-4.7-high** · migrations **0120–0129** · dir `appointments`
- **Tables:**
  - `doctor_schedules`: doctor_id, location_id, weekday, start, end, slot_minutes, max_per_slot.
  - `schedule_exceptions`.
  - `appointments`: patient_id (null for phone bookings), walkin_name, walkin_mobile, doctor_id, date, slot_start,
    slot_end, channel, status (`APPOINTMENT_STATUSES`), encounter_id. Partial unique index on (doctor_id, date,
    slot_start, seq).
  - The FK for `encounters.appointment_id`.
- **API** (`/tenant/m/appointments`, permission appointments.manage):
  - `GET|PUT /schedules/:doctorId`.
  - `GET /slots?doctorId&date` → `SlotDto[]`.
  - `POST /appointments` `bookCounterAppointmentSchema` → `AppointmentDto`. Booking without a `patientId` requires the
    feature phone-appointment-without-registration.
  - `POST /appointments/:id/{reschedule|cancel}`.
  - `GET /diary` → `DiaryDto`.
- **API** (`/tenant/m/opd-visit`, permission opd.manage):
  - `POST /visits` `registerVisitSchema` → `EncounterDto`, for check-in or counter walk-in. It posts the consultation
    charge (new or follow-up tariff) and issues the token.
  - `GET /queue` → `OpdQueueItemDto[]`; `POST /visits/:id/status`.
  - `GET /reports/{visit-register|visit-detail-by-doctor|visit-statistics}`.
  - Implements `DiaryReader`.
- **Web:** `/app/appointments` (diary), `/app/appointments/new`, `/app/opd/queue`, `/app/opd/visits`, `/app/opd/reports`.
- **Acceptance:**
  - Slots respect schedules and exceptions.
  - Two concurrent bookings of one slot give 1 success and 1 × 409.
  - Check-in creates exactly 1 encounter and 1 charge, even on an Idempotency-Key replay.
  - A phone booking links to the patient on arrival.

### B3 Doctor workspace: case paper, prescriptions, orders (OPD + IPD CPOE)
`feat/b-b3-doctor` · depends on B0 · **composer-2.5** · migrations **0130–0139** · dir `doctor`
- **Tables:** `order_sets` (name, kind, items jsonb, owner doctor_id null) and `prescription_templates`.
- **API** (`/tenant/m/opd-visit/doctor` and `/tenant/m/cpoe`; permission clinical.order, reads need clinical.view):
  - `GET /my-queue?date`.
  - `GET|PUT /encounters/:id/case-paper` `casePaperSchema` → `CasePaperDto` (notes, ICD-10 diagnosis, advice, vitals,
    orders and alerts, all through B0 services).
  - `POST /encounters/:id/prescription` `prescriptionSchema` → `ClinicalOrderDto`. An allergy conflict needs an
    `overrideReason`.
  - `GET /encounters/:id/print/{case-paper|prescription|investigation}.{pdf|html}`.
  - CPOE routes: `GET /inpatients`; `POST /encounters/:id/orders/{diagnostic|procedure}`; `GET|POST /order-sets`;
    `POST /encounters/:id/admission-request` (calls `AdmissionRequestSink`); `GET /encounters/:id/vitals-graph`.
- **Web:**
  - Owns `apps/web/src/app/app/clinic/**` and `apps/web/src/features/clinical/orders/**` (the `OrderEntryPanel` and
    `PrescriptionEditor` components).
  - Screens: `/app/clinic`, `/app/clinic/encounters/[id]` (keyboard-first prescription entry), `/app/clinic/inpatients`,
    `/app/clinic/order-sets`.
- **Acceptance:**
  - Lotus can write a case paper and prescription, but gets 403 on procedure orders and order sets.
  - A lab order from the case paper reaches the worklist with exactly 1 charge.
  - An allergy conflict blocks the prescription unless overridden.
  - The prescription PDF shows the doctor's registration number.

### B4 ADT and bed management
`feat/b-b4-adt` · depends on B0 · **grok-4.7-high** · migrations **0140–0149** · dir `adt`
- **Tables:**
  - `wards` (code, ward_type, is_icu, bed_service_id) and `rooms`.
  - `beds` (label, ward_class, status).
  - `admissions`: encounter_id unique, number (IP), admission_type, attendant, provisional_diagnosis, status
    (admitted/discharge_initiated/discharged/cancelled), discharge_type.
  - `bed_assignments`: from_at, to_at. Partial unique indexes on bed_id and on admission_id WHERE to_at IS NULL.
  - `admission_requests`.
  - `discharge_summaries`: sections jsonb, status (draft/final).
- **API** (`/tenant/m/adt`, permission adt.manage):
  - Masters: `GET|POST|PATCH /wards|rooms|beds`. `GET /bed-board` → `BedBoardDto`.
  - `POST /admissions` `admitSchema` → `AdmissionDto`. Opens the IPD encounter, assigns the bed and sets the bed labels.
  - `POST /admissions/:id/transfer`.
  - `POST /admissions/:id/discharge`. If `DischargeClearance` fails it returns 422 `billing_not_cleared`, unless the
    user has billing.ip.manage and gives an `overrideReason`.
  - Discharge summary (Medium): `GET|PUT /admissions/:id/summary`; `POST …/summary/finalise`.
  - `POST /bed-charges/post?date=`: idempotent per (bed_assignment, date); applies `room_rent_rule`.
  - `GET /admission-requests` (implements `AdmissionRequestSink`).
  - Prints: `…/print/{sticker|summary}`. Reports: `/reports/{admissions|transfers|discharges}`.
- **Web:** `/app/adt` (bed board), `/app/adt/admit`, `/app/adt/admissions/[id]`, `/app/adt/admissions/[id]/summary`,
  `/app/adt/masters`, `/app/adt/reports`.
- **Acceptance:**
  - Two concurrent admissions to one bed give 1 success and 1 × 409.
  - A transfer runs in one transaction.
  - Re-posting bed charges for the same date creates no duplicates.
  - A private room at ₹6,000 per day is taxed at 5%; ICU at ₹8,000 per day is 0%.
  - Lotus gets 403 on discharge summaries.

### B5 Billing core and OP billing
`feat/b-b5-billing` · depends on B0 · **grok-4.7-high** · migrations **0150–0159** · dir `billing`
- **Tables:**
  - `bills`: kind (op/ip), number, doc_type, status (draft/final/cancelled), pay_class (cash/credit/free), payer_id,
    subtotal, discount, cgst, sgst, igst, round_off, total, paid.
  - `bill_lines`: charge_id unique, plus a snapshot of the charge and its tax split.
  - `deposits`, `bill_settlements`, `concessions` (requested_by, approved_by), `refunds`, `credit_notes` (CN).
- **API** (`/tenant/m/op-billing`, permission billing.op.post; approvals need billing.op.refund):
  - Masters: `GET|POST|PATCH /services|tariffs` (tenant.manage or accounts.manage).
  - `POST /bills` `createOpBillSchema` → `BillDto`, built from unbilled charges with GST resolved.
  - `POST /bills/:id/finalise` assigns the bill number.
  - `POST /bills/:id/settle` `settleSchema`, by cash, UPI, card, deposit or credit.
  - `POST /bills/:id/concessions|refund`.
  - `POST|GET /deposits`; `POST /deposits/:id/refund`.
  - `GET /bills/:id/print`.
  - Reports: `/reports/{cash|revenue|doctor-sharing|outstanding|deposits|visit-statistics}`.
  - Implements `BillingStatusReader`, plus `billing/engine.ts` (`buildBill`, `settle`, `refund`), which B6 reuses.
- **Web:** `/app/billing` (cashier desk), `/app/billing/bills/[id]`, `/app/billing/deposits`, `/app/billing/refunds`,
  `/app/billing/services`, `/app/billing/reports`.
- **Acceptance:**
  - A bill with only exempt lines is a `bill_of_supply` with zero tax; a mixed bill is an `invoice_cum_bill_of_supply`.
  - Line paise sum exactly to the total, and round-off is at most ₹0.50.
  - A replayed settle writes 1 ledger row.
  - A refund over the paid amount returns 422.
  - A free bill needs approval.
  - The cash summary includes every module's `cash_ledger` rows.

### B6 IP billing, credit/TPA hooks and discharge clearance
`feat/b-b6-ipbilling` · depends on B4 and B5 · **grok-4.7-high** · migrations **0160–0169** · dir `ipbilling`
- **Tables:**
  - `payers` (kind tpa/insurer/corporate/scheme, gstin, state_code, credit_days).
  - `encounter_payers` (policy_no, preauth_amount, approved_amount, status).
  - `payer_receivables` (status open/submitted/settled/denied).
  - An `IpBillHook` registry, where the Phase C Insurance module will plug in.
- **API** (`/tenant/m/ip-billing`, permission billing.ip.manage):
  - `POST /encounters/:id/charges` `manualChargeSchema`; `POST /charges/:id/reverse`.
  - `GET /encounters/:id/statement` → `StatementOfAccountDto`.
  - `POST /encounters/:id/bills` (interim or final); `POST /bills/:id/split` (patient share vs payer share). Settlement,
    concessions and deposits go through the B5 engine.
  - `GET|POST|PATCH /payers`; `GET|PUT /encounters/:id/payer`.
  - Reports: `/reports/{bill-register|concessions|outstanding|revenue|doctor-sharing|deposits|cash}`.
  - Implements `DischargeClearance`: all charges are billed, and the patient share after deposits is ≤ 0.
- **Web:** `/app/ip-billing` (running balances), `/app/ip-billing/[encounterId]`, `/app/ip-billing/payers`,
  `/app/ip-billing/reports`.
- **Acceptance:**
  - Deposits are adjusted on the final bill.
  - A TPA split creates a receivable.
  - IGST applies when the payer's GSTIN is in another state.
  - In an end-to-end test with B4, discharge is blocked until the balance is cleared.

### B7 Pharmacy and stores
`feat/b-b7-pharmacy` · depends on B0 · **grok-4.7-high** · migrations **0170–0179** · dir `pharmacy`
- **Tables:**
  - `pharmacy_items` (generic_code, brand, form, strength, hsn, gst_rate_bp, reorder_level, schedule H/H1/X/OTC).
  - `pharmacy_suppliers`.
  - `pharmacy_batches` (batch_no, expiry, mrp_paise, purchase_rate_paise).
  - `pharmacy_stock`: PK (batch_id, location_id), CHECK qty ≥ 0, updated with `FOR UPDATE`.
  - `pharmacy_stock_moves`: append-only, signed qty.
  - Document tables with lines: `pharmacy_grns` (GR), `pharmacy_sales` (PS), `pharmacy_sale_returns` (PR),
    `pharmacy_ip_issues`, `pharmacy_adjustments`.
- **API** (`/tenant/m/pharmacy`, permission pharmacy.manage):
  - Masters: `GET|POST|PATCH /items|suppliers`.
  - `POST /grns`; `POST /supplier-returns`.
  - `GET /stock`; `GET /prescriptions/open` → `ClinicalOrderDto[]`.
  - `POST /sales` `pharmacySaleSchema`. It picks batches first-expiry-first (FEFO), blocks expired batches, extracts
    the GST from the MRP, records payment through `CashLedger` and calls `recordFulfilment`.
  - `POST /sales/:id/return`.
  - `POST /ip-issues|/ip-issues/:id/return` posts exempt charges and reverses them on return.
  - `POST /adjustments`; `GET /sales/:id/print` (the tax invoice).
  - Reports: `/reports/{stock-register|receipts|rejections|issues|issue-returns|adjustments|ip-statement|expiry|purchases}`.
- **Web:** `/app/pharmacy` (prescription queue → dispense), `/app/pharmacy/sales/new`, `/app/pharmacy/ip-issues`,
  `/app/pharmacy/grn`, `/app/pharmacy/stock`, `/app/pharmacy/items`, `/app/pharmacy/reports`.
- **Acceptance:**
  - Concurrent sales of the last unit give 1 success and 1 × 409 `insufficient_stock`.
  - Stock always equals the sum of moves (property test).
  - An MRP of ₹112.00 at 12% splits into ₹100.00 taxable value and ₹12.00 tax.
  - An IP issue posts an exempt charge, and returning it reverses the charge.
  - Expired batches are blocked.

### B8 Laboratory (LIS)
`feat/b-b8-lab` · depends on B0 · **grok-4.7-high** · migrations **0180–0189** · dir `lab`
- **Tables:**
  - `lab_tests` (service_id unique, specimen, container, tat_hours).
  - `lab_test_params` (unit, value_type, decimals, ref_ranges jsonb by sex and age band, critical_low/high, options).
  - `lab_accessions` (order_item_id unique, number LA, barcode, status
    ordered/collected/received/resulted/verified/reported/rejected).
  - `lab_results` (value_num, value_text, flag N/L/H/LL/HH, entered_by, verified_by, version).
  - `lab_interfaces` (kind mock_astm, token_hash).
- **API** (`/tenant/m/lab`, permission lab.manage):
  - `GET|POST|PATCH /tests` and their params.
  - `GET /worklist` → `LabWorklistItemDto[]`.
  - `POST /accessions` `collectSampleSchema`. OPD orders must be settled first, unless `lab.collectBeforePayment` is on.
  - `POST /accessions/:id/{receive|reject}`.
  - `PUT /accessions/:id/results` (values are auto-flagged).
  - `POST /accessions/:id/verify` (permission lab.verify); this marks the order item done.
  - `GET /accessions/:id/report`; `POST /accessions/:id/email` (mock).
  - `GET /patients/:id/history`; `GET /reports/mis`.
  - `POST /interfaces/:id/ingest` `analyzerResultSchema`, through a mock `LabAnalyzerAdapter`. It authenticates with
    the interface token, not a session.
  - Implements `LabResultsReader`.
- **Web:** `/app/lab` (worklist), `/app/lab/accessions/[id]` (units and ranges beside each input; critical values in
  danger colour with a label), `/app/lab/tests`, `/app/lab/reports`.
- **Acceptance:**
  - Flags are correct per sex and age band.
  - A verified report is immutable; an amendment becomes version 2 and is audited.
  - Lotus gets 403 on the whole module.
  - Ingest without the token is rejected.

### B9 Nurse workbench (web, plus the nursing API reused by mobile)
`feat/b-b9-nursing` · depends on B0 · **composer-2.5** · migrations **0190–0199** · dir `nursing`
- **Tables:**
  - `mar_schedules` (order_item_id, encounter_id, scheduled_at): generated from `FREQUENCIES` for IPD medicine orders;
    regeneration is idempotent.
  - `medication_administrations` (status given/held/refused/missed/self, dose_given, given_at, given_by, reason, and
    witness_user_id for high-alert drugs).
- **API** (`/tenant/m/nurse-station`, permission nursing.manage):
  - `GET /ward` → `WardPatient[]`.
  - `GET /encounters/:id/{orders|results|doctor-notes|vitals-chart}`.
  - `GET /encounters/:id/mar?date` → `MarDose[]`.
  - `POST /mar/:doseId/administer` `giveDoseSchema`. Giving a dose more than 60 minutes early requires a reason.
  - `GET /diet`; `POST /encounters/:id/diet` (through `OrderService`).
  - `GET …/print/{investigation|medicine}-prescription`.
  - Implements `NursingService`.
- **Web:** `/app/nursing` (ward census), `/app/nursing/encounters/[id]` (Orders, MAR, Vitals table and graph, Diet,
  Notes), `/app/nursing/diet`.
- **Acceptance:**
  - A TDS order creates 3 doses a day, and regenerating creates no duplicates.
  - A dose cannot be given twice.
  - Cancelling an order voids its future doses.
  - The vitals graph has a data-table fallback.

### B10 Mobile portal API (A3 patient, A4 doctor, A5 nurse)
`feat/b-b10-portal-api` · depends on B2, B5, B9 (B3 and B8 only via the registry) · **grok-4.7-high** · migrations
**0200–0209** · dir `portal`
- **Tables and function:**
  - `patient_portal_links` (user_id unique, patient_id, verified_at) and `patient_feedback`.
  - Definer function `hos_portal_tenant(slug)`: returns an active tenant's id. It is REVOKEd from PUBLIC, granted to
    hos_app, and has its own test.
- **Routes:**
  - The `/patient/*` and `/doctor/*` routes exactly as in `apps/mobile/API_PROPOSAL.md`, using the `mobile.ts` DTOs.
  - `POST /portal/:slug/signup` `patientSignupSchema`: mock OTP, then a `users` row with role `patient`, linked to an
    existing UHID (matched on mobile + DOB) or to a new patient.
  - `GET /doctor/catalog/{lab-tests|drugs}`.
  - Nurse: `GET /nurse/ward`; `GET /nurse/encounters/:id/{orders|mar|vitals|diet}`; `POST` for vitals, MAR
    administer and diet.
  - Gates: the android-* module plus the matching §2 feature. Patient routes also need `portal.self` and are filtered
    to the linked patient.
- **Acceptance:**
  - Another patient's visit or bill returns 404.
  - Doctor orders use `doctors.user_id`.
  - A booking replays correctly with its Idempotency-Key.
  - An un-entitled tenant gets 403 `not_entitled`.
  - Native header auth works, and CSRF is still enforced.

### B11 Mobile screens against the real API
`feat/b-b11-mobile` · depends on B10 for the end-to-end run (can start alongside it on shared DTOs and `mockClient`) ·
**composer-2.5** · no migrations · owns `apps/mobile/**`
- **A3 (patient):** OTP sign-up, profile, booking, visits with lab results and prescriptions, bills and deposits,
  feedback.
- **A4 (doctor):** diary, visit detail, medical diary with test and drug pickers.
- **A5 (nurse):** replaces the `app/nurse` placeholder. A Ward list, then a patient chart with Orders, Vitals, MAR
  (give/hold) and Diet tabs.
- **Sync:** `httpClient` sends `x-hos-session`. Vitals drafts and feedback queue offline with a "Waiting to sync"
  banner. Money and booking actions are never queued.
- **Acceptance:**
  - `npm run typecheck -w @hos/mobile` and the fixture-mode tests pass.
  - The PR notes record an Expo web smoke test against the local API.
  - Touch targets are 48 px, and the current location stays visible.

## 5. Waves, models and parallelism
Each wave ends with an Opus review. Merge branches in migration-number order, then run
`npm run db:migrate && npm test` on `main`.

| Wave | 5 workers | 3 workers | Needs merged |
|---|---|---|---|
| W0 | B0 (grok) | B0 | Phase A |
| W1 | B1 (composer), B2 (grok), B4 (grok), B5 (grok), B7 (grok) | B2, B4, B5 | B0 |
| W2 | B3 (composer), B6 (grok), B8 (grok), B9 (composer) | B1, B7, B8 | B4 + B5 (for B6) |
| W3 | B10 (grok), B11 (composer) | B3, B6, B9 | B2, B5, B9 (for B10) |
| W4 | Opus integration pass | B10, B11, then the integration pass | all |

- **Critical path.** B0 → B4/B5 → B6, and B9 → B10 → B11 end-to-end. B0 is the only serial step: keep it tight and
  merge it fast.
- **Integration pass.**
  - Run the full Sunrise flow: register → book → check in → case paper with a prescription and a CBC order → bill
    and pay → collect sample → result → dispense → admit → record on the MAR → settle the IP bill → discharge.
  - Write `docs/PHASE_B_REPORT.md` and a CONTRACTS addendum, and update the README.
- **Machine limits (CLAUDE.md).**
  - Run at most 2 DB-backed test suites at once.
  - Each worker uses its own database, `hos_b<id>`, on the shared `hospital-os` Postgres (port 55432).
  - Stop every dev server you start.

## 6. Out of scope (Phase C backlog)
- Doctor Accounting sharing rules and payables (Phase B only reports revenue by performing doctor).
- The Insurance claims workflow (Phase B adds payer hooks only).
- Pharmacy purchase orders, payment approvals and supplier payables.
- Radiology, OT and blood bank.
- Real analyser protocols (ASTM/HL7), ABDM/FHIR, and real SMS, email or WhatsApp.
- xlsx exports and Hindi strings.
- The audit-chain tail anchor and field-level encryption.
