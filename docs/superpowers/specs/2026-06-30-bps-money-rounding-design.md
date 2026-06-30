# Basis-Point Money-Rounding Sweep — Design Spec

**Date:** 2026-06-30
**Status:** Approved (design); ready for implementation planning
**Phase:** 2 (tech-debt / correctness hardening)

## Problem & context

The whole app stores money as integer pence to avoid float bugs (the class that broke Akaunting's VAT). When the what-if planner was built, a float-rate multiplication in `dividendTax` was found to mis-round: `0.0875` is stored as `0.087499999999999994`, so `355000 * 0.0875 = 31062.4999…` rounded **down** to 31062 when the correct half-up result is 31063. That was fixed by computing in integer **basis points** (`875` not `0.0875`): accumulate an integer numerator, then `Math.round(numerator / 10000)` once.

The same float-rate pattern still exists in three other tax engines. This sweep applies the proven basis-point approach to all remaining money math so the rounding-bug class is gone app-wide.

**Expected behaviour change: none.** Every current test uses whole-pound inputs and whole-percentage rates, so `pence × rate` is already exact (unlike dividend's 8.75%). The sweep is a safety/consistency hardening, not a behaviour change. The test-value policy below governs the (unlikely) case where a value shifts.

## Section 1 — Scope

**In:** convert float rates to integer basis points and round once via `Math.round(numerator / 10000)` in: `src/lib/tax/bands.ts`, `src/lib/tax/incomeTax.ts`, `src/lib/tax/corporationTax.ts`, `src/lib/tax/profit.ts` (the `financeCostReducer`).

**Out (unchanged):** `effectiveRate` (corporationTax) and `marginalRate` (incomeTax) — these are display ratios, not money, and stay as floating-point divisions. `dividendTax` (already basis-point). The PA taper `Math.floor(excess / 2)` (already integer). Money values, band widths, thresholds, limits — all already integer pence, untouched. No new shared helper (the inline pattern matches `dividendTax`; the three call sites have different shapes — YAGNI).

## Section 2 — Changes (each preserves behaviour)

### `bands.ts`
- `TaxBand.rate: number` → `rateBps: number`. `TaxBands.topRate: number` → `topRateBps: number`.
- England/Wales/NI 2025-26 bands: `[{ widthPence: 37_700_00, rateBps: 2000 }, { widthPence: null, rateBps: 4000 }]`, `topRateBps: 4500`.
- Scotland 2025-26 bands: `1900, 2000, 2100, 4200, 4500` (rateBps for the five bands, widths unchanged), `topRateBps: 4800`.
- Each rate field carries a `// basis points (2000 = 20%)` comment.
- The validation in `getBands` (final band must have `widthPence: null`) is unchanged.

### `incomeTax.ts`
- Replace the float accumulation:
  ```ts
  let tax = 0;
  for (const band of bands.bands) { … tax += slice * band.rate; … }
  tax += aboveCap * bands.topRate;
  return Math.round(tax);
  ```
  with an integer-numerator accumulation:
  ```ts
  let taxNumerator = 0; // sum of (taxable pence × basis points); ÷ 10,000 at the end
  for (const band of bands.bands) { … taxNumerator += slice * (band.rateBps); … }
  taxNumerator += aboveCap * bands.topRateBps;
  return Math.round(taxNumerator / 10000);
  ```
- `effectivePersonalAllowance` (uses `Math.floor(excess / 2)`) and the band-walking logic (widths, cap) are otherwise unchanged. `estimatePropertyTax` is unchanged except that it consumes the corrected `incomeTaxOn`; its `marginalRate` float ratio stays.

### `corporationTax.ts`
- `CTRates`: `smallRate`/`mainRate`/`marginalFraction` → `smallBps: 1900`, `mainBps: 2500`, `marginalFractionBps: 150` (3/200 = 1.5% = 150 basis points). Limits unchanged.
- Small: `taxPence = Math.round(profitPence * r.smallBps / 10000)`.
- Main: `taxPence = Math.round(profitPence * r.mainBps / 10000)`.
- Marginal: `taxPence = Math.round((profitPence * r.mainBps - (r.upperLimitPence - profitPence) * r.marginalFractionBps) / 10000)`.
- `effectiveRate: taxPence / profitPence` (display ratio) unchanged. The `profitPence <= 0` guard and the band classification unchanged.

### `profit.ts`
- `financeCostReducer`: `return Math.round(base * 0.2);` → `return Math.round(base * 2000 / 10000);` with a `// 2000 bps = 20% Section-24 basic-rate reducer` comment. The `Math.max(0, Math.min(...))` cap is unchanged.

## Section 3 — Testing

- **Run the full existing suite** (`npm test`) after the change. Expectation: **all 158 tests pass unchanged.** The existing tax tests (incomeTax, corporationTax, bands, profit, summary, scenario, sa105, personalSummary, companyAccounts) already pin the correct values; if they still pass, behaviour is preserved.
- **Add a targeted regression test** that pins the basis-point intent at a fraction-prone input — one input where a naive float `× rate` would mis-round but basis points are exact. Concretely, add to `corporationTax.test.ts` a marginal-relief case whose pre-round value ends in `.5`, and to `incomeTax.test.ts` a case at a rate × odd-pence amount that lands on `.5`, asserting the half-up integer result. (The implementation plan will compute the exact inputs/outputs.)
- **`npx tsc --noEmit`** must report 0 errors (the `rate`→`rateBps` and CTRates field renames must be threaded through every consumer — only `incomeTax.ts` reads `bands.rate`/`topRate`; only `corporationTax.ts` reads the CT rate fields).

## Section 4 — Test-value policy (the one real decision)

If converting to basis points causes **any** existing test value to change:
1. **Stop.** Do not edit the expected value to make the test pass.
2. Verify by hand whether the new value is the correct half-up rounding of the exact rational result (e.g. compute `pence × percent / 100` in exact arithmetic and round half-up).
3. Only if the new value is **provably more correct** (the old float result was the mis-rounded one), update the expected value **with a one-line comment** citing the exact arithmetic. Otherwise treat it as a regression and investigate the implementation.

This guards against silently weakening a test to accommodate a genuine error.

## Risks & caveats

- **Wide-ish consumer surface for the renames:** `bands.rate`/`topRate` and the CT rate fields are interface fields. The rename is mechanical but must be threaded through their (single) consumers; `tsc` is the backstop (0 errors required).
- **Integer overflow:** `pence × bps` for realistic figures (millions of pence × ≤4800 bps) stays far below `Number.MAX_SAFE_INTEGER` (9e15). Not a concern for this domain.
- **No behaviour change is the success criterion**, so the existing suite passing unchanged is the primary evidence; the new fraction-prone regression tests prove the *reason* for the change.
