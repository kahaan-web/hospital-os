# GAP · Laboratory Information System (B8 on main: complete it)

Doc module "LABORATORY INFORMATION SYSTEM" [DOCS: ML #9]. Sheet module "LAB", 9 rows [DOCS: S1 r76–r84]. Stage 4 in Sheet3. **Status:** B8 is merged per the notes, but the equipment interface and email results are unknown [ARCH: handover appendix]. **All items are [VERIFY-REPO when the Dell is back].**

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md`. [DOCS] items are unchanged.
- **Analyser interfaces** (R3.3):
  - **ASTM E1394 over RS-232 serial or TCP/IP** is the most common protocol in Indian labs; **HL7 v2** is on newer analysers.
  - Common makes: Sysmex, Mindray, Erba (Transasia).
  - So the connector must handle a **serial-to-TCP bridge** or an on-prem agent.

  [RESEARCH-WEAK: Gemini, no source, verify with real analyser manuals]
- **Expected logs** (NABL/NABH practice, R3.3):
  - a **critical-value read-back log** (who was told, when, read back yes/no);
  - a **sample-rejection log** with reasons;
  - **pathologist sign-off** before release.

  [RESEARCH-WEAK: Gemini, no source]
- **Report delivery** (R3.4): explicit, logged opt-in per channel (email/WhatsApp), with opt-out; password-protected PDF. [RESEARCH-WEAK: Gemini, G3-3 blog] This also matches DPDP notice and consent duties, which apply from 13 May 2027. [VERIFIED: DPDP commencement, V10]

## Purpose
Lab workflow from order to sample to result to report, plus master templates, patient history, sample status tracking, lab MIS, email delivery and analyser interfaces. [DOCS: S1 r76–r84]

## Users and roles
- Lab Tech: collection, result entry.
- Pathologist (Doctor with lab sign permission): validates and signs [DEFAULT, to confirm by research].
- Front Desk: OP lab billing.
- Doctor and Nurse: view results.

## Docs checklist with likely gaps

| Row | Item | Tier B/M/P | Likely state |
|---|---|---|---|
| S1 r76 | Sample Collection | N/Y/Y | verify (barcode label print likely gap) |
| S1 r77 | Result Entry | N/Y/Y | verify (ranges, delta, critical flags) |
| S1 r78 | Master Template | N/Y/Y | verify (panels, parameters, ranges by age and sex, units) |
| S1 r79 | Send Result on EMAIL | N/N/**Y** | **likely gap**; Premium only (Sheet3 says Medium; conflict **OPEN – to confirm with Ajay Sheth**, #24) |
| S1 r80 | Lab Result Report | N/Y/Y | verify the PDF layout and sign-off |
| S1 r81 | Interface: 2 Lab Equipments | N/N/**Y** | **likely gap** |
| S1 r82 | Patient History | N/Y/Y | likely gap (cumulative report / trend per parameter) |
| S1 r83 | Sample Status | N/Y/Y | verify (tracking board) |
| S1 r84 | LAB MIS | N/Y/Y | **likely gap**; Sheet3 calls it "LAB Statistics" (same thing? **OPEN – to confirm with Ajay Sheth**, #34) |

## Workflows to finish
1. **Sample status board** [S1 r83]: ordered → collected → received in lab → in process → resulted → validated → reported. Includes rejection with a reason (haemolysed, insufficient volume) and recollection.
2. **Patient history** [S1 r82]: a cumulative table and trend per parameter across visits.
3. **Email results** [S1 r79]:
   - PDF to the patient's email through the outbox (C4);
   - only finalised reports;
   - needs the patient's consent for the purpose `report_delivery` [DEFAULT, to confirm by research];
   - the link or attachment is password-protected (default: the patient's DOB as DDMMYYYY) [DEFAULT, to confirm by research].
4. **Equipment interface** [S1 r81], 2 analysers:
   - a middleware endpoint that accepts results in ASTM E1394 or HL7 v2 ORU messages from a local connector;
   - maps instrument test codes to parameters;
   - results land as "machine values" for tech review.

   **Protocols:** ASTM E1394 (LIS2-A2 framing) first, then HL7 v2 ORU^R01. **Transport:** a small on-prem connector reads RS-232 (or a serial-to-TCP bridge) or a TCP socket and posts to the HTTP ingest API. **First makes to support with sample files:** Sysmex (haematology), Mindray and Erba (biochemistry). [RESEARCH-WEAK: Gemini, R3.3, verify against vendor interface manuals] v1 is the HTTP ingest API plus a mock connector that replays sample ASTM files; the real connector binary is a later task.
5. **LAB MIS** [S1 r84]: test counts and revenue by test, department and referrer; TAT by test; rejection rate; critical values reported.
6. **Critical value** alert to the ordering doctor and the ward nurse (outbox).
   - A **read-back log** records the person informed, their role, the time, the channel, `read_back_confirmed bool`, and who informed them.
   - An unacknowledged critical value escalates after N minutes (seed 30).

   [RESEARCH-WEAK: Gemini, R3.3]
7. **Pathologist sign-off:** a result can't reach `reported` without a pathologist (or authorised signatory) validation. A tech validation alone only reaches `validated`. [RESEARCH-WEAK: Gemini, R3.3]

## Screens (add if missing [VERIFY-REPO])
- `/app/lab/samples`: the status board [S1 r83].
- `/app/lab/patients/[id]/history`: cumulative table and trend [S1 r82].
- An "Email report" action on the report view [S1 r79, Premium].
- `/app/lab/instruments`: setup, test-code map and message log [S1 r81, Premium].
- `/app/lab/mis`: volume, TAT, rejections and critical values [S1 r84].

## Data model additions [VERIFY-REPO]
- `lab_sample_events(sample_id FK, status, at, by_user, reason)`
- `lab_instruments(location_id, name, make, model, protocol enum astm|hl7, api_key_hash, active)` and `lab_instrument_test_map(instrument_id FK, instrument_code, parameter_id FK)`
- `lab_instrument_messages(instrument_id FK, received_at, raw enc, parsed jsonb, status enum parsed|mapped|error)`, purged after N days [DEFAULT, to confirm by research]
- `lab_result_values.source enum manual|instrument`, `instrument_message_id FK null`
- `lab_report_deliveries(report_id FK, channel, outbox_id FK, sent_at)`
- `lab_critical_notifications(result_value_id FK, informed_person, informed_role, channel, informed_at, read_back_confirmed bool, informed_by, escalated_at null)` (Phase 2)
- `lab_sample_rejections(sample_id FK, reason_code, notes, rejected_by, rejected_at)` (Phase 2; or reuse `lab_sample_events` with a reason code)

## APIs (module `lab`; features per S1 r76–r84 [VERIFY-REPO key names])
- GET `/tenant/lab/samples/board?status&date` [S1 r83]
- GET `/tenant/lab/patients/:patientId/history?parameterId` [S1 r82]
- POST `/tenant/lab/reports/:id/email` (Idem) [S1 r79, Premium]
- POST `/tenant/lab/instruments/:id/messages` (instrument API key auth, **not** a user session, tenant resolved from the key and still under RLS) [S1 r81, Premium]; CRUD `/tenant/lab/instruments`, `/tenant/lab/instruments/:id/test-map`
- GET `/tenant/lab/mis/{volume,tat,rejections,critical}` [S1 r84]

The instrument ingest route needs its own guard type in `TENANT_GUARDS` (a machine principal). Keep it fail-closed [DEFAULT, to confirm by research].

## Business rules and edge cases
- Machine values never auto-validate. A tech or pathologist must accept them.
- Rejected samples keep their history. The recollection creates a new sample linked to the same order.
- Email goes only to the registered email address, and only for final reports.
- Instrument API keys are hashed, rotatable and limited to one location. Messages for an unknown sample id are parked as `error`.

## Integrations
CPOE and Nurse Station (orders), OP and IP billing (C1), Doctor workspace and A4 (results), A3 portal (final reports), Doctor Accounting (pathologist share), MIS, Equipment Maintenance (analyser downtime).

## Tier (Sheet1)
- **Medium:** r76–r78, r80, r82–r84.
- **Premium:** adds r79 Email and r81 Equipment interface.
- **Basic:** no Lab.
- Sheet3 puts Email at Medium and omits the equipment interface. The conflict is **OPEN – to confirm with Ajay Sheth.** (#24).

## Acceptance criteria
- Every checklist row has a route, a screen and a test.
- Replaying an ASTM sample file through the mock connector puts machine values on the matching sample for review.
- Email is 403 on Medium, and on Premium it creates an outbox row only with consent.
- The patient history trend shows 3 visits for a seeded patient.
- (Phase 2) A critical potassium value creates outbox alerts and a read-back row. With no acknowledgement in 30 minutes, it escalates. The rejection-rate MIS counts rejections by reason.
- (Phase 2) A report can't reach `reported` without a pathologist sign-off.

## Build order and tasks
### LAB-T1 Audit B8 against the checklist
- **Scope:** write `docs/specs/lab-gap.md`.
- **Model:** grok.
- **Depends:** Dell back.
### LAB-T2 Sample status events, rejection and recollection, patient history endpoint
- **Model:** grok.
- **Depends:** LAB-T1.
### LAB-T3 Email results through the outbox with the consent check, LAB MIS endpoints, critical read-back log and pathologist sign-off gate (Phase 2 scope)
- **Model:** grok.
- **Depends:** LAB-T1, SF-T7.
### LAB-T4 Instrument ingest
- **Scope:** API-key principal, ASTM/HL7 parser, test map, mock connector script.
- **Model:** grok.
- **Depends:** LAB-T1. Phase 2: build ASTM E1394 first (serial/TCP framing in the mock), then HL7 v2. Vendor manuals are still to verify.
### LAB-T5 Web: sample board, history trend, instrument setup, LAB MIS screens
- **Model:** composer.
- **Depends:** LAB-T2 to LAB-T4.
