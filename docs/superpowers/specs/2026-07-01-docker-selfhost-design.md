# Docker / Self-Host Packaging — Design Spec

**Date:** 2026-07-01
**Status:** Approved (design); ready for implementation planning
**Phase:** 4 (distribution) — sub-project A of three (Docker → Landing → README)

## Problem & context

Quidly is a complete Next.js 16 + Prisma-v7/SQLite app but has no way to self-host it. Self-hosters need: a container image that builds the app and its native modules (`better-sqlite3`, `@node-rs/argon2`), a persistent volume for the SQLite DB **and** on-disk receipt uploads, automatic DB migration + category seeding on first run, a `docker compose up` workflow, and clear first-run auth setup. A blocker was found: the session cookie is `secure` when `NODE_ENV=production`, so login over plain HTTP fails — this must be addressed for common self-host setups.

**Decision from brainstorming — Approach A (simple & robust):** multi-stage build; the runtime image carries the built app **and the full `node_modules`** (so Prisma CLI, `tsx`-based seed, and the compiled native modules all "just work") — larger image, maximal reliability, the right trade for a self-host tool. Order: Docker first (this spec), then Landing, then README.

**Constraint:** additive packaging + one small auth-config addition (`COOKIE_SECURE`); no feature/logic changes. The existing test suite stays green. Docker **is** available in the build environment, so verification includes an actual image build + `docker compose up` smoke test.

## Section 1 — Scope

**In:** `Dockerfile` (multi-stage), `.dockerignore`, `docker-entrypoint.sh`, `docker-compose.yml`, `.env.example` updates, and a `COOKIE_SECURE` override in `src/lib/auth/session-config.ts`. First-run migrate + seed automation and the `set-password` flow for Docker.

