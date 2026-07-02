# Migrating from Akaunting

Bring your existing [Akaunting](https://akaunting.com) data — transactions, vendors,
categories, recurring items and (optionally) receipts — into Quidly, so you don't have
to re-key years of history.

The migration is a **two-phase CLI**:

1. **`analyse`** loads your Akaunting database dump into a throwaway MariaDB, reads it,
   and writes a *review pack* you can inspect: a frozen snapshot, an editable mapping
   file, and a human-readable report (including a "what's missing" section).
2. You **review** the report and edit the mapping file if needed.
3. **`apply`** reads the frozen snapshot + your reviewed mapping and writes into Quidly's
   database. It's **idempotent** — re-running never creates duplicates.

Nothing is written to Quidly until you run `apply`, and `apply --dry-run` shows exactly
what it *would* do without touching your data.

---

## What carries over

| Akaunting | → | Quidly |
|---|---|---|
| Each **company** | → | a **property** |
| **Transactions** (income/expense) | → | Transactions, tagged to an SA105 category |
| **Contacts** (vendors/customers) | → | Vendors |
| **Categories** | → | mapped onto Quidly's SA105 categories (you review this) |
| **Recurring** items | → | Recurring rules (best-effort — see below) |
| **Attachments** | → | copied only if you point at Akaunting's `storage/` folder |

## What does **not** carry over

Quidly is a focused UK-landlord tool, so some Akaunting concepts have no home. `analyse`
lists whatever it finds in the report's **"What's missing"** section, e.g.:

- **Invoices / bills / documents** — Quidly tracks money that has actually moved, not open
  receivables/payables.
- **Bank accounts, transfers, reconciliations** — no multi-account/bank-rec model.
- **Items, tax/VAT rates, budgets** — no equivalent.
- **Non-GBP transactions** — listed individually and skipped (Quidly is GBP-only).

None of these affect your SA105 figures; the report just makes them explicit so you can
decide whether you need anything before relying on the numbers.

---

## Before you start

You need:

- **Docker** (only for the `analyse` step — it runs a temporary MariaDB to read the dump).
- A **MySQL/MariaDB dump** of your Akaunting database (a `.sql` file). Akaunting ships on
  MySQL/MariaDB by default.

### Getting a dump out of Akaunting

**Self-hosted (you have shell/DB access):**

```bash
mysqldump -u <user> -p <akaunting_db_name> > akaunting.sql
```

**Docker install:**

```bash
docker exec <akaunting-db-container> mysqldump -u root -p<password> akaunting > akaunting.sql
```

**Managed hosting (cPanel / phpMyAdmin):** use *Export → SQL* on the Akaunting database and
download the `.sql` file.

The table prefix doesn't matter — the tool auto-detects it (e.g. `akk_` or none), so any
standard Akaunting dump works.

Put the dump where the tool expects it (or pass a path):

```bash
mkdir -p akaunting-migration
cp /path/to/akaunting.sql akaunting-migration/dump.sql
```

> Everything under `akaunting-migration/` is git-ignored — it can contain your financial
> data, so it never gets committed.

---

## Step 1 — Analyse

```bash
npm run migrate:akaunting:analyse -- ./akaunting-migration/dump.sql
```

This writes three files into `akaunting-migration/`:

- **`source.json`** — a frozen snapshot of the relevant Akaunting records. `apply` reads
  *this*, not Docker, so what you review is byte-for-byte what gets imported.
- **`mapping.json`** — your editable decisions, pre-filled with best-guess suggestions.
- **`report.md`** — a human summary: counts, the category mapping table, any blocking
  issues, skipped transactions, recurring rules, and the "what's missing" gap report.

Re-running `analyse` preserves your edited `mapping.json` (it won't clobber your work).
Use `--force` to regenerate the mapping from scratch.

---

## Step 2 — Review

Open **`akaunting-migration/report.md`** first — it's the at-a-glance picture. Then edit
**`akaunting-migration/mapping.json`** if anything needs correcting.

### Category mapping (the important bit)

Akaunting categories are free-form; Quidly categories each carry an **SA105 box**, so the
mapping is where tax correctness lives. Each entry looks like:

```jsonc
{
  "akauntingId": 12,
  "akauntingName": "Repairs",
  "akauntingType": "expense",
  "count": 37,                                  // transactions using this category
  "suggestion": "Property repairs and maintenance",
  "target": "Property repairs and maintenance"  // ← edit this
}
```

`target` must be one of Quidly's categories:

| Quidly category | SA105 box | Kind |
|---|---|---|
| Rent received | 20 | income |
| Other property income | 21 | income |
| Rent, rates, insurance, ground rents | 24 | expense |
| Property repairs and maintenance | 25 | expense |
| Legal, management, other professional fees | 27 | expense |
| Costs of services provided, including wages | 28 | expense |
| Other allowable property expenses | 29 | expense |
| Mortgage / loan interest | 44 | finance |
| Capital improvements | (none) | capital |

**How suggestions are made:**

- **Exact-name match** — if your category is named after an SA105 box (common; e.g.
  `Repairs and maintenance`, or a `TAX: …`-prefixed name), it's matched directly.
- **Keyword heuristics** — "mortgage/interest" → box 44, "insurance/rates" → box 24, etc.
  Wrong-guess-risky cases are left blank rather than guessed.
- **Description-aware income** — a generically-named income category (e.g. `Deposit`,
  `Payment`) is checked against its transactions' descriptions: if they mention "rent" it
  maps to **Rent received** (box 20), otherwise **Other property income** (box 21).
- Anything the tool isn't confident about is left `null` — you must set a `target`.

**`apply` refuses to run** while any category used by real transactions has a `null`
target (it names them). It also blocks an income category mapped to an expense box, or
vice-versa. So you can't accidentally file income as an expense.

Categories with **0 transactions** can be left unmapped — nothing uses them.

### Properties

By default each Akaunting company becomes a new Quidly property. To attach to a property
you already have instead, set:

```jsonc
"target": { "existingPropertyId": "clx…" }
```

### Currency

Amounts are treated as GBP. Any transaction with a non-GBP currency code is **listed in
the report and skipped** — the tool never guesses an exchange rate.

---

## Step 3 — Dry-run, then apply

```bash
# Shows exactly what would be created; writes nothing.
npm run migrate:akaunting:apply -- --dry-run

# Do it for real.
npm run migrate:akaunting:apply
```

The summary line reports what was created:

```
Properties: 1, Vendors: 37, Transactions: 309, Recurring: 3, Attachments: 0, Skipped: 0
```

`apply` writes into the database at `DATABASE_URL` (defaults to `file:./dev.db`). It's
**insert-only and validated first**, so it can't corrupt or overwrite data you already
have, and re-running is always safe (idempotent — see below).

### Starting from a clean database

If you want your imported data to be the *only* data (recommended if you were just trying
Quidly with the demo seed), reset first:

```bash
rm -f dev.db
npx prisma migrate deploy   # rebuild the schema
npx prisma db seed          # seed the 9 SA105 categories
npm run migrate:akaunting:apply
```

Your login is unaffected (it's configured via environment variables, not the database).

---

## Attachments (optional)

A SQL dump contains only file *paths*, not the files themselves — those live in
Akaunting's `storage/` folder. If you still have it, point the importer at it and it will
copy the receipts into Quidly and link them:

```bash
npm run migrate:akaunting:apply -- --attachments-dir /path/to/akaunting/storage
```

Without `--attachments-dir`, the report just tells you how many attachments existed so you
can re-upload the ones that matter. (Quidly links one attachment per transaction; if a
transaction had several in Akaunting, the last one wins.)

---

## Recurring rules

Akaunting continuously recreates its recurring records (each cycle soft-deletes and
recreates them), so there's no reliable "is this still running?" flag. The importer:

- dedupes to the **latest** definition per item,
- keeps only those **started within the last 18 months** of your newest transaction
  (treated as still-active),
- maps `monthly` / `monthly×3 → quarterly` / `yearly → annual`; anything else is skipped,
- sets each rule's *last-generated* marker to your newest transaction date, so it
  **only ever generates future transactions — it never backfills your history**.

Because it's a heuristic, recurring import is **best-effort**: after applying, open the
**`/recurring`** page in Quidly, check the rules look right, tweak or delete any, and click
**"generate due"** when you want future entries created. Nothing is generated automatically.

---

## Re-running / idempotency

Every imported vendor, transaction and recurring rule is tagged with an `externalRef`
(e.g. `akaunting:transaction:412`). Re-running `apply` skips anything already imported, so
you can safely:

- run it again after editing the mapping,
- resume after an interruption,

without creating duplicates. The `externalRef` also lets you trace any Quidly row back to
its Akaunting origin.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Docker is required … not found` | Start/install Docker (only needed for `analyse`). |
| `This dump has no transactions table` | The file isn't an Akaunting DB dump, or is truncated. |
| `Expected Akaunting table "…" is missing` | Unsupported Akaunting version — open an issue with your version. |
| `apply` aborts naming a category | That category (used by real transactions) has no `target` — set one in `mapping.json`. |
| `apply` aborts on an income/expense mismatch | A category's `target` is the wrong kind (income mapped to an expense box or vice-versa). |
| Transactions "skipped" in the report | Non-GBP currency, or no category — the report lists each with a reason. |
| `Could not parse … mapping.json` | You introduced a JSON syntax error while editing; fix it or re-run `analyse --force`. |

---

## Safety summary

- **Nothing writes until `apply`**; `--dry-run` previews with zero writes.
- **Validated before writing** — a bad mapping aborts before any change.
- **Insert-only + idempotent** — existing data is never overwritten; re-runs never duplicate.
- **Your data stays local** — `dev.db` and everything under `akaunting-migration/` are
  git-ignored.
