# Dark Mode — Design Spec

**Date:** 2026-07-01
**Status:** Approved (design); ready for implementation planning
**Phase:** 3 (polish) — a dark theme for the Quiet Ledger design system

## Problem & context

The app has a polished light theme built on semantic CSS-variable tokens in `src/app/globals.css` (`--color-paper`, `--color-surface`, `--color-ink`, `--color-forest`, etc.), and every page uses those tokens (`bg-surface`, `text-ink`, `border-line`, …) rather than hard-coded colours. A survey confirms the **only** hard-coded colour in the whole `(app)` tree is one line in `_ui/Banner.tsx` (`bg-[#e8efe9]`). So a dark theme is almost entirely a second set of token *values* plus a toggle — every page flips for free.

**Decision from brainstorming:** theme **follows the OS preference by default**, a toggle overrides it and is remembered (`localStorage`), and a tiny inline script applies the theme before first paint (no flash). Class-based (`<html class="dark">`) token override — the correct mechanism given Tailwind v4 emits `@theme` tokens as real CSS variables.

**Constraint:** presentation-only. No data/logic/test changes; the full suite stays green. The dark palette must preserve the "Quiet Ledger" character (warm, editorial — not a cold blue-black).

## Section 1 — Scope

**In:** a `.dark` token-override block + `color-scheme` in `globals.css`; a `--color-positive-soft` token and the one `Banner.tsx` fix; a no-flash inline script + `suppressHydrationWarning` in the root layout; a `ThemeToggle` client component placed in the desktop sidebar footer and the mobile drawer.

**Out:** per-page `dark:` variant classes (unnecessary — tokens flip everything); a 3-way system/light/dark selector (a 2-state toggle over an OS default is enough); theming the login page's chrome beyond what the tokens already give (it uses tokens, so it flips for free); persisting the theme server-side/in a cookie (localStorage + no-flash script is sufficient).

## Section 2 — Dark palette (token values)

Add to `globals.css` a `.dark { … }` block overriding these `@theme` colour tokens (warm charcoal base, sage-green accent, brighter amber — preserving the editorial warmth):

```css
.dark {
  --color-paper: #16140f;         /* warm espresso-black app bg */
  --color-surface: #201d16;       /* cards / raised */
  --color-surface-sunk: #100e0a;

  --color-ink: #ece6d8;           /* warm off-white text */
  --color-muted: #a49d8c;
  --color-faint: #726c5e;

  --color-line: #322d22;
  --color-line-strong: #45402f;

  --color-forest: #4f9d78;        /* legible sage — link/active text AND focal-panel bg */
  --color-forest-hi: #5cae87;
  --color-forest-ink: #10130f;    /* near-black text on the sage panels */
  --color-ochre: #d9a441;         /* brighter amber accent */
  --color-ochre-soft: #3a2e14;    /* dark amber tint (allowance callout / selection) */

  --color-positive: #57b083;
  --color-positive-soft: #16281d; /* success banner bg (dark) */
  --color-negative: #e0795f;      /* warm coral — losses / tax due */
  --color-negative-soft: #3a201a;
}
```

- Also add a **new light token** `--color-positive-soft: #e8efe9;` to the `@theme` block (used by the Banner success variant so it flips), and set `html.dark { color-scheme: dark; }` in `@layer base` (native controls follow).
- Rationale for the forest double-duty value: `--color-forest` is used both as focal-panel background (`bg-forest` + `text-forest-ink`) and as link/active text (`text-forest`). In light, a deep green serves both on paper. In dark, a deep green would neither read as text on the dark bg nor pop as a panel, so it becomes a mid **sage** that reads as text on `paper` and, with `forest-ink` flipped to near-black, makes the focal panels a confident sage block. This keeps dark mode a pure token-values change (no page edits).
- Shadows (`--shadow-card`/`--shadow-raise`) are left as-is; they're barely visible on dark and cards read via the surface/line contrast. No change needed.
- The body atmospheric radial gradients (faint forest/ochre rgba) already sit over `--color-paper` and read fine on the dark base — unchanged.

## Section 3 — No-flash theming & toggle

- **Root layout (`src/app/layout.tsx`):** add `suppressHydrationWarning` to `<html>`, and render an inline script in `<head>` that runs before paint:
  ```html
  <script dangerouslySetInnerHTML={{ __html:
    "try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark');}catch(e){}" }} />
  ```
  (Applies `dark` from a stored choice, else the OS preference; `'light'` stored value forces light. Server renders `<html>` without the class; the script adds it pre-paint → no flash. `suppressHydrationWarning` avoids the class-attribute mismatch warning.)
- **`ThemeToggle` (`src/app/(app)/ThemeToggle.tsx`, client):** on mount, reads `document.documentElement.classList.contains('dark')` into state (with a mounted guard to avoid SSR/first-paint mismatch). A button toggles: add/remove the `dark` class on `<html>` and write `localStorage.theme = 'dark' | 'light'`. Renders a sun (in dark, "switch to light") / moon (in light, "switch to dark") glyph with an accessible label, styled like the sidebar's other footer controls (a `text-muted hover:text-ink` row / small ghost button).
- **Placement:** in `src/app/(app)/layout.tsx` desktop sidebar footer (alongside the property switcher + Log out) and in `src/app/(app)/MobileNav.tsx` drawer footer.
- **Banner fix (`src/app/(app)/_ui/Banner.tsx`):** change the `success` variant background from `bg-[#e8efe9]` to `bg-positive-soft` (token) so it themes correctly; keep `border-forest/25 text-forest`.

## Section 4 — Testing & verification

- **Automated:** `npx tsc --noEmit` → 0; `npm test` → full suite unchanged/green (no logic touched; no test asserts on theme).
- **Visual (live-run):** run the dev server; verify (a) with `localStorage.theme` unset the theme follows the OS setting; (b) the toggle flips instantly and, after a reload, the choice persists with **no flash**; (c) screenshot a few representative pages (dashboard, a ledger table, a form, the forest focal panels, a Banner) in dark to confirm the sage/amber/coral palette reads well and nothing is illegible or stuck light; (d) native controls (a `<select>`, `<input type="date">`) render dark.

## Risks & caveats

- **Tailwind v4 token override:** relies on `@theme` colours being emitted as runtime CSS variables (they are) so a `.dark` selector re-points them. If any token were `@theme static`/inlined it wouldn't flip — none are; verify at live-run that a page actually darkens.
- **Hydration:** the inline script mutates `<html>` before React hydrates; `suppressHydrationWarning` on `<html>` and a mounted-guard in `ThemeToggle` prevent mismatch warnings/flicker.
- **Forest focal panels change character in dark** (deep-green-with-cream → sage-with-dark-text). This is an intentional, standard dark-mode inversion and was covered in the palette rationale; confirm it looks good at live-run.
- **The one hard-coded colour** (`Banner` success) is the only page-level edit; everything else is tokens + the toggle/script. Low blast radius.
- **Contrast:** the chosen dark values target legible contrast (off-white ink on espresso; sage/amber/coral accents). Spot-check at live-run; adjust a token value if any pairing reads poorly (a value-only change).
