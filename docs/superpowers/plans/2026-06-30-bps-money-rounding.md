# Basis-Point Money-Rounding Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace float-rate money math in the remaining tax engines (`bands.ts`/`incomeTax.ts`, `corporationTax.ts`, `profit.ts`) with the integer basis-point pattern already used by `dividendTax`, eliminating the float-rounding bug class app-wide.

**Architecture:** Rates become integer basis points (2000 = 20%); each computation accumulates an integer numerator and rounds once via `Math.round(numerator / 10000)`. This is a behaviour-preserving refactor: every existing test must stay green. Two guard tests pin the half-up contract at a `.5` boundary.

**Tech Stack:** TypeScript, Vitest. Money is integer pence. `effectiveRate`/`marginalRate` are display ratios and stay floating-point.

---

## Important context for the implementer

- This is a **behaviour-preserving** change. Success = **all existing tests still pass unchanged** plus `tsc --noEmit` reports 0 errors. Run the FULL suite (`npm test`) after each task, not just the touched file's tests.
- **Test-value policy:** if any *computed money value* test changes, STOP — do not edit the expected value to pass. Verify by hand whether the new value is the correct half-up rounding of the exact rational result; only update it (with a one-line comment citing the arithmetic) if it is provably more correct. `bands.test.ts` assertions change in Task 1 **only because field names are renamed** (`rate`→`rateBps`), which is a structural rename, NOT a computed-value change — that update is expected and fine.
- The two added guard tests (Scottish income `.5`, CT marginal `.5`) PASS both before and after the change — they are characterization tests that lock the rounding contract for the future. They are expected to pass, not fail-first.
- `bands.ts` rate fields are consumed ONLY by `incomeTax.ts` (and asserted by `bands.test.ts`); the CT rate fields ONLY by `corporationTax.ts`. `tsc` is the backstop for threading the renames.

---

## Task 1: bands.ts + incomeTax.ts → basis points

These two files are coupled by the `TaxBand`/`TaxBands` interface (renaming `rate`/`topRate` breaks `incomeTax.ts` until both change), so they move together in one task to keep the tree compiling.

**Files:**
- Modify: `src/lib/tax/bands.ts`
- Modify: `src/lib/tax/incomeTax.ts`
- Test: `src/lib/tax/bands.test.ts` (update field names), `src/lib/tax/incomeTax.test.ts` (add a guard test)

- [ ] **Step 1: Rewrite `src/lib/tax/bands.ts`**

Replace the entire file with (only the `rate`/`topRate` fields change to `*Bps` integers; widths, thresholds, limits, validation unchanged):

```ts
import type { Region } from "./types";

export interface TaxBand {
  /** Width of this band in taxable income (pence), above the personal allowance. null = fills to the top threshold. */
  widthPence: number | null;
  /** Marginal rate in basis points (2000 = 20%). */
  rateBps: number;
}

export interface TaxBands {
  personalAllowancePence: number;
  paTaperStartPence: number;
  /** Gross income at which the personal allowance reaches zero and the top rate begins. */
  topThresholdPence: number;
  /** Top rate in basis points (4500 = 45%). */
  topRateBps: number;
  /** Ordered bands below the top rate; the final band must have widthPence: null. */
  bands: TaxBand[];
}

const ENGLAND_WALES_NI_2025_26: TaxBands = {
  personalAllowancePence: 12_570_00,
  paTaperStartPence: 100_000_00,
  topThresholdPence: 125_140_00,
  topRateBps: 4500,
  bands: [
    { widthPence: 37_700_00, rateBps: 2000 },
    { widthPence: null, rateBps: 4000 },
  ],
};

const SCOTLAND_2025_26: TaxBands = {
  personalAllowancePence: 12_570_00,
  paTaperStartPence: 100_000_00,
  topThresholdPence: 125_140_00,
  topRateBps: 4800,
  bands: [
    { widthPence: 2_306_00, rateBps: 1900 },
    { widthPence: 11_685_00, rateBps: 2000 },
    { widthPence: 17_101_00, rateBps: 2100 },
    { widthPence: 31_338_00, rateBps: 4200 },
    { widthPence: null, rateBps: 4500 }, // advanced (fills to top threshold)
  ],
};

const BANDS: Record<string, Partial<Record<Region, TaxBands>>> = {
  "2025-26": { englandWalesNI: ENGLAND_WALES_NI_2025_26, scotland: SCOTLAND_2025_26 },
};

const LATEST_YEAR = "2025-26";

export function getBands(taxYear: string, region: Region): TaxBands {
  const year = BANDS[taxYear] ?? BANDS[LATEST_YEAR];
  const bands = year[region] ?? year.englandWalesNI;
  if (!bands) throw new Error(`No tax bands configured for ${taxYear}/${region}`);
  if (bands.bands.length === 0 || bands.bands[bands.bands.length - 1].widthPence !== null) {
    throw new Error(`Tax bands for ${taxYear}/${region}: the final band must have widthPence: null (fills to the top threshold)`);
  }
  return bands;
}
```

