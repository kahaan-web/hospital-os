# Hospital OS design system (`@hos/ui`)

Calm teal–slate healthcare UI for nursing-home owners and all-day front-desk use. Tokens are CSS variables; components are React + Radix primitives with WCAG 2.2 AA focus rings and contrast targets.

## Principles

- **Trust first:** generous whitespace, soft elevation, no aggressive reds except clinical errors.
- **India-native:** rupee/paise (`formatINR`, `MoneyInput`), `en-IN` grouping, `DD/MM/YYYY` date entry (`DatePicker` + shared `parseDDMMYYYY`).
- **Two densities:** `data-density="comfortable"` (default) and `compact` for busy counters — toggled via `DensityProvider` / `DensityToggle`.
- **Two themes:** `data-theme="light"` | `dark"` on `<html>`, with optional `system` in `ThemeProvider`.

## Tokens (`packages/ui/src/styles.css`)

| Layer | Notes |
| --- | --- |
| Colour | Brand teal scale; neutrals; **clinical status** tokens (`success`, `warning`, `error`, `info`, `critical`) with paired bg/fg/border for badges and alerts |
| Type | Plus Jakarta Sans + Inter (variable, loaded in `apps/web` layout); scale `--hos-text-xs` → `3xl` |
| Space / radius / shadow | Density-aware spacing and control heights |
| Motion | `--hos-motion-fast/base/slow`, ease curve for hover/focus |

Import once in the app: `@import '@hos/ui/styles.css'` in `globals.css`.

## Providers (wrap in `apps/web/src/app/providers.tsx`)

- `ThemeProvider` — persists theme in `localStorage` (`hos-theme`)
- `DensityProvider` — persists density (`hos-density`)
- `ToastProvider` + `useToast`
- `TooltipProvider` — required for tooltips

## Component map

All exports live in `packages/ui/src/index.ts`. One file per component under `packages/ui/src/components/`.

| Area | Components |
| --- | --- |
| Forms | `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Combobox`, `Checkbox`, `Switch`, `RadioGroup`, `DatePicker`, `Field`, `MoneyInput` |
| Display | `Card`, `Badge`, `PriceDisplay`, `PlanCard`, `ModuleTile`, `StatCard`, `PageHeader`, `EmptyState`, `Skeleton`, `Spinner` |
| Overlays | `Dialog`, `Drawer`, `Tooltip`, `DropdownMenu`, `Toast` |
| Navigation / layout | `Tabs`, `Stepper`, `SidebarLayout`, `PrintLayout`, `DataTable` |

**Module tile states:** `enabled` | `locked` | `coming-soon` (maps to entitlement `enabled` / `locked` / `coming_soon` in shells).

**Stepper:** horizontal for the 8-step onboarding wizard; vertical variant for side panels.

## App shell (`apps/web/src/components/shell`)

Props-only shells for other workers:

- `TenantShell` — sidebar from `ModuleStateDto[]`; locked modules keep nav but route to upsell (`onModuleUpgrade`)
- `AdminShell` — routes from `docs/CONTRACTS.md` web map (`/admin/*`)
- `LocationSwitcher`, `UserMenu`, `ThemeToggle`, `DensityToggle`, `CommandPalette` (Ctrl+K)

## Showcase

`/design` renders every component in light/dark and both densities.

## Accessibility checklist

- Visible `:focus-visible` rings (`--hos-focus-ring`) on interactive controls
- `Field` wires `aria-describedby`, `aria-invalid`, required markers
- Tables use `<th scope="col">`; stepper uses `aria-current="step"`
- Toasts use `aria-live="polite"`

## Dependencies

Radix packages are declared only in `packages/ui/package.json`. Do not add UI deps at the app layer except fonts and Next.js.
