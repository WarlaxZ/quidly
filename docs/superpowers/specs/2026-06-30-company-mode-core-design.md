# Limited-Company Mode (Core) — Design Spec

**Date:** 2026-06-30
**Status:** Approved (design); ready for implementation planning
**Phase:** 2 (company mode — CORE cycle; profit-extraction is a separate later cycle)

## Problem & context

The user holds (or plans to hold) rental property in limited companies (SPVs) — often more tax-efficient because, unlike personal ownership, **mortgage interest is fully deductible** for a company (no Section 24 restriction) and profits are taxed at **corporation tax** rates rather than income tax. The app already has the seam: `Property.ownershipType` (`personal`/`company`), and company-owned properties are excluded from the personal SA105/dashboard. This cycle builds the company side: a `Company` entity, a corporation-tax engine, and per-company accounts.

**Decisions from brainstorming:** **multiple companies** (a `Company` entity; each company-owned property belongs to one company — supports SPV-per-property); each company runs on **its own accounting period** (a year-end date); director's **salary is just a deductible expense category** (no special modelling). **Deferred to the next cycle:** dividends, director's loan account, retained earnings, balance-sheet-lite.

**Overarching caveat (surfaced in the UI and spec):** corporation tax and company accounts are genuinely complex. This is an **estimate and record-keeping aid, not a filed CT600 or statutory accounts** — the operator/their accountant files. The company accounts screen states this.

## Section 1 — Scope

In: `Company` entity + CRUD; property→company assignment; a pure corporation-tax engine (taxable profit with mortgage fully deductible; CT 19%/25% + marginal relief); a per-company accounts/P&L view for the company's accounting period.

Out (next cycle or never): dividends, director's loan account, retained earnings, balance sheet; associated-company threshold division; accounting-period proration of the £50k/£250k limits; financial-year straddle apportionment; capital allowances; ATED; VAT; payroll/PAYE for the salary.

## Section 2 — Data model

- New `Company` model: `id` (cuid), `name`, `accountingYearEndDay` (Int, 1–31), `accountingYearEndMonth` (Int, 1–12), `createdAt`. Relation: `properties Property[]`.
- `Property` gains nullable `companyId` (+ relation to `Company`). Convention: `ownershipType: "company"` ⇒ `companyId` set; `ownershipType: "personal"` ⇒ `companyId` null. (Not DB-enforced; the UI maintains it.)
- Migration (Prisma v7: hand-authored SQL + `prisma migrate deploy` + `prisma generate`): create `Company` table; add `Property.companyId` (nullable) + index.

## Section 3 — Corporation-tax engine (pure, tested)

`src/lib/tax/corporationTax.ts`:

- `companyTaxableProfit(txns: TaxTxn[])` → `{ incomePence, expensesPence, profitPence }` where **expensesPence includes both `expense` and `finance` (mortgage) allowable categories** (the key difference from the personal `computeProfit`, which excludes finance). Capital / non-allowable excluded. `profitPence = income − (expenses + finance)`.
- `corporationTax(profitPence: number, year: string)` → `{ taxPence, effectiveRate, band: "small" | "marginal" | "main" }`:
  - `profit ≤ £50,000` → **19%** (`small`).
  - `profit ≥ £250,000` → **25%** (`main`).
  - between → **marginal relief**: `tax = profit × 0.25 − (250_000 − profit) × 3/200` (`marginal`).
  - Worked checks (the unit tests assert these exactly): £40,000 → £7,600 (19%); £100,000 → **£22,750** (effective 22.75%); £250,000 → £62,500 (25%); £50,000 → £9,500 (continuous with 19%).
  - All pence, single `Math.round` at the end. Rates live in a small per-year config (like the income-tax bands) so April updates are one-line; v1 carries 2025/26 figures (£50k/£250k limits, 3/200 fraction).
- **Documented v1 assumptions** (also shown on-screen): a single standalone company (no associated-company division of the limits), a full 12-month accounting period (no pro-rating of the limits), and a single CT financial year's rates (no straddle apportionment).

