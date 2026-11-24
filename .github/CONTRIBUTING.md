# Contributing to Quidly

Thanks for taking an interest. Quidly is a self-hosted bookkeeping app for UK
landlords, and it deals with people's tax returns — so correctness matters more
here than velocity.

## Ground rules

- **Money is integer pence, end-to-end.** There is no floating-point arithmetic
  anywhere in the money path. If a change introduces a `number` that represents
  a fractional currency amount, it will be rejected. Store pence, format at the
  edge.
- **Tax logic needs a test and a source.** Any change to rates, bands, or
  thresholds must cite the HMRC page it came from in the PR description, and
  come with a test that pins the expected figure.
- **This is not the Next.js you may know.** Quidly is on Next.js 16. Read the
  relevant guide under `node_modules/next/dist/docs/` before writing app code —
  APIs and conventions differ from older versions.
- **Prisma v7 conventions.** The datasource URL lives in `prisma.config.ts`.
  Migrations are hand-authored SQL applied with `prisma migrate deploy` — not
  `migrate dev`.

## Getting set up

```bash
pnpm install
pnpm run set-password            # paste the DEV (backslash-escaped) hash into .env
# .env also needs SESSION_SECRET=... (openssl rand -base64 32) and DATABASE_URL="file:./dev.db"
pnpm exec prisma migrate deploy
pnpm exec prisma db seed
pnpm run dev                     # http://localhost:3000
```

## Before you open a PR

```bash
pnpm test          # vitest
pnpm run typecheck # tsc --noEmit
pnpm run build     # next build
```

All three run in CI on every PR. Green locally means green there.

## Scope

Quidly is deliberately **single-user per install** and **UK-first**. Two kinds
of proposal are usually out of scope:

- Multi-tenancy, user management, or role systems.
- Tax regimes for other countries.

If you want either, a fork is a completely reasonable answer — the AGPL exists
for exactly that.

Good places to start, in rough order of how much they help:

1. **Tax-year rates.** Each April, rates and thresholds change. Updating a rate
   year is well-scoped and high-value.
2. **Bank CSV formats.** More UK bank export formats parsed out of the box.
3. **Bug reports with a reproduction.** Genuinely valuable even without a fix.

## Reporting bugs

Use the issue templates — they ask for the version, whether you're on Docker or
a dev install, and the tax year, which is almost always what a diagnosis turns
on. For anything security-related, see [SECURITY.md](SECURITY.md) instead; do
not open a public issue.

## Licence

Quidly is AGPL-3.0. By contributing you agree your contribution is licensed
under the same terms. Note the AGPL's network clause: if you run a modified
Quidly as a service that others use, you must offer them your changes.
