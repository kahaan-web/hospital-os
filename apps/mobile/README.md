# Hospital OS mobile (`@hos/mobile`)

React Native + Expo (SDK 54, TypeScript) workspace for the seven Android apps in the client module list (A1–A7). SDK 54 is the latest Expo that runs on the Node 20 installed on this machine (SDK 58 requires Node 22). Phase A ships a clickable **Patient portal (A3)** and **Doctor’s medical portal (A4)** against mock fixtures. Other role apps list every feature the document names and mark them coming later.

This is the same product as the web app, not a shrunk desktop: one column, bottom tabs, location on every screen, 48px touch targets, IBM Plex Sans, INR / DD/MM/YYYY / 24-hour times.

## Demo logins (mock mode)

Password for all: `Demo@12345`

| Email | Role | Lands on |
| --- | --- | --- |
| `patient@sunrise.demo` | Patient | A3 — appointments, visits, bills, profile, feedback |
| `doctor@sunrise.demo` | Doctor | A4 — today’s diary, visit, order tests/medicines |
| `nurse@sunrise.demo` | Nurse | A5 placeholder |
| `admin@sunrise.demo` | Tenant Admin | A1 MIS placeholder |

Names are obviously fictional (Priya Sample, Dr. Arjun Fictional, Sunrise Demo Nursing Home). Sample prices/bills are demo data, not a live hospital.

## Run (this Dell, no emulator)

Do **not** run `expo prebuild`, EAS, or an Android emulator. Web is enough to typecheck and click through.

From the repo root:

```
npm install --prefer-offline --no-audit --no-fund
```

From `apps/mobile` (or `-w @hos/mobile`):

```
npx tsc --noEmit -p apps/mobile
npx expo export --platform web
```

To click through locally, start Expo web on **3401** (3400 is the Next.js app):

```
npx expo start --web --port 3401
```

Stop that process when you are done. Default env (see `.env.example`):

- `EXPO_PUBLIC_API_URL=http://127.0.0.1:4400`
- `EXPO_PUBLIC_USE_MOCK=1` (default on — demo works without the API)

Set `EXPO_PUBLIC_USE_MOCK=0` to use `httpClient` against `POST /auth/login` and the proposed `/patient/*` + `/doctor/*` routes in `API_PROPOSAL.md`.

Session: `expo-secure-store` on native; cookie `hos_session` plus `localStorage` fallback on web.

## Layout

```
apps/mobile/
  app/                         expo-router screens
    login.tsx
    patient/                   A3 tabs + book/detail stacks
    doctor/                    A4 tabs + visit + order
    nurse|mis|equipment|hr|maintenance|coming-soon/
  src/
    api/                       MobileApi + httpClient + mockClient
    mock/fixtures.ts           fictional seed
    apps/{patient,doctor,nurse,mis,equipment,hr,maintenance}/
                               tab config per role
    theme.ts                   DESIGN_GUIDE tokens
  metro.config.js              watchFolders + nodeModulesPaths (monorepo)
```

Shared types: `@hos/shared` (`packages/shared/src/mobile.ts`). Metro watches the workspace root so the TypeScript package resolves without a pre-build.

## Later: one Expo app per Android product

Today this is a **single** app that routes by role after login. Each folder under `src/apps/` is already a gated section with its own tab config, so it can become a separate binary:

1. Set `EXPO_PUBLIC_APP_VARIANT=patient` (or `doctor`, `nurse`, `mis`, `equipment`, `hr`, `maintenance`). `app.config.ts` changes the display name.
2. Duplicate `app.config.ts` per variant (`app.config.patient.ts`, …) or use Expo config plugins to swap `android.package` / iOS bundle id (`in.hospitalos.patient`, …).
3. Point that binary’s start route at the matching `app/<role>` group and drop the other groups from the bundle.
4. Keep `@hos/shared` and `src/api` as the common client. Do not fork DTOs.

No EAS project is configured here on purpose.

## Constraints

- Mock / sample data only.
- No real payment, SMS or email.
- No `expo prebuild`, no EAS, no Android emulator in this phase.
