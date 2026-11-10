# Hospital OS design system (`@hos/ui`)

Calm **OPD-desk** UI: clinical teal `#0E6B66`, tinted neutrals, hairline borders, IBM Plex Sans with Noto Sans Devanagari fallback. Follow `docs/DESIGN_GUIDE.md` for product-wide rules.

## Principles

- **Dense and scannable:** 4/8px spacing, 6–8px radius, Lucide line icons (no emoji).
- **India-native:** rupee/paise (`formatINR`, `MoneyInput`), `en-IN` grouping, `DD/MM/YYYY` (`DatePicker` + shared parsers), IST “today” in calendars.
- **Two densities:** `data-density="comfortable"` | `compact` via `DensityProvider`.
- **Two themes:** `data-theme="light"` | `dark"` on `<html>`; inline boot script in `apps/web` layout prevents flash; `ThemeProvider` persists `hos-theme`.

## Tokens (`packages/ui/src/styles.css`)

| Layer | Notes |
| --- | --- |
| Colour | Guide palette mapped to `--hos-brand-*`, tinted neutrals, clinical status (`success`, `warning`, `error`, `info`) |
| Type | IBM Plex Sans + Noto Sans Devanagari (`@fontsource/*` in `apps/web` layout); scale per DESIGN_GUIDE |
| Depth | Cards/tables use borders only; overlay shadow allowed on menus/dialogs |
| Focus | 2px teal outline (high-contrast safe); `prefers-reduced-motion` respected |

Import once: `@import '@hos/ui/styles.css'` in `globals.css`.

## Providers

- `ThemeProvider` — `light` | `dark` | `system`, validated storage
- `DensityProvider` — `comfortable` | `compact`
- `ToastProvider` + `useToast` — single live region, assertive errors, pause on hover/focus
- `TooltipProvider` — required for tooltips

## Component map

All exports in `packages/ui/src/index.ts`.

| Area | Components |
| --- | --- |
| Forms | `Button` (`asChild`), `IconButton`, `Input`, `Textarea`, `Select`, `Combobox`, `Checkbox`, `Switch`, `RadioGroup`, `DatePicker`, `Field`, `MoneyInput` |
| Display | `Card`, `Badge`, `PriceDisplay`, `PlanCard`, `ModuleTile`, `StatCard`, `PageHeader`, `EmptyState`, `Skeleton`, `Spinner` |
| Overlays | `Dialog`, `Drawer`, `Tooltip`, `DropdownMenu`, `Toast` |
| Navigation / layout | `Tabs`, `Stepper`, `SidebarLayout` (+ `renderNavLink`, mobile drawer), `PrintLayout`, `DataTable` |

**Module tile:** uses shared `ModuleAccess` (`enabled` | `locked` | `coming_soon`).

**Stepper:** **vertical** for the 8-step wizard; horizontal for compact headers. Step `label` is a string; `ariaLabel` optional.

## App shell (`apps/web/src/components/shell`)

- `TenantShell` — entitlements, `/app/modules/[key]`, hidden modules filtered, settings includes audit, prefix-aware active state
- `AdminShell` — `/admin/*` map, `Package` icon for module catalogue
- `LocationSwitcher`, `UserMenu` (shows email), `ThemeToggle`, `DensityToggle`, `CommandPalette` (Ctrl+K)

## Showcase

`/design` renders every component (including `Tooltip`, `DropdownMenu`, `IconButton`, vertical stepper) in light/dark and both densities.

## Accessibility checklist

- Teal `:focus-visible` outline on interactive controls
- `Field` always wires `id`, `aria-describedby`, `aria-invalid` into child controls
- Sortable tables expose `aria-sort`; combobox uses `listbox` + arrow keys
- Sidebar locked nav: Lucide lock + screen-reader “upgrade available”; no misleading `aria-disabled`
- Responsive shell: collapsible drawer below 768px

## Dependencies

Radix in `packages/ui` only. App loads fonts via `@fontsource/ibm-plex-sans` and `@fontsource/noto-sans-devanagari`.
