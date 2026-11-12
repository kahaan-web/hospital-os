# Android A3 · Patient Portal (gaps to close)

[DOCS: ML A3] "ANDROID MOBILE: PATIENT PORTAL":
- PATENT REGISTRATION;
- DOCTR'S APPOINTMENTS;
- MEDICAL DATA FOR VISITS TO HOSPITAL;
- ACCOUNTS DETAILS;
- FEEDBACK.

**Status:** Phase A built screens on **mock data**: appointments list and booking, visit summaries, bills, profile, feedback. The real `/patient/*` API was only proposed (`apps/mobile/API_PROPOSAL.md`). Whether B10 (mobile API) was wired is unknown. There has been no device build [ARCH: task-mobile.md, handover §6]. **[VERIFY-REPO when the Dell is back].**

## Purpose
A hospital's patients (and guardians) can register, book appointments, see their visit records and reports, see their bills and dues, and give feedback, all against the real API, safely.

## Users and roles
- Patient (a new principal type, not a staff user, **not counted as a seat** [DEFAULT, to confirm by research]).
- Guardian or family member acting for a minor or a dependent, with a linked profile. Guardian consent for minors is a known DPDP gap [ARCH: handover §6]. Research: under DPDP a **child is under 18**, and **verifiable parental/guardian consent** is required, with exceptions for health services and emergencies per the Rules. [RESEARCH: Gemini, R8.1, EY] Those duties apply from **13 May 2027**. [VERIFIED: V10]

## Gaps vs the docs

