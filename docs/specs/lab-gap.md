# Laboratory gap audit (LAB-T1)

Audited **main** (B8 is on this branch). `git diff main feat/integrate-6` and `git diff main feat/b-b6` are empty for `apps/api/src/clinical/lab`, `packages/db/migrations/0180_lab_tables.sql`, and `apps/web/src/app/app/lab`. `feat/integrate-6` is OP billing definers (`0153_billing_definers.sql`) plus PHI scope `0900`/`0901`. `feat/b-b6` is IP payer tables. No lab checklist row exists only on those branches.

Module key `lab`. API prefix `/api/v1/tenant/m/lab`. Feature keys in `CLINICAL_FEATURES.lab` match S1 r76–r84 (`lab.sample-collection`, `lab.result-entry`, `lab.master-template`, `lab.lab-result-report`, `lab.patient-history`, `lab.sample-status`, `lab.lab-mis`, `lab.send-result-on-email`, `lab.2-lab-equipments`). Email tier conflict with Sheet3 stays **OPEN (#24)**. LAB MIS vs "LAB Statistics" stays **OPEN (#34)**. "2 Lab Equipments" cap stays **OPEN (#33)**; the code does not cap instrument count.

## Matrix

| Kind | Item | Status | Evidence | Gap |
|---|---|---|---|---|
| checklist | S1 r76 Sample Collection | partial | `collectSample`, `receiveSample`, `rejectSample` (`apps/api/src/clinical/lab/service.ts`); `POST …/accessions`, `…/receive`, `…/reject`; worklist collect on `apps/web/src/app/app/lab/page.tsx` | `barcode` is set to the accession `number` (`collectSample`). Result print draws it (`labReportPrint` barcode block). No tube-label print. Collect inserts `status = collected` (no `ordered` row). `UNIQUE (tenant_id, order_item_id)` blocks a second sample. |
| checklist | S1 r77 Result Entry | partial | `saveResults`, `scoreValue` / `flagLabValue`; `PUT …/accessions/:id/results`; accession page save | Flags `N/L/H/LL/HH` and age/sex bands on `lab_test_params.ref_ranges`. No delta check. Critical flag is stored, not notified. No `source` manual vs instrument. |
| checklist | S1 r78 Master Template | partial | `lab_tests`, `lab_test_params` (`0180_lab_tables.sql`); CRUD under `…/tests`; page `apps/web/src/app/app/lab/tests/page.tsx` | One test per service, parameters with unit, type, decimals, ref bands, critical low/high, coded options. No named multi-test panel. |
| checklist | S1 r79 Send Result on EMAIL | partial | `emailReport`; `POST …/accessions/:id/email`; feature `lab.send-result-on-email`; test "403 … for Sunrise email" in `lab.test.ts` | Plaintext body via `deps.email.send` template `lab_result`, not a password-protected PDF. Body `to` may override the patient address. No `report_delivery` consent. No `lab_report_deliveries`. Not in `IDEMPOTENT_POSTS`. No Email button (`lab/api.ts` has no email call). Sets accession `reported` as a side effect of send. |
| checklist | S1 r80 Lab Result Report | partial | `reportFor`, `labReportPrint`; `GET …/accessions/:id/report?format=json\|html\|pdf`; Preview/PDF on `apps/web/src/app/app/lab/accessions/[id]/page.tsx` | PDF/HTML exist. Sign-off is permission `lab.verify` (`verifyAccession`), not a pathologist role. `reported` is only set by email. Unverified preview is allowed (`Laboratory report (not verified)`). |
| checklist | S1 r81 Interface: 2 Lab Equipments | partial | `lab_interfaces` (`kind` check `mock_astm` only); `hos_lab_interface_open` (`0181_lab_rls.sql`); `POST …/interfaces/:id/ingest`; `mockAstmAdapter.parse` (`adapter.ts`); `applyAnalyzer`; seed insert in `packages/db/src/seed-clinical/lab.ts`; test rejects a bad token then accepts after the feature grant | JSON body validated by `analyzerResultSchema`, not ASTM E1394 framing or HL7 v2. No test-code map, message log, instrument CRUD, or web `/app/lab/instruments`. No serial/TCP connector. Unknown accession is 404, not a parked error. Token is hashed. No per-tenant cap (#33). |
| checklist | S1 r82 Patient History | partial | `reportsForPatient`; `GET …/patients/:id/history`; history table on `apps/web/src/app/app/lab/reports/page.tsx` | List of verified/reported accessions (name, status, reportedAt). No `parameterId`, no cumulative values, no trend. |
| checklist | S1 r83 Sample Status | partial | `worklist`; `GET …/worklist`, `GET …/accessions/:id`; status board on `/app/lab` | DB statuses: `ordered`, `collected`, `received`, `resulted`, `verified`, `reported`, `rejected`. Worklist uses synthetic `pending` when no accession exists. No `in_process`. No `lab_sample_events`. Reject stores `reject_reason` text, no reason code, no recollection link. |
| checklist | S1 r84 LAB MIS | partial | `misReport`; `GET …/reports/mis`; four figures on `/app/lab/reports` | Returns `total`, `byStatus`, `criticalCount`, `tatBreaches` for a date range. No counts/revenue by test, department, or referrer; no TAT by test; no rejection rate. No CSV/PDF. Sheet3 name left open (#34). |
| workflow | Status board ordered → collected → received → in process → resulted → validated → reported, plus rejection and recollection | partial | `worklist`, `collectSample`, `receiveSample`, `saveResults` (sets `resulted`), `verifyAccession` (sets `verified`), `emailReport` (sets `reported`), `rejectSample` | No in-process state. `validated` is `verified`. `reported` means emailed. Recollection cannot insert a second accession for the same order item (`409 accession_exists`). |
| workflow | Patient history cumulative table and trend | missing | `reportsForPatient` | Report list only. |
| workflow | Email PDF via C4, final only, consent `report_delivery`, password DOB | partial | `emailReport` requires `report.immutable` (a verified version) | Not C4 outbox row shape, not PDF, no consent, no password. `to` override. |
| workflow | ASTM then HL7, test-code map, machine values for review, mock connector | partial | `applyAnalyzer` maps `paramCode` to `lab_test_params.code` and calls `saveResults` (status stays `resulted` until verify) | Ingest is JSON. Codes must already equal parameter codes. No sample ASTM file replay. `lab_interfaces.kind` cannot be `hl7`. |
| workflow | LAB MIS volume, revenue, TAT, rejection rate, critical values | partial | `misReport` | Volume by status, critical accession count, TAT breach count. The rest is absent. |
| workflow | Critical read-back log and escalation | missing | Flag `LL`/`HH` on `lab_results.flag`; print paragraph says a clinician must see criticals | No `lab_critical_notifications`, no outbox, no read-back, no 30-minute escalation. |
| workflow | Pathologist sign-off before `reported`; tech alone stops at `validated` | partial | `verifyAccession` requires `lab.verify` and sets `verified` | Any user with `lab.verify` is the signatory. There is no `validated` status. `reported` is the email side effect, not a second sign-off. |
| screen | `/app/lab/samples` status board | partial | Implemented as `/app/lab` | Filters: to do, not collected, collected, received, resulted, verified. No rejected filter in `FILTERS`. |
| screen | `/app/lab/patients/[id]/history` | partial | Patient search + table on `/app/lab/reports` | Not a patient route. No trend chart. |
| screen | Email action on the report | missing | Accession page has Preview report and PDF download only | No call to `POST …/email`. |
| screen | `/app/lab/instruments` | missing | No page under `apps/web/src/app/app/lab` | Setup is a seed row. |
| screen | `/app/lab/mis` | partial | Same `/app/lab/reports` page | Four numbers, not the spec breakdown. |
| table | `lab_sample_events` | missing | Status timestamps live on `lab_accessions` (`collected_at`, `received_at`, `verified_at`, `reported_at`, `rejected_at`, `reject_reason`) | No event history. |
| table | `lab_instruments` and `lab_instrument_test_map` | partial | `lab_interfaces` (id, location, name, kind, token_hash, active) | No make/model, no protocol enum `astm\|hl7`, no test map. |
| table | `lab_instrument_messages` | missing | Ingest does not persist raw or parsed messages | Unknown sample is not parked. |
| table | `lab_result_values.source` and `instrument_message_id` | missing | `lab_results` has value, flag, entered_by, verified_by, version | Analyser writes are indistinguishable from manual rows. |
| table | `lab_report_deliveries` | missing | `emailReport` updates the accession and audits `lab.result.email` with `to` | No delivery row, no outbox id. Audit stores the destination address. |
| table | `lab_critical_notifications` | missing | — | Not created. |
| table | `lab_sample_rejections` | partial | `lab_accessions.reject_reason` text | No reason code table. Same row, so recollection cannot keep the rejected sample and add another. |
| api | `GET /tenant/lab/samples/board` | partial | `GET /api/v1/tenant/m/lab/worklist` → `worklist` | Query `status`, no `date`. Feature `lab.sample-status`. |
| api | `GET /tenant/lab/patients/:patientId/history?parameterId` | partial | `GET …/patients/:id/history` → `reportsForPatient` | No `parameterId`. |
| api | `POST /tenant/lab/reports/:id/email` | partial | `POST …/accessions/:id/email` → `emailReport` | See r79. Idempotency not required. |
| api | `POST /tenant/lab/instruments/:id/messages` and instrument CRUD / test-map | partial | `POST …/interfaces/:id/ingest` only; auth is `x-lab-interface-token` + `hos_lab_interface_open`; `assertEquipment` checks `lab.2-lab-equipments` | No CRUD, no test-map routes. Machine principal is the token function, not a new `TENANT_GUARDS` principal type (the route is listed so the inventory stays closed; `openTenant` is not used). |
| api | `GET /tenant/lab/mis/{volume,tat,rejections,critical}` | partial | One route `GET …/reports/mis` → `misReport` | Not four resources. |
| rule | Machine values never auto-validate | done | `applyAnalyzer` calls `saveResults`, which sets `resulted`. `verifyAccession` is a separate `lab.verify` call. Ingest refuses `verified` and `reported` (`409 immutable_report`) | Met. |
| rule | Rejected samples keep history; recollection is a new sample on the same order | partial | `rejectSample` keeps the accession and sets `rejected` | History is one row. A new sample for that order item is `409 accession_exists`. |
| rule | Email only to the registered address, and only for a final report | partial | `emailReport` requires a verified version and falls back to `patients.email` | Caller may pass `to`. No consent check. |
| rule | Instrument keys hashed, rotatable, one location; unknown sample parked `error` | partial | `token_hash`; `hos_lab_interface_open` matches hash and `active`; null location falls back to primary location in the ingest handler | No rotate route. Unknown accession is 404. Messages are not stored. |

## Reuse decisions

- Extend `lab_accessions`, `lab_results`, `lab_test_params`, and `lab_interfaces`. Do not add a parallel LIS.
- Recollection: drop or narrow `UNIQUE (tenant_id, order_item_id)` and point the new accession at the rejected one. Keep the rejected row.
- History trend reads `lab_results` joined to params. Do not copy results into a history table.
- Instrument ingest stays `POST …/interfaces/:id/ingest` and `applyAnalyzer`. Replace `mockAstmAdapter.parse` with a real ASTM parser; add HL7 as a second parser. Add `lab_instrument_test_map` and a message table rather than overloading `lab_results`.
- Email should call the existing mock mail sender only after consent, and should store a delivery row. Do not invent a second mailer. Password PDF is new; the HTML/PDF renderer in `lab/prints.ts` is the document to protect.
- Critical alerts should use the notification outbox once it exists (C4). Until then a `lab_critical_notifications` row is the record. Do not put patient names in `audit_log` (today `lab.result.email` stores `to`).
- `verifyAccession` stays the tech/sign step. A pathologist gate is an extra transition, not a rewrite of result entry.
- Nothing on `feat/integrate-6` or `feat/b-b6` is a lab merge.

## Proposed next-task adjustments

- **LAB-T2 shrinks** the board and the reject-in-place behaviour (`worklist`, `rejectSample`). **LAB-T2 grows** recollection (unique order-item constraint), an event or reason-code record, and a real history endpoint (`parameterId`, values across visits). Do not rebuild collect/receive/result save.
- **LAB-T3 stays large.** Email, consent, password PDF, delivery row, MIS dimensions, read-back, and a sign-off that is not "anyone with `lab.verify`" are all open. Shrink only the Premium 403, which the Sunrise email test already covers, and the "verified before send" check inside `emailReport`. Stop using email to mean `reported`.
- **LAB-T4 shrinks** token auth (`hos_lab_interface_open`), the Premium feature check, and "do not auto-verify". **LAB-T4 grows** ASTM framing, HL7, test-map, message log, parked errors, and a connector script. The current parser accepts JSON.
- **LAB-T5 shrinks** the worklist page, template page, report preview, and the thin MIS/history page. **LAB-T5 still adds** the trend chart, email action, instrument setup, and the fuller MIS. Routes are `/app/lab` and `/app/lab/reports`, not the spec paths.
