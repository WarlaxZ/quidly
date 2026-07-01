# UI Polish & QoL Rollout — Design Spec

**Date:** 2026-07-01
**Status:** Approved (design); ready for implementation planning
**Phase:** 3 (polish) — apply the "Quiet Ledger" design system across the whole app + four QoL upgrades

## Problem & context

The app is functionally complete but visually generic (default Next.js scaffold: Geist/Arial, gray borders, blue underline links, unstyled tables). The user wants it **really polished, super intuitive, easy to use, and to look awesome** — it's the last thing before the product could be sold.

A **"Quiet Ledger"** design system has been built and approved on the flagship (login, app shell/sidebar, dashboard): warm paper (`#f7f4ec`), deep forest-green primary, ochre accent, Fraunces (display) + Hanken Grotesk (body) + IBM Plex Mono (figures), on `globals.css` tokens with `.card`/`.field`/`.btn`/`.ledger`/`.pill` component classes and a `.reveal` load animation. This spec rolls that system across every remaining page and adds four QoL upgrades.

**Decisions from brainstorming:** direction = Quiet Ledger, light theme (approved on the flagship). QoL scope = **all four**: responsive/mobile, delete confirmations, money-input polish, action feedback. Shared primitives first, then page-by-page. Verification is `tsc` 0 + full suite green (restyle touches no logic) + a per-page live screenshot check.

**Constraint:** this is a **presentation-only** change. Data functions, server-action logic, validation, routes, and tax maths must not change behaviour. Existing tests must stay green untouched. Where an action must add a success `?ok=` param, that is additive and must not alter its existing redirects/validation.

## Section 1 — Scope

**In:** shared UI primitives; responsive app shell; restyle of every `(app)` page to the design system; the four QoL upgrades (responsive, delete confirms, money inputs, action feedback + empty states).

**Pages to convert:** `transactions/page.tsx` + `transactions/[id]/edit`, `recurring/page.tsx`, `import/page.tsx`, `scan/page.tsx` + `scan/review/page.tsx`, `sa105/page.tsx`, `planner/page.tsx`, `properties/page.tsx` + `properties/[id]/edit`, `companies/page.tsx` + `companies/[id]/edit` + `companies/[id]/accounts` + `companies/[id]/ledger`, `vendors/page.tsx` + `vendors/[id]/edit`, `settings/page.tsx`.

**Already done (baseline, do not redo):** `src/app/globals.css`, `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/SideNav.tsx`, `src/app/(app)/PropertySwitcher.tsx`, `src/app/(app)/dashboard/page.tsx`.

**Out (never / later):** dark theme; any data-model, route, or tax-logic change; new features; a component library dependency (we use plain React + the existing CSS classes); animation beyond the existing `.reveal`.

## Section 2 — Shared primitives (`src/app/(app)/_ui/`)

Small, focused, mostly server components. Each has one responsibility and a clear prop interface.

- **`PageHeader.tsx`** (server) — props `{ title: string; subtitle?: string; children?: ReactNode }`. Renders the `h1` (Fraunces via base styles) + optional subtitle + a right-aligned slot (`children`) for actions/year-nav. Used at the top of every page for a consistent header.
- **`Banner.tsx`** (server) — props `{ variant: "error" | "success" | "info"; children: ReactNode }`. error = oxblood (`border-negative/30 bg-negative-soft text-negative`); success = forest-tinted; info = line/surface. Replaces every ad-hoc `bg-red-100` block. Pages render `<Banner variant="error">` from `?error` and `<Banner variant="success">` from `?ok`.
- **`EmptyState.tsx`** (server) — props `{ title: string; hint?: string; }`. A centered card with the £ mark, a message, and optional hint. Replaces plain "Add your first…" text.
- **`YearNav.tsx`** (server) — props `{ basePath: string; paramKey: "ty" | "year"; current: string | number; label: string; extraQuery?: Record<string,string> }`. Renders `‹ [label] ›` using the dashboard's control (prev/next links preserving other query params). Applied to SA105 (`ty`), planner (`ty`), company accounts (`year`).
- **`MoneyInput.tsx`** (server) — props extend input props; renders a `.field` with an inset `£` prefix (absolute-positioned, left padding on the input) and `inputMode="decimal"`. Drop-in for every amount field (name/defaultValue/required passed through).
- **`ConfirmSubmit.tsx`** (client, `"use client"`) — props `{ children: ReactNode; confirm?: string; className?: string }`. A `type="submit"` button that runs `window.confirm(confirm ?? "Are you sure?")` on click and calls `e.preventDefault()` if declined. Wraps every destructive (delete) action; keeps the existing `<form action={deleteX}>` server action intact.

