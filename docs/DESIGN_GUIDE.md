# Hospital OS Design Guide

This is the source of truth for every Hospital OS screen, on web and Android. Follow it literally. If a choice is not covered here, pick the quieter option or ask; do not invent a new look.

**Product.** A multitenant HMIS for small Indian nursing homes and hospitals. Owners and managers self-onboard in a setup wizard and start working the same day. Front-desk staff, doctors and nurses — often not tech-savvy, always busy — use mid-range laptops or Android phones, sometimes in bright or crowded rooms.

**Direction: "OPD desk."** The product should feel like a well-kept front desk: paper, ink, a teal stamp, information first. Calm, dense, specific. Not a SaaS marketing site, not a consumer wellness app, not a "modern AI dashboard."

---

## Principles

1. **The next action is obvious.** Every screen has one primary thing to do. Secondary actions stay visually quieter.
2. **Dense, not sparse.** Front desk and OPD are high-throughput. Prefer a tight, scannable layout over large cards and empty air. Hierarchy comes from type, weight and spacing, not boxes.
3. **Prevent the error.** Confirm destructive or clinical actions. Distinguish blank, zero and pending. Show units and normal ranges next to values. Do not make people calculate GST, age or balances in their head.
4. **India by default.** INR with Indian grouping, DD/MM/YYYY, +91 phone numbers, GSTIN, PIN codes. Hindi-ready strings and fonts from day one, even if English ships first.
5. **Solid, quiet, specific.** Surfaces are opaque. Colour is semantic or the one accent. Copy names the real job. Decoration is a defect.
6. **Keyboard at the desk, thumb on the phone.** Tab order matches visual order. Touch targets are large. Hover is never the only affordance.
7. **Trust over flourish.** This software holds patient data, money and prescriptions. It should look competent and calm, never clever.

---

## Do / Don't (anti-slop)

AI slop is the generic look models and starter kits reach for when no one has chosen a direction. Hospital OS must not look like that.

| Do | Don't |
| --- | --- |
| Left-align pages, forms and headings | Centre everything; centred hero + two buttons + three feature cards |
| One primary block per screen; separate the rest with space or a hairline | Grids of identical rounded cards with the same drop shadow ("cardocalypse") |
| Hairline borders or a 3–5% surface shift | `rounded-2xl shadow-lg`, frosted glass, glow, blurred colour blobs |
| One solid accent colour on the primary action | Purple, indigo or violet; multi-hue gradients; gradient text; neon on dark |
| Lucide line icons, only where they label an action or a status | Emoji as icons; an icon in a tinted rounded square on every card |
| Sentence-case headings that say the job | ALL-CAPS eyebrows, "✨ Introducing", sparkle/AI badges, 01/02/03 chrome, arrows on every button |
| Real product content: a queue, a bill, a patient list | Lorem, generic stats strips, fake testimonials, invented metrics |
| Light canvas by default; dark mode only if the user asks | Dark mode as the default; near-black with a glowing accent |
| Motion only to confirm an action the user just took | Fade-up on every section, hover-lift on every card, looping decorations |
| Tokens from this guide | Raw Tailwind `indigo-*` / `violet-*` / `purple-*`, default shadcn look, "Inter on pure white" sameness |

Banned copy, anywhere: *unlock, supercharge, seamless, elevate, empower, revolutionize, next-generation, all-in-one, delightful, magical, effortlessly.*

---

## Visual language

### Colour

Tinted neutrals, not pure `#FFFFFF` / `#000000`. One restrained clinical teal. Semantic colours are not brand colours.

| Token | Hex | Use |
| --- | --- | --- |
| `canvas` | `#EEF2F2` | Page background |
| `surface` | `#FFFFFF` | Main working area, table, form |
| `surface-muted` | `#E7EDED` | Zebra, disabled, inset |
| `ink` | `#1A2426` | Primary text |
| `ink-muted` | `#5C6B6E` | Secondary text, captions (still AA on `canvas`) |
| `line` | `#D0DADA` | Borders, dividers, table rules |
| `teal` | `#0E6B66` | Primary buttons, links, focus, current step |
| `teal-hover` | `#0A524F` | Hover / active primary |
| `teal-subtle` | `#E4F3F2` | Selected row, soft highlight |
| `success` | `#1B6B42` | Completed, paid, in range |
| `warning` | `#8A4B08` | Needs attention, due, low stock |
| `danger` | `#B42318` | Error, overdue, critical, destructive |
| `info` | `#185FA5` | Informational, in progress |

