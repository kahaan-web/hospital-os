# 03 · OT Scheduling

Doc module "OT SCHEDULING" [DOCS: ML #8]. It's a **name only**: no Sheet1 rows and no Android bullets. The related doc items are:
- CPOE "Procedure Orders" [DOCS: S1 r102];
- CPOE "Request Reservation / Admission" [DOCS: S1 r104];
- A1 "DOCTORS PERFORMANCE (SURGERY …)" [DOCS: ML A1].

Everything functional below is [DEFAULT, to confirm by research] unless tagged otherwise.

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md` for the sources and the verification detail. [DOCS] items above and below are unchanged.

- **WHO Surgical Safety Checklist** (sign-in, time-out, sign-out) is the expected template. NABH surveyors look for it, along with pre-op items: patient ID band, NPO status, vitals, allergy, site marking, PAC (pre-anaesthesia check) clearance, blood arranged, and **procedure-specific written consent with a witness**. Op notes are completed **before** the patient leaves for recovery. [RESEARCH-WEAK: Gemini, G3-1 Rely Technologies NABH checklist (vendor), verify; no NABH clause number]
- **Charging norms:** OT room time charged in a base slab (30 or 60 min) plus increments of 15 or 30 min; surgeon fee by surgery grade (minor / intermediate / major / super-major); **anaesthetist fee 30–40% of the surgeon fee**. [RESEARCH-WEAK: Gemini, no source, verify] Seeded as configuration (`ot_charge_rules`), not code.

## Purpose
Book operating theatres for surgeries and procedures, make sure the room, the team and the patient are ready, record what happened, and post the OT charges and surgeon fees.

## Users and roles
- OT Coordinator (new): schedules.
- Surgeon (Doctor): requests and records the operation notes.
- Anaesthetist (Doctor): records the anaesthesia type and notes.
- OT Nurse (Nurse): checklists, consumables.
- Cashier: sees OT charges.
- Location Admin: OT room master.

## Workflows
1. **Request.** A surgery request comes from a CPOE procedure order [DOCS: S1 r102], or the OT Coordinator enters it directly. It records:
   - patient and encounter (IP, or day-care OP);
   - procedure(s);
   - surgeon;
   - preferred date and time;
   - estimated duration;
   - anaesthesia type;
   - priority (elective, emergency).
2. **Schedule.**
   - The coordinator picks an OT room and slot.
   - The system blocks clashes on room, surgeon and anaesthetist.
   - The coordinator assigns the team.
3. **Pre-op readiness.** A configurable checklist covering:
   - consent recorded (yes/no plus document attachment, C5);
   - fitness, NPO and site marking;
   - blood arranged (link to a Blood Bank request).

   The seeded template is the **WHO Surgical Safety Checklist** (sign-in, time-out, sign-out) plus the pre-op items: ID band, NPO, vitals, allergy, site marking, PAC clearance, blood arranged, and procedure-specific consent with a **witness name**. The template is editable per tenant. [RESEARCH-WEAK: Gemini, R3.1, G3-1 vendor source, verify]
4. **Day of surgery.** Record these times:
   - in-room;
   - anaesthesia start;
   - incision;
   - closure;
   - out-room.

   Also record the sign-in, time-out and sign-out checklist states, the OT notes (operation notes template), and implants with batch or serial number.
5. **Consumables.** Issue from the OT store against the patient through C3. Billable items post through C1.
6. **Charging.** On completion, post:
   - the OT room charge (by duration slab or flat);
   - the surgeon and assistant fees;
   - the anaesthetist fee;
   - equipment charges.

   All through C1, with doctor attribution through C2. **Slabs** (`ot_charge_rules`): room = base slab (configurable 30 or 60 min) + per-increment (15 or 30 min) rate per room type; surgeon fee by grade (minor / intermediate / major / super-major); assistant % of the surgeon fee; anaesthetist = **% of the surgeon fee (seed 30%, range 30–40%)** or a flat amount per grade. [RESEARCH-WEAK: Gemini, R3.1, no source, verify]
7. **Postpone or cancel** with a reason code. Cancellation reasons are kept for MIS.

## Screens
- `/app/ot/schedule`: a day or week board, one row per room, with drag to reschedule and colour by status.
- `/app/ot/requests`: the request queue.
- `/app/ot/cases/[id]`: tabs for Details, Team, Checklist, Times, Notes, Consumables and Charges.
- `/app/ot/masters`: OT rooms, procedure catalogue (links to services), checklist templates.
- Reports:
  - OT register (date range);
  - surgeon-wise cases;
  - OT utilisation % by room;
  - cancellations by reason.

## Data model
- `ot_rooms(location_id, code, name, room_type enum major|minor|daycare|cathlab, active)`
- `ot_procedures(service_id FK, name, specialty, default_duration_min, anaesthesia_default, needs_implant bool)`
- `ot_requests(location_id, patient_id FK, encounter_id FK, cpoe_order_id FK null, procedure_id FK, surgeon_id FK, preferred_at, est_duration_min, priority enum elective|emergency, status enum requested|scheduled|cancelled, notes)`
- `ot_cases(request_id FK, ot_room_id FK, scheduled_start, scheduled_end, status enum scheduled|in_progress|completed|postponed|cancelled, cancel_reason_code null, in_room_at, anaesthesia_start_at, incision_at, closure_at, out_room_at, anaesthesia_type, op_notes text enc)`
- The DB uses an exclusion constraint (btree_gist) on `(tenant_id, ot_room_id, tstzrange(scheduled_start, scheduled_end))` where the status is active.
- `ot_case_team(case_id FK, doctor_id FK null, employee_id FK null, role enum surgeon|assistant|anaesthetist|scrub_nurse|circulating_nurse|technician)`
- `ot_checklists(case_id FK, template_id FK, phase enum pre_op|sign_in|time_out|sign_out, items jsonb, completed_by, completed_at)` and `ot_checklist_templates(name, phase, items jsonb)`
- `ot_implants(case_id FK, item_id FK, batch_no, serial_no, qty)`

## APIs (module `ot`; features `ot.scheduling`, `ot.case_record`, `ot.reports` [DEFAULT, to confirm by research])

| Method | Path | Feature | Roles |
|---|---|---|---|
| GET/POST | `/tenant/ot/requests` | ot.scheduling | Doctor, OT Coordinator |
| POST | `/tenant/ot/requests/:id/schedule` (Idem) | ot.scheduling | OT Coordinator |
| GET | `/tenant/ot/board?date&locationId` | ot.scheduling | OT staff, Doctor |
| PATCH | `/tenant/ot/cases/:id` (reschedule, team) | ot.scheduling | OT Coordinator |
| POST | `/tenant/ot/cases/:id/{start,complete,postpone,cancel}` (Idem) | ot.case_record | OT Nurse, Surgeon |
| PUT | `/tenant/ot/cases/:id/checklists/:phase` | ot.case_record | OT Nurse |
| PUT | `/tenant/ot/cases/:id/notes` | ot.case_record | Surgeon, Anaesthetist |
| POST | `/tenant/ot/cases/:id/consumables` (Idem) | ot.case_record | OT Nurse |
| GET/POST/PATCH | `/tenant/ot/masters/{rooms,procedures,checklist-templates}` | ot.scheduling | Location Admin |
| GET | `/tenant/ot/reports/{register,surgeon,utilisation,cancellations}` | ot.reports | Admin, MIS Viewer |

## Business rules and edge cases
- No overlapping active cases per room (enforced by the DB constraint). A surgeon or anaesthetist double-booking is a warning, with an override and a reason [DEFAULT, to confirm by research].
- A case can't start until the pre-op checklist is complete, unless the priority is emergency (override with a reason).
- `complete` needs out-room time ≥ in-room time, and the op notes present. The op notes must be signed **before** the patient is moved out of the OT to recovery or the ward; a later sign-off is flagged as a deviation. [RESEARCH-WEAK: Gemini, R3.1]
- Sign-out without the time-out recorded is blocked, except in an emergency with an override reason.
- Charges post once, on `complete`, and are idempotent. Cancelling after completion isn't allowed; reverse the charges through IP billing instead.
- Op notes and diagnosis are clinical data: stored `enc` and never sent to audit.
- Day-care cases on an OP encounter post to the OP account.

## Integrations
- CPOE: procedure orders.
- ADT: the encounter and pre-admission.
- IP/OP Billing: through C1.
- Doctor Accounting: surgeon shares.
- Pharmacy/Stores: consumables through C3.
- Blood Bank: reservation.
- Equipment Maintenance: OT equipment down blocks the room, as an optional warning.
- MIS: surgeries for A1 doctor performance.

## Tier
Not in Sheet1. **OPEN – to confirm with Ajay Sheth.** No default tier is set. (OPEN-QUESTIONS-AJAY #2) Feature keys exist so App Admin can assign any tier once decided.

## Acceptance criteria
- Scheduling two cases in the same room with overlapping times fails at the DB level (409).
- An elective case can't start with an incomplete checklist; an emergency case can, with an override reason that is audited.
- Completing a case posts room, surgeon and anaesthetist charges to the IP account exactly once.
- The board shows the day's cases per room. Reports render and export.
- RLS fixtures exist for all `ot_*` tables.
- (Phase 2) A 95-minute major case in a room with a 60-min base and 30-min increments charges base + 2 increments. The anaesthetist fee at the seeded 30% of a ₹20,000 surgeon fee is ₹6,000. Changing the rule to 35% affects only new cases.

## Build order and tasks (migrations 1060–1069)
### OT-T1 Masters and schema
- **Scope:** all tables, the exclusion constraint, RLS, room and procedure CRUD.
- **Accept:** constraint test, RLS test.
- **Model:** grok.
- **Depends:** SF-T6.
### OT-T2 Request and schedule API
- **Scope:** requests from CPOE or manual; schedule, reschedule and team.
- **Accept:** clash 409; double-booking warning.
- **Model:** grok.
- **Depends:** OT-T1, CPOE procedure orders [VERIFY-REPO].
### OT-T3 Case lifecycle, checklists and notes
- **Scope:** the start, complete, postpone and cancel state machine, checklists, encrypted notes.
- **Accept:** state-machine tests and the checklist gate.
- **Model:** grok.
- **Depends:** OT-T2.
### OT-T4 Consumables and charge posting
- **Scope:** stock issue through C3; C1 postings on complete, priced by `ot_charge_rules` slabs (Phase 2).
- **Accept:** charges posted once; stock decremented.
- **Model:** grok.
- **Depends:** OT-T3, IPB-T2, SF-T4.
### OT-T5 Web: board and request queue
- **Scope:** the schedule board and request queue screens.
- **Accept:** create, schedule and drag-reschedule on demo data.
- **Model:** composer.
- **Depends:** OT-T2.
### OT-T6 Web: case record and masters
- **Scope:** the case tabs and the masters screens.
- **Accept:** a full case walkthrough from the UI.
- **Model:** composer.
- **Depends:** OT-T3, OT-T4.
### OT-T7 Reports and seed
- **Scope:** the 4 reports, plus `seed-clinical/ot.ts` with 2 rooms and 8 cases, and seeds for the WHO checklist template and `ot_charge_rules` (Phase 2).
- **Accept:** reports export; the demo board is populated.
- **Model:** grok.
- **Depends:** OT-T4.