- [ ] **Step 2: Update `incomeTaxOn` in `src/lib/tax/incomeTax.ts`**

Replace the body of `incomeTaxOn` (the function spanning roughly lines 11–32) with the integer-numerator version. Leave `effectivePersonalAllowance`, `PropertyTaxInput`, `PropertyTaxResult`, and `estimatePropertyTax` exactly as they are:

```ts
export function incomeTaxOn(totalIncomePence: number, taxYear: string, region: Region): number {
  const bands = getBands(taxYear, region);
  const pa = effectivePersonalAllowance(totalIncomePence, bands);
  const taxable = Math.max(0, totalIncomePence - pa);

  const cap = Math.max(0, bands.topThresholdPence - pa);
  let remaining = Math.min(taxable, cap);
  let taxNumerator = 0; // sum of (taxable pence × basis points); divided by 10,000 once at the end

  for (const band of bands.bands) {
    if (remaining <= 0) break;
    const width = band.widthPence ?? remaining;
    const slice = Math.min(remaining, width);
    taxNumerator += slice * band.rateBps;
    remaining -= slice;
  }

  const aboveCap = Math.max(0, taxable - cap);
  taxNumerator += aboveCap * bands.topRateBps;

  return Math.round(taxNumerator / 10000);
}
```

- [ ] **Step 3: Update the field-name assertions in `src/lib/tax/bands.test.ts`**

The existing tests assert the struct shape with the old field names. Update them to the renamed fields (this is a rename, not a value change). Replace the first two `it(...)` blocks' relevant assertions:

In "returns 2025-26 England/Wales/NI bands", replace:
```ts
    expect(b.topRate).toBeCloseTo(0.45);
    expect(b.bands).toEqual([
      { widthPence: 37_700_00, rate: 0.2 },
      { widthPence: null, rate: 0.4 },
    ]);
```
with:
```ts
    expect(b.topRateBps).toBe(4500);
    expect(b.bands).toEqual([
      { widthPence: 37_700_00, rateBps: 2000 },
      { widthPence: null, rateBps: 4000 },
    ]);
```

In "returns 2025-26 Scotland bands (5 bands + topRate)", replace:
```ts
    expect(b.topRate).toBeCloseTo(0.48);
    expect(b.bands[0]).toEqual({ widthPence: 2_306_00, rate: 0.19 });
```
with:
```ts
    expect(b.topRateBps).toBe(4800);
    expect(b.bands[0]).toEqual({ widthPence: 2_306_00, rateBps: 1900 });
```

- [ ] **Step 4: Add a guard test to `src/lib/tax/incomeTax.test.ts`**

Inside `describe("incomeTaxOn (2025-26 EWNI)", ...)`, add this test before the closing `});` of that describe:

```ts
  it("rounds half-up at a fraction-prone Scottish input (basis points are exact)", () => {
    // £12,570.50 income: £0.50 taxable at the 19% starter rate = 9.5p → half-up to 10p.
    expect(incomeTaxOn(12_570_50, "2025-26", "scotland")).toBe(10);
  });
```

- [ ] **Step 5: Run the full suite + typecheck**

Run: `cd /home/ash/projects/akaunting-ng && npm test`
Expected: all tests pass (the previous 158 + 1 new guard test = 159). If any *computed-value* test (incomeTax/summary/scenario/personalSummary) fails, STOP and apply the test-value policy — do not weaken it.

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tax/bands.ts src/lib/tax/incomeTax.ts src/lib/tax/bands.test.ts src/lib/tax/incomeTax.test.ts
git commit -m "refactor: integer basis-point arithmetic in income-tax bands"
```

---

## Task 2: corporationTax.ts → basis points

`CTRates` is internal to `corporationTax.ts`, so this task is self-contained.

**Files:**
- Modify: `src/lib/tax/corporationTax.ts`
- Test: `src/lib/tax/corporationTax.test.ts` (add a guard test)

- [ ] **Step 1: Update `CTRates`, the 2025-26 config, and the `corporationTax` formula**

In `src/lib/tax/corporationTax.ts`, replace the `CTRates` interface:

```ts
export interface CTRates {
  lowerLimitPence: number;
  upperLimitPence: number;
  smallBps: number;             // basis points (1900 = 19%)
  mainBps: number;              // basis points (2500 = 25%)
  marginalFractionBps: number;  // basis points (150 = 3/200 = 1.5%)
}
```

Replace the `CT_2025_26` constant:

```ts
const CT_2025_26: CTRates = {
  lowerLimitPence: 50_000_00,
  upperLimitPence: 250_000_00,
  smallBps: 1900,
  mainBps: 2500,
  marginalFractionBps: 150,
};
```

Replace the three rate computations inside `corporationTax` (the if/else-if/else that sets `taxPence`):

```ts
  if (profitPence <= r.lowerLimitPence) {
    taxPence = Math.round(profitPence * r.smallBps / 10000);
    band = "small";
  } else if (profitPence >= r.upperLimitPence) {
    taxPence = Math.round(profitPence * r.mainBps / 10000);
    band = "main";
  } else {
    taxPence = Math.round((profitPence * r.mainBps - (r.upperLimitPence - profitPence) * r.marginalFractionBps) / 10000);
    band = "marginal";
  }
