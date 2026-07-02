# Akaunting → Quidly Migration Utility — Design

**Date:** 2026-07-02
**Status:** Approved (brainstorming)

## Goal

A CLI utility that imports an existing Akaunting install's data — transactions,
vendors/contacts, categories, and (best-effort) attachments — into Quidly, so a
migrating user doesn't have to re-key years of history. It also produces a
"what's missing" gap report of Akaunting data that Quidly has no home for.

Built for the author's case (one Akaunting company = one rental property) but
designed to generalise to anyone self-hosting Quidly.

## Constraints & decisions

- **Source:** an Akaunting MySQL/MariaDB dump (`.sql`, the Akaunting default).
- **Scope:** transactions, vendors/contacts, categories, attachments (best-effort).
- **Property mapping:** each Akaunting *company* → one Quidly *property*. The
  author has a single company; the model handles N.
- **Category mapping:** a **reviewable mapping file** — auto-suggested targets the
  user reviews/corrects before anything is written. Re-runnable.
- **Currency:** assume GBP; convert decimal → pence with no float; **flag and skip**
  any non-GBP transaction (never guess a rate — wrong figures break the tax return).
- **Delivery:** a repo CLI (`npm run migrate:akaunting:*`), two phases.
- **Priority:** correctness of the final result over everything else.

## Architecture — two-phase CLI

### Phase 1: `analyse <dump.sql>` (needs Docker)

1. Spin up a throwaway MariaDB container, load the dump, introspect it.
2. Read the relevant tables (`transactions`, `contacts`, `categories`, media
   tables) via `mysql2`.
3. Write three files into `./akaunting-migration/`:
   - **`source.json`** — a frozen snapshot of the relevant Akaunting records.
     *Apply reads this snapshot, not Docker again* — so what the user reviews is
     byte-for-byte what gets imported, and Docker is needed only once.
   - **`mapping.json`** — the user's editable decisions, pre-filled with
     best-guess suggestions.
   - **`report.md`** — human-readable summary + the gap report.
4. Tear the container down.

### Phase 2 (user): review/edit `mapping.json`.

### Phase 3: `apply` (no Docker)

- Read `source.json` + `mapping.json`, run the pure transforms, write into
  Quidly's SQLite **inside a single transaction**.
- `--dry-run` prints exactly what it would create and changes nothing.
- **Idempotent:** every imported row is tagged with an `externalRef`
  (e.g. `akaunting:transaction:412`); re-running skips what already exists.
- Optional `--attachments-dir <path>` to also copy attachment files (see below).

### Why the throwaway MariaDB

MariaDB parses its own dump flawlessly — zero risk of a hand-rolled parser
mangling an escaped quote, newline, unicode, or £-sign in a description. The
correctness-critical logic (mapping/transform) is separated into pure functions
that never touch Docker or the DB, so it stays fully unit-testable.

## The mapping file

`mapping.json`, pre-filled by `analyse`:

```jsonc
{
  "currency": { "assume": "GBP" },
  "properties": [
    { "akauntingCompanyId": 1, "akauntingCompanyName": "42 Example St",
      "target": { "createNew": true, "name": "42 Example St", "address": null } }
    // or "target": { "existingPropertyId": "clx…" }
  ],
  "categories": [
    { "akauntingId": 5, "akauntingName": "Repairs", "akauntingType": "expense",
      "count": 37, "suggestion": "Property repairs and maintenance",
      "target": "Property repairs and maintenance" },
    { "akauntingId": 9, "akauntingName": "Misc", "akauntingType": "expense",
      "count": 3, "suggestion": null, "target": null }
  ]
}
```

`target` for categories references a Quidly category by its unique `name`.

### Quidly target categories (from `prisma/seed.ts`)

| Name | kind | SA105 box | allowable |
|---|---|---|---|
| Rent received | income | 20 | yes |
| Other property income | income | 21 | yes |
| Rent, rates, insurance, ground rents | expense | 24 | yes |
| Property repairs and maintenance | expense | 25 | yes |
| Legal, management, other professional fees | expense | 27 | yes |
| Costs of services provided, including wages | expense | 28 | yes |
| Other allowable property expenses | expense | 29 | yes |
| Mortgage / loan interest | finance | 44 | yes |
| Capital improvements | capital | (none) | no |

### Auto-suggestion heuristics (`suggest.ts`, pure)

Keyword matching against the 9 targets, respecting `type` (income vs expense):

