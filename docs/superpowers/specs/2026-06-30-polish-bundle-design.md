# Polish Bundle — Design Spec

**Date:** 2026-06-30
**Status:** Approved (design); ready for implementation planning
**Phase:** 2 (polish sub-project)

## Problem & context

Phase 1 (MVP) and Phase 2 auth are complete and merged to `main`. This sub-project adds four independent quality-of-life features the user considers important. They share no state and could each ship alone; they are grouped into one spec/plan for convenience, implemented as four self-contained units.

Reference: Phase 1 spec `2026-06-30-uk-property-accounting-design.md`; existing tax engine in `src/lib/tax/`, data layer in `src/lib/data/`, auth in `src/lib/auth/`. Prisma v7 (migrations: hand-authored SQL + `prisma migrate deploy` + `prisma generate`). Money is integer pence throughout. New server actions/routes must be auth-guarded (middleware gates everything; server actions also call `requireSession()`).

## Feature 1 — Scottish tax bands + region picker

**Why invasive:** the engine currently hard-codes a 3-band model (`basicRateLimitPence`, `higherRateLimitPence`, `basicRate`, `higherRate`, `additionalRate`). Scotland has 6 bands (starter/basic/intermediate/higher/advanced/top). So the band model is generalised.

- **Generalise `TaxBands`** (`src/lib/tax/bands.ts`) to an ordered bracket list: `{ personalAllowancePence, paTaperStartPence, brackets: { uptoPence: number | null; rate: number }[] }`, where `uptoPence` is the upper bound of *taxable income* (income above the personal allowance) for that bracket and `null` means "remainder". EWNI is expressed as 3 brackets; Scotland 2025/26 as 6.
- **Rewrite `incomeTaxOn`** (`src/lib/tax/incomeTax.ts`) to iterate the brackets, applying each rate to the slice of taxable income within it. Personal-allowance taper logic (£1 per £2 over £100k) is unchanged and shared. `estimatePropertyTax` is unchanged (it diffs two `incomeTaxOn` calls).
- **Regression lock:** existing EWNI test values (£20k→£1,486; £60k→£11,432; £110k taper→£33,432; £130k→£44,703; the property-tax estimate) must remain identical after the refactor.
- **Scotland 2025/26 bands** (taxable-income slices above the £12,570 personal allowance): starter 19% (next £2,306), basic 20% (next £11,685), intermediate 21% (next £17,101), higher 42% (up to £125,140 total), advanced 45% (£125,140–£given), top 48% (remainder). Implement from current HMRC figures; **verify against the current year's Scottish rates at build time** and add a test asserting at least one representative Scottish figure.
- **Region picker:** a `<select>` (England/Wales/NI | Scotland) on the dashboard, persisted to `TaxYearProfile.region` (the field and `getTaxYearSummary` plumbing already exist). Saving it recomputes the estimate.

## Feature 2 — Inline editing (transactions & vendors)

