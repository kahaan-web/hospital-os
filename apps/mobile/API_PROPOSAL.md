# Mobile API proposal (Phase A additive)

Phase A implements auth, catalogue, onboarding and billing only. Patient appointments, visits, bills and doctor orders are **not** in the live API yet. `apps/mobile` calls these routes from `httpClient`. Until they exist, set `EXPO_PUBLIC_USE_MOCK=1` (the default) so the demo uses fictional fixtures.

Base: `{EXPO_PUBLIC_API_URL}` + `/api/v1` (default `http://127.0.0.1:4400/api/v1`).

Auth matches `docs/CONTRACTS.md`: session cookie `hos_session`, header `x-hos-csrf: 1` on mutations. Native clients cannot rely on httpOnly cookies, so this proposal also accepts:

- Request: `Authorization: Bearer <token>` **or** `x-hos-session: <token>` **or** `Cookie: hos_session=<token>`
- Login response (optional extra field, additive): `{ …Me, sessionToken?: string }` **or** response header `x-hos-session`
- Errors: `ApiErrorBody`

DTOs live in `packages/shared/src/mobile.ts` (`Appointment`, `Visit`, `Bill`, `DoctorSlot`, `Order`, plus profile/feedback). Money is integer paise. Dates are `YYYY-MM-DD`; slots are `HH:mm` (24-hour). Lists may be a bare array or `{ items, total, page, pageSize }`.

A mobile-only role key `patient` is used for portal users (staff roles stay as in `rbac.ts`).

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

## Doctor portal (A4) — `/doctor/*`

Tenant session, doctor role. Diary is location-scoped via the session’s current location.

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| GET | `/doctor/diary?date=YYYY-MM-DD` | — | `Appointment[]` |
| GET | `/doctor/visits/:id` | — | `Visit` (same DTO; doctor may also use `/patient/visits/:id` once authorised) |
| GET | `/doctor/orders?visitId=` | — | `Order[]` |
| POST | `/doctor/orders` | `placeOrderSchema` | `Order` |

`httpClient` reads visits through `/patient/visits/:id` for a shared DTO. When the API lands, prefer `/doctor/visits/:id` if RBAC needs a split.

## Entitlements

Gate with module keys `android-patient-portal` and `android-doctor-portal`. Un-entitled → 403 `not_entitled`. Every mutation writes `audit_log`. Tenant isolation via `SET LOCAL app.tenant_id` as in CONTRACTS.

## Out of scope here (placeholder apps)

A1 MIS, A2 Equipment, A5 Nurses, A6 HR, A7 Maintenance — catalogue only. No routes proposed until those modules exist on web.
