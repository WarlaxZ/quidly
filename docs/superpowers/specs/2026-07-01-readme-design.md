# README & Licensing — Design Spec

**Date:** 2026-07-01
**Status:** Approved (design); ready for implementation planning
**Phase:** 4 (distribution) — sub-project C of three (Docker ✓ → Landing ✓ → **README**)

## Problem & context

Quidly's `README.md` is a 50-line stub carrying the old name ("Property Accounts"), a stale
`npm run db:migrate -- --name init` step (Prisma v7 uses hand-authored SQL + `migrate deploy`, not
`migrate dev`), and no mention of the Docker self-host packaging (sub-project A) or the product's
real feature set. `package.json` is still named `akaunting-ng`. There is no `LICENSE` file. The
repo has no committed screenshots (the app + landing deliberately used zero binary assets).

This sub-project rewrites the README as an operator-first self-hosting guide that matches where
Quidly is now, adds an AGPL-3.0 `LICENSE`, renames the package, and commits a few screenshots.

**Decisions from brainstorming:**
- **Licence = AGPL-3.0** (strong copyleft: stays open, prevents a closed hosted competitor, leaves
  the door open to the author dual-licensing/selling a hosted version later).
- **Screenshots = a few key shots** (dashboard light + dark, SA105, planner/optimiser), captured
  from the running app and committed under `docs/screenshots/`.
- Operator-first structure (self-host fast), with a dev section below.

**Constraint:** documentation + additive files only. The one code touch is `package.json`'s `name`
field (cosmetic). No app/tax logic changes; the test suite stays green (198).

## Section 1 — Scope

**In:**
- Rewrite `README.md` (sections listed in §3).
- Add `LICENSE` (full AGPL-3.0 text) + a short licence section in the README.
- Rename `package.json` `"name": "akaunting-ng"` → `"quidly"`.
- Capture and commit screenshots under `docs/screenshots/` (dashboard light + dark, SA105, planner).
- A copy-paste **Caddy** HTTPS reverse-proxy snippet (the deferred Docker follow-up) + a Traefik/nginx pointer.

**Out:** `CONTRIBUTING.md`; issue/PR templates; a hosted docs site; a CHANGELOG; filling the landing's
real repo URL (no public repo exists yet — stays a documented `TODO` in `page.tsx`); any app/tax code
change beyond the `package.json` name; CI config.

## Section 2 — Screenshots

Capture from the running app (already themeable light/dark, seeded dev data present) via the browser,
save as PNGs under `docs/screenshots/`:
- `dashboard-light.png`, `dashboard-dark.png` — the hero ledger + estimated-tax panel.
- `sa105.png` — the SA105 summary screen.
- `planner.png` — the what-if planner (or the salary-vs-dividend optimiser `/extraction`) — whichever
  shows the "does your tax for you" value best.

Embed near the top of the README (after the one-liner). Reasonable widths so the repo page isn't
dominated by huge images (use HTML `<img width=...>` or a two-column table for the light/dark pair).
These are the repo's first (and only) committed binary assets — acceptable for docs.

## Section 3 — README structure (top to bottom)

1. **Title + one-liner + badges.** `# Quidly` · "Self-Assessment, sorted." · one line of static
   shields-style badges (Licence: AGPL-3.0 · Next.js 16 · SQLite · Tests: 198). One-sentence pitch.
2. **Screenshots** (from §2) — light/dark dashboard pair, then SA105 + planner.
3. **What it is.** Free, self-hosted UK-landlord bookkeeping + tax; money is integer pence end-to-end;
   single-user per install; **not affiliated with HMRC — produces estimates, not tax advice.**