- `rent received`, `rental income`, `rent` (income) → **Rent received** (20)
- other income → **Other property income** (21)
- `repair`, `maintenance`, `fix` → **Property repairs and maintenance** (25)
- `mortgage`, `interest`, `loan` (finance) → **Mortgage / loan interest** (44)
- `insurance`, `rates`, `ground rent`, `service charge` → **Rent, rates, insurance, ground rents** (24)
- `legal`, `management`, `letting agent`, `accountant`, `professional`, `fees` → **Legal, management, other professional fees** (27)
- `wages`, `cleaning`, `gardening`, `services` → **Costs of services provided** (28)
- `capital`, `improvement`, `renovation` → **Capital improvements** (no box)
- anything else → `null` (never guessed; user must set)

Wrong SA105 box = wrong tax return, so low-confidence stays `null`.

`apply` **refuses to run** while any category used by a real transaction has a
`null` target, naming the offenders. Vendors are auto-created from contacts,
deduped by name against existing Quidly vendors — no per-row decisions needed.

## Gap report (`report.md`)

Beyond counts and the mapping summary, flags Akaunting data with no Quidly home:

- **Invoices/bills** (`documents`) — Quidly tracks money movements, not open
  receivables/payables.
- **Customers/tenants** — no tenant entity in Quidly (vendors only).
- **Bank accounts, reconciliation, transfers** — no multi-account/bank-rec model.
- **Items, taxes/VAT rates, budgets, recurring templates** — no equivalent.
- **Non-GBP transactions** — listed individually.
- **Attachments with missing files** — listed if the DB references a file the
  dump didn't include.

Each line states present-in-Akaunting → not-migrated → why / whether it matters
for SA105, so the user can consciously decide if a gap needs a Quidly feature.

## Money handling (correctness core)

Akaunting `amount` is a decimal (≤4 dp). Parse the **string** value and convert
to pence with no float (`"123.45" → 12345`), rounding at the pence boundary.
`type` (`income`/`expense`) → Quidly `direction`, and constrains valid categories.
Pinned down by `transform` unit tests.

## Attachments (best-effort, explicit)

The DB holds only file *paths* (`media`/`mediables`); the files live in
Akaunting's `storage/` folder, absent from a SQL dump.

- With `--attachments-dir <path>`: copy files into Quidly's upload location and
  create `Attachment` rows.
- Without it: **list in the report** which transactions had attachments so the
  user can re-upload the ones that matter. No silent loss either way.

## Schema change

One Prisma migration: add nullable, unique `externalRef String?` to `Vendor` and
`Transaction`. Nullable-unique in SQLite allows many NULLs while enforcing
"no duplicate import" at the DB level and giving permanent traceability.
Hand-authored SQL + `prisma migrate deploy` (project convention — never
`migrate dev`).

## Error handling

- Docker/MariaDB unavailable → clear message with guidance.
- Expected Akaunting tables missing (wrong version) → `analyse` names what's
  missing and aborts.
- Non-GBP transactions → skipped + listed in the report.
- Category used by real transactions but left unmapped → `apply` aborts, names them.
- `apply` runs in a single transaction — any failure rolls back; idempotency
  makes retry safe.

## File structure

Standalone Node CLI (builds its own `PrismaClient` with the better-sqlite3
adapter like `prisma/seed.ts`, since `src/lib/db.ts` is `server-only`):

```
scripts/migrate-akaunting/
  index.ts       # CLI entry: parse args, dispatch analyse|apply
  mariadb.ts     # Docker lifecycle + load dump + mysql2 read (analyse only)
  read.ts        # queries → typed source records
  suggest.ts     # pure: category name → suggested Quidly category   ← tested
  transform.ts   # pure: source + mapping → Quidly payloads          ← tested (core)
  report.ts      # pure: source + mapping → report.md                ← tested
  apply.ts       # snapshot + mapping → Prisma writes (txn, idempotent)
  types.ts       # SourceSnapshot, Mapping, etc.
```

Two npm scripts: `migrate:akaunting:analyse`, `migrate:akaunting:apply`.

## Testing

Vitest with fixture snapshots. The pure layers carry the correctness guarantees,
so the suite needs no Docker:

- `suggest.test.ts` — name → suggested category, per `type`.
- `transform.test.ts` — decimal→pence (incl. rounding), direction mapping,
  externalRef formation, unmapped-category rejection, non-GBP skip.
- `report.test.ts` — gap detection, counts, non-GBP listing.

Reader (`mariadb.ts`/`read.ts`) validated manually against the real dump in the
first implementation step; an optional Docker-gated integration test may follow.

## First implementation step

Load the author's real dump into the throwaway MariaDB and introspect it, to pin
the reader to that Akaunting version's actual schema before writing queries.
