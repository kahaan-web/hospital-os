# Security and compliance (Phase A)

This note is the Phase A position for Hospital OS. It is not a legal opinion and it is not a certification. Production still needs a reviewed privacy notice, a DPA with each hospital, and a pen test before real patient data is stored. Phase A stores **mock data only**.

## Tenancy

Every tenant-owned table has row-level security enabled and forced. Policies match `tenant_id` (or `tenants.id`) to `nullif(current_setting('app.tenant_id', true), '')::uuid`. The API sets that value, and `app.scope`, with `set_config(..., true)` inside the request transaction, so a pooled connection cannot leak a tenant into the next request.

Two database roles exist, both `NOSUPERUSER` and `NOBYPASSRLS`:

- `hos_migrator` owns the schema and runs migrations and seeds. Forced RLS means the owner still needs an explicit `USING (true)` policy.
- `hos_app` is what the API connects as. It has explicit grants only. It cannot read `sessions` or `invoice_sequences` directly; those go through `SECURITY DEFINER` functions owned by `hos_migrator`, with `search_path` locked to `pg_catalog, public` and `EXECUTE` revoked from `PUBLIC`.

**Limit.** `hos_app` sets its own GUCs. RLS stops application bugs that forget a `WHERE tenant_id = …`. It does not stop a compromised API process: that process can set `app.tenant_id` to any tenant it knows. Defence in depth is the app role's lack of `BYPASSRLS`, statement timeouts (`statement_timeout` 10s, `idle_in_transaction_session_timeout` 15s), and keeping the API host off the public internet except through TLS.

Postgres 16 has no built-in `sha256(bytea)`. Bootstrap (the superuser, `DATABASE_ADMIN_URL`) creates the `pgcrypto` extension. `public.sha256(bytea)` is a thin wrapper around `digest(data, 'sha256')` so the audit trigger does not depend on a function name that does not exist in this version.

## Sessions and CSRF

The cookie `hos_session` is an opaque 32-byte token. The database stores only its SHA-256. Passwords use argon2id (`@node-rs/argon2`). Every state-changing request must send `x-hos-csrf: 1`. Auth routes are rate-limited. Mock OTP, email and SMS are written to the API log and to `outbox_messages`; they are not delivered by a real provider. `MOCK_EXPOSE_SECRETS` may echo a code in the JSON response in development and must be off in production.

## Audit

`audit_log` is append-only. A trigger rejects `UPDATE`, `DELETE` and `TRUNCATE`, including for the table owner. Each tenant (and the platform, chain key `platform`) has its own hash chain: the trigger takes an advisory lock, overwrites `chain_key`, `seq`, `prev_hash`, `hash` and `created_at`, and sets `hash` to SHA-256 of a canonical JSON array. The genesis previous hash is 64 zeroes. `GET /api/v1/tenant/audit/verify` and `GET /api/v1/admin/audit/verify` recompute that hash in the application and report the first broken sequence.

## DPDP Act 2023

Hospital OS is a processor for each hospital (the data fiduciary) once real clinical data exists. Phase A captures the scaffolding only:

- A versioned privacy notice (`privacy_notices`). Signup records consent against the current version and its purpose tags (`consents`).
- Data-principal requests: access, correction, erasure and grievance (`data_principal_requests`), with a 30-day due date. Staff with `privacy.manage` record the outcome. This is a register, not an automated export or wipe of clinical records (those modules are not built yet).
- Purpose limitation is represented as the purpose list on the notice. New purposes need a new notice version and fresh consent.
- The App Admin and tenant audit logs are the accountability trail.

Before go-live: publish the real notice, name a grievance officer, sign a DPA, and define who at the hospital may raise a request on a patient's behalf.

## Encryption, transport, residency

- **In transit.** Production terminates TLS at the edge. The dev API listens on `127.0.0.1:4400` without TLS.
- **At rest.** Production databases and backups sit on managed disks with encryption enabled (for example a cloud disk encryption key, or Postgres on an encrypted volume). Backups are encrypted with a key separate from the database password and are stored in an India region.
- **Field level.** A later phase encrypts government identifiers (ABHA, Aadhaar tokens if ever stored, and similar) with envelope encryption: a data key per tenant wrapped by a KMS key that never leaves the India region. Phase A does not store those identifiers and does not implement the KMS call.
- **Residency.** Primary database, backups, object storage for logos and invoices, and the KMS key stay in India. No subprocessors outside India for personal data.

## Retention

| Data | Phase A default | Production intent |
| --- | --- | --- |
| Audit log | Kept. Append-only. | Retain at least 7 years (clinical record practice) or the hospital's policy, whichever is longer. |
| Tax invoices | Kept with the subscription. | 8 years, GST record-keeping. |
| Sessions | Idle and absolute timeouts (tenant 2h/12h, platform 30min/8h). | Same. |
| OTP and invites | Short expiry; rows remain for the audit of the attempt. | Purge consumed challenges after 30 days. |
| Mock outbox | Dev only. | Replace with a real provider; do not store message bodies longer than the delivery receipt needs. |
| Uploaded logos | On local disk under `UPLOAD_DIR`. | Object storage in India, deleted with the tenant. |
| Erasure requests | Status on the register. | When clinical modules exist, erasure follows the hospital's retention exceptions (medico-legal), not a hard delete of the audit chain. |

## Breach response

1. Contain: revoke the API credentials, rotate `hos_app` / `hos_migrator` passwords and the session pepper equivalent (invalidate `sessions`), and block the host.
2. Determine which `tenant_id` values appear in access logs for the window. RLS does not help after a credential theft of `hos_app`; the audit chain and reverse-proxy logs do.
3. Notify the hospital (fiduciary) without undue delay so they can meet the DPDP Board timeline. Do not notify patients directly unless the hospital asks and the contract says so.
4. Preserve the audit log. Do not `UPDATE` it; the trigger will reject that anyway.
5. Record the incident, the tenants affected, and the remediation in the platform audit chain.

## ABDM readiness (not implemented)

ABDM is optional per tenant and is not called in Phase A. The hooks, when a later phase adds them, are:

- **ABHA** — patient account linking, behind a module feature the plan matrix can turn on.
- **HFR** — facility registration for each location.
- **HPR** — practitioner registration for doctors.
- **FHIR R4** — a later exchange boundary. Phase A tables are not a FHIR server.

Until those features are entitled and configured, the API neither collects ABHA addresses nor talks to the ABDM gateway.

## Payments

The gateway is a mock. Orders and payments never leave this process. A captured payment is acknowledged only when `HMAC-SHA256(secret, orderPublicId|paymentPublicId)` matches, compared with a timing-safe equality check. There is no real payment gateway and no card data.
