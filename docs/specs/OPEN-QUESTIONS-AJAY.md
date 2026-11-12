# Open questions for Ajay Sheth: product and doc-meaning decisions

Prepared 12 Nov 2026 under Kahaan's steering rule: wherever the specs are unsure about something Kahaan's docs or product decisions own, nothing is filled with a default or a guess. Each item below is marked **OPEN – to confirm with Ajay Sheth** in the spec named.

Not in this list:
- Regulatory and practice facts from research (see `RESEARCH-LOG.md`).
- Pure engineering choices, which keep their `[DEFAULT]` tags.

Format for each item: **Module** · Question · Why it matters (what it blocks or changes in the build).

## A. Tiers missing from Sheet1 (R9.1, one item per module)
Every module below has feature keys, so building can start, but **no tier is set**. Until a tier is set, App Admin can't package or price the module, and tier guards (`requireFeature`) can't be tested against Basic, Medium or Premium.

1. **Shared foundations (00)**
   - **Question:** Are the master screens (cost centres, suppliers, items, stores, employees, payers, service rates) on all tiers, or only where a dependent module is enabled?
   - **Why it matters:** These masters gate every other module. Restricting them could block Basic tenants from IP/OP billing set-up.
2. **OT Scheduling (03)**
   - **Question:** Which tier gets OT scheduling, the case record and the utilisation reports? Can OT be bought as an add-on?
   - **Why it matters:** It decides the `ot.*` feature guards and whether CPOE procedure orders (Premium) can route to OT on lower tiers.
3. **Radiology (04)**
   - **Question:** Which tier gets orders, worklist and reporting, and which gets the email result?
   - **Why it matters:** It decides the `radiology.*` guards. Lab is Medium+ with Premium email in Sheet1; should Radiology mirror it?
4. **Insurance/TPA (05)**
   - **Question:** Which tier, or is it an add-on? Are its reports a separate tier?
   - **Why it matters:** IP final-bill splitting (IPB-T4) only calls the payer split where entitled. It also affects the NHCX export (INS-T8).
5. **Indents & Purchase (07)**
   - **Question:** Which tier gets departmental indents and purchase requisitions? Sheet1 only covers the pharmacy PO, GRN and returns rows.
   - **Why it matters:** Basic has no PO (S1 r56), so it's unclear whether Basic gets indents → store issue at all.
6. **Bill Passing (08)**
   - **Question:** Which tier gets scroll, certification and 3-way passing? Sheet1 has only the approvals, payment and supplier reports, all Basic. What happens on tiers without scroll and certification?
   - **Why it matters:** It decides whether Basic bills go straight to approval, and the guards on BP-T2 and BP-T3.
7. **Blood Bank (09)**
   - **Question:** Which tier? Are storage (Mode S) and a full blood centre (Mode F) priced separately?
   - **Why it matters:** It decides the `blood_bank.storage` and `blood_bank.centre` entitlements and the App Admin pricing.
8. **Linen & Laundry (10)**
   - **Question:** Which tier?
   - **Why it matters:** The `linen.*` guards, and whether linen cost feeds MIS on lower tiers.
9. **Equipment Maintenance (11)**
   - **Question:** Which tier gets the master, breakdown and non-operational tracking, and which gets PM, calibration and the reports?
   - **Why it matters:** The `equipment.*` guards, which Android A2 also follows.
10. **Maintenance Tracker (12)**
    - **Question:** Which tier?
    - **Why it matters:** The `maintenance.*` guards. The Complaint Tracker routes facility complaints here, and Android A7 follows it.
