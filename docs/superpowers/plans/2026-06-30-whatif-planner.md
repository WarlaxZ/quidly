# What-If Tax Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/planner` page that pre-fills a tax scenario from real data and shows, side by side, the tax and take-home cash of holding property personally (actual costs vs £1,000 allowance) vs in a limited company (profits retained vs taken as dividends).

**Architecture:** A pure `runScenario` engine composes the existing income-tax, finance-reducer and corporation-tax functions plus a new pure `dividendTax`. A thin server-only loader pre-fills the engine's input from real transactions. A server-rendered page with a GET form (state in the URL, no persistence) shows the comparison. One pre-existing bug in `summary.ts` (finance reducer applied under the £1,000 allowance) is fixed.

**Tech Stack:** Next.js 16 (App Router, async `searchParams`), TypeScript, Prisma v7 + SQLite, Vitest. All money is integer pence.

---

## File Structure

- `src/lib/tax/dividendTax.ts` (new) — pure dividend-tax function + per-year config. No I/O.
- `src/lib/tax/dividendTax.test.ts` (new) — unit tests.
- `src/lib/tax/summary.ts` (modify) — finance-reducer-under-allowance fix.
- `src/lib/tax/summary.test.ts` (modify) — regression test for the fix.
- `src/lib/tax/scenario.ts` (new) — pure `runScenario` engine. Composes existing tax fns + `dividendTax`.
- `src/lib/tax/scenario.test.ts` (new) — unit tests.
- `src/lib/data/scenarioInput.ts` (new) — server-only loader pre-filling `ScenarioInput` from real transactions.
- `src/lib/data/scenarioInput.test.ts` (new) — integration tests (test DB).
- `src/app/(app)/planner/page.tsx` (new) — the planner page (GET form + comparison).
- `src/app/(app)/layout.tsx` (modify) — add the "Planner" nav link.

Build order: dividend tax → summary fix → scenario engine → loader → page. Each task is independently testable.

---

## Task 1: Dividend-tax function

**Files:**
- Create: `src/lib/tax/dividendTax.ts`
- Test: `src/lib/tax/dividendTax.test.ts`

Dividends are taxed as the **top slice** of income. Rates (2025/26): £500 dividend allowance at 0% (still occupies band space), then 8.75% (ordinary), 33.75% (upper), 39.35% (additional). Band boundaries in **total income** terms: ordinary up to `personalAllowance + 37,700`; upper up to `125,140`; additional above. **UK-wide regardless of region** — there is deliberately no `region` parameter. The personal-allowance taper above £100,000 uses total income (other income + dividend).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/tax/dividendTax.test.ts
import { describe, expect, it } from "vitest";
import { dividendTax } from "./dividendTax";

