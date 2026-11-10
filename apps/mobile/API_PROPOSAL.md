# Mobile API proposal (Phase A additive)

Phase A implements auth, catalogue, onboarding and billing only. Patient appointments, visits, bills and doctor orders are **not** in the live API yet. `apps/mobile` calls these routes from `httpClient`. Until they exist, set `EXPO_PUBLIC_USE_MOCK=1` (the default) so the demo uses fictional fixtures.

Base: `{EXPO_PUBLIC_API_URL}` + `/api/v1` (default `http://127.0.0.1:4400/api/v1`).

Auth matches `docs/CONTRACTS.md`: session cookie `hos_session` (httpOnly, SameSite=Lax), header `x-hos-csrf: 1` on mutations. Web clients send `credentials: 'include'` and restore the session with `GET /auth/me`. They must not store the session in `localStorage` or a script-readable cookie (browsers hide `Set-Cookie`).

Native clients cannot read httpOnly cookies, so they send **one** header with the opaque session id:

- Request: `x-hos-session: <token>`
- Login response (optional extra field, additive): `{ …Me, sessionToken?: string }` **or** response header `x-hos-session`
- Errors: `ApiErrorBody`

Do not send Bearer, Cookie, and `x-hos-session` together.

DTOs live in `packages/shared/src/mobile.ts` (`Appointment`, `Visit`, `Bill`, `DoctorSlot`, `Order`, plus profile/feedback). Money is integer paise. Dates are `YYYY-MM-DD`; slots are `HH:mm` (24-hour). Lists may be a bare array or `{ items, total, page, pageSize }`.

A mobile-only role key `patient` is used for portal users (staff roles stay as in `rbac.ts`).

Access: a caller who is the wrong role gets `403 forbidden`. A row the caller does not own is **`404`**, never `403` (same as CONTRACTS: another principal’s id is invisible).

`GET /doctor/diary` is read-only. `visitId` may be `null` until a visit exists for that appointment; the client must not open `/doctor/visit/null`. The mock does **not** create visits as a side effect of listing the diary.

Healthcare clinical bills (OP consultation, in-house diagnostics from a clinical establishment) are GST-exempt: `gstRateBp` is `0` on each line, and `cgstPaise` / `sgstPaise` / `igstPaise` / `gstPaise` are `0`.

## Patient portal (A3) — `/patient/*`

Tenant session. Patient role sees only their own rows.

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| GET | `/patient/profile` | — | `PatientProfile` |
| GET | `/patient/doctors` | — | `DoctorDirectoryItem[]` |
| GET | `/patient/doctors/:id/slots?date=YYYY-MM-DD` | — | `DoctorSlot[]` |
| GET | `/patient/appointments` | — | `Appointment[]` |
| GET | `/patient/appointments/:id` | — | `Appointment` |
| POST | `/patient/appointments` | `bookAppointmentSchema` | `Appointment` |
| POST | `/patient/appointments/:id/cancel` | — | `Appointment` |
| GET | `/patient/visits` | — | `Visit[]` |
| GET | `/patient/visits/:id` | — | `Visit` |
| GET | `/patient/bills` | — | `Bill[]` |
| GET | `/patient/bills/:id` | — | `Bill` |
| POST | `/patient/feedback` | `submitFeedbackSchema` | `Feedback` |

Existing: `POST /auth/login` (`loginSchema`) → `Me`; `POST /auth/logout`; `GET /auth/me`.

`POST /patient/appointments` accepts `Idempotency-Key` (client sends a new UUID per user-initiated submit) so a double tap does not book twice.

## Doctor portal (A4) — `/doctor/*`

Tenant session, doctor role. Diary is location-scoped via the session’s current location. Doctor visit reads go through `/doctor/visits`, not `/patient/visits`.

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| GET | `/doctor/diary?date=YYYY-MM-DD` | — | `Appointment[]` |
| GET | `/doctor/visits` | — | `Visit[]` (this doctor’s visits) |
| GET | `/doctor/visits/:id` | — | `Visit` |
| GET | `/doctor/orders?visitId=` | — | `Order[]` |
| POST | `/doctor/orders` | `placeOrderSchema` | `Order` |

`POST /doctor/orders` accepts `Idempotency-Key` (new UUID per submit). The placed order’s `doctorId` is the signed-in doctor, not a hardcoded sample id.

## Entitlements

Gate with module keys `android-patient-portal` and `android-doctor-portal`. Un-entitled → 403 `not_entitled`. Every mutation writes `audit_log`. Tenant isolation via `SET LOCAL app.tenant_id` as in CONTRACTS.

## Out of scope here (placeholder apps)

A1 MIS, A2 Equipment, A5 Nurses, A6 HR, A7 Maintenance — catalogue only. No routes proposed until those modules exist on web.
