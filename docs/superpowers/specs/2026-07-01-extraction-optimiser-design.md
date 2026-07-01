# Salary-vs-Dividend Optimiser — Design Spec

**Date:** 2026-07-01
**Status:** Approved (design); ready for implementation planning
**Phase:** 2 (company profit-extraction sub-project D — the optimiser)

## Problem & context

A director of a limited company can take money out as **salary** (a deductible company cost, but subject to employer NIC, employee NIC and income tax) or as **dividends** (paid from post-corporation-tax profit, taxed at dividend rates with no NIC). The most tax-efficient answer is usually a mix. This cycle adds an optimiser that, given the company's profit available for extraction and the director's other income, finds the salary/dividend split that maximises take-home after **all** taxes.

The building blocks already exist: `corporationTax`, `incomeTaxOn` (region-aware), `dividendTax` (top-slice, UK-wide). The only new tax subsystem is **Class 1 NIC** (employer secondary + employee primary). This is sub-project **D** of the company-extraction work (A+B — dividends + director's loan — are already merged).

**Decisions from brainstorming:** output = **both** the exact optimum (via a sweep) and a few named strategies for context; placement = a **dedicated `/extraction` page** ("Salary vs dividends", under the Tax nav group); model per Section 2.

**Overarching caveat (on-screen + spec):** an estimate, not payroll/advice. v1 models a single-director company with **Employment Allowance off by default** (a toggle enables it for eligible companies); it ignores pension contributions, student-loan deductions, and other benefits-in-kind. All rates live in per-year config flagged to verify against HMRC.

## Section 1 — The extraction model

For a candidate salary `S` (2025/26 defaults):
1. **Employer (secondary) Class 1 NIC** = 15% of `max(0, S − £5,000)`; if Employment Allowance is enabled, waive up to the EA budget (£10,500) from the employer NIC.
2. Salary and employer NIC are **deductible**: `companyTaxableProfit = max(0, profitBeforeSalary − S − employerNIC)`.
3. **Corporation tax** = `corporationTax(companyTaxableProfit, ctYear).taxPence`.
4. **Dividend paid** = `max(0, companyTaxableProfit − CT)` (all remaining post-CT profit distributed).
5. Director's personal taxes:
   - **Employee (primary) Class 1 NIC** on `S`: 8% between the £12,570 primary threshold and the £50,270 upper earnings limit, 2% above.
   - **Income tax on the salary** (marginal, region-aware): `incomeTaxOn(otherIncome + S) − incomeTaxOn(otherIncome)`.
   - **Dividend tax** on the dividend, stacked on top of `otherIncome + S`: `dividendTax(dividend, otherIncome + S, taxYear)`.
6. **Take-home** = `S + dividend − employeeNIC − incomeTaxOnSalary − dividendTax`.

**Conservation identity** (unit-tested): `profitBeforeSalary === takeHome + (employerNIC + CT + employeeNIC + incomeTaxOnSalary + dividendTax)` for any `S` where `profitBeforeSalary ≥ S + employerNIC` (i.e. the salary is affordable from profit). The optimiser only sweeps affordable salaries.

**v1 assumptions (documented, shown on-screen):** single director / sole employee ⇒ EA off by default; the optimum salary lies in `[0, £12,570]` (salary above the personal allowance is dominated by dividends), so the sweep is bounded there; annual (cumulative) NIC basis; ignores pension/student-loan/other BIK.

## Section 2 — NIC engine (`src/lib/tax/nic.ts`, pure)

Per-year `NICRates` config, integer basis points, single-round `Math.round(x * bps / 10000)`:

```ts
export interface NICRates {
  secondaryThresholdPence: number;   // 5_000_00
  secondaryBps: number;              // 1500 (15%) — employer
  primaryThresholdPence: number;     // 12_570_00
  uelPence: number;                  // 50_270_00
  mainBps: number;                   // 800 (8%) — employee PT→UEL
  upperBps: number;                  // 200 (2%) — employee above UEL
  employmentAllowancePence: number;  // 10_500_00
}
```
- `employerNIC(salaryPence, year, employmentAllowancePence = 0)` → `raw = round(max(0, salary − secondaryThreshold) × secondaryBps / 10000)`; `return max(0, raw − employmentAllowancePence)`.
- `employeeNIC(salaryPence, year)` → `round(max(0, min(salary, uel) − primaryThreshold) × mainBps / 10000) + round(max(0, salary − uel) × upperBps / 10000)`.
- Unknown-year fallback to the latest configured year (like the other engines). All rates VERIFY-flagged.

## Section 3 — Optimiser engine (`src/lib/tax/extraction.ts`, pure)

```ts
export interface ExtractionInput {
  profitBeforeSalaryPence: number;
  otherIncomePence: number;
  taxYear: string;
  region: Region;
  employmentAllowance: boolean;
}
export interface ExtractionOutcome {
  salaryPence: number; dividendPence: number;
  employerNicPence: number; corporationTaxPence: number;
  employeeNicPence: number; incomeTaxPence: number; dividendTaxPence: number;
  totalTaxPence: number; takeHomePence: number;
}
export interface ExtractionResult {
  recommended: ExtractionOutcome;
  strategies: { key: "none" | "secondary" | "allowance" | "optimum"; label: string; outcome: ExtractionOutcome }[];
  curve: { salaryPence: number; takeHomePence: number }[];
}
```
- `extractionOutcome(salaryPence, input): ExtractionOutcome` implements Section 1 (composing `employerNIC`, `corporationTax`, `employeeNIC`, `incomeTaxOn`, `dividendTax`); EA budget passed to `employerNIC` only when `input.employmentAllowance` is true.
- `optimiseExtraction(input): ExtractionResult`:
  - Sweep salary over `0 .. min(profitBeforeSalaryPence, 12_570_00)` in £10 steps, plus the exact kink candidates `£0, £5,000, £12,570` (each clamped to affordable ≤ `profitBeforeSalary`); compute `extractionOutcome` for each; **recommended** = the max `takeHomePence` (ties → lower salary, simpler).
  - `strategies` = the three named reference points (`none` £0, `secondary` salary to £5,000, `allowance` salary to £12,570 — each clamped to affordable) plus `optimum` (= recommended). Deduplicate is not required; label clearly.
  - `curve` = a coarse series (e.g. ~20 evenly-spaced salary points across the swept range) of `{ salaryPence, takeHomePence }` for the chart.
  - Degenerate input (`profitBeforeSalaryPence ≤ 0`): return an all-zero recommended outcome (salary 0, dividend 0, all taxes 0, take-home = profitBeforeSalary floored at 0) and a single-point curve; never produce negative dividends/taxes.

## Section 4 — Page & UX (`/extraction`)

- Nav: add **"Salary vs dividends"** to the **Tax** group in `src/app/(app)/layout.tsx` (after "What-if planner").
- `src/app/(app)/extraction/page.tsx` (server component), GET form, state in the URL (`profit`, `other`, `ty`, `region`, `ea`) — same override pattern as the planner (`overridePence` helper; validate `ty` format; region whitelist; `ea` = `"1"`).
- **Inputs** card: profit before salary (`MoneyInput`), your other income (`MoneyInput`), tax-year `select`, region `select`, Employment-Allowance checkbox (default off, one-line "only if the company has another employee — a sole director usually can't claim this" note).
- **Recommendation** focal panel (forest, like the dashboard tax card): "Pay yourself **£{salary} salary + £{dividend} dividends**" and a large **take-home £{z}**; all-in tax beneath.
- **Breakdown** ledger (`.ledger` in a `.card`): Employer NIC · Corporation tax · Employee NIC · Income tax on salary · Dividend tax → **Total tax**; **Take-home** (bold). Money via `.money`.
- **Strategies** comparison (`.ledger`): rows for No salary / Salary to £5,000 / Salary to £12,570 / **Optimum** — salary, dividend, total tax, take-home; optimum row highlighted (`ring`/forest text) and labelled.
- **Take-home curve:** a small inline **SVG** polyline of `curve` (take-home vs salary) with a marker at the optimum. Pure SVG, no dependency; `aria-hidden` with a text fallback ("Optimum salary £X").
- Caveat (`text-xs text-faint`): estimate; single-director/no-EA default; ignores pension/student-loan/other benefits; verify NIC/CT/dividend rates with an accountant.
- Uses the design system throughout (`PageHeader`, `Banner` if needed, `.card`, `.field`/`MoneyInput`, `.btn`, `.ledger`, `.reveal`).

## Section 5 — Testing

- **`nic.ts` (unit):** `employerNIC` — £0 below the £5,000 threshold; a worked value above it; EA waiver reduces it (to 0 when covered). `employeeNIC` — £0 at/below the £12,570 PT; a worked 8% slice between PT and UEL; a case above the £50,270 UEL adding the 2% band. Exact pence.
- **`extraction.ts` (unit):** `extractionOutcome` for a worked salary asserting each component + take-home; the **conservation identity** holds for several salaries (0, £5,000, £12,570); `optimiseExtraction` returns a `recommended` whose `takeHomePence` is ≥ every `strategies` outcome and every `curve` point; `strategies` contains keys `none`/`secondary`/`allowance`/`optimum`; a `profitBeforeSalaryPence: 0` input yields the all-zero degenerate result.
- **Integration:** none required (pure engine + a stateless page). 
- **Flow (build + live-run):** open `/extraction`; enter a realistic profit (e.g. £60,000) + other income £0; confirm a sensible recommendation (a modest salary + dividends), the breakdown sums to the total, the strategies table + optimum highlight render, the SVG curve draws, and the EA toggle changes the numbers.

## Risks & caveats

- **Rate sensitivity is the headline risk.** Employer NIC (15% / £5,000 threshold), employee NIC (8%/2%, £12,570 PT, £50,270 UEL), and Employment Allowance (£10,500) all changed recently and change most Aprils — all live in `NICRates` config flagged VERIFY, alongside the existing CT/income-tax/dividend configs. The on-screen caveat states the estimate/verify position.
- **Employment Allowance eligibility** is a real fork: a sole-director-with-no-other-employees company **cannot** claim it, which is why the default is off; the toggle is provided for companies that qualify, with a note. Getting this wrong would materially mis-recommend, so the default and the note matter.
- **Sweep bound assumption:** the optimum is assumed within `[0, £12,570]`. This holds because salary above the personal allowance incurs income tax + employee NIC that exceed the dividend-tax + CT-relief trade-off; documented, and the named strategies make the shape visible so a user can sanity-check.
- **Pure engine, no persistence:** the page is a stateless calculator (URL state only); nothing is written. Correctness rests on the pure unit tests + the conservation identity.
- **Integer-pence + basis-point discipline** throughout, consistent with the recent money-rounding sweep.