## Section 4 — Company accounts view + CRUD

- `src/lib/data/company.ts`: `listCompanies`, `getCompany(id)`, `createCompany(input)`, `updateCompany(id, input)`, `getCompanyPropertyCount(id)`, `deleteCompanyIfEmpty(id)` (throws if any property references it).
- `companyAccountingPeriod(yearEndDay, yearEndMonth, periodYear)` (pure) → `{ start, end }`: `end` = the year-end date in `periodYear` (UTC); `start` = the day after the year-end one year earlier (a 12-month period). Tested.
- `src/lib/data/companyAccounts.ts`: `getCompanyAccounts(companyId, periodYear)` → loads the company, computes the period, queries transactions for **properties where `companyId = company.id` and date within the period**, runs `companyTaxableProfit` + `corporationTax`, returns `{ company, period, incomePence, expensesPence, profitBeforeTaxPence, corporationTaxPence, profitAfterTaxPence, band, effectiveRate }`.
- `/companies` page: list (name, year-end, property count), add, edit, delete (blocked when it owns properties). Nav link "Companies".
- `/companies/[id]/accounts` page (`?year=` selects the period; default current): shows the period dates, income, expenses (incl. mortgage), **profit before tax**, **estimated corporation tax** (with band + effective rate), **profit after tax**, and the accountant caveat.
- **Property → company assignment:** on the property add/edit form, when `ownershipType: "company"` is chosen, a **company `<select>`** (required) sets `companyId`; choosing "personal" clears it. (Properties page shows the owning company name for company properties.)
- Personal dashboard/SA105 are unchanged — they already exclude `ownershipType: "company"`, so company property data never reaches the personal return.

## Section 5 — Testing

- **Pure/unit (Vitest):** `corporationTax` (£40k→£7,600 small; £100k→£22,750 marginal; £300k→£75,000 main; £50k→£9,500 boundary); `companyTaxableProfit` (mortgage/finance IS deducted — contrast with personal `computeProfit`); `companyAccountingPeriod` (year-end 31 Mar, period 2026 → 2025-04-01..2026-03-31).
- **Integration (test DB):** Company CRUD + delete-protection (blocked when a property references it); `getCompanyAccounts` (sums only that company's properties within the period; excludes personal properties and other companies; mortgage reduces profit-before-tax; CT + profit-after-tax correct).
- **Flow (build + live-run):** create a company (year-end 31 March); set a property to `company` ownership and assign it; add rent + a mortgage-interest transaction; open the company accounts and confirm profit-before-tax deducts the mortgage, the CT estimate matches the band, and profit-after-tax = profit − CT; confirm the property is absent from the personal SA105.

## Risks & caveats

- **Tax correctness is the headline risk.** The CT engine is pure and exhaustively unit-tested at the band boundaries; the marginal-relief formula is the standard `P×25% − (250k−P)×3/200`. The simplifying assumptions (standalone, full-year, single FY) are documented and shown on-screen, with "verify with your accountant / this is not a filed CT600".
- **Accounting period vs tax year:** company accounts use the company's own 12-month period, deliberately different from the personal 6-Apr tax year. The two reporting worlds are kept separate (personal SA105 excludes company properties; company accounts only include that company's properties).
- **`companyId` integrity is UI-maintained**, not DB-enforced (a `personal` property could in theory carry a stale `companyId`). The property form clears `companyId` when ownership is personal; `getCompanyAccounts` filters by `companyId` AND the period, and the personal summary filters by `ownershipType`, so a stale value cannot cross the personal/company boundary in reporting.
- **Salary as a plain expense:** director's salary is entered as an ordinary deductible expense category — correct for the CT computation. PAYE/NI and the personal-side tax of that salary are out of scope (an accountant concern).
- **Multiple CT financial years / rate changes:** v1 uses one year's rates; re-verify the £50k/£250k limits and 3/200 fraction against current HMRC figures each year (the per-year config makes this a one-line update).
