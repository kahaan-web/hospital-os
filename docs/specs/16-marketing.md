# 16 · Marketing

Doc module "MARKETING" [DOCS: ML #24]. It's a **name only**. The related doc item is Patient Registration "Send Mailers via email / SMS" [DOCS: S1 r10] (Medium+). Everything else is [DEFAULT, to confirm by research]. These were [GAP: needs research]; Phase 2 status:
- **DPDP consent for marketing:** explicit opt-in, **not bundled** with treatment consent. The notice states the purpose, the contact and a withdrawal link. [RESEARCH: Gemini, R8.1/R8.5, EY] Notice and consent duties apply from **13 May 2027**. [VERIFIED: DPDP Rules commencement, V10] This confirms the Phase 1 design.
- **TRAI DLT:** the hospital registers as a **Principal Entity** (≈₹5,000 fee) with an operator DLT, registers **headers** (sender IDs) and **content templates** (variables limited; Gemini says ≤2 non-continuous). Every SMS carries the PE ID, header and template ID. [RESEARCH-WEAK: Gemini, trai.gov.in advice page + SMSCountry blog, verify the fee and variable limits with the operator]
- **NMC limits:** Gemini reports an "Oct 2026" NMC update barring **discounts, cashbacks and limited-period offers**, referral fees, paid reviews, pay-per-patient agency deals and before/after photos for promotion. [RESEARCH-WEAK: Gemini, nmc.org.in/whats-new/download/1874, no regulation number, verify] [CONFLICT: if true for hospitals (NMC regulates doctors, not hospitals as such), it affects **discount campaigns here and Medicard (18)**. Gate: discount-type campaigns are **off by default**, and a tenant-level legal acknowledgement is needed to enable them. See R9.8.]
- **WhatsApp Business rules:** **still open** (Gemini omitted them).

## Purpose
Help a small hospital understand where its patients come from and reach them responsibly:
- referral source tracking;
- referring doctor and corporate tie-up tracking;
- health camps and campaigns;
- consent-based mailers (email/SMS/WhatsApp via the mock outbox);
- simple ROI reports.

## Users and roles
- Marketing Executive (new).
- Front Desk: captures the referral source at registration.
- Tenant Admin: approves campaigns.

## Workflows
1. **Referral source capture.** At registration or visit, the source is one of:
   - walk-in;
   - referring doctor (master of external doctors);
   - corporate;
   - camp;
   - online;
   - existing patient;
   - other.

   Stored per encounter.
2. **Referring doctor master and relationship log.** Visits, meetings and notes. **No referral payouts.** Doctor Accounting covers only doctors who performed the service, and referral incentives stay disabled: research reports an NMC bar on referral fees [RESEARCH-WEAK: Gemini, R8.5, verify].
3. **Health camps.** Plan (date, venue, partner, budget) → register attendees (minimal data with consent; may create patients) → follow-up conversions (visits or admissions within N days).
4. **Campaigns and mailers** [DOCS: S1 r10 for the mailer function]:
   - build a segment (filters: age band, city, last-visit window, department visited; **no diagnosis-based targeting by default** [DEFAULT, to confirm by research]);
   - pick a template;
   - schedule;
   - send through the outbox, **only to patients with an active marketing consent** (purpose tag `marketing`);
   - every message carries an opt-out link or keyword;
   - opt-out withdraws the consent immediately.
5. **Corporate tie-ups.** Corporate accounts (may link to a payer), agreed discounts (applied in billing as a concession type), and employee counts.
6. **Reports:**
   - patients and revenue by referral source and referring doctor (counts and revenue only);
   - camp conversions;
   - campaign delivery (mock) and opt-outs.

## Screens
- `/app/marketing/sources`: dashboard.
- `/app/marketing/referrers`.
- `/app/marketing/camps`: list and detail.
- `/app/marketing/campaigns`: list, the builder (segment → template → schedule → preview count) and results.
- `/app/marketing/corporates`.
- `/app/marketing/templates`.
- `/app/marketing/reports/*`.

## Data model
- `referral_sources(code, name, kind enum walkin|doctor|corporate|camp|online|patient|other)` and `encounter_referrals(encounter_id FK, source_id FK, referring_doctor_ext_id FK null, corporate_id FK null, camp_id FK null)`
- `external_doctors(name, qualification, registration_no null, clinic_name, city, mobile enc, email enc, notes)` and `referrer_interactions(external_doctor_id FK, met_on, by_user, notes)`
- `camps(location_id, name, date, venue, partner, budget_paise, status)` and `camp_attendees(camp_id FK, patient_id FK null, name enc, mobile enc, consent_id FK null, converted_encounter_id FK null)`
- `corporates(name, payer_id FK null, discount_bp, contract_from, contract_to, contact enc)`
- `campaigns(name, channel enum sms|email|whatsapp, segment jsonb, template_id FK, scheduled_at, status enum draft|approved|scheduled|sent|cancelled, approved_by, audience_count, sent_count, suppressed_count)` and `message_templates(channel, name, body, dlt_template_id null)`
- Delivery rows live in `notification_outbox` (SF-T7) with `consent_purpose='marketing'`.
- `consents`: existing [ARCH: CONTRACTS.md `/tenant/consents`]. Add the purpose `marketing` and a withdrawal timestamp [VERIFY-REPO].

## APIs (module `marketing`; features `marketing.referrals`, `marketing.camps`, `marketing.campaigns`, `marketing.reports`; plus the registration feature `registration.send_mailers` [S1 r10])

| Method | Path | Feature | Roles |
|---|---|---|---|
| GET/POST/PATCH | `/tenant/marketing/{sources,referrers,corporates}` | marketing.referrals | Marketing Exec |
| POST | `/tenant/encounters/:id/referral` | marketing.referrals | Front Desk |
| GET/POST/PATCH | `/tenant/marketing/camps` ; POST `/camps/:id/attendees` | marketing.camps | Marketing Exec |
| POST | `/tenant/marketing/campaigns` ; POST `/:id/{preview,approve,schedule,cancel}` | marketing.campaigns (+ registration.send_mailers) | Marketing Exec; Tenant Admin approves |
| POST | `/public/opt-out/:token` (no session; token-scoped) | n/a | patient |
| GET | `/tenant/marketing/reports/{sources,referrers,camps,campaigns}` | marketing.reports | Marketing Exec, Admin |

## Business rules and edge cases
- **No consent, no message.** The audience count excludes patients without an active marketing consent. The preview shows the suppressed count.
- Opt-out is immediate and idempotent. Re-consenting needs a fresh, explicit capture.
- Segments can't use diagnosis, lab results or other clinical fields [DEFAULT, to confirm by research].
- A campaign can't be sent without approval (the approver isn't the creator).
- Marketing reports show counts and revenue only, never a patient list. Exporting a patient list for marketing isn't possible.
- SMS sends need `dlt_pe_id` (tenant), `dlt_header` and `dlt_template_id` (template), and the outbox refuses an SMS template without them (the mock doesn't call DLT). Variable count per template is configuration (seed max 2, Gemini's figure). [RESEARCH-WEAK: Gemini, R8.5]
- Campaigns of type `discount_offer` are disabled unless the tenant has recorded a legal acknowledgement (NMC risk). [RESEARCH-WEAK: Gemini, R8.5] [CONFLICT flagged]
- The opt-out token is opaque, single-tenant and has no PII in the URL.

