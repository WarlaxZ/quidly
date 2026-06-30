# Authentication — Design Spec

**Date:** 2026-06-30
**Status:** Approved (design); ready for implementation planning
**Phase:** 2 (first sub-project)

## Problem & context

The Phase 1 MVP (property accounting app: transactions, recurring rules, dashboard, SA105, CSV export — see [the Phase 1 spec](2026-06-30-uk-property-accounting-design.md)) has **no authentication** — every route is world-readable. The user intends to **expose it to the internet** and is also considering selling it as a **self-hosted, one-time-payment product** (each customer runs their own instance).

**Product-model decision (drives architecture):** Build for **single-tenant-per-install** — each deployment has exactly one user, their own data in their own SQLite file. This fits both "just me, exposed to the internet" and the "self-host, one-time payment" sales model, where installs are physically separate so there is no cross-customer data-leak surface. A hosted multi-tenant SaaS (many landlords in one instance) is explicitly **out of scope** and would be its own separate project (it would require `userId` on every row, signup, billing, data isolation, GDPR handling).

**Credential model:** username + password. **Security level:** solid baseline (no 2FA this round).

## Decision

Approach A — a thin, hand-rolled auth gate using vetted primitives, layered over the existing app without changing its data model. Chosen over Auth.js (over-engineered for single-user-per-install) and proxy-based auth (pushes work into infrastructure the customer must run; not "in the app"). HTTPS is assumed to be terminated by a reverse proxy (Caddy/Cloudflare/etc.) in front — a deployment concern, documented but not built here.

## Section 1 — Architecture, stack & the multi-tenancy seam

A gate that protects the app without touching the Phase 1 data model.

- **Password hashing:** `@node-rs/argon2` (argon2id). Node-runtime only → used solely in the login route handler.
- **Session:** `iron-session` — an encrypted, `httpOnly`, `secure`, `sameSite=lax` cookie. Stateless (no session table). Web-Crypto based, so it is validatable in Next.js middleware (edge runtime).
- **Credentials in environment variables:** `AUTH_USERNAME`, `AUTH_PASSWORD_HASH` (argon2id hash), `SESSION_SECRET` (≥ 32 chars). No unauthenticated first-run setup window — important for internet exposure and natural for a self-hosted customer.
- **The multi-tenancy seam:** all "who is calling" logic lives behind one module, `src/lib/auth/session.ts`, exposing `getSession()` and `requireSession()` returning a `Principal`. Today the principal is "the owner of this install" (no id needed). A future SaaS build adds a `userId` to `Principal` and scopes data queries by it; the seam keeps that change localized. **No user/tenant columns are added now (YAGNI).**

## Section 2 — Login, session & route-protection flow

- **`/login` page** — username + password form, posts to a login route handler (`POST /api/login`, Node runtime).
- **Login handler** — verifies username + argon2id password; on success writes the iron-session cookie and redirects to `/dashboard`; on failure re-renders with a **generic** "invalid username or password" (no field-level disclosure) and a 401-equivalent UX.
- **`src/middleware.ts`** — runs on every request; redirects to `/login` when there is no valid session. Allow-list: `/login`, the login API route, Next static assets (`/_next/*`, favicon). Gates **pages and route handlers alike**, including `/export/transactions` (CSV must not be world-readable).
- **Deep-link return** — middleware appends `?next=<path>` so login returns the user to the originally requested page.
- **Logout** — `POST /api/logout` (or server action) destroys the session cookie and redirects to `/login`. A "Log out" control is added to the nav in `src/app/(app)/layout.tsx`.

## Section 3 — Password hashing & brute-force protection

- **`npm run set-password`** — interactive script (`scripts/set-password.ts`): prompts for username + password, computes the argon2id hash, and prints/optionally writes `AUTH_USERNAME` + `AUTH_PASSWORD_HASH` to `.env`. Plaintext is never persisted.
- **Rate limiting / lockout** — a DB-backed `LoginAttempt` model (`id`, `ip`, `outcome`, `createdAt`). After **N failed attempts within a window** (default: 5 in 15 minutes) login is locked for a cooldown (default: 15 minutes). DB-backed so it survives process restarts; counted **globally** (one account) so it also resists IP-rotating/distributed brute force. A successful login clears recent failures. The threshold/window/cooldown are constants in one config module.
- **Hardening defaults:** cookie `httpOnly` + `secure` + `sameSite=lax`; session lifetime 7 days with an optional "remember me"; `SESSION_SECRET` presence and length validated at boot (fail fast on misconfiguration).

## Section 4 — Testing

- **Pure/unit (Vitest):** argon2id hash + verify round-trip; the lockout decision as a pure function over attempt records → `{ allowed | lockedUntil }`; session payload encode/validate.
- **Integration (test DB):** `LoginAttempt` recording, lockout threshold trips, reset-on-success.
- **Flow checks (build + live run):** unauthenticated request to a protected route → redirect to `/login`; valid credentials → session set → reach `/dashboard`; logout clears session; `/export/transactions` is gated. Lean on the live-run check harder than usual here, since "is it actually locked down?" is the whole point.

## New schema

One model added (no changes to existing models):

```prisma
model LoginAttempt {
  id        String   @id @default(cuid())
  ip        String?
  outcome   String   // "success" | "failure"
  createdAt DateTime @default(now())

  @@index([createdAt])
}
```

Migration created via the project's Prisma v7 workflow: hand-authored SQL under `prisma/migrations/<ts>_login_attempt/`, applied with `prisma migrate deploy`, then `prisma generate` (never `migrate dev`).

## Non-goals (explicit)

- No multi-tenant SaaS, no signup, no `userId` columns, no per-user data isolation (single-tenant per install).
- No 2FA/TOTP this round (baseline only; could be added later behind the same seam).
- No password reset flow (credentials are set via env / the CLI script by the operator).
- No HTTPS/TLS in app code (terminated by a reverse proxy; documented in README).
- No OAuth / social login.

## Risks & caveats

- **Stateless sessions can't be server-revoked** before expiry. Mitigated by a 7-day lifetime and the ability to rotate `SESSION_SECRET` (which invalidates all sessions). Acceptable for single-user; revisit if SaaS.
- **argon2 is Node-only** — must not be imported into edge middleware; password verification stays in the Node-runtime login handler. Middleware only validates the (Web-Crypto) session cookie.
- **Lockout is global** (single account) — a determined attacker could deny the legitimate user access by tripping the lockout (DoS). Accepted for a single-user app; the cooldown is short and a strong password is the primary defence. Note in README.
- **HTTPS is assumed.** The `secure` cookie flag requires TLS; document that the app must run behind HTTPS (it will misbehave over plain HTTP in production). Provide a local-dev note (secure cookies over `localhost` are allowed by browsers).
- Re-verify `@node-rs/argon2` builds in the deployment container (it is native, like the existing better-sqlite3 dependency).