## Section 3 — Responsive app shell

- `src/app/(app)/layout.tsx`: the `<aside>` sidebar becomes `hidden md:flex`. Add a **`MobileNav.tsx`** (client) top bar shown `md:hidden`: the £ wordmark + a hamburger button toggling a slide-in drawer containing the same `SideNav` groups, the property switcher, and logout. `<main>` padding adapts (`px-4 py-6 md:px-8 md:py-8`). The drawer uses local `useState` + a backdrop; closes on link click / backdrop click / Escape.
- `SideNav` is reused inside both the desktop aside and the mobile drawer (already a client component; pass the same groups). No change to its logic.
- Tables wrap in an `overflow-x-auto` container so wide `.ledger` tables scroll on narrow screens rather than breaking the layout.

## Section 4 — QoL details

- **Delete confirmations:** every `deleteX` form's submit becomes `<ConfirmSubmit confirm="Delete this <thing>? This can't be undone.">Delete</ConfirmSubmit>`. Applies to transactions, recurring rules, properties, companies, vendors, and company ledger entries.
- **Money-input polish:** every amount `<input name="amount"|"otherIncome"|"income"|…>` becomes `<MoneyInput …>` (£ prefix, `inputMode="decimal"`). Pure presentation — the server actions still parse pounds→pence exactly as now.
- **Action feedback:** add/save/generate/delete server actions append `?ok=<message>` to their redirect target (e.g. `?ok=Transaction+added`, `?ok=Saved`, `?ok=Deleted`). Each list/detail page reads `?ok` and renders `<Banner variant="success">`. The existing `?error=` handling and all validation/redirect-on-error paths are unchanged. (Recurring's existing `?generated=` note is replaced by the standard `?ok=` banner.)
- **Empty states:** replace bare "no data"/"add your first" text with `<EmptyState>` on transactions, recurring, properties, companies, vendors, ledger, SA105 (no-data), scan.

## Section 5 — Restyle conventions (applied to every page)

- Wrap content in `mx-auto max-w-4xl space-y-8` (or `max-w-3xl` for narrow forms), consistent with the dashboard.
- `PageHeader` at the top; `Banner` for `?error`/`?ok` beneath it.
- Filter/add forms → a `.card` panel with `.label` + `.field`/`MoneyInput`/`<select class="field">`; primary submit `.btn .btn-primary`, secondary `.btn .btn-ghost`.
- Lists/tables → `.ledger` inside a `.card overflow-hidden` (money right-aligned, `.money` class, `.tnum`); row actions (Edit link `.btn-ghost`-sized / `ConfirmSubmit` for delete).
- Money always via `formatGBP` + `.money`; negative/tax figures may use `text-negative`, profits `text-positive`, per the dashboard.
- `.reveal` with staggered `animationDelay` on the main sections of each page.
- No inline `text-blue-600`, `bg-gray-*`, `bg-red-100`, raw `border px-2 py-1` left anywhere in `(app)`.

## Section 6 — Testing & verification

- **Automated:** after every task, `npx tsc --noEmit` → 0 errors, and `npm test` → the full suite passes unchanged (the restyle changes presentation only; no test asserts on CSS classes). If a test breaks, STOP — it means logic was touched inadvertently.
- **Visual (live-run):** the dev server is run and each converted page is screenshotted via the browser (logged in as `ash`) and eyeballed for consistency with the flagship, correct data, no broken layout, and working responsive behaviour at a narrow viewport for the shell.
- **Consistency sweep (final):** `grep` `(app)` for banned leftovers (`text-blue-600`, `bg-red-100`, `bg-gray-2`, `border px-2 py-1`, `bg-blue-600`, `bg-green-700`) → none remain; a final full-app screenshot pass.

## Risks & caveats

- **Wide touch surface (~18 files):** mitigated by doing the shared primitives first and converting in small page-clusters, each screenshot-verified, so drift is caught early.
- **Action-feedback edits touch server-action files:** must remain purely additive (`?ok=` on success redirects only) — no change to validation or error redirects; reviewed per task.
- **Responsive drawer is the only stateful new client component:** keep it minimal (open/close), reuse `SideNav`, and verify at a narrow viewport.
- **Presentation-only guarantee is the core safety property:** the passing test suite (unchanged) is the evidence that no behaviour shifted.
