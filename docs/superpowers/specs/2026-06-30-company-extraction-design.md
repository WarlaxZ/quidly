# Company Profit-Extraction (Dividends + Director's Loan) — Design Spec

**Date:** 2026-06-30
**Status:** Approved (design); ready for implementation planning
**Phase:** 2 (company-extraction sub-project A+B; the optimiser and balance-sheet are later/reassessed)

## Problem & context

Limited-company mode (core) computes per-period corporation tax but has no concept of getting money *out* of the company. This cycle adds the two foundational extraction mechanisms — **dividends** and the **director's loan account (DLA)** — plus **retained earnings / distributable reserves**, and the associated tax: a personal **dividend-tax** estimate, the **s455** charge on an overdrawn loan, and the **beneficial-loan benefit-in-kind (BIK) + Class 1A NIC**.

A structural fact drives the data model: existing `Transaction`s are tied to a `Property`, but dividends and director's-loan movements are **company-level** events with no property. So this introduces a new company-level ledger model.

**Decisions from brainstorming:**
- Build **dividends + retained earnings + director's loan together** (they share the ledger model).
- **Personal tax:** company-side records **plus** a self-contained personal **dividend-tax estimate** on dividends paid in a tax year (using the existing `dividendTax` engine). Not full personal-dashboard integration.
- **DLA depth:** compute **s455 and the beneficial-loan BIK + Class 1A NIC**, not just flag overdrawn.
- **Single director-shareholder** assumption (matches the single-tenant model).
- Include an **unlawful-dividend guard** (warn when cumulative dividends exceed distributable reserves).

**Overarching caveat (surfaced in the UI):** this is an estimate and record-keeping aid, **not** filed accounts, a CT600, a P11D, or payroll. s455 timing, the official rate of interest, and Class 1A NIC have rules and rates that change — verify with an accountant. Rates live in per-year config flagged to verify against HMRC.

## Section 1 — Scope

