# Security Policy

Quidly holds financial records and is designed to be exposed to a network, so
security reports are welcome and taken seriously.

## Reporting a vulnerability

**Please do not open a public issue.**

Report privately via GitHub's
[private vulnerability reporting](https://github.com/WarlaxZ/quidly/security/advisories/new)
— that opens a draft advisory only you and the maintainer can see.

Please include:

- What the issue is and roughly how bad you think it is.
- Steps to reproduce, or a proof of concept.
- The Quidly version or commit, and whether you're running Docker or a dev install.
- Whether you're behind a reverse proxy, and whether `COOKIE_SECURE` is set.

You can expect an acknowledgement within a few days. Because Quidly is
maintained by one person in their own time, a fix may take longer than that —
you'll get an honest estimate rather than silence.

## Supported versions

Quidly is pre-1.0 and ships from `main`. Only the latest release receives
security fixes; there are no maintained backport branches.

## Scope

In scope:

- Authentication and session handling (iron-session, argon2id password hashing).
- Authorisation gaps that expose data across properties or companies.
- SQL injection, XSS, CSRF, SSRF, path traversal.
- Anything that leaks financial data, uploaded receipts, or the session secret.
- Container issues, e.g. unnecessary privilege in the runtime image.

Out of scope — these are documented design decisions, not bugs:

- **Single-user by design.** Each install has one account. "A logged-in user can
  see all the data in the install" is the intended behaviour.
- **`COOKIE_SECURE=false` weakens cookies.** That is the documented trade-off
  for plain HTTP on a trusted LAN. Deployments behind HTTPS should leave it unset.
- Running Quidly on the public internet without a TLS-terminating proxy.
- Missing rate limiting on login for a single-user LAN app — though a concrete
  attack here is still worth reporting.

## Hardening notes for operators

- Serve behind HTTPS (see the Caddy example in the README) and leave
  `COOKIE_SECURE` unset.
- `SESSION_SECRET` should be 32+ random characters, e.g. `openssl rand -base64 32`.
- Back up the `quidly-data` volume — it holds the SQLite database and uploads.
- If you set `ANTHROPIC_API_KEY` for receipt scanning, receipt images are sent
  to Anthropic's API. Leave it unset if that is not acceptable to you.
