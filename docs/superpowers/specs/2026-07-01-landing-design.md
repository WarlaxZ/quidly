# Landing Page — Design Spec

**Date:** 2026-07-01
**Status:** Approved (design); ready for implementation planning
**Phase:** 4 (distribution) — sub-project B of three (Docker ✓ → **Landing** → README)

## Problem & context

Quidly has no public front door. The root route `src/app/page.tsx` unconditionally `redirect("/transactions")`, and `proxy.ts` gates every path except `/login` + `/api/login`, so a logged-out visitor to `/` is bounced to the login screen. We want a public landing page that positions Quidly as a **free, self-hostable UK-landlord tax tool**, using the existing "Quiet Ledger" identity (so it themes light/dark for free).

**Decision from brainstorming:** angle = **self-host, free & open** (no commerce). CTAs: **Sign in** (for the operator) + an on-page **"Self-host in 2 minutes"** Docker quick-start. Self-contained (no external repo URL yet — a placeholder button the operator fills when they publish). Single server component; no binary image assets.

**Constraint:** presentation + a tiny access change. The only logic touched is: making `/` public in `proxy.ts` and gating the root render on session. Full test suite stays green.

## Section 1 — Scope

**In:** make `/` (and `/icon.svg`) public in `src/proxy.ts`; rewrite `src/app/page.tsx` as the landing (auth-aware: authed → `/dashboard`, else render landing); a `LandingPage` built from design-system tokens (top bar, hero, feature grid, "why", self-host quick-start, footer).

**Out:** a hosted/paid/waitlist flow; a blog/docs site; binary screenshots (use CSS/SVG); a separate marketing route (the landing IS `/`); i18n; analytics. The in-app experience and all `(app)` routes are unchanged.

## Section 2 — Routing & access

- **`src/proxy.ts`:** add `"/"` and `"/icon.svg"` to `PUBLIC_PATHS` (so the landing and its favicon are reachable when logged out). Everything else stays gated exactly as now.
- **`src/app/page.tsx`** (server component):
  ```
  const session = await getSession();               // from ../lib/auth/session
  if (session.authenticated) redirect("/dashboard");
  return <LandingPage />;
  ```
  Use the existing `getSession()` helper (`src/lib/auth/session.ts`). The page renders inside the root layout (fonts + no-flash theme script already present), so it follows the OS/dark preference; there's no in-app sidebar/toggle on the public page (acceptable for a marketing page).

## Section 3 — Page content (`LandingPage`)

A single server component (co-located in `page.tsx` or `src/app/_landing/LandingPage.tsx`) using `.card`, `.btn`/`.btn-primary`/`.btn-ghost`, `.pill`, Fraunces headings, forest/ochre tokens, and `.reveal` staggering. Sections top-to-bottom:

1. **Top bar:** the £-keystone mark + "Quidly" wordmark (Fraunces) on the left; a "Sign in" `.btn btn-ghost` (→ `/login`) on the right. `max-w-5xl` centred, generous padding.
2. **Hero:** an oversized Fraunces headline, a muted subhead, and two CTAs (`Sign in` primary → `/login`; `Self-host it — free` ghost, anchor `#self-host`). Draft copy (editable):
   - H1: *"Rental accounts that do your tax for you."*
   - Sub: *"Quidly is a free, self-hosted bookkeeping app for UK landlords — track income and expenses and get your SA105 (and corporation tax) worked out to the penny."*
   - A small decorative inline ledger motif (a few `.money` rows summing to a profit, or the £ mark on a soft forest panel) — CSS/SVG only. Staggered `.reveal`.
3. **Feature grid** (`grid md:grid-cols-3`, `.card p-5` each), the real capabilities with a one-line blurb each:
   - Bookkeeping — transactions, recurring rules, one-click bank-CSV import.
   - Scan a receipt — optional AI extraction with your own key.
   - SA105 & personal tax — the £1,000 allowance, Section 24 relief, Scottish bands, to the penny.
   - Limited companies — corporation tax, dividends, director's loan (s455 + BIK).
   - Plan ahead — what-if personal-vs-company, and the salary-vs-dividend optimiser.
   - Light & dark — a calm, considered interface, your way.
4. **Why Quidly** (a compact row/list): Free forever · Self-hosted (your data on your machine) · UK-first · Correct-to-the-penny (integer money) · Open.
5. **Self-host in 2 minutes** (`id="self-host"`): a short intro line + a `<pre>` code block with the Docker quick-start:
   ```
   git clone <your-fork>   # your repo
   cd quidly
   cp .env.example .env     # set SESSION_SECRET, then:
   docker compose run --rm quidly npm run set-password   # paste the Docker-Compose hash into .env
   docker compose up -d
   # open http://localhost:3000
   ```
   Plus a "View the code" `.btn btn-ghost` with an `href="#"` placeholder + an HTML comment `<!-- TODO: set your repo URL -->` for the operator to fill on publish.
6. **Footer:** "Quidly" + "Not affiliated with HMRC. Estimates, not tax advice." + a warm one-liner (e.g. "Made for UK landlords who'd rather not fight their spreadsheet.").

## Section 4 — Testing & verification

- **Automated:** `npx tsc --noEmit` → 0 (clear `.next/dev` if a stale generated error appears); `npm test` → full suite green (only `proxy.ts` public-paths + `page.tsx` change; if any auth/proxy test exists it must still pass — confirm).
- **Flow (build + live-run):**
  - **Logged out:** `GET /` returns **200** and renders the landing (NOT a 302 to `/login`); the "Sign in" link points to `/login`; the favicon loads; the `#self-host` anchor scrolls to the quick-start.
  - **Logged in:** `GET /` redirects to `/dashboard`.
  - Screenshot the landing in **light and dark** (toggle via OS/localStorage) to confirm it's on-brand and legible in both.

## Risks & caveats

- **Public-path change:** adding `/` + `/icon.svg` to `PUBLIC_PATHS` must not expose any gated route — only these two exact paths are added; all `(app)` routes remain behind the session check. Verify a gated route (e.g. `/dashboard`) still redirects to `/login` when logged out.
- **Root redirect change:** `/` previously redirected to `/transactions`; now authed users go to `/dashboard` (the better landing for a signed-in user) and logged-out users see the marketing page. No deep links break (`/transactions` etc. still work directly).
- **No binary assets / no new deps:** the "app preview" is CSS/SVG, keeping the repo clean and the page fast; if a real screenshot is wanted later it can be added.
- **Repo URL placeholder:** the "View the code" / clone step carries a `TODO` placeholder because no public repo exists yet — documented, operator fills it on publish.
- **Presentation-only guarantee:** the passing unchanged test suite plus the logged-in/out flow check are the evidence nothing behavioural regressed.
