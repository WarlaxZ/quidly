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

> In a `.env` file the hash's `$` characters must be backslash-escaped (`npm run set-password`
> prints the escaped line ready to paste). If you set `AUTH_PASSWORD_HASH` as a real environment
> variable (Docker, systemd), use the unescaped hash the command also prints.

2. Set a long `SESSION_SECRET` (e.g. `openssl rand -base64 32`).

**Run it behind HTTPS.** Session cookies use the `Secure` flag in production, so the
app must be served over TLS (e.g. behind Caddy, nginx, or Cloudflare). Over plain HTTP
in production the session cookie will not be set and login will appear to fail.

After 5 failed logins within 15 minutes, login is locked for 15 minutes (a deliberate
single-account safeguard).

## Receipt scanning (optional AI)

Set `ANTHROPIC_API_KEY` to enable the Scan feature: upload a receipt/invoice image or PDF and
it pre-fills a transaction. Extraction uses your Anthropic API key (a few pence per receipt) and
sends the uploaded file to Anthropic for processing. Without the key, the feature is hidden.

Uploaded files are stored in `UPLOAD_DIR` (default `./uploads`) — mount it as a persistent
volume in production so receipts survive redeploys.

To test extraction end-to-end, set a real `ANTHROPIC_API_KEY` in `.env` and upload a receipt at `/scan`.