describe("dividendTax (2025-26)", () => {
  it("is zero within the £500 dividend allowance", () => {
    expect(dividendTax(400_00, 20_000_00, "2025-26")).toBe(0);
  });

  it("taxes an ordinary-band dividend at 8.75% after the allowance", () => {
    // other 20,000 leaves the dividend entirely in the basic band.
    // (10,000 - 500 allowance) * 8.75% = 831.25
    expect(dividendTax(10_000_00, 20_000_00, "2025-26")).toBe(831_25);
  });

  it("splits a dividend straddling the basic→higher threshold", () => {
    // other 45,000; PA 12,570; basic top = 50,270.
    // dividend 10,000 sits 45,000→55,000. First 500 at 0%.
    // 45,000→50,270 = 5,270; minus 500 allowance = 4,770 @ 8.75% = 417.375
    // 50,270→55,000 = 4,730 @ 33.75% = 1,596.375
    // total = 2,013.75
    expect(dividendTax(10_000_00, 45_000_00, "2025-26")).toBe(2_013_75);
  });

  it("taxes an additional-rate dividend at 39.35% (personal allowance fully tapered)", () => {
    // other 200,000 → PA 0; dividend all in additional band.
    // (10,000 - 500) * 39.35% = 3,738.25
    expect(dividendTax(10_000_00, 200_000_00, "2025-26")).toBe(3_738_25);
  });

  it("returns 0 for a non-positive dividend", () => {
    expect(dividendTax(0, 20_000_00, "2025-26")).toBe(0);
    expect(dividendTax(-5_00, 20_000_00, "2025-26")).toBe(0);
  });

  it("falls back to the latest year's config for an unknown year", () => {
    expect(dividendTax(10_000_00, 20_000_00, "2099-00")).toBe(831_25);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/tax/dividendTax.test.ts`
Expected: FAIL — "Failed to resolve import './dividendTax'".

- [ ] **Step 3: Implement `dividendTax`**

```ts
// src/lib/tax/dividendTax.ts

export interface DividendRates {
  allowancePence: number;        // 0% dividend allowance (still occupies band space)
  personalAllowancePence: number;
  paTaperStartPence: number;     // income above which the personal allowance tapers
  basicLimitPence: number;       // width of the basic-rate band above the personal allowance
  additionalStartPence: number;  // total income at which the additional rate begins
  ordinaryRate: number;
  upperRate: number;
  additionalRate: number;
}

const DIVIDEND_2025_26: DividendRates = {
  allowancePence: 500_00,
  personalAllowancePence: 12_570_00,
  paTaperStartPence: 100_000_00,
  basicLimitPence: 37_700_00,
  additionalStartPence: 125_140_00,
  ordinaryRate: 0.0875,
  upperRate: 0.3375,
  additionalRate: 0.3935,
};

const DIVIDEND_RATES: Record<string, DividendRates> = { "2025-26": DIVIDEND_2025_26 };
const LATEST_YEAR = "2025-26";

function effectivePersonalAllowance(totalIncomePence: number, r: DividendRates): number {
  if (totalIncomePence <= r.paTaperStartPence) return r.personalAllowancePence;
  const reduced = r.personalAllowancePence - Math.floor((totalIncomePence - r.paTaperStartPence) / 2);
  return Math.max(0, reduced);
}

/**
 * UK dividend tax on `dividendPence`, treated as the top slice of income above `otherIncomePence`.
 * Region-independent by design: Scotland's separate income-tax bands do NOT apply to dividends.
 * v1 assumption: dividends are the top slice; the personal-allowance taper uses total income.
 */
export function dividendTax(dividendPence: number, otherIncomePence: number, taxYear: string): number {
  if (dividendPence <= 0) return 0;
  const r = DIVIDEND_RATES[taxYear] ?? DIVIDEND_RATES[LATEST_YEAR];
  const total = otherIncomePence + dividendPence;
  const pa = effectivePersonalAllowance(total, r);
  const basicTop = pa + r.basicLimitPence;   // total-income boundary: ordinary → upper
  const addStart = r.additionalStartPence;   // total-income boundary: upper → additional

  // The taxable dividend is the part of [otherIncome, total] above the personal allowance.
  let cursor = Math.max(otherIncomePence, pa);
  let remaining = Math.max(0, total - cursor);
  let allowanceLeft = r.allowancePence;
  let tax = 0;

  while (remaining > 0) {
    let rate: number;
    let bandEnd: number;
    if (cursor < basicTop) { rate = r.ordinaryRate; bandEnd = basicTop; }
    else if (cursor < addStart) { rate = r.upperRate; bandEnd = addStart; }
    else { rate = r.additionalRate; bandEnd = Infinity; }

    const slice = Math.min(remaining, bandEnd - cursor);
    const zeroPart = Math.min(slice, allowanceLeft); // dividend allowance: 0% but uses band space
    tax += (slice - zeroPart) * rate;
    allowanceLeft -= zeroPart;
    cursor += slice;
    remaining -= slice;
  }

  return Math.round(tax);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/tax/dividendTax.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/dividendTax.ts src/lib/tax/dividendTax.test.ts
git commit -m "feat: pure UK dividend-tax function"
```

---

## Task 2: Fix the finance-reducer-under-allowance bug in `summary.ts`

**Files:**
- Modify: `src/lib/tax/summary.ts:35`
- Test: `src/lib/tax/summary.test.ts` (add one test)

When the £1,000 property allowance is elected it is in lieu of *all* actual costs, including finance costs — so the Section-24 finance reducer must not also be applied. Currently `buildTaxYearSummary` computes the reducer regardless.

- [ ] **Step 1: Write the failing regression test**

Add this test inside the existing `describe` block in `src/lib/tax/summary.test.ts` (append it as a new `it(...)` before the closing `});` of the describe):

```ts
  it("applies NO finance reducer when the £1,000 property allowance is elected", () => {
    const txns: TaxTxn[] = [
      { date: new Date("2025-06-01"), amountPence: 12_000_00, direction: "in", categoryKind: "income", allowable: true, sa105Box: "20" },
      { date: new Date("2025-06-02"), amountPence: 5_000_00, direction: "out", categoryKind: "finance", allowable: true, sa105Box: "44" },
    ];
    const summary = buildTaxYearSummary(txns, {
      taxYear: "2025-26",
      otherIncomePence: 40_000_00,
      region: "englandWalesNI",
      usePropertyAllowance: true,
    });
    expect(summary.financeReducerPence).toBe(0);
  });
```

If `summary.test.ts` does not already import `TaxTxn`, add `import type { TaxTxn } from "./types";` at the top (check the existing imports first; the file already imports `buildTaxYearSummary`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/tax/summary.test.ts -t "NO finance reducer"`
Expected: FAIL — `financeReducerPence` is `1_000_00` (20% of the £5,000 finance cost), not `0`.

- [ ] **Step 3: Apply the fix**

In `src/lib/tax/summary.ts`, replace the finance-reducer line. The current line (35) is:

```ts
  const financeReducerPence = financeCostReducer(financeCostsPence, taxableProfitPence);
```

Replace it with:

```ts
  // The £1,000 property allowance is in lieu of ALL actual costs, including finance costs,
  // so the Section-24 finance reducer does not apply when the allowance is elected.
  const financeReducerPence = profile.usePropertyAllowance
    ? 0
    : financeCostReducer(financeCostsPence, taxableProfitPence);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/tax/summary.test.ts`
Expected: PASS (all existing tests + the new one).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/summary.ts src/lib/tax/summary.test.ts
git commit -m "fix: no finance-cost reducer when the £1,000 property allowance is elected"
```

---

## Task 3: Scenario engine

**Files:**
- Create: `src/lib/tax/scenario.ts`
- Test: `src/lib/tax/scenario.test.ts`

`runScenario` returns four outcomes. `pocketPence` is cash in the person's pocket after all tax, with the mortgage and expenses subtracted in every world (so the columns are directly comparable). It composes `estimatePropertyTax`, `financeCostReducer`, `corporationTax`, `dividendTax`, and `formatGBP`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/tax/scenario.test.ts
import { describe, expect, it } from "vitest";
import { runScenario, type ScenarioInput } from "./scenario";

const base: ScenarioInput = {
  incomePence: 12_000_00,
  expensesPence: 2_000_00,
  financeCostsPence: 5_000_00,
  otherIncomePence: 40_000_00,
  taxYear: "2025-26",
  region: "englandWalesNI",
};

function byKey(input: ScenarioInput) {
  const { outcomes } = runScenario(input);
  return Object.fromEntries(outcomes.map((o) => [o.key, o]));
}

describe("runScenario (worked landlord case)", () => {
  it("personal — actual costs: 20% on £10k profit, less £1k finance reducer", () => {
    const o = byKey(base)["personal-actual"];
    expect(o.taxPence).toBe(1_000_00);   // £2,000 income tax − £1,000 reducer
    expect(o.pocketPence).toBe(4_000_00); // 12,000 − 2,000 − 5,000 − 1,000
  });

  it("personal — £1,000 allowance: no finance reducer, taxed on income−£1,000", () => {
    const o = byKey(base)["personal-allowance"];
    expect(o.taxPence).toBe(2_346_00);   // tax on (40k+11k) − tax on 40k, no reducer
    expect(o.pocketPence).toBe(2_654_00); // 12,000 − 2,000 − 5,000 − 2,346
  });

  it("company — profits retained: corporation tax only, nothing in pocket", () => {
    const o = byKey(base)["company-retained"];
    expect(o.taxPence).toBe(950_00);     // £5,000 profit × 19%
    expect(o.pocketPence).toBe(0);       // money stays in the company
    expect(o.note).toContain("4,050");   // £4,050 retained (5,000 − 950)
  });

  it("company — taken as dividends: corporation tax + dividend tax", () => {
    const o = byKey(base)["company-dividends"];
    // CT £950; distributable £4,050; dividend tax = (4,050 − 500) × 8.75% = 310.625 → 310.63
    expect(o.taxPence).toBe(1_260_63);   // 950.00 + 310.63
    expect(o.pocketPence).toBe(3_739_37); // 5,000 − 950 − 310.63
  });

  it("returns exactly the four outcomes in order", () => {
    const { outcomes } = runScenario(base);
    expect(outcomes.map((o) => o.key)).toEqual([
      "personal-actual", "personal-allowance", "company-retained", "company-dividends",
    ]);
  });
});

describe("runScenario (loss case)", () => {
  it("never produces negative tax and keeps pockets sensible", () => {
    const o = byKey({ ...base, incomePence: 3_000_00, expensesPence: 2_000_00, financeCostsPence: 5_000_00 });
    expect(o["personal-actual"].taxPence).toBe(0);
    expect(o["company-retained"].taxPence).toBe(0);
    expect(o["company-dividends"].taxPence).toBe(0);
    // profit = 3,000 − 2,000 − 5,000 = −4,000; nothing to distribute
    expect(o["company-dividends"].pocketPence).toBe(-4_000_00);
    expect(o["company-retained"].note).toContain("loss");
  });
});

describe("runScenario (region affects only personal income tax, not dividends)", () => {
  it("uses UK dividend thresholds even for a Scottish taxpayer", () => {
    const eng = byKey({ ...base, region: "englandWalesNI" })["company-dividends"];
    const sco = byKey({ ...base, region: "scotland" })["company-dividends"];
    // company-dividends tax = CT + dividend tax; both are region-independent.
    expect(sco.taxPence).toBe(eng.taxPence);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/tax/scenario.test.ts`
Expected: FAIL — "Failed to resolve import './scenario'".

- [ ] **Step 3: Implement `runScenario`**

```ts
// src/lib/tax/scenario.ts
import { estimatePropertyTax } from "./incomeTax";
import { financeCostReducer } from "./profit";
import { corporationTax } from "./corporationTax";
import { dividendTax } from "./dividendTax";
import { formatGBP } from "./money";
import type { Region } from "./types";

const PROPERTY_ALLOWANCE_PENCE = 1_000_00;

export interface ScenarioInput {
  incomePence: number;
  expensesPence: number;       // allowable expenses excluding finance
  financeCostsPence: number;   // mortgage / loan interest
  otherIncomePence: number;    // the person's non-property income
  taxYear: string;             // e.g. "2025-26"
  region: Region;              // affects personal income tax only
}

export type OutcomeKey = "personal-actual" | "personal-allowance" | "company-retained" | "company-dividends";

export interface Outcome {
  key: OutcomeKey;
  label: string;
  taxPence: number;     // total tax in this world
  pocketPence: number;  // cash in the person's pocket after all tax
  note: string;
}

export interface ScenarioResult {
  outcomes: Outcome[];
}

export function runScenario(input: ScenarioInput): ScenarioResult {
  const { incomePence, expensesPence, financeCostsPence, otherIncomePence, taxYear, region } = input;

  // Expenses and the mortgage are really paid in every world; subtract them everywhere
  // so pocketPence is directly comparable across outcomes.
  const realCostsPence = expensesPence + financeCostsPence;

  // --- Personal: actual costs ---
  const actualTaxable = Math.max(0, incomePence - expensesPence);
  const actualReducer = financeCostReducer(financeCostsPence, actualTaxable);
  const actualTax = estimatePropertyTax({
    otherIncomePence, taxableProfitPence: actualTaxable, financeReducerPence: actualReducer, taxYear, region,
  }).taxOnPropertyPence;
  const personalActual: Outcome = {
    key: "personal-actual",
    label: "Personal — actual costs",
    taxPence: actualTax,
    pocketPence: incomePence - realCostsPence - actualTax,
    note: "Income tax on your profit, with 20% Section-24 relief on the mortgage interest.",
  };

  // --- Personal: £1,000 property allowance (no finance reducer) ---
  const allowanceTaxable = Math.max(0, incomePence - PROPERTY_ALLOWANCE_PENCE);
  const allowanceTax = estimatePropertyTax({
    otherIncomePence, taxableProfitPence: allowanceTaxable, financeReducerPence: 0, taxYear, region,
  }).taxOnPropertyPence;
  const personalAllowance: Outcome = {
    key: "personal-allowance",
    label: "Personal — £1,000 allowance",
    taxPence: allowanceTax,
    pocketPence: incomePence - realCostsPence - allowanceTax,
    note: "The £1,000 allowance replaces all actual costs — no separate mortgage relief.",
  };

  // --- Company: mortgage fully deductible ---
  const companyProfit = incomePence - realCostsPence;
  const ct = corporationTax(companyProfit, taxYear).taxPence;
  const retainedPence = companyProfit - ct;
  const companyRetained: Outcome = {
    key: "company-retained",
    label: "Company — profits retained",
    taxPence: ct,
    pocketPence: 0,
    note: companyProfit > 0
      ? `${formatGBP(retainedPence)} kept in the company (not in your pocket until you extract it).`
      : "Company made a loss this period — nothing to retain.",
  };

  // --- Company: profits taken as dividends ---
  const distributablePence = Math.max(0, retainedPence);
  const divTax = dividendTax(distributablePence, otherIncomePence, taxYear);
  const companyDividends: Outcome = {
    key: "company-dividends",
    label: "Company — taken as dividends",
    taxPence: ct + divTax,
    pocketPence: companyProfit - ct - divTax,
    note: "Corporation tax, then dividend tax to take the profit out to yourself.",
  };

  return { outcomes: [personalActual, personalAllowance, companyRetained, companyDividends] };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/tax/scenario.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/scenario.ts src/lib/tax/scenario.test.ts
git commit -m "feat: pure what-if scenario engine (personal vs company)"
```

---

## Task 4: Scenario-input loader

**Files:**
- Create: `src/lib/data/scenarioInput.ts`
- Test: `src/lib/data/scenarioInput.test.ts`

Server-only. Pre-fills a `ScenarioInput` from real transactions for a tax year and basis (`"all"` personal properties, or a single `propertyId`). Company-owned properties are excluded via `property: { ownershipType: "personal" }`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/data/scenarioInput.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { getScenarioInput } from "./scenarioInput";
import { createProperty } from "./property";
import { createTransaction } from "./transactions";
import { updateProfile } from "./taxProfile";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function cat(name: string) {
  return (await prisma.category.findFirstOrThrow({ where: { name } })).id;
}
beforeEach(async () => { await resetDb(); });

describe("getScenarioInput", () => {
  it("sums income, expenses and finance for one personal property; reads profile", async () => {
    const a = await createProperty({ name: "A", ownershipType: "personal" });
    await updateProfile("2025-26", { otherIncomePence: 40_000_00, region: "scotland" });
    const rent = await cat("Rent received");
    const repairs = await cat("Property repairs and maintenance");
    const mortgage = await cat("Mortgage / loan interest");
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 12_000_00, direction: "in" });
    await createTransaction({ propertyId: a.id, categoryId: repairs, date: new Date("2025-06-02"), amountPence: 2_000_00, direction: "out" });
    await createTransaction({ propertyId: a.id, categoryId: mortgage, date: new Date("2025-06-03"), amountPence: 5_000_00, direction: "out" });

    const input = await getScenarioInput({ taxYear: "2025-26", basis: a.id });
    expect(input).toEqual({
      incomePence: 12_000_00,
      expensesPence: 2_000_00,
      financeCostsPence: 5_000_00,
      otherIncomePence: 40_000_00,
      taxYear: "2025-26",
      region: "scotland",
    });
  });

  it("'all' basis combines personal properties and excludes company ones", async () => {
    const a = await createProperty({ name: "A", ownershipType: "personal" });
    const b = await createProperty({ name: "B", ownershipType: "personal" });
    const co = await createProperty({ name: "Co", ownershipType: "company" });
    const rent = await cat("Rent received");
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 7_000_00, direction: "in" });
    await createTransaction({ propertyId: b.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 3_000_00, direction: "in" });
    await createTransaction({ propertyId: co.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 9_000_00, direction: "in" });

    const input = await getScenarioInput({ taxYear: "2025-26", basis: "all" });
    expect(input.incomePence).toBe(10_000_00); // company's 9,000 excluded
  });

  it("a single-property basis ignores transactions outside the tax year", async () => {
    const a = await createProperty({ name: "A", ownershipType: "personal" });
    const rent = await cat("Rent received");
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 1_000_00, direction: "in" });
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2024-06-01"), amountPence: 9_999_00, direction: "in" });
    const input = await getScenarioInput({ taxYear: "2025-26", basis: a.id });
    expect(input.incomePence).toBe(1_000_00);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/data/scenarioInput.test.ts`
Expected: FAIL — "Failed to resolve import './scenarioInput'".

- [ ] **Step 3: Implement `getScenarioInput`**

```ts
// src/lib/data/scenarioInput.ts
import "server-only";
import { prisma } from "../db";
import { taxYearRange } from "../tax/taxYear";
import { getOrCreateProfile } from "./taxProfile";
import { toTaxTxn } from "../tax/fromPrisma";
import type { ScenarioInput } from "../tax/scenario";
import type { Region } from "../tax/types";

export async function getScenarioInput(opts: { taxYear: string; basis: "all" | string }): Promise<ScenarioInput> {
  const { taxYear, basis } = opts;
  const { start, end } = taxYearRange(taxYear);

  // Always restrict to personal properties; a company-owned property passed as the basis
  // therefore contributes nothing (its data belongs to the company accounts).
  const where =
    basis === "all"
      ? { date: { gte: start, lt: end }, property: { ownershipType: "personal" as const } }
      : { date: { gte: start, lt: end }, propertyId: basis, property: { ownershipType: "personal" as const } };

  const [rows, profile] = await Promise.all([
    prisma.transaction.findMany({ where, include: { category: true } }),
    getOrCreateProfile(taxYear),
  ]);

  let incomePence = 0;
  let expensesPence = 0;
  let financeCostsPence = 0;
  for (const r of rows) {
    const t = toTaxTxn(r);
    if (!t.allowable) continue;
    if (t.categoryKind === "income") incomePence += t.amountPence;
    else if (t.categoryKind === "expense") expensesPence += t.amountPence;
    else if (t.categoryKind === "finance") financeCostsPence += t.amountPence;
  }

  return {
    incomePence,
    expensesPence,
    financeCostsPence,
    otherIncomePence: profile.otherIncomePence,
    taxYear,
    region: profile.region as Region,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/data/scenarioInput.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/scenarioInput.ts src/lib/data/scenarioInput.test.ts
git commit -m "feat: scenario-input loader (pre-fill from real transactions)"
```

---

## Task 5: The `/planner` page + nav link

**Files:**
- Create: `src/app/(app)/planner/page.tsx`
- Modify: `src/app/(app)/layout.tsx:17` (add the nav entry)

A server component. Reads `searchParams` (a Promise in Next 16): `ty`, `basis`, and optional overrides `income`, `expenses`, `finance`, `other`, `region` (all in pounds for the figures). Loads the real-data pre-fill, applies any overrides, runs the scenario, and renders a GET form plus the four-outcome comparison with the best in-pocket highlighted. No persistence.

- [ ] **Step 1: Add the nav link**

In `src/app/(app)/layout.tsx`, the `nav` array currently ends with:

```ts
    { href: "/properties", label: "Properties" },
    { href: "/companies", label: "Companies" },
  ];
```

Change it to add the Planner entry:

```ts
    { href: "/properties", label: "Properties" },
    { href: "/companies", label: "Companies" },
    { href: "/planner", label: "Planner" },
  ];
```

- [ ] **Step 2: Create the page**

```tsx
// src/app/(app)/planner/page.tsx
import { listProperties } from "../../../lib/data/activeProperty";
import { getScenarioInput } from "../../../lib/data/scenarioInput";
import { runScenario, type ScenarioInput } from "../../../lib/tax/scenario";
import { getTaxYear } from "../../../lib/tax/taxYear";
import { formatGBP, penceToPounds, poundsToPence } from "../../../lib/tax/money";
import type { Region } from "../../../lib/tax/types";

type Search = {
  ty?: string; basis?: string;
  income?: string; expenses?: string; finance?: string; other?: string; region?: string;
};

// A pounds override wins over the loaded figure only when it is a valid non-negative number.
function overridePence(raw: string | undefined, fallbackPence: number): number {
  if (raw === undefined || raw === "") return fallbackPence;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallbackPence;
  return poundsToPence(n);
}

export default async function PlannerPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const taxYear = sp.ty ?? getTaxYear(new Date());
  const basis = sp.basis ?? "all";

  const properties = await listProperties();
  const personalProperties = properties.filter((p) => p.ownershipType === "personal");

  const loaded = await getScenarioInput({ taxYear, basis });
  const region: Region = sp.region === "scotland" || sp.region === "englandWalesNI" ? sp.region : loaded.region;

  const input: ScenarioInput = {
    incomePence: overridePence(sp.income, loaded.incomePence),
    expensesPence: overridePence(sp.expenses, loaded.expensesPence),
    financeCostsPence: overridePence(sp.finance, loaded.financeCostsPence),
    otherIncomePence: overridePence(sp.other, loaded.otherIncomePence),
    taxYear,
    region,
  };

  const { outcomes } = runScenario(input);
  const best = outcomes.reduce((a, b) => (b.pocketPence > a.pocketPence ? b : a));

  const startYear = Number(taxYear.slice(0, 4));
  const yearOptions = [startYear - 1, startYear, startYear + 1].map((y) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">What-if planner</h1>
        <span className="text-gray-500">Tax year {taxYear}</span>
      </div>
      <p className="text-sm text-gray-600">
        Compare the tax and the cash you keep under each way of holding your property. Figures are
        pre-filled from your records — change any of them to test a different scenario.
      </p>

      <form method="get" className="grid grid-cols-2 gap-3 rounded border p-4 md:grid-cols-3">
        <label className="block">
          <span className="block text-sm">Tax year</span>
          <select name="ty" defaultValue={taxYear} className="w-full border px-2 py-1">
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-sm">Based on</span>
          <select name="basis" defaultValue={basis} className="w-full border px-2 py-1">
            <option value="all">All personal properties</option>
            {personalProperties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-sm">Tax region</span>
          <select name="region" defaultValue={region} className="w-full border px-2 py-1">
            <option value="englandWalesNI">England / Wales / NI</option>
            <option value="scotland">Scotland</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-sm">Rental income (£/yr)</span>
          <input name="income" defaultValue={penceToPounds(input.incomePence)} className="w-full border px-2 py-1" />
        </label>
        <label className="block">
          <span className="block text-sm">Expenses (£/yr)</span>
          <input name="expenses" defaultValue={penceToPounds(input.expensesPence)} className="w-full border px-2 py-1" />
        </label>
        <label className="block">
          <span className="block text-sm">Mortgage interest (£/yr)</span>
          <input name="finance" defaultValue={penceToPounds(input.financeCostsPence)} className="w-full border px-2 py-1" />
        </label>
        <label className="block">
          <span className="block text-sm">Your other income (£/yr)</span>
          <input name="other" defaultValue={penceToPounds(input.otherIncomePence)} className="w-full border px-2 py-1" />
        </label>
        <div className="col-span-2 flex items-end gap-3 md:col-span-3">
          <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Compare</button>
          <a href={`/planner?ty=${taxYear}&basis=${basis}`} className="text-sm text-blue-600 hover:underline">Reset to my real figures</a>
        </div>
      </form>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {outcomes.map((o) => (
          <div key={o.key} className={`rounded border p-4 ${o.key === best.key ? "border-green-600 ring-1 ring-green-600" : ""}`}>
            <div className="text-sm font-medium">{o.label}</div>
            <div className="mt-2 text-xs text-gray-500">Tax</div>
            <div className="text-lg font-semibold">{formatGBP(o.taxPence)}</div>
            <div className="mt-2 text-xs text-gray-500">In your pocket</div>
            <div className={`text-2xl font-semibold ${o.key === best.key ? "text-green-700" : ""}`}>{formatGBP(o.pocketPence)}</div>
            <p className="mt-2 text-xs text-gray-500">{o.note}</p>
          </div>
        ))}
      </div>

      <p className="text-sm text-gray-700">
        On these figures, <strong>{best.label}</strong> keeps the most in your pocket: {formatGBP(best.pocketPence)}.
      </p>

      <p className="text-xs text-gray-400">
        Estimate only — not tax advice. It compares tax alone and ignores incorporation costs, capital
        gains tax and stamp duty on transferring a property into a company, typically higher company
        mortgage rates, and accountancy fees. Talk to an accountant before deciding.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"`
Expected: `0`. (If the editor shows stale "module not found" for the new files, the `tsc` count is the source of truth.)

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: all tests pass (previous total + the new dividend/scenario/summary/loader tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/planner/page.tsx src/app/\(app\)/layout.tsx
git commit -m "feat: /planner what-if comparison page"
```

---

## Self-review notes (already reconciled)

- **Spec coverage:** dividend tax (Task 1), `summary.ts` fix (Task 2), scenario engine with all four outcomes + pocket semantics (Task 3), real-data loader with company exclusion (Task 4), `/planner` GET form + comparison + caveat + nav (Task 5). The live-run is performed after Task 5 by the executing skill.
- **Type consistency:** `ScenarioInput` (incomePence, expensesPence, financeCostsPence, otherIncomePence, taxYear, region) and `Outcome` (key, label, taxPence, pocketPence, note) are defined in Task 3 and consumed unchanged in Tasks 4–5. `getScenarioInput({ taxYear, basis })` returns exactly `ScenarioInput`. `dividendTax(dividendPence, otherIncomePence, taxYear)` (no region) is used in Task 3.
- **Worked numbers** in the Task 3 tests were computed against the real engine values (England/Wales/NI 2025/26): personal-actual tax £1,000 / pocket £4,000; personal-allowance £2,346 / £2,654; company-retained £950 / £0 (retain £4,050); company-dividends £1,260.63 / £3,739.37.
