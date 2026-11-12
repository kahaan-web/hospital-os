# 18 · Medicard Management

Doc module "MEDICARD MANAGEMENT" [DOCS: ML #27]. It's a **name only**. What a "Medicard" is here isn't defined: **OPEN – to confirm with Ajay Sheth** (#27). The text that follows is a *candidate reading only*, kept so work can start fast once confirmed. It is **not a decision**: no task in this module may be built on it until the meaning is confirmed. Candidate reading: **a hospital-issued health membership card**, for an individual or a family, bought for a fee and valid for a period. It gives:
- discounts on service categories;
- a number of free or discounted consultations or check-ups;
- priority registration.

It is **not** a prepaid wallet and **not** insurance. Holding stored value could fall under RBI prepaid-instrument rules, and pooling risk could look like insurance under IRDAI. Phase 2 research (weak) says a closed-system card needs no RBI authorisation, and that risk-pooling looks like insurance (see Research updates). v1 keeps **no stored balance, no cash-back and no cover-type benefit**: benefits are discounts and visit entitlements only.

## Research updates (Phase 2, 12 Nov 2026)
See `RESEARCH-LOG.md` for the sources and the verification detail. [DOCS] items above and below are unchanged.

- **RBI:** a hospital card usable only at the issuing hospital, with no cash withdrawal, would be a **closed-system PPI**, which doesn't need RBI authorisation. Gemini also says balances "generally cap at ₹10,000". [RESEARCH-WEAK: Gemini, R8.6, RBI PPI Master Direction link only; the ₹10,000 cap is doubtful for closed systems, verify] **v1 still holds no stored value**, so this is moot unless a wallet is added later.
- **IRDAI:** if the card covers **future unknown medical costs for a fixed fee** (risk pooling), it may be unlicensed insurance; a pure **discount/benefit card** is safer. [RESEARCH-WEAK: Gemini, R8.6, no IRDAI cite] This confirms the Phase 1 design: discounts and visit quotas only, with **no "free treatment up to ₹X" benefit type**.
- **GST on the card fee:** **18%** (residual services rate). There's no CBIC clarification, so get a written tax opinion. [RESEARCH-WEAK: Perplexity R1.2(f) and Gemini R8.6 agree] Seeded as `gst_rate_bp = 1800`, configurable. The card fee voucher is a **tax invoice**, not a bill of supply.
- **NMC discount rule:** Gemini reports an NMC update ("Oct 2026") prohibiting discounts and limited-period offers. [RESEARCH-WEAK: Gemini, R8.5, no regulation number] [CONFLICT: this would undercut the core Medicard benefit (discounts). Gate before production: a legal review (new **R9.8**). Plans are only sellable once the tenant records the legal sign-off.]
- **Cash:** the card fee goes through the SF-T9 cash guard. [VERIFIED: V8]

## Purpose
Sell, issue, renew and manage membership cards, and apply their benefits automatically at OP billing, IP billing and pharmacy, with a usage ledger.

## Users and roles
- Front Desk / Cashier: sell, issue and renew; benefits apply at billing.
- Marketing Executive: designs plans.
- Tenant Admin: approves plans.
- Accounts: card revenue reports.
- Patient: sees their card on A3.

## Workflows
1. **Plan design.**
   - Name, validity (months), fee, max members (1 for individual, N for family), eligibility (age limits).
   - Benefits:
     - % discount per service category (consultation, lab, radiology, pharmacy, room);
     - free-visit quotas per period (for example 4 free GP consultations a year);
     - an annual health check package;
     - priority flag.
   - GST on the card fee: **18%**, as configuration (`gst_rate_bp = 1800`); a tax invoice. [RESEARCH-WEAK: Perplexity + Gemini agree; no CBIC clarification, get a tax opinion]
2. **Sale and issue.**
   - Select the primary patient (registration required), add family members (registered patients), take the fee (OP voucher through OP billing), and generate the card number with barcode/QR.
   - Print the card [S1 r95 "Print Barcode" pattern for patient barcodes, Premium]. The card printing tier is a default.
3. **Benefit application at billing.**
   - When a patient with an active card is billed, the eligible lines get the plan's discount as a **concession of type `medicard`**: an IP/OP concession [S1 r25, r46] with an automatic approval reason.
   - Quota-based free visits consume the quota.
   - The cashier can remove a benefit, with a reason (audited).
4. **Renewal, upgrade and cancellation.**
   - **Renewal:** extends validity and resets quotas.
   - **Upgrade:** the price difference, prorated [DEFAULT, to confirm by research].
   - **Cancellation and refund policy:** not answered by research **OPEN – to confirm with Ajay Sheth** (#27). No default is set. Whatever is chosen, any refund issues a GST credit note (an engineering rule).
5. **Lost card.** Reissue a new card number and deactivate the old one (with a fee).
6. **Reports:**
   - cards sold and active by plan;
   - benefit utilisation (discount value given);
   - renewals due;
   - card revenue vs discount cost.

## Screens
- `/app/medicard/plans`: list, editor with a benefits grid.
- `/app/medicard/cards`: search, issue, detail with members, ledger, renew, reissue, cancel.
- A badge on the patient banner and billing screens: "Medicard: <plan>, valid till DD/MM/YYYY".
- `/app/medicard/reports/*`.
- Card print layout.

## Data model
- `medicard_plans(code, name, validity_months, fee_paise, gst_rate_bp, max_members, min_age null, max_age null, status enum draft|active|retired, approved_by)`
- `medicard_plan_benefits(plan_id FK, benefit_type enum category_discount|free_visit_quota|package|priority, service_category null, service_id FK null, discount_bp null, quota_count null, quota_period enum validity|year|month null)`
- `medicard_cards(location_id, card_no, plan_id FK, primary_patient_id FK, valid_from, valid_to, status enum active|expired|cancelled|lost_replaced, replaced_by_card_id FK null, sale_voucher_id FK)`, with UNIQUE (tenant_id, card_no)
- `medicard_members(card_id FK, patient_id FK, relation)`, with UNIQUE (card_id, patient_id). A patient can be on at most one active card per plan [DEFAULT, to confirm by research].
- `medicard_usage(card_id FK, patient_id FK, benefit_id FK, charge_id FK, concession_id FK null, quota_used int, discount_paise, used_at, reversed bool)`

## APIs (module `medicard`; features `medicard.plans`, `medicard.cards`, `medicard.reports` [DEFAULT])

| Method | Path | Feature | Roles |
|---|---|---|---|
| GET/POST/PATCH | `/tenant/medicard/plans` ; POST `/:id/{approve,retire}` | medicard.plans | Marketing Exec, Tenant Admin |
| POST | `/tenant/medicard/cards` (Idem; creates the OP voucher for the fee) | medicard.cards | Front Desk, Cashier |
| GET | `/tenant/medicard/cards?q` ; GET `/:id` ; GET `/by-patient/:patientId` | medicard.cards | Front Desk, Cashier |
| POST | `/tenant/medicard/cards/:id/{renew,upgrade,reissue,cancel}` (Idem) | medicard.cards | Front Desk, Cashier |
| POST | `/tenant/medicard/benefits/preview` `{patientId, lines}` | medicard.cards | Cashier (billing calls it) |
| GET | `/tenant/medicard/cards/:id/print` | medicard.cards | Front Desk |
| GET | `/tenant/medicard/reports/{sales,utilisation,renewals,economics}` | medicard.reports | Accounts, Admin |

## Business rules and edge cases
- Benefits apply only on the service date within `valid_from..valid_to` and when the card is `active`.
- When a line qualifies for several concessions (for example a corporate discount and a medicard), only the **best single** concession applies; they don't stack [DEFAULT, to confirm by research].
- A quota can't go negative. When a charge is reversed, the quota and discount usage are reversed too.
- A plan in use can't be edited. Retire it and create a new version.
- A card and its fee voucher are created atomically (DB function).
- An insurance (payer) case: the medicard discount applies only to the patient share [DEFAULT, to confirm by research].

## Integrations
- Registration (members must be registered).
- OP billing (fee voucher, OP concessions).
- IP billing (concessions at bill preparation).
- Pharmacy (sale discounts).
- Marketing (plans as promotions).
- A3 Patient portal (my card).
- MIS (revenue vs discount cost).

## Tier
Not in Sheet1. **OPEN – to confirm with Ajay Sheth.** No default tier is set. (OPEN-QUESTIONS-AJAY #17) Feature keys exist so App Admin can assign any tier once decided. **Production gate:** legal sign-off on the NMC discount question (R9.8).

## Acceptance criteria
- Issue a family card (3 members) with 10% off lab and 2 free consultations → a lab bill for member 2 shows a ₹ discount concession of type `medicard`. Two consultations are free, and the third is charged normally.
- Reversing a free consultation restores the quota.
- An expired card applies nothing. A reissued card deactivates the old number.
- Non-stacking with a corporate discount is verified. RLS fixtures exist.
- (Phase 2) The card fee voucher prints as a tax invoice with 18% GST from the config. Selling a plan for a tenant without the legal sign-off flag → 403 `legal_signoff_required`.

## Build order and tasks (migrations 1360–1369)
### MED-T1 Plans, benefits, cards, members, usage and RLS
- **Scope:** also the atomic issue + fee-voucher DB function.
- **Model:** grok.
- **Depends:** OP billing [VERIFY-REPO], registration.
### MED-T2 Benefit engine
- **Scope:** preview and apply as a concession, quota consumption and reversal, non-stacking.
- **Model:** grok.
- **Depends:** MED-T1, IPB-T4.
### MED-T3 Renew, upgrade, reissue and cancel, plus reports
- **Model:** grok.
- **Depends:** MED-T2.
### MED-T4 Web: plans editor, cards screens, billing badge, card print and reports
- **Model:** composer.
- **Depends:** MED-T2, MED-T3.
