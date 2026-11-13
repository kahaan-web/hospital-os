# Worker ot-web2-c — delivery notes

Branch: `feat/ot-gknm-web2` (worktree `admin-wizard`).

## Built per spec section

### §9 Post-operative surgery details (`/app/ot/bookings/[id]/post-op`)
- Booking summary header and full form: seven theatre times with tick → now (`TimeTickRow`), clinical fields, anaesthesia type list (safe default from spec), Major/Minor, Save via `GET/PUT …/bookings/:id/post-op`.
- Graceful handling when booking/post-op API returns 404 (placeholder summary, user can still edit/save).

### §12 OT list status (`/app/ot/list-status`)
- Filters: optional From (checkbox), To, criteria surgery/booking date, status Active/Cancelled/All, OT, Cr company (text), patient type, Show / Clear / Back.
- Grid columns match §12.

### §13 Reports (`/app/ot/reports`)
- Report picker: OT register (LOS), date-wise register (same API, sorted by date), doctor-wise, department matrix, anaesthetist-wise, cancellation, duplication check, frozen statistics.
- Params: date range, OT, operating doctor, department, anaesthetist, booking type, multi-select surgeries (master list when API available).
- Print via `window.print` + `ot-print.css`; Clear / Back.

### §14 Masters (`/app/ot/masters`)
- Tabs: Surgeries (list/add/edit), Special remarks (list/add), Doctor roles (surgeon/anaesthetist switches), OT resources (full §14 field form), Settings (cutoff, min lead days, emergency bypass).

### Shared
- `apps/web/src/features/clinical/ot/api-gknm2.ts` — typed client against OT-SPEC API contract; uses `apiGet`/`apiPut`/etc. from `@/lib/api` (does not modify `api.ts`).
- `gknm2/OtSectionNav.tsx` — cross-links between ot-web2 routes (does not edit `nav.tsx`).
- Empty/error states when GKNM API routes are not deployed yet.

## Deviations / decisions
- **Date-wise register**: uses `register` report kind with client-side sort/group; no separate API kind in OT-SPEC.
- **Patient type filter**: MVP values (`pay_patient`, `insurance`, `corporate`, `staff`) — CR P10 patient-type list still OPEN.
- **Departments** for surgery master/report filters: best-effort `GET /tenant/clinical/departments`; silently empty if missing.
- **Post-op 404**: allows data entry before backend links booking id (decision: unblock parallel API work).

## OPEN items (from OT-SPEC, unchanged)
- Cr company semantics, patient type full list (§12).
- Appointment for on resource master (§14).
- Anaesthesia values confirmation (using safe default list).
- TEMP cancellation type display depends on API payload.

## Typecheck
- `npm run typecheck` in `apps/web` **passes**.
- Root `npm run typecheck` **fails** on pre-existing `apps/mobile` / Expo `tsc` issues (unrelated to ot-web2); no changes made outside owned paths.

## Not in scope (ot-web1 / other workers)
- Dashboard, requests, book, schedule routes; `api.ts`, `nav.tsx`, API, DB.