```

Leave the `profitPence <= 0` guard, the `effectiveRate: taxPence / profitPence` line, and the return shape unchanged.

- [ ] **Step 2: Add a guard test to `src/lib/tax/corporationTax.test.ts`**

Inside `describe("corporationTax (2025-26)", ...)`, add before its closing `});`:

```ts
  it("rounds half-up at a fraction-prone marginal input (basis points are exact)", () => {
    // £100,001 profit (marginal band): 100001_00×2500 − (250000_00−100001_00)×150
    // = 22,750,265,000 / 10,000 = 2,275,026.5p → half-up to 2,275,027p (£22,750.27).
    const r = corporationTax(100_001_00);
    expect(r.taxPence).toBe(2_275_027);
    expect(r.band).toBe("marginal");
  });
```

- [ ] **Step 3: Run the full suite + typecheck**

Run: `cd /home/ash/projects/akaunting-ng && npm test`
Expected: all pass (159 + 1 = 160). The existing CT cases (£40k→£7,600; £50k→£9,500; £300k→£75,000; £100k→£22,750; loss→0) must be unchanged. If a computed value changes, apply the test-value policy.

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tax/corporationTax.ts src/lib/tax/corporationTax.test.ts
git commit -m "refactor: integer basis-point arithmetic in corporation tax"
```

---

## Task 3: profit.ts financeCostReducer → basis points

**Files:**
- Modify: `src/lib/tax/profit.ts`
- Test: `src/lib/tax/profit.test.ts` (existing tests must stay green)

Note: the Section-24 reducer is a whole 20%, which can never produce a half-penny on integer pence, so there is no meaningful fraction-prone guard test to add here; the existing `profit.test.ts` cases plus the consistency with the other engines are sufficient. This task is purely the consistency change so no float rate remains in the tax module.

- [ ] **Step 1: Update `financeCostReducer` in `src/lib/tax/profit.ts`**

Replace:
```ts
export function financeCostReducer(financeCostsPence: number, profitPence: number): number {
  const base = Math.max(0, Math.min(financeCostsPence, profitPence));
  return Math.round(base * 0.2);
}
```
with:
```ts
export function financeCostReducer(financeCostsPence: number, profitPence: number): number {
  const base = Math.max(0, Math.min(financeCostsPence, profitPence));
  return Math.round(base * 2000 / 10000); // 2000 bps = 20% Section-24 basic-rate reducer
}
```

Leave the JSDoc comment above the function and the rest of `profit.ts` unchanged.

- [ ] **Step 2: Run the full suite + typecheck**

Run: `cd /home/ash/projects/akaunting-ng && npm test`
Expected: all pass (160). `profit.test.ts`, `summary.test.ts`, `scenario.test.ts` (which use the reducer) must be unchanged.

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `0`.

- [ ] **Step 3: Verify no float rate remains in the tax module**

Run: `grep -rnE '\* *0\.[0-9]+|3 */ *200' src/lib/tax/*.ts | grep -v '\.test\.' | grep -vE 'effectiveRate|marginalRate|penceToPounds|/ 100'`
Expected: no money-rate multiplications remain (matches may only be the `effectiveRate`/`marginalRate` display divisions, which are intentional). If a money `× 0.xx` line remains, convert it the same way.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tax/profit.ts
git commit -m "refactor: integer basis-point arithmetic in Section-24 finance reducer"
```

---

## Self-review notes (already reconciled)

- **Spec coverage:** bands.ts/incomeTax.ts (Task 1), corporationTax.ts (Task 2), profit.ts (Task 3); test-value policy embedded in each verify step; guard tests for the two fraction-capable engines (income Scottish `.5`, CT marginal `.5`); `effectiveRate`/`marginalRate` and the PA taper left as-is per spec.
- **Type consistency:** `rateBps`/`topRateBps` defined in Task 1 `bands.ts` and consumed in Task 1 `incomeTax.ts` and `bands.test.ts`; `smallBps`/`mainBps`/`marginalFractionBps` defined and consumed within Task 2 `corporationTax.ts`. No cross-task type drift.
- **Verified numbers:** all existing test values recompute identically under basis points (checked: EWNI £20k→£1,486; £60k→£11,432; £110k→£33,432; £130k→£44,703; Scotland £50k→£9,028.31; CT £40k→£7,600/£50k→£9,500/£100k→£22,750/£300k→£75,000). Guard values: Scottish £12,570.50→10p; CT £100,001→£22,750.27 (2_275_027p).