White text on `teal`, `success`, `warning`, `danger` and `info` must stay AA. Do not use colour as the only signal: pair it with a label (`Paid`, `Critical`) or an icon. Do not introduce a fourth brand hue. Do not put a coloured left stripe on cards "for flair"; reserve it for a true status, if at all.

### Typography

One Latin family: **IBM Plex Sans**, 400 / 500 / 600. It was designed for dense professional software, has tabular figures, and is not a starter-kit default.

Hindi / Devanagari fallback: **IBM Plex Sans Devanagari** (same foundry, same metrics). Load it so UI and body copy do not jump when a string is translated. Do not mix in Inter, Plus Jakarta Sans, Geist, Poppins or a display serif.

Scale (use these sizes only):

| Role | Size / line-height / weight |
| --- | --- |
| Caption, table meta, helper | 12 / 16 / 400 |
| Body, table cell, input | 14 / 20 / 400 |
| Body comfortable (wizard, help, empty state) | 16 / 24 / 400 |
| Label, nav item, button | 14 / 20 / 500 |
| Section title | 18 / 24 / 600 |
| Page title | 24 / 32 / 600 |
| Rare display (login, wizard welcome only) | 32 / 40 / 600 |

No 72px marketing headings in the app. `font-variant-numeric: tabular-nums` on money, counts, IDs, dates and times. Line length for prose: about 60–80 characters. Do not uppercase a whole label for style.

### Spacing, radius, depth, icons

- **Grid:** 4px base, 8px rhythm. Prefer 8, 12, 16, 24, 32, 48. Do not invent 13px or 15px gaps.
- **Radius:** 6px on controls (buttons, inputs, selects); 8px on panels and dialogs; full pill only on status badges. Never 16px+ "soft" cards.
- **Depth:** no drop shadow on cards or tables. Hairline `line` borders, or a shift from `canvas` to `surface`. One overlay shadow is allowed on menus, popovers and modal dialogs: `0 8px 24px rgba(26, 36, 38, 0.16)`.
- **Icons:** Lucide only, 16 or 20px, `strokeWidth={1.5}`. No filled icon sets, no emoji, no decorative illustration on empty states unless it is a simple monochrome line drawing.

### Dark mode

Optional, off by default, behind a user setting (and `prefers-color-scheme` once the setting exists). Tinted dark neutrals, not pure black; lower-chroma teal; no glow, no glass, no neon borders. Every pair must still meet AA. Build light first; do not block the demo on dark mode.

---

## Layout patterns

### App shell

Desktop: collapsible left sidebar (modules the hospital has entitled), top bar with hospital name, **location switcher** (Mumbai / Indore / Jaipur, etc.), current user, and a clear search or "Register patient" primary action where that is the job. Content is left-aligned, full working width, with a sensible max width on settings and reading pages (~720px for forms, wider for tables).

The location in context must always be visible. Switching location must be explicit and hard to do by accident.

### Data tables

The default working view for queues, bills, patients and inventory.

- Sticky header, 14px cells, enough row padding to click or tap (min ~36px row height on desktop, 44px on touch).
- Sensible default sort; sortable columns; filter and search in the header, not hidden in a hamburger.
- Do not rely on horizontal scroll. Prioritise columns; offer a column picker if needed.
- Distinguish **blank** (em dash or "Not recorded"), **zero** (`0` or `₹0.00`), and **pending** ("Pending" in `warning` or `info`, never an empty cell).
- Row click opens the record; a separate checkbox column selects. Visible hover and selected states (`teal-subtle`).
- Real `<table>` markup, with column headers associated to cells.

### Forms

Labels above fields, sentence case, left-aligned. Group related fields (for example hospital identity, GST, addresses). Helper text under the field, not a wall of tooltips.

Validate on blur and on submit, not on every keystroke. Do not block typing or paste to "force a format." Normalise GSTIN, PAN and phone on blur (uppercase, strip spaces). Keep GSTIN input long enough to paste a messy value, then show a specific error, not "Invalid."

Sensible defaults everywhere: country India, currency INR, date today where that is safe, GST rates the product already knows. Never default a clinical or financial value that could be wrong.

### Setup wizard

Eight steps, one job per step. A visible step list (name, not just 1–8), with the current step in `teal`. **Save and resume** on every step; a returning user lands on the first incomplete step.