## Integrations
- Registration and visits (source capture).
- Consents (DPDP).
- Outbox.
- Billing (corporate discount as a concession type, revenue by source).
- Medicard (card promotions).
- MIS.

## Tier
- "Send Mailers via email / SMS" is **Medium+** [S1 r10].
- The rest of the Marketing module isn't in Sheet1. **OPEN – to confirm with Ajay Sheth.** (OPEN-QUESTIONS-AJAY #14)

## Acceptance criteria
- A campaign to a segment of 50 where 20 have marketing consent → 20 outbox rows (`sent_mock`) and 30 suppressed. One opt-out → the next campaign has 19.
- Approving a campaign as its creator → 403.
- The referral-source report on seeded data ties to registration counts.
- RLS fixtures exist. No patient names in audit or reports.

## Build order and tasks (migrations 1320–1329)
### MKT-T1 Sources, encounter referrals, external doctors and corporates; RLS
- **Model:** grok.
- **Depends:** SF-T7, registration [VERIFY-REPO].
### MKT-T2 Consent purpose `marketing` + withdrawal, opt-out endpoint, campaigns, segments, approval and outbox send
- **Model:** grok.
- **Depends:** MKT-T1.
### MKT-T3 Camps, attendees, conversions and reports
- **Model:** grok.
- **Depends:** MKT-T1.
### MKT-T4 Web: all marketing screens and the registration source field
- **Model:** composer.
- **Depends:** MKT-T2, MKT-T3.