11. **Payroll & Attendance (13)**
    - **Question:** Which tier for payroll? Are attendance and leave sold separately?
    - **Why it matters:** The `payroll.*` guards; Android A6 follows them. It also affects seat use (see #22).
12. **Access Data Migration (14)**
    - **Question:** Is it on all tiers as an onboarding tool? Is assisted import a paid service?
    - **Why it matters:** The `data_migration.import` guard, and App Admin pricing of migration services.
13. **Night Audit (15)**
    - **Question:** Which tier? Do lower tiers get automatic bed-charge posting without the day close?
    - **Why it matters:** IP bed charges must post somehow on every tier that has IP billing (Basic). This decides where `ipb_post_bed_charges` is called from.
14. **Marketing (16)**
    - **Question:** Which tier for the module beyond "Send Mailers" (S1 r10, Medium+)?
    - **Why it matters:** The `marketing.*` guards. Campaigns reuse the r10 consent/outbox path.
15. **Hospital MIS & Dashboards (02)**
    - **Question:** Which tiers get which of the 6 A1 dashboards (overview, revenue, material, occupancy, doctor performance, outstanding, cost centre)?
    - **Why it matters:** The `mis.*` keys, which Android A1 follows; it also affects the snapshot job's scope.
16. **Employee Complaint Tracker (17)**
    - **Question:** Which tier?
    - **Why it matters:** The `complaints.*` guards, and whether POSH intake is available to every tenant with 10+ staff (POSH applies by law at that size).
17. **Medicard (18)**
    - **Question:** Which tier, or is it an add-on?
    - **Why it matters:** The `medicard.*` guards. It's also legally gated (see #43).
18. **Users Management (ML #21)**
    - **Question:** It's listed in R9.1 but has no Sheet1 rows and no spec here. Which tier, and what's in scope beyond today's users and roles?
    - **Why it matters:** Seats and role bundles for the ~12 new roles proposed in `_CONVENTIONS` §5 depend on it.
19. **Nurse Station: vitals, MAR, diet (gap-nurse-station, A5)**
    - **Question:** Sheet1 makes Nurse Station Premium (r85–r91), but vitals entry, MAR and diet aren't rows. Which tier gets them? (CPOE "Patient Vitals" r113 is Premium.)
    - **Why it matters:** The new `nurse_station.vitals/.mar/.diet` keys, and Android A5's barcode administration flow.
20. **Patient Portal (A3)**
    - **Question:** Which tier? Do feedback and appointments come on all tiers if the app is bought?
    - **Why it matters:** The `patient_portal.*` keys, and the patient OTP auth work (A3-T2).

## B. Commercial and packaging (R9.2, R9.3)
21. **All Android apps (A1–A7)**
    - **Question:** Are the apps separate add-ons, or included with their web modules? (R9.2)
    - **Why it matters:** It decides whether mobile routes need their own entitlement check, and App Admin pricing.
22. **Seats (all modules, `_CONVENTIONS` §3, 13, A6, A3)**
    - **Question:** Do self-service employees (attendance, payslip, complaints) and patients (portal) count against seat limits (Basic 8 / Medium 25 / Premium 80)? Do they need a lighter "employee" login type? (R9.3)
    - **Why it matters:** A 60-staff hospital would exceed Medium's 25 seats on payroll alone. This decides the user model, the auth session kinds, and A6-T1 and A3-T2.

## C. Doc meanings and doc conflicts (R9.4, R9.5, R9.6 and others found)
23. **Sheet3 "Stage" and "Status" columns (all Sheet1 modules)**
    - **Question:** What does Stage (1–4) mean (release phase? priority?), and which existing system do the Status values (Change / No Change / New) refer to? (R9.5)
    - **Why it matters:** If Stage is a release order, the wave plan in INDEX §2 may need reordering. "Change" vs "New" could mean features already exist in a legacy system we're replacing, which changes the scope of the gap specs and the migration (14).
24. **Sheet1 vs Sheet3 conflicts (01, 06, gap-lab, gap-op-billing)**
    - **Question:** Which is right?
      - IP Patient Outstanding: Sheet1 Medium+ vs Sheet3 Basic.
      - Doctor Accounting: Sheet1 Premium vs Sheet3 Medium.
      - Lab email result: Sheet1 Premium vs Sheet3 Medium.
      - OP Visit Statistics: Sheet1 Medium+ vs Sheet3 Basic.
    - **Why it matters:** These are the tier guards on IPB-T6, DA-T1–T5, LAB-T3 and OPB-T3. The specs show the Sheet1 value (PLAN.md calls it the source of truth) but treat it as unconfirmed.
25. **Scrolling, Certification, Bill Passing (08)**
    - **Question:** What do the three terms mean here? Reading A (Phase 1): certification = the user department confirms receipt or service, and passing = Accounts' 3-way match. Reading B (Gemini, weak): certification = the 3-way match, and passing = statutory deductions and authorisation.
    - **Why it matters:** It changes who does what, the stage routing (`match_stage`, `require_dept_certification`), the screens in BP-T6, and the role permissions. BP-T2 and BP-T3 are gated.
26. **Access Data Migration (14)**
    - **Question:** Is "Access" Microsoft Access (.mdb/.accdb)? Which legacy system do target hospitals run, and what data must come across (patients, outstanding, stock, clinical history)?
    - **Why it matters:** It decides whether DM-T6 (the Access converter) is needed at all, and whether clinical history import is in scope. DM-T1–T6 are gated.
27. **Medicard (18)**
    - **Question:** What is a "Medicard": a membership/discount card, a prepaid card, a health plan, or something else?
    - **Also:** What's the cancellation and refund policy?
    - **Why it matters:** A prepaid card brings RBI PPI rules; a plan covering future treatment may count as insurance (IRDAI). It changes the whole data model (benefits vs stored value). MED-T1–T4 are gated.
28. **Employee Complaint Tracker (17)**
    - **Question:** Is it complaints *by* employees (grievances) or complaints *about* employees (e.g. from patients)?
    - **Why it matters:** Different users, confidentiality model (POSH channel, anonymity), routing and reports. CMP-T1–T3 are gated.
29. **Blood Bank (09)**
    - **Question:** Do target customers run a full licensed blood centre (Mode F), only a storage centre (Mode S, under 2,000 units/yr with State approval), or only request from an outside bank? (R9.6)
    - **Why it matters:** Mode F adds donor, collection, component and TTI workflows (BB-T4, on hold) and heavier regulation. It decides what's built first and the default mode per location.
30. **Maintenance Tracker (12) vs Equipment Maintenance (11)**
    - **Question:** How do #18 and #19 differ? Candidate: #18 = biomedical equipment, #19 = facility work orders.
    - **Why it matters:** It decides the ticket models, which module owns lifts, DG sets and fire equipment, and the A2 vs A7 app scopes.
31. **Night Audit (15)**
    - **Question:** What does the doc mean by "Night Audit" for a hospital? Candidate: a per-location end-of-day close (recurring charges, counter reconciliation, exceptions, day lock). Research found no Indian HMIS using the term.
    - **Why it matters:** It decides whether a business-date lock exists, which affects the back-dated guards in every money function (NA-T3). NA-T1–T4 are gated.
32. **CPOE (gap-doctor-workspace-cpoe)**
    - **Question:** CPOE is in Sheet1 but not in the module list PDF. Is it a module in its own right, or part of "Doctor Appointment / Visit" or the doctor workspace?
    - **Why it matters:** Module key, packaging and the Premium guard on all 13 rows.
33. **Lab equipment interface (gap-lab, S1 r81)**
    - **Question:** "2 Lab Equipments": does this mean exactly two analysers per tenant (a licence limit), or just the first two integrations?
    - **Why it matters:** Whether to enforce a per-tenant instrument cap in LAB-T4.
34. **LAB MIS vs "LAB Statistics" (gap-lab, S1 r84 / Sheet3)**
    - **Question:** Are they the same report set?
    - **Why it matters:** Report scope for LAB-T3 and LAB-T5.
35. **Maintenance Tracker, duplicated (12, A7)**
    - **Question:** It appears as Group I #19 and as Android item 7. Is it one module with a mobile app, or two products?
    - **Why it matters:** Packaging, and whether A7 needs its own entitlement.
36. **Android A6 HR & Payroll and A7 Maintenance (names only)**
    - **Question:** What screens are expected? A1–A5 have bullets; A6 and A7 don't.
    - **Why it matters:** The A6 and A7 task scope (5 tasks) is a guess until confirmed.
37. **Doc label typos (all UI)**
    - **Question:** Use the corrected labels in the UI ("Patient Registration", "Doctor's Appointments", "Workbench", "Statistics") rather than the doc spellings ("PATENT", "DOCTR'S", "WORKBANCH", "Satatisitcs")?
    - **Why it matters:** UI strings and feature-key display names.
38. **Users Management (ML #21)**
    - **Question:** What does the doc expect beyond the existing users and roles feature (e.g. role designer, per-location access, the employee login type)?
    - **Why it matters:** Needed to plan the new roles in `_CONVENTIONS` §5. It's not specced here.
39. **Doctor Accounting (06)**
    - **Question:** Are doctor shares computed on the gross or the net-of-concession amount, and on billing or collection basis?
    - **Why it matters:** It's the core formula for DA-T2 and changes every payout. This is a product and commercial decision, not research.
40. **IP account opening (01)**
    - **Question:** Is the payer (self vs insurer vs corporate) picked at admission, or only at billing?
    - **Why it matters:** It affects ADT (B4) admission screens and INS-T1. Insurance is a name only in the docs.

## D. Product decisions raised by Phase 2 research (R9.7–R9.10)
41. **Insurance (05)**
    - **Question:** Pursue ABDM M1–M3 certification and NHCX participation, through our own gateway or a partner? (R9.7)
    - **Why it matters:** INS-T9 (live NHCX) is on hold. NHCX needs ABDM M1 and HFR, which is an unscoped ABDM track.
42. **Insurance and IP billing (05, 01)**
    - **Question:** Accept the research-driven scope in v1: a multi-payer split (INS-T3), package billing (IPB-T11) and government scheme masters (INS-T10)? (R9.9)
    - **Why it matters:** Multi-payer changes the bill-line data model, which is costly to retrofit. The other two add 2 tasks.
43. **Medicard and Marketing (18, 16)**
    - **Question:** Get a legal review of the reported NMC bar on discounts, offers and referral fees before selling Medicard or running discount campaigns. (R9.8)
    - **Why it matters:** It may make the core Medicard benefit (discounts) unusable. Both features are gated off.
44. **IP/OP Billing, Bill Passing (01, gap-op-billing, 08)**
    - **Question:** Confirm the research-based seeds: the concession matrix (cashier 0; supervisor 5% / ₹2,000; branch admin 10% / ₹10,000, cumulative per encounter); the bed-day basis that each tenant picks at set-up; MSME due dates of 15 or 45 days. (R9.10)
    - **Why it matters:** These are the default approval limits and charging behaviour seen by every tenant.

## E. Other doc ambiguities found
45. **MIS (02, A1)**
    - **Question:** What does "SNAPSHOTS" (in "OCCUPANCY / ADMISSIONS MIS & SNAPSHOTS") mean? A live bed census, a stored daily snapshot, or a shareable screenshot/PDF?
    - **Why it matters:** The MIS-T1 snapshot table design and the A1 snapshot screen.
46. **Patient Portal registration (A3)**
    - **Question:** Does "PATENT REGISTRATION" in the app mean self-registration that creates a UHID instantly, or a pre-registration the front desk confirms?
    - **Why it matters:** UHID issuance rules, duplicate-patient risk, and A3-T4 scope.