Inline validation, a review step before payment, and a mock checkout that can succeed or fail with a clear recovery path. Primary button is a verb: "Save and continue", "Pay ₹12,000." Back is always available and never destructive. Do not lock a hospital out because they closed the tab.

### Empty states

One short sentence of plain language and **one** next action. Example: "No patients at this location yet. Register the first patient." No mascots, no robots, no "You don't have any data yet" with a gradient illustration.

Loading: skeleton or a still, labelled spinner in the content area — not a bouncing logo. Error: what failed, and what to try.

### Printouts (invoices, prescriptions, reports)

Black (or `ink`) on white. No teal fills, no screens, no grey bars that waste toner. Hospital name, address, GSTIN and logo at the top. Indian date and INR formatting. GST breakup visible on invoices. Enough margin for a physical file and a stamp. A4, preview before print, and a PDF that matches the preview.

---

## Copy and tone

Plain Indian English. Short sentences. Address the user as "you." Name the object: patient, bill, appointment, location, module — not "entity" or "resource."

Buttons are a verb plus an object: "Register patient", "Collect payment", "Download invoice." The confirm button uses the same verb.

Errors say what happened and how to fix it: "This GSTIN is 14 characters. It should be 15." Success toasts are brief and specific: "Invoice INV-1042 saved."

Do not joke in clinical or billing flows. Do not write marketing on operational screens. Keep strings in a translation file, never concatenated mid-sentence, so Hindi (and later other languages) can be swapped in.

**Locale rules (en-IN):**

- Money: `₹1,23,456.00` (Indian grouping). Use lakh/crore only in high-level summaries (`₹2.5 Lakh`); never on invoices, receipts or payment screens.
- Dates: `DD/MM/YYYY` in fields and tables; `10 Nov 2026` is fine in prose. Times in 24-hour clock, Asia/Calcutta, labelled when the zone could be unclear.
- Phone: `+91 98765 43210`.
- GSTIN: 15 characters, shown in uppercase.

---

## Mobile (Android)

The same product, not a shrunk desktop. One column. A **bottom nav** of at most five destinations (for example Queue, Patients, Billing, Reports, More). The current location stays visible at the top.

Touch targets are at least **44×44px**, preferably 48. Primary actions sit in a reachable thumb zone. No hover-only menus. Inputs large enough for a mid-range phone in a bright room: 16px text on fields so Android does not zoom the page.

**Offline-tolerant:** if the network drops, say so in a calm banner, keep already-loaded records readable, and queue safe actions (draft notes, clock-in style events) with a clear "Waiting to sync" state. Never silently drop a registration or a payment. Do not pretend to be a full offline EHR in Phase A; be honest about what will wait.

---

## Accessibility

WCAG 2.2 **AA** is the floor: 4.5:1 for text, 3:1 for UI components and focus rings. The focus ring is visible (`teal`, 2px, offset) and never removed.

Full keyboard use: tab order follows reading order; Enter submits the focused form; Escape closes a dialog and returns focus to the opener; dialogs trap focus while open. Front-desk flows must be completable without a mouse.

Do not rely on colour alone. Respect `prefers-reduced-motion` (no decorative motion; keep instant state changes). Form fields have visible labels (placeholder is not a label). Images and icons that convey meaning have text alternatives; decorative icons are hidden from assistive tech. Tables use real headers. Hit areas and text can be enlarged without breaking the layout.

---

## Reviewer checklist

Do not merge UI that fails any of these:

- [ ] Looks like Hospital OS (OPD desk), not a shadcn / Tailwind / AI default
- [ ] No purple, indigo, gradients, glass, glow, emoji icons, or decorative card grids
- [ ] One primary action; left-aligned; 4/8 spacing; radius 6–8; borders not shadows
- [ ] IBM Plex Sans only (plus Devanagari fallback); type scale from this guide
- [ ] INR, DD/MM/YYYY, +91, GSTIN handled as specified
- [ ] Empty, loading and error states exist and offer a next step
- [ ] Blank vs zero vs pending is unambiguous
- [ ] Keyboard works; focus is visible; contrast is AA; colour is not the only signal
- [ ] Copy is plain, specific, and free of banned marketing words
- [ ] Touch targets ≥ 44px on mobile; location context is visible
- [ ] Destructive or clinical actions are confirmed; the user can recover from a failed payment or a closed tab in the wizard
- [ ] Print/PDF is black on white and complete (identity, GST, totals)