**Out:** Kubernetes/Helm; a published image on a registry (build-from-source via compose is enough); a DB-backed "create account on first run" screen (env-based auth stays; noted as a future upgrade); `output: 'standalone'` (Approach B, rejected); Postgres/MySQL support (SQLite only); HTTPS termination (delegated to the operator's reverse proxy, documented).

## Section 2 — Dockerfile (multi-stage, Debian slim)

- **Builder stage** `node:22-bookworm-slim`:
  - `apt-get install -y --no-install-recommends build-essential python3` (to compile `better-sqlite3`/`@node-rs/argon2` if a prebuilt binary isn't used).
  - `WORKDIR /app`; `COPY package*.json .`; `npm ci`; `COPY . .`; `npx prisma generate`; `npm run build`.
- **Runtime stage** `node:22-bookworm-slim`:
  - `WORKDIR /app`; `COPY --from=builder /app /app` (whole app incl. built `.next`, `node_modules` with compiled native modules + generated Prisma client + Prisma CLI + `tsx`, `prisma/`, `scripts/`, `src/`).
  - Use the base image's non-root `node` user; `mkdir -p /data && chown node:node /data`; `USER node`.
  - `ENV NODE_ENV=production`; `EXPOSE 3000`; `ENTRYPOINT ["./docker-entrypoint.sh"]`.
  - No build tools in runtime (native modules already compiled against the same OS/glibc).

## Section 3 — `.dockerignore`

Exclude: `node_modules`, `.next`, `.git`, `.env`, `.env.*` (never bake secrets), `*.db`, `*.db-*`, `docs`, `dev.db`, `uploads`, test artefacts. (Ensures a clean build context; the builder runs its own `npm ci`.)

## Section 4 — Entrypoint (`docker-entrypoint.sh`)

```sh
#!/bin/sh
set -e
mkdir -p "${UPLOAD_DIR:-/data/uploads}"
npx prisma migrate deploy
npx prisma db seed        # idempotent upsert of the HMRC categories
exec npx next start -H 0.0.0.0 -p 3000
```
- First run: creates + migrates + seeds the DB at `DATABASE_URL`. Subsequent runs: `migrate deploy` is a no-op if up-to-date; the seed re-upserts categories harmlessly.
- Binds `0.0.0.0:3000` so the port maps out of the container.
- `prisma.config.ts` reads `DATABASE_URL` from the real container env (no `.env` file is shipped in the image — see `.dockerignore`), so no dotenv-expand mangling occurs.

## Section 5 — `docker-compose.yml`

```yaml
services:
  quidly:
    build: .
    image: quidly
    env_file: .env
    environment:
      DATABASE_URL: file:/data/quidly.db
      UPLOAD_DIR: /data/uploads
    ports:
      - "3000:3000"
    volumes:
      - quidly-data:/data
    restart: unless-stopped
volumes:
  quidly-data:
```
- The **Docker paths** (`DATABASE_URL`, `UPLOAD_DIR`) are set in `environment:` (fixed for the container, independent of the dev-oriented host `.env`). Secrets (`AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `SESSION_SECRET`, optional `ANTHROPIC_API_KEY`/`EXTRACTION_MODEL`, optional `COOKIE_SECURE`) come from the host `.env` via `env_file`.
- The named volume `quidly-data` persists both the DB and uploads across restarts/upgrades.

## Section 6 — `.env.example` (updated)

Add a clearly-labelled **Docker / self-host** section documenting: leave `DATABASE_URL`/`UPLOAD_DIR` to compose; set `AUTH_USERNAME`/`AUTH_PASSWORD_HASH` (the **UNescaped** hash for Docker — see §7), `SESSION_SECRET`; optional `ANTHROPIC_API_KEY`; and `COOKIE_SECURE` (see §7). Keep the existing dev-oriented lines with a note that Docker overrides the paths.

## Section 7 — Auth & the HTTPS/cookie fix

- **`COOKIE_SECURE` override** in `src/lib/auth/session-config.ts`: change `secure: process.env.NODE_ENV === "production"` to:
  ```ts
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
  ```
  Default behaviour is unchanged (secure in production). A self-hoster serving over plain HTTP on a trusted LAN can set `COOKIE_SECURE=false`; `.env.example` documents this with a security warning (prefer an HTTPS reverse proxy — Caddy/Traefik/nginx — and leave it secure).
- **Password hash for Docker:** the operator runs `docker compose run --rm quidly npm run set-password` (works because the runtime carries `tsx` + `scripts/` + `src/lib/auth`), enters username/password, and pastes the printed **UNescaped** `AUTH_PASSWORD_HASH` into the host `.env` (the script already prints the unescaped form for "Docker/systemd" env vars). `env_file` passes it to the container as a real env var — no dotenv-expand, so the raw hash is correct.

## Section 8 — Testing & verification

- **Automated (unchanged behaviour):** `npm test` → full suite green (the only code change is the `COOKIE_SECURE` line, which preserves the existing prod-secure default; no test asserts on the cookie). `npx tsc --noEmit` → 0.
- **Docker smoke test (Docker is available):**
  1. `docker compose build` succeeds (native modules compile; `prisma generate` + `next build` run).
  2. With a test `.env` (a generated `AUTH_PASSWORD_HASH`, a `SESSION_SECRET`, and `COOKIE_SECURE=false` so the http smoke test can log in), `docker compose up -d` starts; logs show `migrate deploy` applying all migrations and the seed running.
  3. `curl`/browser: `GET /login` 200; log in with the set credentials over `http://localhost:3000` succeeds (session cookie set — confirms the `COOKIE_SECURE=false` path and the hash form); a signed-in page renders seeded categories.
  4. Add a transaction; `docker compose restart`; confirm the data persists (volume) and uploads dir exists under `/data`.
  5. Tear down (`docker compose down`; keep or remove the volume). Document the exact working `.env` hash form as verified.
- If any step fails, fix and re-verify before merge.

## Risks & caveats

- **`secure` cookie over HTTP** is the main real-world footgun; the `COOKIE_SECURE` override + the "use an HTTPS reverse proxy" guidance resolve it. Default stays secure so we don't weaken the standard deployment.
- **Image size** (full `node_modules`, ~hundreds of MB) is the accepted cost of Approach A's reliability; documented. (A `standalone` slim image is a possible later optimisation.)
- **Native module portability:** built and run on the same `node:22-bookworm-slim` base, so the compiled `.node` binaries match the runtime glibc. Don't switch the runtime to Alpine/musl without rebuilding.
- **Secrets never baked into the image** (`.dockerignore` excludes `.env`); they arrive at runtime via `env_file`. The image is safe to rebuild/share.
- **Seed idempotency:** `prisma db seed` upserts categories, safe to run on every boot; if the seed ever becomes non-idempotent this entrypoint step must be revisited.
