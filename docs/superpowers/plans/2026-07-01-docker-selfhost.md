# Docker / Self-Host Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package Quidly for self-hosting — a Docker image + compose stack that auto-migrates/seeds, persists the SQLite DB and uploads on a volume, and logs in over HTTP behind a proxy or on a trusted LAN.

**Architecture:** Multi-stage `Dockerfile` (Debian slim; builder compiles native modules + builds Next; runtime carries the whole app incl. full `node_modules`). An entrypoint fixes volume ownership, runs `prisma migrate deploy` + seed, then `next start` as the non-root `node` user (via `gosu`). A `COOKIE_SECURE` override makes the session cookie work over plain HTTP when opted in.

**Tech Stack:** Docker (available in this environment), Next.js 16, Prisma v7 + better-sqlite3, `@node-rs/argon2`, `gosu`.

---

## Notes for the implementer

- **Native modules:** `better-sqlite3` and `@node-rs/argon2` are compiled in the builder (hence `build-essential python3`); the runtime shares the same `node:22-bookworm-slim` base so the compiled `.node` binaries match — do **not** switch the runtime to Alpine.
- **Volume-permissions refinement (supersedes the spec's build-time `USER node`/`chown`):** a named volume mounted at `/data` is created **root-owned**, masking any build-time `chown`. So the container starts as **root**, the entrypoint `chown`s `/data`, then drops to `node` via `gosu` for migrate/seed/serve. This is the correct pattern for a non-root app process with a persistent volume.
- **Secrets** are never baked in (`.dockerignore` excludes `.env`); they arrive at runtime via compose `env_file`.
- Docker is available — Task 2 includes a real build + `compose up` smoke test.

---

## Task 1: `COOKIE_SECURE` override

**Files:** Modify `src/lib/auth/session-config.ts`.

- [ ] **Step 1: Edit the cookie `secure` line.**
In `src/lib/auth/session-config.ts`, the `cookieOptions` currently has:
```ts
    secure: process.env.NODE_ENV === "production",
```
Replace it with:
```ts
    // Secure cookie in production by default; a self-hoster on plain-HTTP LAN can set COOKIE_SECURE=false.
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
```
(Default behaviour is unchanged when `COOKIE_SECURE` is unset.)

- [ ] **Step 2: Verify + commit.**
`cd /home/ash/projects/akaunting-ng && npx tsc --noEmit 2>&1 | grep -c "error TS"` → 0 (clear `.next/dev .next/types` first if a stale generated error shows). `npm test` → full suite green (report totals; no test asserts on the cookie). Then:
```bash
git add src/lib/auth/session-config.ts
git commit -m "feat: COOKIE_SECURE override for self-hosting over HTTP"
```

---

## Task 2: Docker image, compose, entrypoint, ignore, env

**Files:** Create `Dockerfile`, `.dockerignore`, `docker-entrypoint.sh`, `docker-compose.yml`; modify `.env.example`.

- [ ] **Step 1: Create `Dockerfile`.**
```dockerfile
# syntax=docker/dockerfile:1

# ---- builder: install deps, compile native modules, build Next ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential python3 \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate \
  && npm run build \
  && chmod +x docker-entrypoint.sh

# ---- runtime: carry the whole built app (incl. node_modules) ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app /app
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
```

- [ ] **Step 2: Create `docker-entrypoint.sh`.**
```sh
#!/bin/sh
set -e

# Ensure the data dir (SQLite DB + uploads) exists and is owned by the app user.
mkdir -p "${UPLOAD_DIR:-/data/uploads}"
chown -R node:node /data

echo "Quidly: applying database migrations..."
gosu node npx prisma migrate deploy

echo "Quidly: seeding categories..."
gosu node npx prisma db seed

echo "Quidly: starting on http://0.0.0.0:3000"
exec gosu node npx next start -H 0.0.0.0 -p 3000
```

- [ ] **Step 3: Create `.dockerignore`.**
```
node_modules
.next
.git
.gitignore
.env
.env.*
*.db
*.db-journal
*.db-wal
*.db-shm
dev.db
uploads
docs
npm-debug.log*
.DS_Store
```

- [ ] **Step 4: Create `docker-compose.yml`.**
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

- [ ] **Step 5: Update `.env.example`** to the following (keeps the dev lines, adds a Docker section + `COOKIE_SECURE`):
```dotenv
# ============================================================
# Quidly configuration. Copy to .env and fill in.
# ============================================================

# --- Auth (required) ---
# Generate AUTH_USERNAME + AUTH_PASSWORD_HASH with:  npm run set-password
#   (Docker:  docker compose run --rm quidly npm run set-password)
# In a .env file loaded by Next (local dev), use the BACKSLASH-ESCAPED hash the
# command prints (\$argon2id\$...). For Docker/systemd real env vars, use the
# UNESCAPED hash the command also prints.
AUTH_USERNAME=
AUTH_PASSWORD_HASH=

# A long random secret (32+ chars), e.g.:  openssl rand -base64 32
SESSION_SECRET=

# --- Local development ---
# SQLite file + uploads dir (Docker overrides these — see below).
DATABASE_URL="file:./dev.db"
UPLOAD_DIR=./uploads

# --- Docker / self-host ---
# docker-compose.yml already sets DATABASE_URL=file:/data/quidly.db and
# UPLOAD_DIR=/data/uploads (persisted in the quidly-data volume) — no need to set them here.
# Serve Quidly behind an HTTPS reverse proxy (Caddy/Traefik/nginx) and leave the cookie secure.
# ONLY if you serve plain HTTP on a trusted LAN, set COOKIE_SECURE=false so login works:
# COOKIE_SECURE=false

# --- AI receipt scanning (optional) ---
# Set to enable the Scan feature. Uses YOUR Anthropic key (~pennies/receipt).
ANTHROPIC_API_KEY=
# Vision model for extraction (optional; defaults to a cheap vision-capable Claude model).
EXTRACTION_MODEL=
```

- [ ] **Step 6: Build the image.**
Run: `cd /home/ash/projects/akaunting-ng && docker compose build 2>&1 | tail -20`
Expected: builds successfully — `npm ci`, native-module compile, `prisma generate`, `next build` all complete; final image tagged `quidly`.

- [ ] **Step 7: Smoke-test the running stack.**
Create a throwaway `.env.docker-smoke` (do NOT commit) with a real generated hash + secret + `COOKIE_SECURE=false`:
```bash
# Generate an argon2 hash for the smoke test (unescaped form for a real env var):
HASH=$(printf 'ash\ntestpass123\n' | npm run -s set-password | grep -A0 'UNescaped' -m0 ; true)
# Simpler: run set-password interactively-equivalent; then hand-build the env file:
cat > .env.docker-smoke <<EOF
AUTH_USERNAME=ash
AUTH_PASSWORD_HASH=<PASTE the UNESCAPED hash from: printf 'ash\ntestpass123\n' | npm run set-password>
SESSION_SECRET=smoke-secret-please-change-0123456789abcdef
COOKIE_SECURE=false
EOF
docker compose --env-file .env.docker-smoke up -d
sleep 6
docker compose logs --no-color | tail -30   # expect: migrate deploy applied, seed ran, "starting on :3000"
```
Then verify login + persistence:
```bash
# login (COOKIE_SECURE=false so the cookie sets over http)
curl -s -o /dev/null -w "login=%{http_code}\n" -c /tmp/qc.txt --data "username=ash&password=testpass123" http://localhost:3000/api/login
curl -s -o /dev/null -w "dashboard=%{http_code}\n" -b /tmp/qc.txt http://localhost:3000/dashboard   # expect 200
# seeded categories present (transactions add form lists them) — a 200 on /transactions confirms boot+seed
curl -s -o /dev/null -w "transactions=%{http_code}\n" -b /tmp/qc.txt http://localhost:3000/transactions
docker compose restart && sleep 6
curl -s -o /dev/null -w "after-restart dashboard=%{http_code}\n" -b /tmp/qc.txt http://localhost:3000/dashboard
```
Expected: `login=303/302` (redirect on success), `dashboard=200`, data persists after restart. If login returns the login page (not a redirect) the hash/escaping is wrong — fix the `.env.docker-smoke` hash to the UNESCAPED form and re-test; record the verified form.
Tear down: `docker compose down` (keep the volume) and `rm -f .env.docker-smoke /tmp/qc.txt`.

- [ ] **Step 8: Commit.**
```bash
git add Dockerfile .dockerignore docker-entrypoint.sh docker-compose.yml .env.example
git commit -m "feat: Docker self-host packaging (image, compose, entrypoint, env)"
```
(Confirm `git status` shows no `.env.docker-smoke` or DB artefacts staged — `.dockerignore`/`.gitignore` already exclude `.env.*` and `*.db`.)

---

## Self-review notes (already reconciled)

- **Spec coverage:** `COOKIE_SECURE` (Task 1) ↔ spec §7; Dockerfile (T2 S1) ↔ §2; entrypoint (S2) ↔ §4; `.dockerignore` (S3) ↔ §3; compose (S4) ↔ §5; `.env.example` (S5) ↔ §6; build+smoke (S6–7) ↔ §8.
- **Deviation flagged:** the runtime runs as **root → `gosu node`** (entrypoint) rather than the spec's build-time `USER node`, because a root-owned named volume masks a build-time `chown`. Same end state (app runs as `node`), correctly handling the volume — documented above.
- **No app-logic change** beyond the one-line `COOKIE_SECURE` (behaviour-preserving default); the suite stays green.
- **Secrets safety:** `.dockerignore` excludes `.env`/`.env.*`; the smoke-test env file is a throwaway that is git-ignored and removed.
- **Consistency:** `DATABASE_URL=file:/data/quidly.db` and `UPLOAD_DIR=/data/uploads` are set in `docker-compose.yml` (§5) and referenced by the entrypoint (`UPLOAD_DIR` default `/data/uploads`) and `.env.example` note — aligned.