| Doc bullet | Built (mock) | Gap |
|---|---|---|
| PATENT REGISTRATION | profile screen only | **Self-registration** with mobile OTP → a pre-registration that the front desk confirms into a UHID, or instant UHID (which one: **OPEN – to confirm with Ajay Sheth**, #46). Link an existing UHID via OTP to the registered mobile. Optional ABHA link: ABDM certification is **M1** (ABHA create/verify), **M2** (HIP: share records), **M3** (HIU: fetch records); the facility registers on **HFR** and doctors on **HPR**; **Scan & Share** QR registration. [RESEARCH: Gemini, R8.3, abdm.gov.in/dhis] This sits in the optional ABDM track (INDEX), not in v1. |
| DOCTR'S APPOINTMENTS | list and book on mock | Real slots from appointment scheduling (B1/B3 slot locking [VERIFY-REPO]), cancel/reschedule with the hospital's cut-off rules, reminders through the outbox. |
| MEDICAL DATA FOR VISITS | visit summaries on mock | Real visit list: consult notes summary (what the doctor marks shareable [DEFAULT, to confirm by research]), prescriptions, **final** lab and radiology reports (PDF), discharge summary [S1 r35, Medium+]. |
| ACCOUNTS DETAILS | bills on mock | Real OP vouchers, IP bills, deposits, receipts, outstanding, and a Medicard view. Online payment of dues stays **mock** until Kahaan approves a gateway [ARCH: CLAUDE.md]. |
| FEEDBACK | form on mock | Store feedback (rating per visit or department, free text), route negative feedback to the Grievance Officer or Location Admin, and give staff a report [DEFAULT, to confirm by research]. |

Not in the doc but needed under DPDP [DEFAULT, to confirm by research]:
- the privacy notice;
- consent management (marketing, report delivery);
- a data-principal request (access, correction, erasure, grievance). This uses the existing DPR model [ARCH: CONTRACTS.md `/tenant/privacy/requests`].

## Workflows
1. **Sign-in:**
   - mobile number → OTP (mock) → choose the hospital (if the mobile is registered with several tenants) → session scoped to **one tenant + one patient profile set**.
   - Patients are tenant-scoped. There's no cross-hospital patient account in v1 [DEFAULT, to confirm by research].
2. **Self-register** or link a UHID.
3. Book, cancel or reschedule an appointment.
4. Visits → visit detail → reports (PDF view).
5. Accounts → bills → bill detail → receipt PDF. Pay dues (mock).
6. Feedback after a visit (prompted).
7. Privacy: view the notice, manage consents, raise a request.

## Screens
Sign-in (mobile + OTP + hospital picker), Home, Register / Link UHID, Family profiles, Appointments (list, book, detail), Visits (list, detail, report viewer), Accounts (bills, receipts, outstanding, Medicard), Feedback, Privacy & consents, Profile.

## Data model (server additions)
- `patient_portal_accounts(mobile_hash, mobile enc, status, last_login_at)` and `patient_portal_links(portal_account_id FK, patient_id FK, relation enum self|guardian|family, verified_by enum otp|front_desk, verified_at)`, both tenant-scoped
- `patient_preregistrations(…demographics enc, status enum pending|confirmed|rejected, patient_id FK null)`
- `patient_feedback(encounter_id FK null, department_id FK null, rating 1..5, text enc, routed_to_user_id null, status)`
- `visit_share_flags(encounter_id FK, notes_shareable bool, set_by_doctor_id)` [DEFAULT, to confirm by research]
- Sessions: a new session kind `patient` alongside `platform` and `tenant` [ARCH: CONTRACTS.md session kinds]. `TENANT_GUARDS` needs a patient principal with **row-level ownership checks** (patient_id ∈ linked profiles) on top of RLS.

## APIs (prefix `/api/v1/patient/*`, per the proposal [VERIFY-REPO API_PROPOSAL.md])
- POST `/patient/auth/otp`, `/patient/auth/verify`, GET `/patient/me`, POST `/patient/switch-hospital`
- POST `/patient/preregistrations`; POST `/patient/links` (UHID + OTP)
- GET `/patient/doctors`, GET `/patient/slots?doctorId&date`, POST/GET `/patient/appointments` (Idem on POST), POST `/patient/appointments/:id/{cancel,reschedule}`
- GET `/patient/visits`, `/patient/visits/:id`, `/patient/reports/:id.pdf`
- GET `/patient/accounts/{bills,receipts,outstanding}`, `/patient/bills/:id.pdf`, POST `/patient/payments/mock` (Idem)
- POST `/patient/feedback`; GET/POST `/patient/consents`; POST `/patient/privacy-requests`

Module key `patient_portal`, features per doc bullet (`patient_portal.registration`, `.appointments`, `.medical_data`, `.accounts`, `.feedback`) [DEFAULT, to confirm by research].

## Business rules and edge cases
- A patient sees only linked profiles. Every route checks ownership: 404 (not 403) for others.
- Only **finalised** reports and shareable notes are shown. **Critical or sensitive results** (configurable list, e.g. biopsy malignancy, HIV) are **held until the doctor marks them as discussed**. [RESEARCH-WEAK: Gemini, R8.4, clinical advice not law] Demographics, prescriptions, discharge summaries and final labs are visible.
- OTP rate limits (e.g. 5 per hour per mobile) and lockout [DEFAULT, to confirm by research].
- A minor's profile (**under 18**) is managed by a guardian link, verified by OTP to the guardian's registered mobile (or ABHA); the guardian's consent is logged. At 18 the link converts to the patient's own consent. [RESEARCH: Gemini, R8.1] [RESEARCH-WEAK: R8.4 OTP norm]
- **Erasure requests** are accepted, but statutory retention applies first (see the _CONVENTIONS retention table); the response states the retain-until date. [RESEARCH: Gemini, R8.2] [VERIFIED: DPDP timeline]
- **Breach:** a patient-facing breach notice template exists (DPDP Rule 7 content: nature, likely consequences, mitigation, steps for the patient, contact). [VERIFIED: Rule 7]
- No real payments. The mock pay flow is labelled "Demo payment".
- Reads of patient records through the portal are audited (patient-read audit, when built).

## Integrations
Registration, Appointments, OPD, Lab, Radiology, ADT (discharge summary), OP and IP billing, Medicard, Complaint/Grievance routing (feedback), Consents/DPR, Outbox (OTP, reminders).

## Tier
Not in Sheet1. Tier **OPEN – to confirm with Ajay Sheth.** (#20). Add-on or included: **OPEN – to confirm with Ajay Sheth.** (#21).

## Acceptance criteria
- With `EXPO_PUBLIC_USE_MOCK=0`, all 5 doc bullets work against the real API on demo data.
- Patient A can't fetch patient B's visit or bill (404).
- Unfinalised reports aren't listed.
- Self-registration appears in the front-desk queue.
- Typecheck passes. Native screenshots on a device or emulator [GAP: needs research].

## Build order and tasks
### A3-T1 Audit mobile and B10 against this table
- **Scope:** write `docs/specs/patient-portal-gap.md`.
- **Model:** grok.
- **Depends:** Dell back.
### A3-T2 Patient session kind, OTP auth, portal accounts and links, ownership guard in TENANT_GUARDS, RLS fixtures
- **Model:** grok.
- **Depends:** A3-T1.
### A3-T3 Patient API: appointments and slots, visits, reports, accounts
- **Scope:** all read-only except bookings.
- **Model:** grok.
- **Depends:** A3-T2.
### A3-T4 Pre-registration, feedback with routing, consents and DPR endpoints
- **Model:** grok.
- **Depends:** A3-T2.
### A3-T5 Mobile: switch screens to httpClient, sign-in with hospital picker, register/link, report viewer, accounts, privacy
- **Model:** composer.
- **Depends:** A3-T3, A3-T4.
