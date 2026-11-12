# 09 · Blood Bank

Doc module "BLOOD BANK" [DOCS: ML #16]. It's a **name only**. Blood banking in India is a licensed, heavily regulated activity. Which activities a small hospital or nursing home may do (a full blood centre, a blood storage centre, or only requesting from an outside blood bank), the mandatory tests, the record formats and retention, and national reporting were [GAP: needs research]. Phase 2 answered the storage-centre rules (verified) and gave weak answers for the rest; see below. The spec is still built in **two modes**. Anything not tagged otherwise is [DEFAULT, to confirm by research].

Which mode target customers run is **OPEN – to confirm with Ajay Sheth** (#29). No mode is a default.

- **Mode S (Storage / transfusion only):**
  - receive units from a licensed blood centre;
  - store them;
  - cross-match and issue;
  - record transfusions and reactions.
- **Mode F (Full blood centre):** Mode S, plus donor registration, screening, collection, component preparation, TTI testing, release and discard.

A location setting chooses the mode, and Mode F routes are guarded by the `blood_bank.centre` feature.

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md` for the sources and the verification detail. [DOCS] items above and below are unchanged.

- **Blood storage centre (Mode S)** (R4.1):
  - Hospitals transfusing **under 2,000 units a year** may run a storage centre **without a blood bank licence**, but need **approval from the State/UT Licensing Authority** after inspection, valid for a fixed period.
  - Units come only from a linked **mother blood centre**. The NACO text names licensed Government hospital, Indian Red Cross or Regional Blood Transfusion Centre blood banks. If the parent's licence is cancelled, the storage centre's approval falls with it.
  - 10 m², a blood bank refrigerator with an alarm, 24-hour power and cold-chain carriers.
  - No extra staff, but a designated **medical officer and technician** with training.
  - **Unused bags go back to the mother centre at least 10 days before expiry**, and are replaced with fresh ones.

  [VERIFIED: NACO "Guidelines for Setting up Blood Storage Centres", https://naco.mohfw.gov.in/files/8-Guidelines%20for%20Setting%20up%20Blood%20Storage%20Centres%281%29.pdf] [RESEARCH: Gemini, G4-1..5]

  [CONFLICT: Gemini says the mother centre must be "CDSCO-licensed", meaning any licensed centre. NACO's guideline lists Govt/IRCS/RBTC only. The guideline predates later Drugs Rules amendments (2020 "blood centre" terminology), so the current eligibility of private mother centres is **unverified**. The rule is configuration (`mother_centre_types_allowed`), and the approval document is stored.]

  Scope changes, all in BB-T2/BB-T3:
  - an **annual units counter**, with a warning at 80% of 2,000 and a block plus MO override at 2,000;
  - the **mother-centre link** (supplier flagged `is_mother_centre`, with licence no. and validity);
  - a **return-to-mother-centre** workflow with a "return due" list at expiry − 10 days;
  - approval-validity tracking.
- **Components, storage and TTI** (R4.2): whole blood/PRBC **35 days (CPDA-1) / 42 days (SAGM) at 2–6 °C**; platelets **5 days at 20–24 °C with agitation**; FFP/cryo **1 year at ≤ −18 °C** (optimal −30 °C). [RESEARCH: Gemini, NACO for the 35/42 days and storage (V4 confirms 35/42)] [RESEARCH-WEAK: platelets, FFP and temperatures] Mandatory TTI: **HIV 1/2, HBsAg, HCV, syphilis, malaria**. [RESEARCH-WEAK: Gemini, no source; matches the Phase 1 placeholder list] Donor rules (Mode F): **18–65 y**, **>45 kg (50 kg for a 450 ml collection)**, **Hb ≥ 12.5 g/dL**, plus deferral periods. [RESEARCH-WEAK: Gemini, verify against the current NBTC/D&C Schedule F Part XII-B] All of these go in a **component master and donor-criteria table** (configuration).
- **Registers and retention** (R4.3): donor, master (stock), issue, discard, cross-match/compatibility and transfusion-reaction registers, kept **5 years**. [RESEARCH-WEAK: Gemini, G4-7 RAKT vendor blog, verify against D&C Rules Sch. F Part XII-B]
- **e-RaktKosh** (R4.4): Gemini says reporting is mandated for licensed centres, with an API for HMIS sync. [RESEARCH-WEAK: Gemini, no source; it cites "late 2026 DTAB proposals", so it's possibly not yet law] Only a **CSV export in e-RaktKosh-like stock format** goes in Mode F. A live API is held (BB-T7).
- **Emergency uncross-matched O-negative** (R4.5): permitted only in life-threatening haemorrhage; the physician signs an emergency release form accepting the risk; O-neg is prioritised for females under 50 and children, and O-pos is acceptable for adult males. [RESEARCH-WEAK: Gemini, G4-8 is the **UK** NBTC, not Indian] Return window for an unused issued unit: 30 min with the cold chain intact, otherwise discard. [CONFLICT: this is a UK practice source, and a different flow from the NACO 10-days-before-expiry return to the mother centre. Both are configuration.]
- **Reactive donors** (R4.6): consent to notification taken **before** donation; on a reactive result, discard, defer permanently, confidentially recall the donor (up to 3 attempts), counsel, and refer (ICTC for HIV, NVHCP for HBV/HCV, STD clinic). [RESEARCH-WEAK: Gemini, ResearchGate citing the NBTC 2017 guideline, verify]

## Purpose
Keep a safe, traceable vein-to-vein record of every blood unit:
- where it came from;
- its tests;
- its storage and expiry;
- who it was cross-matched and issued to;
- the transfusion outcome.

## Users and roles
- Blood Bank Medical Officer (new): approves release and issue, reviews reactions.
- Blood Bank Tech (new): inventory, grouping, cross-match, components.
- Doctor and Nurse: request blood, record the transfusion and reactions.
- Front Desk: donor registration (Mode F).

## Workflows
**Mode S**
1. **Unit receipt.**
   - From an external blood centre (supplier master), with: unit no., component (WB, PRBC, FFP, PC, cryo), group and Rh, volume, collection date, expiry, and the source centre's TTI-tested flag.
   - Stock goes into the blood store (C3 with `item_class=blood_component`, one unit = one batch).
2. **Blood request.** From the ward or OT: patient, component, units, urgency, indication, and the required-by time. A link to the OT case is optional.
3. **Patient sample, grouping and cross-match.** Record the patient's group, antibody screen (optional) and cross-match result per unit (compatible/incompatible), with the tech and time.
4. **Reserve and issue.** Compatible units are reserved for the patient (with a reservation expiry). Issue records the issuing person, the receiving nurse and the time. Charges post through C1.
5. **Transfusion record.** Start and end time, pre and post vitals (link to Nursing vitals), the bedside double-check, and any reaction. A reaction triggers an investigation record.
6. **Return or discard.**
   - An unused **issued** unit returns to the blood store within `ward_return_minutes` (seed 30), with the cold chain confirmed; otherwise it's discarded with the reason `returned_late`. [RESEARCH-WEAK: Gemini, R4.5, UK source]
   - **Mode S:** unissued stock is returned to the **mother centre at least 10 days before expiry** (`mother_return_days_before_expiry` = 10). A "return due" list and a return note to the mother centre drive this. [VERIFIED: NACO storage-centre guideline]
   - Expired units are auto-flagged.
7. **Annual volume (Mode S):** units transfused this calendar year vs the 2,000-unit storage-centre limit: a warning at 80%, and a block plus BB MO override with a reason at 100%. [VERIFIED: NACO guideline]

**Mode F (adds)**
7. **Donor registration and screening.** Demographics `enc`, questionnaire, Hb, BP, weight, deferral (temporary or permanent, with a reason).
8. **Collection.** Bag type, segment numbers and volume. A unit number is generated.
9. **Component preparation.** One WB unit splits into its components, each with its own expiry.
10. **TTI testing.** Record the result per mandatory test: **HIV 1/2, HBsAg, HCV, syphilis, malaria** (configuration list). [RESEARCH-WEAK: Gemini, R4.2]
    - Release only if all are non-reactive.
    - A reactive result means quarantine → discard, plus permanent donor deferral.
    - **Donor notification:** only if pre-donation notification consent is on file. A confidential recall task for the BB MO allows up to 3 attempts (letter or phone, logged without results), then counselling and a referral record (ICTC / NVHCP / STD clinic).
    - No SMS or email ever carries TTI status.

    [RESEARCH-WEAK: Gemini, R4.6, verify]

## Screens
- `/app/blood-bank/inventory`: by group, component and expiry, colour-coded for near-expiry.
- `/app/blood-bank/requests`: the queue.
- `/app/blood-bank/requests/[id]`: grouping, cross-match, reserve, issue.
- `/app/blood-bank/transfusions/[id]`.
- `/app/blood-bank/receipts` (Mode S).
- `/app/blood-bank/donors`, `/collections`, `/components`, `/tti` (Mode F).
- Reports:
  - stock register;
  - issue register;
  - discard register;
  - transfusion reaction register;
  - cross-match to transfusion (C:T) ratio;
  - donor register (Mode F).

Registers (R4.3): donor, master/stock, issue, discard, cross-match, transfusion-reaction (and TTI in Mode F), each printable and exportable, with `retain_until` = 5 years after the last entry. [RESEARCH-WEAK: Gemini, vendor blog; the exact columns still need the D&C Rules Sch. F Part XII-B text]

## Data model
- `bb_settings(location_id, mode enum storage|centre, licence_no, licence_valid_to, approval_authority, annual_unit_limit default 2000, mother_return_days_before_expiry default 10, ward_return_minutes default 30, mother_centre_types_allowed text[])` (Phase 2 fields) [VERIFIED: V4 for the limit and return days]
- `bb_component_types(code, name, storage_min_c, storage_max_c, shelf_life_days, agitation bool, is_placeholder)`, seeded per R4.2 [RESEARCH-WEAK except the 35/42-day RBC rows]
- `bb_mother_returns(location_id, supplier_id FK, unit_ids uuid[], returned_at, note_no)` (Mode S)
- `bb_emergency_releases(issue_id FK, physician_id FK, reason enc, form_attachment_id FK, crossmatch_done_at null)`
- `bb_donor_notifications(donor_id FK, consent_on_file bool, attempt_no, attempted_at, channel enum letter|phone|in_person, outcome, referral_to null)` (Mode F)
- `bb_units(location_id, unit_no, source enum external|in_house, supplier_id FK null, donation_id FK null, component enum wb|prbc|ffp|pc|cryo|sdp|other, abo enum A|B|AB|O, rh enum pos|neg, volume_ml, collected_on, expires_at, status enum quarantine|available|reserved|issued|transfused|returned|discarded, tti_cleared bool, store_id FK)`, with UNIQUE (tenant_id, location_id, unit_no)
- `bb_requests(location_id, patient_id FK, encounter_id FK, ot_case_id FK null, component, units_requested, urgency enum routine|urgent|emergency, indication enc, required_by, requested_by, status)`
- `bb_patient_grouping(request_id FK, abo, rh, antibody_screen enum neg|pos|not_done, tested_by, tested_at)`
- `bb_crossmatches(request_id FK, unit_id FK, result enum compatible|incompatible, method, tested_by, tested_at)`
- `bb_issues(request_id FK, unit_id FK, issued_by, received_by_user_id, issued_at, charge_id FK null)`
- `bb_transfusions(issue_id FK, started_at, ended_at, pre_vitals_id FK null, post_vitals_id FK null, bedside_check_by uuid[], reaction bool, reaction_details enc)`
- `bb_discards(unit_id FK, reason_code enum expired|tti_reactive|leak|clotted|returned_late|other, discarded_by, discarded_at)`
- Mode F:
  - `bb_donors(donor_no, first_name enc, last_name enc, dob, sex, mobile enc, abo, rh, deferral_until null, permanent_deferral bool)`;
  - `bb_donations(donor_id FK, screening jsonb, bag_type, volume_ml, collected_at, status)`;
  - `bb_tti_results(unit_id FK null, donation_id FK, test_code, result enum non_reactive|reactive|indeterminate, kit_lot, tested_by, tested_at)`.

## APIs (module `blood_bank`; features `blood_bank.storage`, `blood_bank.centre`, `blood_bank.reports` [DEFAULT, to confirm by research])

| Method | Path | Feature | Roles |
|---|---|---|---|
| GET | `/tenant/blood-bank/inventory` | blood_bank.storage | BB staff, Doctor, Nurse (counts only) |
| POST | `/tenant/blood-bank/units/receive` (Idem) | blood_bank.storage | BB Tech |
| GET/POST | `/tenant/blood-bank/requests` | blood_bank.storage | Doctor, Nurse, BB staff |
| POST | `/tenant/blood-bank/requests/:id/{grouping,crossmatch,reserve,issue}` (Idem on issue) | blood_bank.storage | BB Tech; issue needs BB MO |
| POST | `/tenant/blood-bank/issues/:id/{transfusion,return}` | blood_bank.storage | Nurse, Doctor |
| POST | `/tenant/blood-bank/units/:id/discard` | blood_bank.storage | BB MO |
| GET/POST | `/tenant/blood-bank/{donors,donations,components,tti}` | blood_bank.centre | BB staff |
| POST | `/tenant/blood-bank/units/:id/release` | blood_bank.centre | BB MO |
| GET | `/tenant/blood-bank/reports/{stock,issue,discard,reactions,ct-ratio,donors}` | blood_bank.reports | BB MO, Admin |

## Business rules and edge cases
- **Hard safety blocks** (422, no override):
  - issuing a unit that's expired, not `available`/`reserved`, not TTI-cleared, or without a compatible cross-match for **this** patient;
  - an ABO/Rh mismatch against the patient's grouping.
- An emergency issue of uncross-matched O-negative (or O-positive for adult males, per policy) needs the **requesting physician's signed emergency release** (attachment) and the BB MO's override reason, which is audited. A retrospective cross-match is required, and an overdue one shows on the BB dashboard. [RESEARCH-WEAK: Gemini, R4.5, UK source, verify with NBTC India]
- A unit moves only along the allowed state transitions. Each transition is a row in a unit history table (append-only).
- Reservations auto-expire (default 72 h) [DEFAULT, to confirm by research].
- Donor PII and reaction details are `enc`. TTI-reactive status is extremely sensitive: only the BB MO can view it, and it's never sent to notifications.
- A unit's charge posts once on issue. A return within the window reverses the charge [DEFAULT, to confirm by research].
- Licence or **storage-centre approval** expiry within 60 days shows a warning banner. With it expired, issue is blocked [DEFAULT, to confirm by research]. The mother centre's licence validity is tracked the same way: if it's expired, receipts from it are blocked. [VERIFIED: NACO, the approval falls with the parent licence]

## Integrations
- Ward and OT requests: Nurse Station, OT.
- Nursing vitals.
- IP billing (C1).
- Supplier master (external centres).
- Equipment Maintenance: blood bank refrigerator downtime alerts.
- MIS.

## Tier
Not in Sheet1. **OPEN – to confirm with Ajay Sheth.** No default tier is set. (OPEN-QUESTIONS-AJAY #7) Feature keys exist so App Admin can assign any tier once decided.
Whether storage (Mode S) and full blood centre (Mode F) are sold separately is also **OPEN – to confirm with Ajay Sheth.** (#29).

## Acceptance criteria
- Mode S: receive 4 units → request 2 PRBC → grouping → cross-match (1 incompatible) → reserve 2 compatible → issue → transfusion recorded → the charge posted once.
- Each hard safety block returns 422 in tests (expired unit, wrong group, no cross-match, not TTI-cleared).
- Mode F routes return 403 unless `blood_bank.centre` is entitled. With it, a donation → 3 components each with its own expiry, and reactive TTI → quarantine → discard.
- The full unit history is reconstructable. Only the BB MO can read TTI results.
- RLS fixtures exist for all `bb_*` tables.
- (Phase 2) Mode S: a unit expiring on 30 Nov appears on the mother-return list from 20 Nov. At 1,600 units transfused in the year a warning shows; at 2,000 the next issue needs the BB MO override.
- (Phase 2) An emergency O-neg issue without an attached release form → 422. With it, the issue succeeds and a retrospective cross-match task is created.

## Build order and tasks (migrations 1180–1199)
### BB-T1 Schema, settings, unit state machine, history and RLS
- **Model:** grok.
- **Depends:** SF-T3, SF-T4.
### BB-T2 Receipt, requests, grouping, cross-match, reserve and issue with safety blocks and C1
- **Accept:** all hard-block tests.
- **Phase 2 scope:** mother-centre link and licence check, annual unit counter, emergency release form.
- **Model:** grok.
- **Depends:** BB-T1, IPB-T2.
### BB-T3 Transfusion, reactions, returns, discards and expiry job
- **Phase 2 scope:** ward-return window, mother-centre return-due list and return note, component master shelf-life, register retention.
- **Model:** grok.
- **Depends:** BB-T2.
### BB-T4 Mode F
- **Scope:** donors, donations, components and TTI release.
- **Model:** grok.
- **Depends:** BB-T1. Hold until the research batch on licensing is answered.
### BB-T5 Web: inventory, requests and issue screens
- **Model:** composer.
- **Depends:** BB-T2.
### BB-T6 Web: transfusion and discard screens, reports and seed (Mode F screens added once BB-T4 lands)
- **Model:** composer.
- **Depends:** BB-T3 (and BB-T4 for the Mode F screens).
### BB-T7 e-RaktKosh export and API (Phase 2, **HOLD**)
- **Scope:** a CSV stock/issue/discard export in e-RaktKosh format, then an API sync if one is published.
- **Hold reason:** Gemini's "mandate" and API claim have no source (R4.4). Verify on eraktkosh.mohfw.gov.in and with NBTC first.
- **Model:** grok.
- **Depends:** BB-T4.