4. **Features.** The real capabilities, one line each: Bookkeeping (transactions, recurring rules,
   one-click bank-CSV import, multi-property); Receipt scanning (optional BYO-key AI extraction);
   SA105 & personal tax (£1,000 allowance, Section 24 finance reducer, Scottish bands, SA105 PDF);
   Limited companies (corporation tax incl. marginal relief, dividends, director's loan s455 + BIK);
   Plan ahead (what-if planner + salary-vs-dividend optimiser); Light & dark.
5. **Self-host with Docker (recommended).** The exact quick-start from the landing:
   ```
   git clone <your-fork> && cd quidly
   cp .env.example .env                                   # set SESSION_SECRET
   docker compose run --rm quidly npm run set-password    # paste the Docker-Compose hash into .env
   docker compose up -d                                   # open http://localhost:3000
   ```
   Plus: the **`$`-doubling gotcha** (docker-compose interpolates `$` in env values, so the argon2
   hash goes in `.env` with each `$` doubled — `set-password` prints that form); the `quidly-data`
   volume persisting the SQLite DB + uploads; and `COOKIE_SECURE=false` only for plain-HTTP LAN.
6. **HTTPS reverse proxy.** A copy-paste **Caddy** `Caddyfile` snippet (`example.com { reverse_proxy
   localhost:3000 }`), noting Caddy auto-provisions TLS and you then leave the cookie secure (drop
   `COOKIE_SECURE`); a one-line pointer that Traefik/nginx work equally well.
7. **Local development.** `npm install`; create `.env` with `npm run set-password` (dev uses the
   **backslash-escaped** hash form) + `SESSION_SECRET` + `DATABASE_URL="file:./dev.db"`;
   `npx prisma migrate deploy` + `npx prisma db seed`; `npm run dev`; `npm test` (198). Note Prisma v7:
   datasource URL is in `prisma.config.ts`, migrations are hand-authored SQL applied via `migrate deploy`
   (not `migrate dev`).
8. **Configuration reference.** A table: var · required? · what it does · example — for `AUTH_USERNAME`,
   `AUTH_PASSWORD_HASH`, `SESSION_SECRET`, `DATABASE_URL`, `UPLOAD_DIR`, `COOKIE_SECURE`,
   `ANTHROPIC_API_KEY`, `EXTRACTION_MODEL`. Cross-reference `.env.example`.
9. **Tech stack.** Next.js 16 (App Router) · Prisma v7 + SQLite (better-sqlite3 adapter) · Tailwind v4 ·
   iron-session + argon2id auth · Vitest · Docker.
10. **Tax accuracy & caveats.** Estimates not advice; verify rates against HMRC each April; currently
    configured for the **2025-26** tax year (unconfigured years fall back with an in-app notice);
    single-tenant per install.
11. **Licence.** AGPL-3.0; one short paragraph on *why* (open, but network-use share-alike) and that
    commercial/hosted licensing from the author is possible. Link the `LICENSE` file.

## Section 4 — LICENSE file & package rename

- `LICENSE`: the verbatim **GNU AGPL-3.0** licence text (standard FSF text, with the year/author line
  filled where the standard template calls for it, or left as the canonical unmodified text — canonical
  unmodified text is fine and simplest).
- `package.json`: change `"name": "akaunting-ng"` to `"name": "quidly"`. (Cosmetic; `package-lock.json`
  root `name`/`packages[""].name` may update on the next `npm install` — updating the lockfile's two
  name fields to match is fine but not required; do not run a full `npm install` just for this.)

## Section 5 — Testing & verification

- **Automated:** `npm test` → 198 green (only `package.json` name changes — no code path touched);
  `npx tsc --noEmit` → 0.
- **Docs verification (the real gate for a README):**
  - Every command block is copy-pasteable and matches reality: the Docker quick-start matches
    `docker-compose.yml` + `docker-entrypoint.sh`; the dev steps match `package.json` scripts + the
    Prisma v7 flow; the env table matches `.env.example`.
  - Screenshots render (valid PNGs committed under `docs/screenshots/`, referenced with correct
    relative paths, images non-empty).
  - Markdown renders cleanly (no broken links, no unbalanced code fences) — spot-check by rendering
    or a lint pass.
  - `LICENSE` present and is the AGPL-3.0 text.

## Risks & caveats

- **Doc drift:** a README that contradicts the code is worse than none. Mitigation: the verification
  gate cross-checks every command/var against the actual compose file, scripts, and `.env.example`.
- **Binary assets:** screenshots are the first committed binaries; keep them reasonably sized and few.
  They live under `docs/` (already git-tracked for specs/plans).
- **Repo URL placeholder:** clone commands use `<your-fork>`; the landing's "View the code" button
  keeps its `TODO` — both are filled by the operator on publish (no public repo yet).
- **Licence accuracy:** AGPL-3.0 text must be the exact canonical FSF text (don't paraphrase a licence).
- **Presentation/docs-only guarantee:** the passing unchanged suite + the one cosmetic `package.json`
  name change are the evidence nothing behavioural regressed.
