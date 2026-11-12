# Android A6 · HR & Payroll app

[DOCS: ML A6] "ANDROID MOBILE: HR & PAYROLL" is a **name only**, with no feature bullets. Scope is therefore [DEFAULT, to confirm by research]: **employee self-service**, plus light approvals for managers. **Status:** placeholder in `apps/mobile/src/apps/hr/` [ARCH: task-mobile.md]. The backend is `13-payroll-attendance.md`, with complaints in `17-employee-complaint-tracker.md`.

## Purpose
Staff mark attendance, apply for leave, see their roster and download payslips. Managers approve leave. Staff raise and track complaints.

## Users and roles
- Employee (self-service).
- Department head / Nursing Superintendent: approvals, team roster.
- HR Officer: read-only overview [DEFAULT, to confirm by research].

## Workflows
1. **Attendance:** punch in and out (optional geofence to the location; a selfie is **not** collected by default because of the DPDP minimisation principle [DEFAULT, to confirm by research]). Shows today's shift.
2. **My roster:** the week view.
3. **Leave:** balances, apply, cancel, status. Approvers get a list → approve/reject.
4. **Payslips:** month list → PDF view and download (with a password [DEFAULT, to confirm by research]).
5. **Complaints:** raise (including anonymous), my complaints, messages (from 17).
6. **Profile:** view own details. Change requests go to HR; there's no direct edit of statutory or bank fields.

## Screens
Home (today's shift + punch), Roster, Leave (balances, apply, my requests, approvals), Payslips, Complaints, Profile.

## Data model
Server: from 13 and 17. Client: none persistent except the session. Payslip PDFs are opened from a temp file and deleted after viewing [DEFAULT, to confirm by research].

## APIs
- POST `/tenant/hr/attendance/punch`
- GET `/tenant/hr/rosters?employeeId=me`
- GET/POST `/tenant/hr/leave-requests` (+ approve/reject)
- GET `/tenant/hr/payslips/:runId/me.pdf`
- POST `/tenant/complaints`, GET `/tenant/complaints/mine`, GET `/tenant/complaints/anon/:token`
- GET `/tenant/hr/me` (new; the employee's own profile DTO, masked)

## Business rules and edge cases
- An employee sees only their own data; the server enforces it.
- Approvers see only their department.
- Punching twice within 5 minutes is ignored.
- A punch outside the geofence (if enabled) is rejected, with a "request manual correction" option.
- Whether self-service users count as seats is a commercial decision (**R9.3**).
- The punch screen shows a DPDP notice (purpose: attendance; location only at punch time) and records consent before the first geofenced punch. No biometrics on the phone beyond the OS unlock. [RESEARCH-WEAK: Gemini, R6.10] [VERIFIED: DPDP duties from 13 May 2027]

## Integrations
Payroll & Attendance (13), Complaint Tracker (17), Users/auth (an employee login invite flow; may need a lighter "employee" login type [GAP: needs research]).

## Tier
Uses `payroll.*` and `complaints.*`, whose tiers are **OPEN – to confirm with Ajay Sheth.** (#11, #16). Add-on or included: **OPEN – to confirm with Ajay Sheth.** (#21).

## Acceptance criteria
- Punch → shows in the HR attendance grid. Leave apply → approve → balance updated. A payslip opens only for self (403 otherwise). A complaint is raised and tracked, including anonymously by token.
- Typecheck passes. Native screenshots once a device build exists [GAP: needs research].

## Build order and tasks
### A6-T1 Home with punch, roster, profile (`/tenant/hr/me` endpoint included)
- **Model:** composer.
- **Depends:** PAY-T2.
### A6-T2 Leave (apply, approve), payslips viewer
- **Model:** composer.
- **Depends:** PAY-T3, PAY-T5.
### A6-T3 Complaints (raise, mine, anonymous token, messages)
- **Model:** composer.
- **Depends:** CMP-T2.