**In:** a unified company-level ledger (dividends + director's-loan movements); retained-earnings / distributable-reserves computation; an unlawful-dividend warning; a personal dividend-tax estimate on dividends paid in a tax year; director's-loan balance, s455 charge, and beneficial-loan BIK + Class 1A NIC; a ledger-management page and computed read-only sections on the company accounts page.

**Out (later/never):** balance-sheet-lite (sub-project C); salary-vs-dividend optimiser (sub-project D); per-shareholder dividend splits; multiple share classes; precise s455 repayment-timing tracking; the strict daily-averaging BIK method; payroll/PAYE/RTI; P11D filing. Salary remains a deductible expense category as in company-mode core.

## Section 2 — Data model

New model (one table, three kinds — integer pence; amounts always positive, `kind` conveys direction):

```prisma
enum CompanyLedgerKind {
  dividend          // company → director (reduces reserves)
  director_loan_in  // director → company (reduces overdrawn balance / company owes director)
  director_loan_out // company → director, not as salary/dividend (director owes company)
}

model CompanyLedgerEntry {
  id          String            @id @default(cuid())
  companyId   String
  company     Company           @relation(fields: [companyId], references: [id])
  date        DateTime
  kind        CompanyLedgerKind
  amountPence Int               // always positive; kind conveys direction
  note        String?
  createdAt   DateTime          @default(now())
  @@index([companyId, date])
}
```

- `Company` gains `ledgerEntries CompanyLedgerEntry[]`.
- Migration in the Prisma-v7 style (hand-authored SQL + `prisma migrate deploy` + `prisma generate`, never `migrate dev`). `test/setup/resetDb.ts` clears `companyLedgerEntry` (before `company.deleteMany`).
- **Director's-loan balance** = Σ`director_loan_out` − Σ`director_loan_in`. Positive ⇒ director **owes the company** (overdrawn — the s455/BIK case); negative ⇒ company owes the director (benign).
- Dividends are tracked independently of the loan balance: a dividend is a `dividend` entry; a loan movement is a loan entry. The user records each explicitly (we don't auto-derive one from the other).

## Section 3 — Reserves, retained earnings & dividends

- **`src/lib/data/companyReserves.ts` — `getCompanyReserves(companyId, periodYear)`** (server-only): cumulatively to the end of the selected accounting period, computes **cumulative after-tax profit** (sum of each period's `profitAfterTaxPence` from the first period with activity up to the selected period, reusing `getCompanyAccounts` per period because CT is per-period) **− cumulative dividends declared** (sum of `dividend` entries dated ≤ period end) = **retainedEarningsPence carried forward**. Returns `{ periodProfitAfterTaxPence, periodDividendsPence, cumulativeProfitAfterTaxPence, cumulativeDividendsPence, retainedEarningsPence, unlawful }` where `unlawful = cumulativeDividendsPence > cumulativeProfitAfterTaxPence`.
  - Period enumeration: iterate `periodYear` backwards from the selected year while a period has any company transactions or ledger dividends; a young SPV has O(1–5) periods. (A documented v1 assumption: reserves start from the first period with activity; no opening-reserves/share-capital seed.)
- **`src/lib/tax/dividendTaxByYear.ts` (pure) — `dividendTaxForYears(dividends: { taxYear, dividendPence, otherIncomePence }[])`** → per-tax-year `{ taxYear, dividendPence, taxPence }[]` using `dividendTax`. The data layer groups `dividend` entries by UK tax year (`getTaxYear(date)`) and supplies `otherIncomePence` from each year's `TaxYearProfile`.
- **Accounts page "Reserves" section:** profit after tax (this period), dividends paid (this period), retained earnings carried forward (cumulative), and — when `unlawful` — a clear warning that dividends can only be paid from distributable profits and this may be an unlawful distribution. (Warning only; recording is not blocked, since the user may be correcting data.)
- **Accounts page "Dividend tax" note:** per UK tax year, total dividends and the estimated dividend tax, labelled as a personal Self-Assessment matter (company accounting period ≠ personal tax year).

## Section 4 — Director's loan account, s455 & beneficial-loan BIK

Pure functions in `src/lib/tax/directorLoan.ts` (per-year `DLARates` config; rates flagged to verify against HMRC):

- **`directorLoanBalance(entries, asOf: Date)`** → signed pence: Σ`director_loan_out` − Σ`director_loan_in` for loan entries dated ≤ `asOf`.
- **`s455Charge(overdrawnPence, year)`** → `overdrawnPence > 0 ? Math.round(overdrawnPence * s455Bps / 10000) : 0`, `s455Bps: 3375` (33.75%). Surfaced as the *potential* charge if the loan is not repaid within 9 months + 1 day of period end; refundable on repayment. v1 does not track repayment timing (documented + on-screen).
- **`beneficialLoanBenefit({ startBalancePence, endBalancePence, interestPaidPence, year })`** → `{ applies: boolean, bikPence, class1aNicPence }`, per UK tax year, **averaging method**: `applies` when `max(startBalance, endBalance) > beneficialLoanThresholdPence` (£10,000); `avg = Math.round((max(0,startBalance) + max(0,endBalance)) / 2)`; `bikPence = max(0, Math.round(avg * officialRateBps / 10000) − interestPaidPence)`; `class1aNicPence = Math.round(bikPence * class1aBps / 10000)`. `interestPaidPence` defaults to 0. v1 simplifications (documented): averaging method (not strict daily), threshold tested at year start/end, only the overdrawn (positive) balance benefits.
- **`DLARates` per year:** `s455Bps: 3375`; `officialRateBps` (2025/26 — best-known value, flagged to verify); `class1aBps: 1500` (15% from April 2025); `beneficialLoanThresholdPence: 10_000_00`. All basis-point integers, consistent with the rest of the tax module.
- **`src/lib/data/directorLoan.ts` — `getDirectorLoanSummary(companyId, periodYear)`** (server-only): loads the company's loan entries, computes the balance at period end, the s455 on that balance, and the beneficial-loan benefit for the **tax year containing the period end** (start/end balances at that tax year's bounds; `interestPaidPence` from an optional caller arg). Returns the figures + the inputs used.
- **Accounts page "Director's loan account" section:** balance at period end (overdrawn / in credit); if overdrawn, the potential s455 with the 9-month note; the beneficial-loan BIK + Class 1A NIC with an optional "interest the director paid" input (query param like the planner's overrides); a prominent "estimate — verify the official rate of interest, Class 1A rate, and timing with your accountant" caveat.

## Section 5 — UI & data entry

- **`src/lib/data/companyLedger.ts`** (server-only): `listLedgerEntries(companyId)`, `createLedgerEntry({ companyId, date, kind, amountPence, note })`, `deleteLedgerEntry(id)`, `getDividendsByTaxYear(companyId)` (groups `dividend` entries by `getTaxYear`).
- **`/companies/[id]/ledger`** (new page): three add-forms (record a **dividend**, a **loan in**, a **loan out**) with date / amount (£) / optional note; a list of all entries (date, kind, amount, note) with a delete control; empty state when none.
- **Server actions** in `src/app/(app)/companies/actions.ts`: `addLedgerEntryAction`, `deleteLedgerEntryAction` — all `requireSession`; validate positive amount (pence > 0), a valid date, and `kind ∈ CompanyLedgerKind`; friendly `redirect("/companies/[id]/ledger?error=…")` on bad input, matching the existing company/property action style.
- **`/companies/[id]/accounts`** (existing) gains the read-only computed **Reserves**, **Dividend tax**, and **Director's loan account** sections from §3–§4, each with its caveat, and a "Manage dividends & director's loan →" link to the ledger page.
- Money shown via `formatGBP`; pounds inputs converted with `poundsToPence`.

## Section 6 — Testing

- **Pure/unit (Vitest):**
  - `directorLoanBalance`: signed netting of in/out; respects the `asOf` date; in-credit (negative) vs overdrawn (positive).
  - `s455Charge`: 33.75% of an overdrawn balance (worked figure); 0 when in credit/zero.
  - `beneficialLoanBenefit`: below threshold → `applies:false, bik 0`; above threshold → averaging-method BIK at the official rate; interest-paid offset reduces the BIK (floored at 0); Class 1A = `class1aBps` × BIK.
  - `dividendTaxForYears`: groups and applies `dividendTax` per year (reuses the dividend engine; one basic-rate and one straddle year asserted).
- **Integration (test DB):** `getCompanyReserves` — cumulative after-tax profit across two periods minus dividends = retained earnings carried forward; unlawful flag when dividends exceed cumulative after-tax profit; dividends-by-tax-year grouping; `getDirectorLoanSummary` — overdrawn balance at period end drives s455, BIK computed for the right tax year; ledger CRUD (create each kind, list ordered, delete) scoped to the company.
- **Flow (build + live-run):** on the seeded test company (Bristol Holdings Ltd), record a dividend within reserves and a loan-out; open the accounts page; confirm retained earnings = cumulative after-tax profit − dividends, the per-tax-year dividend-tax note shows, the loan shows overdrawn with a potential s455 figure (and BIK if over £10k), and recording a dividend beyond reserves raises the unlawful-dividend warning.

## Risks & caveats

- **Tax correctness + changing rates are the headline risk.** s455 (33.75%), the official rate of interest, and Class 1A NIC (15%) are per-year config flagged to verify against HMRC; the on-screen caveat states the figures are estimates and that s455 timing and the BIK method are simplified. All money math uses integer basis points (consistent with the recent sweep).
- **Accounting period vs tax year:** reserves/s455 are period-based; dividend tax and the BIK are tax-year-based. The two are kept visually distinct and labelled.
- **No opening reserves / share capital:** reserves accrue from the first period with activity; a company with pre-existing reserves or share capital isn't seeded (documented v1 assumption). This mainly affects the unlawful-dividend guard's baseline.
- **Single director-shareholder:** dividends and the loan are attributed to one director; no per-person split or multiple share classes.
- **Averaging-method BIK & threshold-at-bounds:** simpler than the strict daily method and "exceeds £10,000 at any point"; documented. Adequate for an estimate; an accountant files the P11D.
- **Unlawful dividends are warned, not blocked:** the user may legitimately be entering historical/correcting data.
