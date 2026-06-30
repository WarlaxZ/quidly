# What-If Tax Planner — Design Spec

**Date:** 2026-06-30
**Status:** Approved (design); ready for implementation planning
**Phase:** 2 (decision-support sub-project; first of two — company profit-extraction follows)

## Problem & context

The user wants to *test choices and see how they change the tax burden* — e.g. "claim the £1,000 property allowance **or** my actual costs?" and "hold this property **personally or** in a limited company?". The app already has pure, composable tax engines (`buildTaxYearSummary`, `corporationTax`, `companyTaxableProfit`, `incomeTaxOn`), so most of this is a composition + UI layer over functions we already trust. The only genuinely new tax piece is **dividend tax** (needed so the personal-vs-company comparison is honest about getting money out of a company).

**Decisions from brainstorming:**
- Build the **what-if planner first**; the full company profit-extraction sub-project (director's-loan account, retained earnings, balance-sheet-lite, salary-vs-dividend optimisation) is a **separate later cycle**.
- **Inputs:** pre-fill from real transactions for a chosen tax year, with **key figures editable** for "what if".
- **Scope:** the user **picks the basis** — one property or all personal properties — as the starting figures, then edits.
- **Company tax shown both ways:** *profits retained* (corporation tax only) **and** *taken as dividends* (corporation tax + dividend tax).
- A latent bug in `summary.ts` (applies the Section-24 finance reducer even when the £1,000 allowance is elected) is **fixed as part of this work**.

**Overarching caveat (surfaced in the UI):** this is an estimate and decision aid, **not advice**. It answers "what does the tax alone look like?", not "should I incorporate?" — it ignores incorporation costs, CGT/SDLT on transfer, mortgage-rate differences, and accountancy fees. Verify with an accountant.

## Section 1 — Scope

**In:** a pure scenario engine; a pure dividend-tax function; a server-only data loader that pre-fills a scenario from real transactions (one property or all-personal, for a chosen tax year); a `/planner` page with an editable GET form and a side-by-side comparison; the `summary.ts` allowance/finance-reducer correctness fix.

**Out (deferred or never):** saved/named scenarios; salary-vs-dividend optimisation and the director's-loan/retained-earnings/balance-sheet mechanics (the extraction sub-project); multi-year projections; capital gains / SDLT / ATED; incorporation-cost modelling.

## Section 2 — Scenario engine (`src/lib/tax/scenario.ts`, pure, correctness-critical)

`runScenario(input: ScenarioInput): { outcomes: Outcome[] }` where:

```ts
interface ScenarioInput {
  incomePence: number;
  expensesPence: number;       // allowable expenses excluding finance
  financeCostsPence: number;   // mortgage/loan interest
  otherIncomePence: number;    // the person's non-property income
  taxYear: string;             // e.g. "2025-26"
  region: Region;              // affects personal income tax only
}
interface Outcome {
  key: "personal-actual" | "personal-allowance" | "company-retained" | "company-dividends";
  label: string;
  taxPence: number;            // total tax in this world
  pocketPence: number;         // cash in the person's pocket after all tax
  note: string;                // one-line explanation
}
```

The mortgage and expenses are really paid in every world, so **`pocketPence` is the comparable number**: cash in pocket after all tax, with the mortgage subtracted everywhere.

- **`personal-actual`**: `taxable = income − expenses`; personal income tax on `taxable` at the marginal rate given `otherIncome`, **minus** the Section-24 finance reducer (`financeCostReducer(financeCosts, taxable)`, the existing 20% basic-rate reducer). `pocket = income − expenses − financeCosts − tax`.
- **`personal-allowance`**: `taxable = max(0, income − 1_000_00)`; **no** finance reducer (the allowance is in lieu of *all* actual costs, including finance). `pocket = income − expenses − financeCosts − tax`. note flags "no mortgage relief under the allowance".
- **`company-retained`**: `profit = income − expenses − financeCosts` (mortgage fully deductible); `tax = corporationTax(profit, ctYear).taxPence`. Money stays in the company: `pocket = 0`, note = "£X kept in the company (not yet in your pocket)" where `X = profit − tax`.
- **`company-dividends`**: CT as above; the post-tax profit `distributable = profit − CT` is paid out: `divTax = dividendTax(distributable, otherIncome, taxYear)`. `tax = CT + divTax`; `pocket = profit − CT − divTax`.

The engine composes existing pure functions plus the new `dividendTax`. It performs no I/O. All-pence; rounding via the underlying functions (each does a single `Math.round`).

**Notes on the CT year:** `corporationTax` takes a CT financial-year string; map the personal `taxYear` to the appropriate CT rate-year (v1 carries one year's figures, as in the company-mode spec). Profit ≤ 0 ⇒ CT 0 and the dividends row distributes 0 (pocket 0).

## Section 2a — Dividend tax (`src/lib/tax/dividendTax.ts`, pure)

`dividendTax(dividendPence: number, otherIncomePence: number, taxYear: string): number`:

- A **£500 dividend allowance** (the first £500 of dividends is taxed at 0%), per-year config.
- Rates **8.75% (ordinary) / 33.75% (upper) / 39.35% (additional)**.
- Dividends are taxed as the **top slice** of income — stacked **above** `otherIncome` (after the personal allowance), so the band a dividend pound falls into depends on `otherIncome`.
- **UK-wide thresholds regardless of `region`**: Scotland's separate income-tax bands do **not** apply to dividends. The basic-rate limit (UK £37,700 over the personal allowance ⇒ £50,270) and higher-rate limit (£125,140) come from a UK dividend config, not `getBands(region)`.
- Per-year config (allowance, rates, thresholds) like the income-tax bands so April updates are one-line; v1 carries 2025/26 figures.
- **Documented v1 assumptions:** dividends sit as the top slice; the personal-allowance taper above £100k is applied to `otherIncome`'s share of the personal allowance via the existing income-tax path where relevant, but the rarer interaction at very low other income is not specially modelled.

Worked checks the unit tests assert (2025/26, dividend allowance £500):
- £400 dividend, any other income → £0 (within allowance).
- £10,000 dividend, £20,000 other income → all in the ordinary band: `(10_000 − 500) × 8.75% = £831.25` → 83125 pence.
- £10,000 dividend, £45,000 other income (straddles £50,270): `5,000` slice into ordinary + remainder into upper after the £500 allowance — assert the exact split.
- £10,000 dividend, £200,000 other income → all additional: `(10_000 − 500) × 39.35% = £3,738.25` → 373825 pence.
- Scottish region with the same inputs as the straddle case → identical result (UK thresholds).

## Section 3 — Data loader (`src/lib/data/scenarioInput.ts`, server-only)

`getScenarioInput({ taxYear, basis }): Promise<ScenarioInput>` where `basis` is `"all"` or a `propertyId`:

- Loads the relevant **personal** transactions for `taxYear` (reuse the existing personal-summary query path / `toTaxTxn` mapping). For `"all"`, all `ownershipType: "personal"` properties; for a `propertyId`, just that property (must be personal).
- Sums into `{ incomePence, expensesPence, financeCostsPence }` by category kind (income / expense / finance), counting only `allowable` transactions — consistent with `computeProfit`/`buildTaxYearSummary`.
- Reads `otherIncomePence` and `region` from the `TaxYearProfile` for that year (same source the dashboard/SA105 use).
- Company-owned properties are **excluded** from the `"all"` basis (they are not personal).
- This is the only DB-touching unit; it just assembles the pre-fill. No writes.

## Section 4 — `/planner` page + UX

- New **"Planner"** nav link in `src/app/(app)/layout.tsx`.
- `src/app/(app)/planner/page.tsx` (server component). Reads `searchParams` (a Promise, per Next 16): `ty` (tax year), `basis` (`"all"` | propertyId), and optional overrides `income`, `expenses`, `finance`, `other`, `region`.
- **Form (GET, state in the URL** — scenarios are shareable/bookmarkable; no DB):
  - tax-year `<select>`; basis `<select>` ("All personal properties" + each property).
  - editable number fields **pre-filled from `getScenarioInput`**: annual income, expenses, mortgage/finance interest, your other income; region select (defaults from the profile).
  - When an override search-param is present it takes precedence over the loader value; a "Reset to my real figures" link clears the overrides (links to the page with only `ty`/`basis`).
- **Result:** the four `Outcome`s rendered side by side (cards or a table). Each shows **tax** and **in-pocket**, with the **highest in-pocket** highlighted and the one-line `note`. A plain-English takeaway line names the best option and the gap (e.g. "Holding personally and claiming actual costs keeps the most in your pocket this year: £X, vs £Y in a company after dividends").
- **Caveat banner** (reuse the company-accounts caveat styling): an estimate; ignores incorporation costs, CGT/SDLT, mortgage-rate differences, and accountancy fees; check with an accountant.
- Pure server render; no client JS beyond the native GET form. Empty state when there are no properties / no data for the year (prompt to add transactions, with the form still usable via manual figures).

## Section 4a — `summary.ts` correctness fix

In `buildTaxYearSummary`, when `profile.usePropertyAllowance` is true the finance reducer must be **0** (the £1,000 allowance is in lieu of all actual costs, including finance). Change: compute `financeReducerPence` as `0` when `usePropertyAllowance` is true, else the existing `financeCostReducer(financeCostsPence, taxableProfitPence)`. Add a regression test. (This keeps the dashboard/SA105 and the planner's `personal-allowance` outcome consistent and correct.)

## Section 5 — Testing

- **Pure/unit (Vitest) — correctness core:**
  - `dividendTax`: the five worked checks in Section 2a (within-allowance £0; ordinary-only; ordinary→upper straddle; additional-rate; Scottish region uses UK thresholds).
  - `runScenario`: a worked landlord case — £12,000 rent, £2,000 expenses, £5,000 mortgage, £40,000 other income — asserting all four outcomes' `taxPence` and `pocketPence` exactly; `company-retained` has `pocket = 0` and the correct "kept in company" amount in its note/derivation; `company-dividends` tax = CT + dividend tax; `personal-allowance` applies **no** finance reducer. Also a loss case (expenses+finance > income) → no negative tax, sensible pockets.
  - `summary.ts` fix: allowance elected **and** finance costs present → `financeReducerPence === 0` (regression).
- **Integration (test DB):** `getScenarioInput` — sums one personal property's income/expense/finance for the year; `"all"` basis combines two personal properties and **excludes** a company-owned one; pulls `otherIncome`/`region` from the profile; a `propertyId` basis scopes to that property only.
- **Flow (build + live-run):** open `/planner`; pick a year + "all personal"; confirm figures pre-fill from real data; verify the four outcomes compute and best-in-pocket is highlighted; override the mortgage figure and confirm the company columns shift; switch basis to a single property; confirm the `personal-allowance` row drops the mortgage relief.

## Risks & caveats

- **Tax correctness is the headline risk.** Everything is pure and unit-tested at the band/rate boundaries. Dividend stacking is the top slice on `otherIncome`; the `summary.ts` finance-reducer fix has its own regression test.
- **Comparison honesty:** the personal-vs-company verdict is tax-only. It ignores incorporation costs, CGT/SDLT on transferring an existing property in, the typically-higher company BTL mortgage rates, and ongoing accountancy fees. The page states this; the `company-retained` vs `company-dividends` split makes clear that company money isn't the owner's until extracted.
- **Dividend edge cases:** personal-allowance taper above £100k and very-low-other-income interactions are simplified (documented v1 assumption); revisit if needed.
- **No persistence:** scenarios live only in the URL; "reset to my real figures" restores loader values. No data is written by the planner.
- **Rates upkeep:** dividend allowance/rates/thresholds and the CT mapping live in per-year config; re-verify against HMRC figures each April (one-line update).
