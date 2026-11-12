# Nurse Station gap audit (NS-T1)

Audited **main** (B9 is on this branch). `git diff main feat/integrate-6` is empty for `apps/api/src/clinical/nursing`, `packages/db/migrations/0190_nursing_tables.sql`, and `apps/web/src/app/app/nursing`. `git diff main feat/b-b6` does not touch those paths. `feat/integrate-6` only adds OP bill/deposit/cash definers (`0153_billing_definers.sql`) and PHI platform-scope migrations `0900`/`0901`. `feat/b-b6` adds IP payer tables in `packages/db/src/clinical/ipbilling.ts`. None of that completes a Nurse Station row. No row is "done (pending merge)".

The spec asked for `nursing-gap.md`. This file is `nurse-station-gap.md` as the W0 worker brief names it.

Module key `nurse-station`. API prefix `/api/v1/tenant/m/nurse-station`. Web `/app/nursing` (there is no `/app/nursing/ward`). Feature keys that exist are the seven Sheet1 slugs in `CLINICAL_FEATURES.nurseStation` (`packages/shared/src/clinical/features.ts`). There is no `nurse_station.vitals`, `.mar`, or `.diet` key. Vitals, MAR, and diet tier stay **OPEN – to confirm with Ajay Sheth (#19)**.

Status is done / partial / missing against `docs/specs/gap-nurse-station.md`.

## Matrix

| Kind | Item | Status | Evidence | Gap |
|---|---|---|---|---|
| checklist | S1 r85 Lab Orders | partial | `GET …/encounters/:id/orders` → `encounterOrders` (`apps/api/src/clinical/nursing/service.ts`); feature `nurse-station.lab-orders`; web Orders tab `apps/web/src/app/app/nursing/encounters/[id]/page.tsx` | View only. No nursing POST. `gateOrder` (`apps/api/src/clinical/module-routes.ts`) requires module `lab` and `opd.manage` or `clinical.order`, not `nursing.manage`. |
| checklist | S1 r86 Medicine Orders | partial | Same GET; filter `kind in (lab, medicine)` in `encounterOrders`; feature `nurse-station.medicine-orders` | Same: no nurse-placed medicine order. MAR is a separate flow. |
| checklist | S1 r87 View Test Results | partial | `GET …/encounters/:id/results` → `summariesFor` (`apps/api/src/clinical/lab/service.ts`); feature `nurse-station.view-test-results`; `nursingApi.results` in `apps/web/src/features/clinical/nursing/api.ts` | Returns status/flag/reportedAt per lab order item, not result values. Radiology orders throw `not_available` in `orders.place` (`apps/api/src/clinical/orders.ts`). Encounter page never calls `results` (no Results tab). |
| checklist | S1 r88 Investigation Prescription | partial | `GET …/print/investigation/{pdf,html}` → `investigationPrescriptionDoc` (`apps/api/src/clinical/nursing/prints.ts`); handler `requireFeature(nurse-station.investigation-prescription)` | PDF/HTML exist. Encounter page does not link `printUrl`. `TENANT_GUARDS` print row has no feature (`apps/api/src/route-guards.ts`). |
| checklist | S1 r89 Medicine Prescription | partial | `GET …/print/medicine/{pdf,html}` → `medicinePrescriptionDoc` | Same: render exists, no screen action, guard row has no feature. |
| checklist | S1 r90 Doctors Notes | partial | `GET …/encounters/:id/doctor-notes` → `encounterNotes` reads `clinical_notes`; feature `nurse-station.doctors-notes`; Notes tab on the encounter page | On-screen table only. `printParams.kind` is `investigation \| medicine` (`nursing/routes.ts`). No notes print. |
| checklist | S1 r91 Patient Vitals Table / Graph | partial | `GET …/encounters/:id/vitals-chart` → `vitalsChart` reads `vital_signs`; feature `nurse-station.patient-vitals-table-graph`; `VitalsPanel` in the encounter page | Table plus a client pulse SVG. No other series. No vitals entry on this page. No range-alert flag. |
| checklist | ML A5 vital sign entry/view | partial | `POST /api/v1/tenant/clinical/encounters/:id/vitals` in `module-routes.ts` (`recordVitalsSchema`); module may be `nurse-station`, permission `nursing.manage`; table `vital_signs` (`packages/db/migrations/0101_clinical_tables.sql`) | Shared clinical route, not a nursing route. Zod bounds only. No alert row. No `nurse_station.vitals` key (#19). Nursing chart does not post vitals. |
| checklist | ML A5 medicine administration (MAR) | partial | Tables `mar_schedules`, `medication_administrations` (`0190_nursing_tables.sql`); `ensureMarForDay`, `marForEncounter`, `giveDose`; `GET …/mar`, `POST …/mar/:doseId/administer`; MAR tab + dialog | Schedule from IPD medicine orders, not from a pharmacy issue. No feature key (#19). See MAR rules below. |
| checklist | ML A5 diet order entry/view | partial | `POST …/encounters/:id/diet` → `placeDietOrder` → `orders.place` with `source: 'nurse'`; `GET …/diet` → `dietOrders`; page `apps/web/src/app/app/nursing/diet/page.tsx` | List only. `placeDiet` is not called by the page. No start/stop, no meal. Diet is `clinical_orders.kind = diet`, not a `diet_orders` table. No feature key (#19). |
| workflow | Ward census with bed, due-med alerts, pending results, latest vitals | partial | `wardPatients` (`nursing/service.ts`); page `apps/web/src/app/app/nursing/page.tsx` | Bed, UHID, name, age, doctor. No alerts and no latest vitals. Route is gated on `nurse-station.medicine-orders`. |
| workflow | Verbal/telephonic order, read-back, 24 h countersign, overdue report | missing | `clinical_orders` columns are `source`, `ordering_doctor_id`, `ordered_by_user_id`, `notes` (`0101_clinical_tables.sql`) | No `read_back_confirmed`, `countersigned_by`, `countersigned_at`. No overdue query. `source = nurse` is set only by `placeDietOrder`. |
| workflow | Medicine order → pharmacy IP issue → MAR | partial | MAR: `ensureMarForDay` on `clinical_orders` kind `medicine`. Pharmacy issue: `postIpIssue` (`apps/api/src/clinical/pharmacy/service.ts`) | MAR does not wait for an issue. `pharmacy_ip_issue_lines` has no `order_item_id`. No ward indent. |
| workflow | MAR 6 rights, high-alert second nurse, LASA banner | missing | `giveDoseSchema` (`packages/shared/src/mobile.ts`): `status`, `doseGiven`, `reason`, `witnessUserId`. `HIGH_ALERT_GENERIC_CODES` in `nursing/service.ts` | No 6-rights payload. Witness is an optional string, not a second login, and is not checked to be a different user. LASA is not on `pharmacy_items`. High-alert is a hardcoded generic set, not `items.high_alert`. |
| workflow | Vitals entry with range alerts, table and graph | partial | Entry: clinical POST above. Chart: `vitalsChart` + `VitalsPanel` | No configured range and no alert flag. Graph is pulse only. |
| workflow | Diet type, start/stop, kitchen list per ward and meal | partial | `dietOrders` filters `kind = diet`, `status = placed`, optional `wardCode` | Diet code + instructions. No start, stop, or meal. |
| workflow | Four prints under C6 | partial | `investigationPrescriptionDoc`, `medicinePrescriptionDoc` | Doctors-notes and vitals prints absent. No `report.export` audit. |
| screen | `/app/nursing/ward` | partial | Implemented as `/app/nursing` (`page.tsx`) | Path differs. Census columns are thin (see ward workflow). |
| screen | `/app/nursing/encounters/[id]` tabs Orders, Results, MAR, Vitals, Diet, Notes, Prints | partial | Tabs in `encounters/[id]/page.tsx`: Orders, MAR, Vitals, Notes | No Results, Diet, or Prints tab. Diet is `/app/nursing/diet`. |
| table | `mar_schedules` | done | `0190_nursing_tables.sql`; unique `(tenant_id, order_item_id, scheduled_at)` | Matches the spec schedule. `voided_at` is the stop flag. |
| table | `mar_administrations` | done | Table name is `medication_administrations` in `0190_nursing_tables.sql`; unique `(tenant_id, mar_schedule_id)` | Status check: `given`, `held`, `refused`, `missed`, `self`. `witness_user_id` exists. |
| table | `nursing_vitals` | partial | No such table. `vital_signs` in `0101_clinical_tables.sql` | Reuse `vital_signs`. Do not add a second vitals table. |
| table | `diet_orders` | partial | No such table. `clinical_orders` / `clinical_order_items.diet_code` | Reuse CPOE orders. |
| table | Order-on-behalf columns | missing | `clinical_orders` in `0101_clinical_tables.sql` | No countersign or read-back columns. |
| api | `GET /tenant/nursing/ward` | partial | `GET /api/v1/tenant/m/nurse-station/ward` → `wardPatients` | Query is `wardCode`, not `wardId`. Payload has no alerts. |
| api | `GET …/encounters/:id/summary` | missing | No summary route in `nursing/routes.ts` | Chart loads orders, notes, vitals, and MAR as four calls. |
| api | `POST …/lab-orders` and `…/medicine-orders` | missing | No POST in `nursing/routes.ts`. Shared `POST /api/v1/tenant/clinical/encounters/:id/orders` | Nurse permission cannot place lab or medicine orders (`gateOrder`). |
| api | `GET …/results` | partial | `GET …/nurse-station/encounters/:id/results` | Lab summary only. See r87. |
| api | `POST/GET …/vitals` | partial | GET is `…/vitals-chart`. POST is the shared clinical route | Not the spec path. GET is the chart, not a nursing write. |
| api | `POST …/mar/:scheduleId/administer` | partial | `POST …/mar/:doseId/administer` → `giveDose` | Param is the schedule id. Not in `IDEMPOTENT_POSTS` (`apps/api/src/http.ts`). No feature key. |
| api | `POST/PATCH …/diet-orders` | partial | `POST …/encounters/:id/diet` only | No PATCH, no stop. Not in `IDEMPOTENT_POSTS`. |
| api | `GET …/print/{investigation-rx,medicine-rx,doctor-notes,vitals}` | partial | `GET …/print/:kind/:format` with kind `investigation \| medicine` | Two of four. Format is an extra path segment. |
| rule | Second administration of the same slot is 409 | done | `giveDose` throws `409 already_given`; unique `(tenant_id, mar_schedule_id)`; test `cannot record the same dose twice` in `nursing.test.ts` | Met. |
| rule | Administering a stopped medicine is 422 | partial | `voidFutureForItem` sets `voided_at` when `scheduled_at > now`; `giveDose` throws `422 dose_voided` | Only future slots. A slot already due can still be given after cancel. Test covers future void, not the current slot. |
| rule | Vitals outside configured ranges raise an alert flag | missing | `POST …/vitals` inserts `vital_signs` and audits `clinical.vital.record` with `encounterId` only | No range table and no flag column. |
| rule | Notes and results stay out of the audit payload | done | `giveDose` audits `status` and `orderItemId`. Note and result reads are not audited | MAR write matches the no-PHI rule. Read-audit hook still does not exist (platform gap). |
| rule | Premium guard on S1 r85–r91 | partial | Orders, results, notes, vitals-chart, and the print handler call `requireFeature` | MAR, diet, and the ward route's guard row do not use a Sheet1 feature. Print's `TENANT_GUARDS` row omits the feature the handler checks. |
| rule | High-alert dose needs a second, different nurse | missing | `giveDose`: if generic is in `HIGH_ALERT_GENERIC_CODES` and `status = given` and `witnessUserId` is absent → `422 witness_required` | Not a re-login. Same user can be sent as witness. List is code, not item master. No test. |

## Reuse decisions

- Keep `vital_signs`. Do not create `nursing_vitals`.
- Keep diet as `clinical_orders` (`kind = diet`, `source = nurse`). Do not create `diet_orders`.
- Keep `mar_schedules` and `medication_administrations`. Add columns there for witness authentication and 6-rights flags. Do not rename the administration table in a migration unless a reader already depends on `mar_administrations` (nothing in repo does).
- Nurse-placed lab and medicine orders should call `orders.place` (`apps/api/src/clinical/orders.ts`) with `source: 'nurse'`. Change `gateOrder` so `nursing.manage` plus the Sheet1 feature is enough. Do not add a second order table.
- Results stay on `summariesFor` / lab accessions. Radiology is out of B9; the results route should keep ignoring it until radiology exists.
- Pharmacy IP issues stay in B7. MAR must not grow its own stock ledger. Linking an issue line to `order_item_id` is a pharmacy change (`pharmacy-gap.md`), not a new nursing table.
- `feat/integrate-6` and `feat/b-b6` have nothing to merge for this module.

## Proposed next-task adjustments

- **NS-T2 shrinks** the double-dose guard: `409 already_given` and the unique administration row are done. **NS-T2 grows** for: countersign columns, read-back, 24 h overdue report, 6-rights payload, real second-nurse check, `items.high_alert` / `items.lasa` (with pharmacy), nurse POST for lab and medicine orders, result values on the nursing summary, ward-census alerts, idempotency on administer, and 422 on a due slot after the order is stopped. Add `nurse_station.mar` (and the vitals/diet keys) without a tier until #19 is answered.
- **NS-T3 shrinks** investigation and medicine prints (`prints.ts` PDF/HTML) and the vitals series (`vitalsChart`). **NS-T3 still does** doctors-notes print, vitals print, and a graph beyond pulse. No new vitals table.
- **NS-T4 shrinks** the ward list, MAR table, notes table, and diet list, which already render. **NS-T4 still does** Results tab, print actions, diet entry, vitals entry on the chart, witness capture, and census alerts. Point links at `/app/nursing`, not `/app/nursing/ward`.
