# Branding: "Quidly" — Design Spec

**Date:** 2026-07-01
**Status:** Approved (design); ready for implementation planning
**Phase:** 3 (polish) — product name & identity

## Problem & context

The app has a placeholder identity: the wordmark literally reads "Property Accounts" and the browser tab / metadata still carry generic values. It needs a real name and a small, consistent identity applied across the shell, login, and browser chrome.

**Decisions from brainstorming:**
- **Name: Quidly** — *quid* (British money slang) + *-ly*: playful, unmistakably UK, and Google-clear (verified — no existing accounting product; the ruled-out **Reckoner**→Reckon and **Tally/Tallyman** clashes were avoided).
- **Mark:** keep the existing forest **£ keystone** — it already *is* the Quidly mark (quid = £).
- **Tagline: "Self-Assessment, sorted."** — outcome-focused, confident.
- **Typeface:** the wordmark uses the existing display serif **Fraunces**.

**Constraint:** presentation-only — wordmark/metadata/favicon text and a new favicon asset; no data/logic/route changes; the full test suite stays green.

## Section 1 — Scope

**In:** update the metadata title/description (`src/app/layout.tsx`); add a favicon (`src/app/icon.svg`); swap the wordmark "Property Accounts" → "Quidly" in the desktop sidebar (`src/app/(app)/layout.tsx`), the mobile drawer (`src/app/(app)/MobileNav.tsx`), and the login page (`src/app/login/page.tsx`); add the tagline "Self-Assessment, sorted." on the login screen.

**Out:** changing the £ mark's shape/colour (kept as-is); renaming code identifiers, routes, DB, or the repo; a logo beyond the £ mark; marketing pages; touching `AGENTS.md`/tooling. The internal `title` on cards etc. is unchanged.

## Section 2 — Details

- **Metadata (`src/app/layout.tsx`):**
  - `title`: `"Quidly — UK landlord bookkeeping & tax"`
  - `description`: `"Self-Assessment, sorted. Beautifully-kept accounts, SA105, corporation tax and tax planning for UK landlords."`
- **Favicon (`src/app/icon.svg`, new):** an SVG Next serves as the site icon automatically. A 32×32 (viewBox 0 0 32 32) rounded-square in forest `#1f3d30` with a centred cream `£` (`fill #f4f1e6`, `font-family: Georgia, 'Times New Roman', serif`, bold, ~20px, centred via `text-anchor="middle"` + `dominant-baseline="central"`). Matches the in-app mark. (Values are literal hex, not the CSS tokens, since the SVG renders outside the app's stylesheet.)
- **Desktop sidebar wordmark (`src/app/(app)/layout.tsx`):** the current mark block renders the £ square + `<span>Property<br/>Accounts</span>`. Replace the text with a single-line `Quidly` (remove the `<br/>`), keeping the £ square and the Fraunces styling. (A single word no longer needs the two-line wrap; adjust the span to `font-display text-[1.35rem] font-semibold leading-none text-ink` so "Quidly" sits nicely beside the mark.)
- **Mobile drawer wordmark (`src/app/(app)/MobileNav.tsx`):** the top-bar `<span>Property Accounts</span>` → `Quidly` (keep its existing classes).
- **Login (`src/app/login/page.tsx`):** the wordmark `<span>Property Accounts</span>` → `Quidly`; directly beneath the wordmark row add a tagline line: `<p class="mt-1 text-sm text-muted">Self-Assessment, sorted.</p>`. Keep the "Welcome back" card and its "Sign in to your accounts." subtitle unchanged.

## Section 3 — Testing & verification

- **Automated:** `npx tsc --noEmit` → 0; `npm test` → full suite green (no logic touched; no test asserts on the wordmark text). (If `tsc` shows a stale `.next/dev/types/validator.ts` error, `rm -rf .next/dev .next/types` and re-run.)
- **Grep:** no `"Property Accounts"` string remains in `src/app` (`grep -rn "Property Accounts" src/app` → none, except optionally within the metadata *description* if we choose to keep the descriptor — the wordmark occurrences must all be "Quidly").
- **Flow (build + live-run):** run the dev server; confirm the login shows the **Quidly** wordmark + "Self-Assessment, sorted." tagline; the sidebar (and mobile drawer) read **Quidly**; the browser tab title reads "Quidly — UK landlord bookkeeping & tax"; and the **£ favicon** renders in the tab. Screenshot login + a signed-in page in both a light check (dark mode already shipped; a quick light screenshot suffices).

## Risks & caveats

- **Availability caveat (from brainstorming):** "Quidly" returned no existing accounting product in a web search, but a domain/trademark check is advisable before any commercial launch — noted, out of scope for this build.
- **Favicon rendering:** browsers may cache the old favicon; a hard refresh may be needed to see the new one at live-run (not a code issue).
- **Presentation-only:** the passing unchanged test suite is the evidence nothing behavioural moved; the only new asset is `icon.svg` and the only edits are wordmark/metadata strings.
- **Fraunces in the favicon isn't available** (SVG renders outside the app fonts), so the favicon `£` uses a generic serif — visually close at 32px; acceptable.
