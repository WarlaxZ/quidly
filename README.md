# Property Accounts

Free self-hosted UK landlord accounting for SA105 tax returns.

**Stack:** Next.js / TypeScript / Prisma + SQLite / Vitest

## Getting Started

```bash
npm install
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

## Testing

```bash
npm test
```

## Authentication

This app requires a single username/password login.

1. Set credentials: `npm run set-password` and copy the printed lines into `.env`.
2. Set a long `SESSION_SECRET` (e.g. `openssl rand -base64 32`).

**Run it behind HTTPS.** Session cookies use the `Secure` flag in production, so the
app must be served over TLS (e.g. behind Caddy, nginx, or Cloudflare). Over plain HTTP
in production the session cookie will not be set and login will appear to fail.

After 5 failed logins within 15 minutes, login is locked for 15 minutes (a deliberate
single-account safeguard).
