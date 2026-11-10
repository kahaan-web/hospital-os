# Security and compliance

This is the Phase A position for Hospital OS: what is built, what is only designed, and what is missing. It is not a legal opinion and not a certification. Production still needs a reviewed privacy notice, a Data Processing Agreement (DPA) with each hospital, a security review and a pen test before any real patient data is stored.

**Phase A stores mock data only.** Every seeded hospital is a sandbox tenant (`tenants.sandbox = true`), seeded doctors and patients are flagged `is_sample = true` (patients also get a `DEMO-` UHID), and the payment gateway, SMS and email are mocks.

## Roles under the DPDP Act, 2023

- **Data Principal**: the patient (and the hospital's staff, for their own accounts).
- **Data Fiduciary**: the hospital. It decides why and how patient data is processed.
- **Data Processor**: Hospital OS, acting on the hospital's instructions under a DPA. For the hospital's own account data (owner, staff, billing) Hospital OS is the fiduciary for its SaaS relationship.

Health data is not a separate "sensitive" category in the DPDP Act, but we treat it as the highest-risk data we hold, and the hospital remains bound by clinical record rules (for example the medico-legal and state retention rules) that override a simple erase.

## DPDP duties mapped to the build

Status: **Built** (in code and tested), **Partial** (some of it is in code), **Designed** (written down here, not built), **Gap** (not addressed yet).

| DPDP duty (section) | What Hospital OS does today | Status |
| --- | --- | --- |
| Notice before consent (s.5) | Versioned `privacy_notices` with purpose list; signup shows the current notice and records the version accepted. The notice text is a sample. | Partial |
| Consent: free, specific, for a stated purpose (s.6) | `consents` stores user, notice version, purpose tags, IP, user agent and time. Required vs optional purposes are separate. | Built (staff accounts) |
| Withdrawal of consent as easy as giving it (s.6(4)) | `consents.withdrawn_at` exists. There is **no withdraw endpoint or screen** yet. | Gap |
| Patient consent at registration | Patients are not consented through the product yet: Phase A has no patient-facing capture. | Gap (Phase B, Patient Registration) |
| Purpose limitation (s.4, s.6) | Purposes are declared on the notice. A new purpose needs a new notice version and fresh consent. Nothing in code blocks use for an undeclared purpose. | Partial |
| Accuracy and completeness (s.8(3)) | Input validation (zod) on every write; Indian formats enforced in the database (mobile `+91`, GSTIN check digit, pincode, DOB range). Correction requests go through the register. | Partial |
| Reasonable security safeguards (s.8(5)) | Tenant isolation in Postgres, RBAC per location, argon2id passwords, hashed session tokens, CSRF header, rate limits, TOTP for App Admin, append-only audit log. Details below. | Built (Phase A scope) |
| Breach intimation to the Board and each affected principal (s.8(6)) | Runbook below. Detection and notification tooling is not built. As processor we notify the hospital; the hospital notifies the Board and patients. | Designed |
| Erase when the purpose is served or consent is withdrawn (s.8(7)) | Erasure requests are logged in `data_principal_requests` with a 30-day due date. No automated erase or anonymise job. | Partial |
| Grievance redressal and contact person (s.8(9), s.8(10)) | Grievance is a request type in the register. No named grievance officer or published contact yet. | Partial |
| Right to access a summary of data (s.11) | Access requests are logged. No self-service export. | Partial |
| Right to correction and erasure (s.12) | Logged and tracked to closure by staff with `privacy.manage`. Manual fulfilment. | Partial |
| Right to nominate (s.14) | Not modelled. | Gap |
| Children's data: verifiable guardian consent (s.9) | Seeded sample patients include minors with an emergency contact. There is no guardian-consent flow or age check. | Gap |
| Processor only on a contract (s.8(2)) | DPA template not written. | Gap |
| Accountability record | Hash-chained audit log per tenant, verifiable from the API. Patient-record access logging arrives with the Phase B patient routes. | Built (Phase A actions) |
| Cross-border transfer (s.16) | Intent: India-only hosting, backups and KMS. No hosting is chosen yet. | Designed |

## Tenant isolation (row-level security)

Every tenant-owned table has row-level security **enabled and forced** (Phase B tables, `patients` included, follow the same template, and a planned `rls-coverage` test fails any tenant table without it). Policies compare `tenant_id` with `nullif(current_setting('app.tenant_id', true), '')::uuid` (wrapped as `hos_tenant_id()`). The API sets `app.tenant_id` and `app.scope` with `set_config(..., true)` at the start of each request transaction, so the setting dies with the transaction and a pooled connection cannot carry one hospital into the next request. With no tenant set, every tenant table reads as empty.

Two database roles, both `NOSUPERUSER` and `NOBYPASSRLS`:

- `hos_migrator` owns the schema and runs migrations and seeds. Because RLS is forced, even the owner goes through an explicit policy.
- `hos_app` is what the API connects as. Explicit grants only. It cannot read `sessions` or `invoice_sequences`; those go through `SECURITY DEFINER` functions with `search_path` pinned and `EXECUTE` revoked from `PUBLIC`. It cannot `UPDATE` or `DELETE` `audit_log`.

Children reference parents by `(tenant_id, id)` composite foreign keys, so a row cannot point at another tenant's location, user or order even by mistake.

How it is checked:

- `apps/api/src/security.test.ts` (vitest, throwaway database) checks that another tenant's invoice and user come back as 404, plus idempotency replay, entitlement and payment-signature checks.
- `scripts/smoke.mjs` signs in as Sunrise Care and as a second hospital (the Lotus demo tenant once Phase B seeds it, otherwise a throwaway signup) and asserts that the second hospital gets 404 on Sunrise's invoices and invoice PDF, never lists them, and cannot switch into a Sunrise location; with Lotus it also checks locations, staff and (once built) patients. With `--db` it connects as `hos_app` and checks that with no tenant set every tenant table reads empty, that another tenant sees 0 Sunrise rows, cannot update them and cannot insert into Sunrise (42501).

**Limit.** `hos_app` sets its own GUCs. RLS protects against application bugs (a query that forgets `WHERE tenant_id = …`). It does not protect against a fully compromised API process, which could set `app.tenant_id` to any tenant id it learns. Mitigations: no `BYPASSRLS`, statement timeout 10s and idle-in-transaction timeout 15s on `hos_app`, the API never exposed except behind TLS, and the audit chain plus proxy logs for forensics.

## Access control

- RBAC is per hospital **and per location**. A role assignment has a `location_id`, or `NULL` for all locations. Permissions are checked against the location the session is working in.
- Nine system roles: Tenant Admin, Location Admin, Front Desk, Doctor, Nurse, Cashier, Pharmacist, Lab Tech, Accounts (`packages/shared/src/rbac.ts`). Staff cannot grant a role above their own or at a location they do not manage.
- Patient records (Phase B plan): `patients.view` or `patients.manage` at the current location; another tenant's patient is a 404, so the API does not confirm it exists.
- App Admin (platform) is a separate account type with its own sessions. Platform sessions see no tenant rows unless an admin action targets one tenant, and that action is written to the tenant's own audit chain.
- **Gaps:** no "break-the-glass" emergency access, no time-boxed access, no MFA enforcement for hospital staff (TOTP exists but is optional), no per-field masking (for example hiding the mobile number from roles that do not need it).

## Audit log

`audit_log` is append-only. A trigger rejects `UPDATE`, `DELETE` and `TRUNCATE`, for the owner too. Each hospital has its own hash chain (the platform has chain `platform`): the trigger takes an advisory lock, sets `seq`, `prev_hash` and `created_at`, and stores `hash` = SHA-256 (`pg_catalog.sha256`) of a canonical JSON form of the row. The genesis previous hash is 64 zeroes. `GET /api/v1/tenant/audit/verify` and `GET /api/v1/admin/audit/verify` recompute the chain and report the first broken sequence.

Logged today: sign-in, failed sign-in, staff invites and role changes, onboarding steps, plan and add-on purchases, App Admin changes, privacy requests and seeds.

**Gaps:** reads of patient data are not logged yet (Phase B should log at least every opened record), and there is no external anchor for the chain (a database owner could in principle rebuild a whole chain; periodically exporting the head hash to write-once storage would close that).

## Encryption

- **In transit.** Production terminates TLS 1.2+ at the edge and forwards to the API on a private network. The session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` when `NODE_ENV=production`. **Dev runs plain HTTP on 127.0.0.1** (API 4400, web 3400, Postgres 55432 bound to localhost only).
- **At rest.** Intended: managed Postgres or an encrypted volume, encrypted backups with a separate key, all in an India region. **Not in place in dev**: the Docker volume `hospital-os-pgdata` is not encrypted.
- **Secrets.** Passwords are argon2id. Session tokens are 32 random bytes; only their SHA-256 is stored. OTP and invite tokens are stored hashed. `.env` is git-ignored; `.env.example` holds dev-only values. Production refuses to start without a real `MOCK_GATEWAY_KEY_SECRET` and forces secret echoing off.
- **Field level.** Designed, not built: government identifiers (ABHA number and address, any Aadhaar token) encrypted with a per-tenant data key wrapped by an India-region KMS key. The Phase B plan stores Aadhaar only as ID type plus last 4 digits; ABHA fields are optional and stored in clear until this lands, which is acceptable only while data is sample. Seeded ABHA-style numbers start with `00-` (never issued) and addresses end in `@sbx` (the ABDM sandbox suffix). **Recommended before go-live:** a CHECK that refuses ABHA values on rows not marked `is_sample` until encryption exists.

## Consent

Staff and owner consent is captured at signup against the current notice version and its purpose tags, with IP and user agent. Optional purposes (product updates) are separate from required ones. Gaps: no withdrawal endpoint or screen, no patient consent capture, no guardian consent for minors, no consent receipt sent to the principal.

## Data retention and deletion

| Data | Phase A behaviour | Production intent |
| --- | --- | --- |
| Patient records | Sample only (Phase B table). Erasure goes through the request register. | Keep for the hospital's clinical retention period (NMC/state rules, often cited as at least 3 years for inpatient records, longer for medico-legal cases, or the hospital's policy if longer). After that, anonymise or delete on a scheduled job, and log it. |
| Audit log | Kept forever, append-only. | At least as long as the clinical records it covers (we plan 7 years) or the hospital's policy if longer. |
| Tax invoices | Kept with the subscription. | 8 years (GST record keeping). |
| Sessions | Idle and absolute timeouts (tenant 2h / 12h, platform 30min / 8h). | Same; purge expired rows after 30 days. |
| OTP challenges, invites | Short expiry; rows kept as evidence of the attempt. | Purge consumed rows after 30 days. |
| Mock outbox | Dev only. | Real provider; keep only delivery receipts. |
| Uploaded logos | Local disk under `UPLOAD_DIR`. | Object storage in India, deleted with the tenant. |
| Tenant offboarding | Not built. | Export, then delete or anonymise all tenant rows after the contractual notice period, keeping only what law requires (invoices, audit). |

**Gap:** no retention job exists yet. Nothing is purged automatically.

## Breach handling

Runbook (Designed; not rehearsed):

1. **Contain.** Revoke API credentials, rotate the `hos_app` and `hos_migrator` passwords, invalidate all sessions, and isolate the host.
2. **Scope.** Work out which `tenant_id` values and which records were exposed in the window, from the audit chain, patient-access entries (once Phase B logs them) and proxy logs. After a theft of `hos_app` credentials RLS no longer helps; the logs do.
3. **Notify the hospital** (the fiduciary) without delay with what we know, so it can inform the Data Protection Board and affected patients within the time the DPDP Rules set (the DPDP Rules, 2025 ask for a detailed report to the Board within 72 hours). We do not contact patients directly unless the hospital asks and the DPA allows it. CERT-In reporting (6 hours for listed incident types) applies to us as the service provider.
4. **Preserve evidence.** Do not modify the audit log (the trigger refuses anyway). Snapshot logs and the database.
5. **Record** the incident, the tenants affected, the timeline and the fix in the platform audit chain.

**Gaps:** no intrusion detection, no alerting on unusual access (for example one user opening hundreds of records), no tested restore, no named incident owner.

## Application security, other

- Every state-changing request must carry `x-hos-csrf: 1`; auth routes are rate limited (30 a minute per IP); idempotency keys on payments and other writes.
- A login for an unknown email still runs an argon2 verify against a dummy hash, so timing does not reveal which emails exist.
- Mock payments: a capture is accepted only when `HMAC-SHA256(secret, orderPublicId|paymentPublicId)` matches (timing-safe compare). No real gateway, no card data.
- **Gaps:** no security headers middleware (CSP, HSTS, frame-ancestors) on the API, no dependency or container scanning in CI, no pen test.

## ABDM readiness (not implemented)

ABDM is optional per tenant and is not called in Phase A: ABHA linking, HFR facility registration, HPR practitioner registration and FHIR R4 exchange are later features behind the plan matrix. Until they are entitled and configured, the API neither collects real ABHA identifiers nor talks to the ABDM gateway.

## Before any real patient data

1. Real privacy notice, DPA template and named grievance officer.
2. Patient consent at registration, guardian consent for minors, and consent withdrawal.
3. Field-level encryption for identifiers (ABHA, Aadhaar last-4 handling).
4. Encrypted storage and backups in an India region, TLS everywhere, security headers.
5. Retention and erasure jobs, tenant offboarding.
6. Access alerting, breach drill, pen test.