- **Edit pages:** `src/app/(app)/transactions/[id]/edit/page.tsx` and `src/app/(app)/vendors/[id]/edit/page.tsx` — forms pre-filled from the record, posting to `updateTransactionAction` / `updateVendorAction`.
- **Data layer:** add `getTransaction(id)` and `getVendor(id)` fetchers (`src/lib/data/transactions.ts`, `vendors.ts`); `updateTransaction`/`updateVendor` already exist.
- **Actions:** new server actions call `requireSession()` first, parse the amount via `parseAmountToPence` (transactions), update, `revalidatePath`, and redirect back to the list.
- **UI:** an "Edit" link on each transaction row and vendor row, beside the existing delete control.
- Editing a transaction's amount/category/date/vendor/description and a vendor's name/contact/notes is in scope. (Editing recurring rules is out of scope — they're delete+re-add for now.)

## Feature 3 — PDF export of the SA105 summary

- **Dependency:** `pdf-lib` (pure JS, no native build, free).
- **Route:** `src/app/(app)/export/sa105.pdf/route.ts` — `GET ?ty=<taxYear>` (defaults to current). Auth-gated by middleware. Builds a PDF: title, tax year, property name, a table of populated SA105 boxes (box / description / amount via `formatGBP`), and the "estimates only / verify box numbers" disclaimer. Returns `application/pdf` with a `Content-Disposition: attachment; filename="sa105-<taxYear>.pdf"`.
- **UI:** a "Download PDF" link on the SA105 page carrying the current `ty`.
- Reuses `getTaxYearSummary` and the existing `BOX_LABELS` map (extract `BOX_LABELS` to a shared module so the page and the PDF route share one source).

## Feature 4 — Bank-statement CSV import (generic mapper)

Four-step flow under `/import`:

1. **Upload** — a CSV file input; the file is parsed and its header row + first rows shown.
2. **Map** — the user selects which column is the date, which is the amount, and which is the description, and picks a default category for the import.
3. **Preview** — parsed rows shown as they'll be created (date, direction, amount, description), with duplicates flagged.
4. **Confirm** — bulk-creates the non-duplicate rows.

Pure, tested pieces:
- **`parseCsv(text)`** (`src/lib/reports/csv.ts`, alongside `toCsv`): RFC-4180-aware (quoted fields, escaped quotes, commas/newlines in fields), returns `{ header: string[]; rows: string[][] }`.
- **`mapImportRow(row, mapping)`** (`src/lib/import/bankImport.ts`): given a parsed row and a column mapping, produces `{ date: Date; amountPence: number; direction: "in"|"out"; description: string }`. Date parsing accepts **DD/MM/YYYY** and **YYYY-MM-DD** (UK-first). **Sign convention:** a negative amount → `out`, positive → `in`. Throws on an unparseable date or amount (the row is reported as an error in preview, not silently dropped).
- **Dedup:** `isDuplicate` compares a candidate against existing transactions by `propertyId + date (same day) + amountPence + description`. Imported rows are created with `source: "imported"`.

Server/UI pieces (build + manual verified): the upload/map/preview/confirm pages and a `bulkCreateTransactions` data-layer function. Mapping state is carried between steps via the form (e.g. the CSV text + chosen mapping posted along), avoiding server-side session storage of the upload.

**Deferred (explicit non-goals):** separate debit/credit columns, date formats beyond DD/MM/YYYY and YYYY-MM-DD, auto-categorisation/learning, multi-file or recurring import, storing the raw file.

## Testing

- **Pure/unit (Vitest):** generalised `incomeTaxOn` across EWNI (regression) and Scotland; `parseCsv` (quotes/commas/newlines); `mapImportRow` (both date formats, sign→direction, error on bad input); `isDuplicate`.
- **Integration (test DB):** `getTransaction`/`getVendor` fetchers; `bulkCreateTransactions` + dedup against existing rows.
- **Flow (build + live run):** edit a transaction and a vendor; download the SA105 PDF and confirm it opens; import a small CSV end-to-end (map → preview shows a flagged duplicate → confirm creates the rest); switch region to Scotland and see the estimate change.

## Risks & caveats

- **Tax-engine refactor risk:** generalising the band model touches the most correctness-critical code. Mitigated by locking existing EWNI test values and adding Scottish cases. Verify both EWNI and Scottish rates against current HMRC figures at build time.
- **Bank CSV variety:** the generic mapper covers the common single-signed-amount layout; banks with separate debit/credit columns or odd date formats won't import cleanly in v1 (deferred, documented in the import UI).
- **PDF layout:** `pdf-lib` is manual layout (no HTML); the SA105 table is simple enough (a handful of rows) that fixed-position text is sufficient. Long descriptions are not a concern (SA105 boxes are fixed labels).
- **`[id]` route params** are async in Next 16 (a Promise) — the edit pages must await `params`.
