# Dashboard, Reports & SA105 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn recorded transactions into the figures the user needs: a tax-year dashboard (income, expenses, profit, finance-cost relief, estimated tax) and an SA105 summary screen showing exactly what to enter on the Self Assessment property pages — with transaction filtering and CSV export.

**Architecture:** A single pure function `buildTaxYearSummary` composes the Plan 1 tax engine (`computeProfit`, `propertyAllowanceAdvice`, `financeCostReducer`, `estimatePropertyTax`, `sa105Boxes`) into one summary object — fully unit-tested. A thin server-only data wrapper loads a tax year's transactions (via the existing `listTransactionsForTaxYear` + `toTaxTxn`) and the `TaxYearProfile`, then calls it. Next.js pages render the dashboard and SA105 screen. Filtering is a pure where-clause builder; CSV export is a pure serialiser behind a route handler.

**Tech Stack:** Next.js 16 (App Router, server actions, route handlers), TypeScript, Prisma v7 + SQLite, Vitest.

This is Plan 3 of 3 for Phase 1. It completes the MVP. It also clears the Plan 2 follow-ups (listCategories wrapper, per-property materialisation, friendlier amount-validation errors, generate-count feedback).

**Carried-forward context from Plan 2 final review (addressed here):**
- `src/lib/data/categories.ts` was never created; pages call `prisma.category.findMany` directly → Task 1 adds `listCategories` and removes the direct calls.
- `materialiseDue` ignores `propertyId` → Task 1 scopes it.
- Bad amount input throws a raw 500 → Task 9 catches it and shows a message.
- `generateNowAction` discards the created count → Task 1 surfaces it.
- Prisma v7 + better-sqlite3 adapter: no `createMany skipDuplicates`; migrations via manual SQL + `prisma migrate deploy` then `prisma generate` (never `migrate dev`).

---

## File Structure

- `src/lib/data/categories.ts` — `listCategories()` wrapper (NEW)
- `src/lib/data/recurring.ts` — add optional `propertyId` to `materialiseDue` (MODIFY)
- `src/lib/data/taxProfile.ts` — get/create/update `TaxYearProfile` (NEW)
- `src/lib/tax/summary.ts` — `buildTaxYearSummary` pure composition (NEW)
- `src/lib/data/summary.ts` — `getTaxYearSummary(propertyId, taxYear)` server wrapper (NEW)
- `src/lib/reports/csv.ts` — `toCsv` pure serialiser (NEW)
- `src/app/(app)/dashboard/page.tsx` + `actions.ts` — dashboard + other-income form
- `src/app/(app)/sa105/page.tsx` — SA105 box summary
- `src/app/(app)/transactions/` — add filtering controls + error display (MODIFY)
- `src/app/(app)/export/transactions/route.ts` — CSV download route handler
- Nav update in `src/app/(app)/layout.tsx` (add Dashboard, SA105)

---

### Task 1: Plan 2 clean-ups (categories wrapper, per-property materialisation, generate count)

**Files:**
- Create: `src/lib/data/categories.ts`
- Test: `src/lib/data/categories.test.ts`
- Modify: `src/lib/data/recurring.ts`, `src/lib/data/recurring.test.ts`
- Modify: `src/app/(app)/transactions/page.tsx`, `src/app/(app)/recurring/page.tsx`, `src/app/(app)/recurring/actions.ts`

- [ ] **Step 1: Write the failing test for categories**

`src/lib/data/categories.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { listCategories } from "./categories";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => { await resetDb(); });

describe("listCategories", () => {
  it("returns the 9 seeded categories alphabetically", async () => {
    const cats = await listCategories();
    expect(cats).toHaveLength(9);
    const names = cats.map((c) => c.name);
    expect([...names]).toEqual([...names].sort());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/data/categories.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/data/categories.ts`**

```typescript
import "server-only";
import { prisma } from "../db";

export function listCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/data/categories.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace direct prisma category calls in pages**

In `src/app/(app)/transactions/page.tsx` and `src/app/(app)/recurring/page.tsx`: remove `import { prisma } from "../../../lib/db";`, add `import { listCategories } from "../../../lib/data/categories";`, and replace `prisma.category.findMany({ orderBy: { name: "asc" } })` with `listCategories()`.

- [ ] **Step 6: Scope `materialiseDue` to a property and add the failing test**

Add to `src/lib/data/recurring.test.ts` (inside the existing describe):

```typescript
  it("only materialises rules for the given property when propertyId is passed", async () => {
    const p1 = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    await createRecurringRule({
      propertyId: p1.id, categoryId, amountPence: 1000, direction: "in",
      frequency: "monthly", dayOfMonth: 1, startDate: new Date("2025-01-01"), endDate: null,
    });
    const created = await materialiseDue(new Date("2025-02-15"), p1.id);
    expect(created).toBe(2);
  });
```

- [ ] **Step 7: Run to verify it fails**

Run: `npm test src/lib/data/recurring.test.ts`
Expected: FAIL — `materialiseDue` takes only 1 argument.

- [ ] **Step 8: Modify `materialiseDue` in `src/lib/data/recurring.ts`**

Change the signature and the initial query:

```typescript
export async function materialiseDue(asOf: Date, propertyId?: string): Promise<number> {
  const rules = await prisma.recurringRule.findMany({
    where: propertyId ? { propertyId } : undefined,
  });
  // ...rest unchanged...
```

- [ ] **Step 9: Run to verify it passes**

Run: `npm test src/lib/data/recurring.test.ts`
Expected: PASS (all recurring tests, including the existing ones which call `materialiseDue(asOf)` with no propertyId).

- [ ] **Step 10: Surface the generated count in the recurring action**

In `src/app/(app)/recurring/actions.ts`, change `generateNowAction` to scope to the default property and redirect with a count:

```typescript
import { redirect } from "next/navigation";
// ...
export async function generateNowAction() {
  const property = await getOrCreateDefaultProperty();
  const count = await materialiseDue(new Date(), property.id);
  revalidatePath("/transactions");
  redirect(`/recurring?generated=${count}`);
}
```

Add to `src/app/(app)/recurring/page.tsx` signature `({ searchParams }: { searchParams: Promise<{ generated?: string }> })`, await it, and render a small banner when `generated` is present (e.g. `Generated N transaction(s).`). Note: in Next.js 16 `searchParams` is a Promise — `const { generated } = await searchParams;`.

- [ ] **Step 11: Verify build + full tests**

Run: `npm run build` (expect success) and `npm test` (expect all green, count = 50 + 2 new = 52).

- [ ] **Step 12: Commit**

```bash
git add -A && git commit -m "refactor: listCategories wrapper, per-property materialisation, generate-count feedback"
```

---

### Task 2: TaxYearProfile data layer

**Files:**
- Create: `src/lib/data/taxProfile.ts`
- Test: `src/lib/data/taxProfile.test.ts`

**Context:** The tax estimate needs the user's other (non-property) income, region, and allowance choice for the tax year. `TaxYearProfile` already exists in the schema (taxYear unique, otherIncomePence, region, basis, usePropertyAllowance).

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { getOrCreateProfile, updateProfile } from "./taxProfile";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => { await resetDb(); });

describe("tax year profile", () => {
  it("creates a default profile for a tax year and reuses it", async () => {
    const a = await getOrCreateProfile("2025-26");
    const b = await getOrCreateProfile("2025-26");
    expect(a.id).toBe(b.id);
    expect(a.otherIncomePence).toBe(0);
    expect(a.region).toBe("englandWalesNI");
    expect(a.usePropertyAllowance).toBe(false);
  });

  it("updates the profile", async () => {
    await getOrCreateProfile("2025-26");
    await updateProfile("2025-26", { otherIncomePence: 4_000_000, usePropertyAllowance: true });
    const p = await getOrCreateProfile("2025-26");
    expect(p.otherIncomePence).toBe(4_000_000);
    expect(p.usePropertyAllowance).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/data/taxProfile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/data/taxProfile.ts`**

```typescript
import "server-only";
import { prisma } from "../db";
import type { Region } from "../tax/types";

export function getOrCreateProfile(taxYear: string) {
  return prisma.taxYearProfile.upsert({
    where: { taxYear },
    update: {},
    create: { taxYear },
  });
}

export interface ProfileInput {
  otherIncomePence?: number;
  region?: Region;
  usePropertyAllowance?: boolean;
}

export async function updateProfile(taxYear: string, input: ProfileInput) {
  await prisma.taxYearProfile.upsert({
    where: { taxYear },
    update: input,
    create: { taxYear, ...input },
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/data/taxProfile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: tax-year profile data layer"
```

---

### Task 3: buildTaxYearSummary (the composition brain)

**Files:**
- Create: `src/lib/tax/summary.ts`
- Test: `src/lib/tax/summary.test.ts`

**Context:** Pure function composing the engine. Input: `TaxTxn[]` for the year, plus profile fields (otherIncomePence, region, usePropertyAllowance) and the taxYear label. Output: every figure the dashboard and SA105 screen need. Honours the user's allowance choice but also returns the auto-recommendation so the UI can nudge.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { buildTaxYearSummary } from "./summary";
import type { TaxTxn } from "./types";

const t = (over: Partial<TaxTxn>): TaxTxn => ({
  date: new Date("2025-06-01"), amountPence: 0, direction: "in",
  categoryKind: "income", allowable: true, sa105Box: null, ...over,
});

describe("buildTaxYearSummary", () => {
  const txns: TaxTxn[] = [
    t({ amountPence: 12_000_00, categoryKind: "income", direction: "in", sa105Box: "20" }),
    t({ amountPence: 2_000_00, categoryKind: "expense", direction: "out", sa105Box: "25" }),
    t({ amountPence: 3_000_00, categoryKind: "finance", direction: "out", sa105Box: "44" }),
  ];

  it("computes profit, finance costs, reducer, taxable profit and SA105 boxes (actual expenses)", () => {
    const s = buildTaxYearSummary(txns, {
      taxYear: "2025-26", otherIncomePence: 40_000_00, region: "englandWalesNI", usePropertyAllowance: false,
    });
    expect(s.incomePence).toBe(12_000_00);
    expect(s.expensesPence).toBe(2_000_00);
    expect(s.profitPence).toBe(10_000_00);
    expect(s.financeCostsPence).toBe(3_000_00);
    expect(s.taxableProfitPence).toBe(10_000_00); // expenses route
    expect(s.financeReducerPence).toBe(600_00);   // 20% of £3,000
    expect(s.sa105["20"]).toBe(12_000_00);
    expect(s.sa105["25"]).toBe(2_000_00);
    expect(s.sa105["44"]).toBe(3_000_00);
    // tax on £10,000 property profit stacked on £40k other income (basic rate) minus £600 reducer
    expect(s.estimatedTaxPence).toBe(10_000_00 * 0.2 - 600_00);
  });

  it("uses the £1,000 allowance when the user opts in", () => {
    const s = buildTaxYearSummary(txns, {
      taxYear: "2025-26", otherIncomePence: 40_000_00, region: "englandWalesNI", usePropertyAllowance: true,
    });
    expect(s.taxableProfitPence).toBe(11_000_00); // £12,000 income − £1,000 allowance
    expect(s.allowanceRecommended).toBe(false);    // actual expenses (£2,000) beat the £1,000 allowance
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/tax/summary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/tax/summary.ts`**

```typescript
import { computeProfit, propertyAllowanceAdvice, financeCostReducer } from "./profit";
import { estimatePropertyTax } from "./incomeTax";
import { sa105Boxes } from "./sa105";
import type { Region, TaxTxn } from "./types";

const PROPERTY_ALLOWANCE_PENCE = 1_000_00;

export interface SummaryProfile {
  taxYear: string;
  otherIncomePence: number;
  region: Region;
  usePropertyAllowance: boolean;
}

export interface TaxYearSummary {
  incomePence: number;
  expensesPence: number;
  profitPence: number;
  financeCostsPence: number;
  taxableProfitPence: number;
  financeReducerPence: number;
  estimatedTaxPence: number;
  marginalRate: number;
  allowanceRecommended: boolean;
  sa105: Record<string, number>;
}

export function buildTaxYearSummary(txns: TaxTxn[], profile: SummaryProfile): TaxYearSummary {
  const { incomePence, expensesPence, profitPence } = computeProfit(txns);

  const financeCostsPence = txns
    .filter((t) => t.allowable && t.categoryKind === "finance")
    .reduce((sum, t) => sum + t.amountPence, 0);

  const advice = propertyAllowanceAdvice(incomePence, expensesPence);

  const taxableProfitPence = profile.usePropertyAllowance
    ? Math.max(0, incomePence - PROPERTY_ALLOWANCE_PENCE)
    : Math.max(0, profitPence);

  const financeReducerPence = financeCostReducer(financeCostsPence, taxableProfitPence);

  const { taxOnPropertyPence, marginalRate } = estimatePropertyTax({
    otherIncomePence: profile.otherIncomePence,
    taxableProfitPence,
    financeReducerPence,
    taxYear: profile.taxYear,
    region: profile.region,
  });

  return {
    incomePence,
    expensesPence,
    profitPence,
    financeCostsPence,
    taxableProfitPence,
    financeReducerPence,
    estimatedTaxPence: taxOnPropertyPence,
    marginalRate,
    allowanceRecommended: advice.useAllowance,
    sa105: sa105Boxes(txns),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/tax/summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: buildTaxYearSummary composing the tax engine"
```

---

### Task 4: getTaxYearSummary data wrapper

**Files:**
- Create: `src/lib/data/summary.ts`
- Test: `src/lib/data/summary.test.ts`

**Context:** Loads a tax year's transactions and profile, maps via `toTaxTxn`, calls `buildTaxYearSummary`. Returns the summary plus the available tax years (distinct years that have transactions) so the dashboard can offer a selector.

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { getTaxYearSummary } from "./summary";
import { getOrCreateDefaultProperty } from "./property";
import { createTransaction } from "./transactions";
import { updateProfile } from "./taxProfile";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function cat(name: string) {
  const c = await prisma.category.findFirstOrThrow({ where: { name } });
  return c.id;
}
beforeEach(async () => { await resetDb(); });

describe("getTaxYearSummary", () => {
  it("aggregates a tax year's transactions through the engine", async () => {
    const property = await getOrCreateDefaultProperty();
    await updateProfile("2025-26", { otherIncomePence: 40_000_00 });
    await createTransaction({ propertyId: property.id, categoryId: await cat("Rent received"), date: new Date("2025-06-01"), amountPence: 12_000_00, direction: "in" });
    await createTransaction({ propertyId: property.id, categoryId: await cat("Property repairs and maintenance"), date: new Date("2025-07-01"), amountPence: 2_000_00, direction: "out" });

    const { summary } = await getTaxYearSummary(property.id, "2025-26");
    expect(summary.incomePence).toBe(12_000_00);
    expect(summary.expensesPence).toBe(2_000_00);
    expect(summary.profitPence).toBe(10_000_00);
    expect(summary.sa105["20"]).toBe(12_000_00);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/data/summary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/data/summary.ts`**

```typescript
import "server-only";
import { listTransactionsForTaxYear } from "./transactions";
import { getOrCreateProfile } from "./taxProfile";
import { toTaxTxn } from "../tax/fromPrisma";
import { buildTaxYearSummary, type TaxYearSummary } from "../tax/summary";
import type { Region } from "../tax/types";

export async function getTaxYearSummary(
  propertyId: string,
  taxYear: string,
): Promise<{ summary: TaxYearSummary; otherIncomePence: number; region: Region; usePropertyAllowance: boolean }> {
  const [rows, profile] = await Promise.all([
    listTransactionsForTaxYear(propertyId, taxYear),
    getOrCreateProfile(taxYear),
  ]);
  const txns = rows.map((r) => toTaxTxn(r));
  const summary = buildTaxYearSummary(txns, {
    taxYear,
    otherIncomePence: profile.otherIncomePence,
    region: profile.region as Region,
    usePropertyAllowance: profile.usePropertyAllowance,
  });
  return {
    summary,
    otherIncomePence: profile.otherIncomePence,
    region: profile.region as Region,
    usePropertyAllowance: profile.usePropertyAllowance,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/data/summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: getTaxYearSummary data wrapper"
```

---

### Task 5: CSV serialiser

**Files:**
- Create: `src/lib/reports/csv.ts`
- Test: `src/lib/reports/csv.test.ts`

**Context:** Pure function turning rows of `Record<string, string | number>` into a CSV string with a header row and RFC-4180 quoting (quotes around fields containing comma/quote/newline; embedded quotes doubled).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("writes a header row and values", () => {
    const csv = toCsv(["date", "amount"], [{ date: "2025-06-01", amount: "950.00" }]);
    expect(csv).toBe("date,amount\n2025-06-01,950.00");
  });
  it("quotes fields containing commas, quotes and newlines", () => {
    const csv = toCsv(["desc"], [{ desc: 'Rent, "June"' }]);
    expect(csv).toBe('desc\n"Rent, ""June"""');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/reports/csv.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/reports/csv.ts`**

```typescript
type Row = Record<string, string | number>;

function escape(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(columns: string[], rows: Row[]): string {
  const header = columns.map(escape).join(",");
  const body = rows.map((row) => columns.map((c) => escape(row[c] ?? "")).join(","));
  return [header, ...body].join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/reports/csv.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: CSV serialiser"
```

---

### Task 6: Nav + Dashboard page

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/dashboard/page.tsx`
- Create: `src/app/(app)/dashboard/actions.ts`

**Context:** The dashboard picks a tax year, lets the user enter their other (non-property) income for that year, and shows the summary: income, expenses, profit, finance-cost relief, taxable profit, and estimated tax — plus an allowance nudge. Default the tax year to the current one via `getTaxYear(new Date())`.

- [ ] **Step 1: Add Dashboard + SA105 to nav**

In `src/app/(app)/layout.tsx`, prepend to `NAV`:
```typescript
  { href: "/dashboard", label: "Dashboard" },
```
and after Recurring add:
```typescript
  { href: "/sa105", label: "SA105" },
```

- [ ] **Step 2: Create `src/app/(app)/dashboard/actions.ts`**

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateProfile } from "../../../lib/data/taxProfile";
import { parseAmountToPence } from "../../../lib/money/parseAmount";

export async function saveOtherIncomeAction(formData: FormData) {
  const taxYear = String(formData.get("taxYear"));
  const raw = String(formData.get("otherIncome") ?? "0").trim();
  const otherIncomePence = raw === "" ? 0 : parseAmountToPence(raw);
  await updateProfile(taxYear, { otherIncomePence });
  revalidatePath("/dashboard");
  redirect(`/dashboard?ty=${taxYear}`);
}
```

- [ ] **Step 3: Create `src/app/(app)/dashboard/page.tsx`**

```tsx
import { getOrCreateDefaultProperty } from "../../../lib/data/property";
import { getTaxYearSummary } from "../../../lib/data/summary";
import { getTaxYear } from "../../../lib/tax/taxYear";
import { formatGBP, penceToPounds } from "../../../lib/tax/money";
import { saveOtherIncomeAction } from "./actions";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ ty?: string }> }) {
  const { ty } = await searchParams;
  const taxYear = ty ?? getTaxYear(new Date());
  const property = await getOrCreateDefaultProperty();
  const { summary, otherIncomePence } = await getTaxYearSummary(property.id, taxYear);

  const Card = ({ label, pence, accent }: { label: string; pence: number; accent?: boolean }) => (
    <div className="rounded border p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold ${accent ? "text-green-700" : ""}`}>{formatGBP(pence)}</div>
    </div>
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <span className="text-gray-500">Tax year {taxYear}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card label="Rental income" pence={summary.incomePence} />
        <Card label="Allowable expenses" pence={summary.expensesPence} />
        <Card label="Profit" pence={summary.profitPence} />
        <Card label="Mortgage interest" pence={summary.financeCostsPence} />
        <Card label="Finance-cost relief (20%)" pence={summary.financeReducerPence} />
        <Card label="Estimated tax on property" pence={summary.estimatedTaxPence} accent />
      </div>

      <p className="text-sm text-gray-600">
        Taxable profit {formatGBP(summary.taxableProfitPence)} · marginal rate {(summary.marginalRate * 100).toFixed(0)}%.
        {summary.allowanceRecommended
          ? " Tip: the £1,000 property allowance would reduce your taxable profit more than your actual expenses — consider enabling it."
          : " You're better off claiming actual expenses than the £1,000 property allowance."}
      </p>

      <form action={saveOtherIncomeAction} className="flex items-end gap-2">
        <input type="hidden" name="taxYear" value={taxYear} />
        <label className="block">
          <span className="block text-sm">Your other (non-property) income this year</span>
          <input name="otherIncome" defaultValue={penceToPounds(otherIncomePence)} className="border px-2 py-1" />
        </label>
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Update estimate</button>
      </form>

      <p className="text-xs text-gray-400">
        Estimates only — not tax advice. Verify against the current SA105 notes before filing.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Verify build + manual check**

Run: `npm run build` (expect success).
Manual: `npm run dev`, add a few transactions for the current tax year on `/transactions`, set other income on `/dashboard`, confirm profit and estimated tax update sensibly.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: dashboard with tax estimate and allowance nudge"
```

---

### Task 7: SA105 summary page

**Files:**
- Create: `src/app/(app)/sa105/page.tsx`

**Context:** Shows each populated SA105 box with its label and total, so the user can copy the figures straight onto the return. Defaults to the current tax year; `?ty=` overrides.

- [ ] **Step 1: Create `src/app/(app)/sa105/page.tsx`**

```tsx
import { getOrCreateDefaultProperty } from "../../../lib/data/property";
import { getTaxYearSummary } from "../../../lib/data/summary";
import { getTaxYear } from "../../../lib/tax/taxYear";
import { formatGBP } from "../../../lib/tax/money";

const BOX_LABELS: Record<string, string> = {
  "20": "Total rents and other income from property",
  "21": "Other property income",
  "24": "Rent, rates, insurance, ground rents",
  "25": "Property repairs and maintenance",
  "27": "Legal, management and other professional fees",
  "28": "Costs of services provided, including wages",
  "29": "Other allowable property expenses",
  "44": "Residential finance costs (mortgage interest)",
};

export default async function Sa105Page({ searchParams }: { searchParams: Promise<{ ty?: string }> }) {
  const { ty } = await searchParams;
  const taxYear = ty ?? getTaxYear(new Date());
  const property = await getOrCreateDefaultProperty();
  const { summary } = await getTaxYearSummary(property.id, taxYear);

  const boxes = Object.keys(summary.sa105).sort((a, b) => Number(a) - Number(b));

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">SA105 summary — {taxYear}</h1>
      <p className="text-sm text-gray-600">
        Figures to enter on the UK property pages (SA105) of your Self Assessment. Box 44 (finance costs) is a
        20% basic-rate tax reducer, not a deduction.
      </p>
      <table className="w-full border">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="px-3 py-2 w-16">Box</th><th className="px-3 py-2">Description</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {boxes.map((box) => (
            <tr key={box} className="border-b">
              <td className="px-3 py-2 font-mono">{box}</td>
              <td className="px-3 py-2">{BOX_LABELS[box] ?? "—"}</td>
              <td className="px-3 py-2 text-right">{formatGBP(summary.sa105[box])}</td>
            </tr>
          ))}
          {boxes.length === 0 && <tr><td colSpan={3} className="px-3 py-2 text-gray-500">No data for this tax year.</td></tr>}
        </tbody>
      </table>
      <p className="text-xs text-gray-400">
        Box numbers reflect the 2025/26 SA105 — verify against the current year's form notes before filing.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + manual check**

Run: `npm run build` (expect success).
Manual: visit `/sa105`, confirm the seeded categories' boxes show the right totals matching the dashboard.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: SA105 summary screen"
```

---

### Task 8: Transaction filtering

**Files:**
- Create: `src/lib/data/transactionFilter.ts`
- Test: `src/lib/data/transactionFilter.test.ts`
- Modify: `src/app/(app)/transactions/page.tsx`

**Context:** A pure where-clause builder (testable without the DB) plus filter controls on the transactions page. Filters: tax year, category, direction.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { buildTransactionWhere } from "./transactionFilter";

describe("buildTransactionWhere", () => {
  it("always scopes to the property", () => {
    expect(buildTransactionWhere("prop1", {})).toEqual({ propertyId: "prop1" });
  });
  it("adds category and direction filters", () => {
    expect(buildTransactionWhere("prop1", { categoryId: "c1", direction: "out" }))
      .toEqual({ propertyId: "prop1", categoryId: "c1", direction: "out" });
  });
  it("adds a tax-year date range", () => {
    const where = buildTransactionWhere("prop1", { taxYear: "2025-26" });
    expect(where.propertyId).toBe("prop1");
    expect((where.date as { gte: Date }).gte.toISOString().slice(0, 10)).toBe("2025-04-06");
    expect((where.date as { lt: Date }).lt.toISOString().slice(0, 10)).toBe("2026-04-06");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/data/transactionFilter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/data/transactionFilter.ts`**

```typescript
import { taxYearRange } from "../tax/taxYear";
import type { Direction } from "../tax/types";

export interface TransactionFilter {
  taxYear?: string;
  categoryId?: string;
  direction?: Direction;
}

export interface TransactionWhere {
  propertyId: string;
  categoryId?: string;
  direction?: Direction;
  date?: { gte: Date; lt: Date };
}

export function buildTransactionWhere(propertyId: string, filter: TransactionFilter): TransactionWhere {
  const where: TransactionWhere = { propertyId };
  if (filter.categoryId) where.categoryId = filter.categoryId;
  if (filter.direction) where.direction = filter.direction;
  if (filter.taxYear) {
    const { start, end } = taxYearRange(filter.taxYear);
    where.date = { gte: start, lt: end };
  }
  return where;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/data/transactionFilter.test.ts`
Expected: PASS.

- [ ] **Step 5: Add a filtered query + wire filter controls**

In `src/lib/data/transactions.ts` add:

```typescript
import { buildTransactionWhere, type TransactionFilter } from "./transactionFilter";

export function listTransactionsFiltered(propertyId: string, filter: TransactionFilter) {
  return prisma.transaction.findMany({
    where: buildTransactionWhere(propertyId, filter),
    orderBy: { date: "desc" },
    include: { category: true, vendor: true },
  });
}
```

In `src/app/(app)/transactions/page.tsx`: accept `searchParams: Promise<{ taxYear?: string; categoryId?: string; direction?: string; error?: string }>`, await it, build a `TransactionFilter`, and use `listTransactionsFiltered(property.id, filter)` instead of `listTransactions`. Add a GET `<form>` (method defaults to GET via no action, using `<select name=...>` with the nav) above the table with a tax-year text input, a category `<select>`, a direction `<select>` (All/In/Out), and a "Filter" submit button. Submitting reloads `/transactions?...` with query params.

- [ ] **Step 6: Verify build + tests + manual**

Run: `npm run build` and `npm test` (expect all green). Manual: add transactions across two tax years; filter by year, category, direction; confirm the list narrows correctly.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: transaction filtering by tax year, category and direction"
```

---

### Task 9: CSV export route + friendlier amount errors

**Files:**
- Create: `src/app/(app)/export/transactions/route.ts`
- Modify: `src/app/(app)/transactions/page.tsx` (export link + error banner)
- Modify: `src/app/(app)/transactions/actions.ts` (catch parse errors)

**Context:** A route handler streams the (optionally filtered) transactions as a CSV download. The add action catches a bad amount and redirects back with an error message instead of throwing a 500.

- [ ] **Step 1: Create `src/app/(app)/export/transactions/route.ts`**

```typescript
import { getOrCreateDefaultProperty } from "../../../../lib/data/property";
import { listTransactionsFiltered } from "../../../../lib/data/transactions";
import type { TransactionFilter } from "../../../../lib/data/transactionFilter";
import { toCsv } from "../../../../lib/reports/csv";
import { penceToPounds } from "../../../../lib/tax/money";
import type { Direction } from "../../../../lib/tax/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const property = await getOrCreateDefaultProperty();
  const filter: TransactionFilter = {
    taxYear: url.searchParams.get("taxYear") ?? undefined,
    categoryId: url.searchParams.get("categoryId") ?? undefined,
    direction: (url.searchParams.get("direction") as Direction) || undefined,
  };
  const txns = await listTransactionsFiltered(property.id, filter);
  const rows = txns.map((t) => ({
    date: t.date.toISOString().slice(0, 10),
    direction: t.direction,
    category: t.category.name,
    vendor: t.vendor?.name ?? "",
    description: t.description ?? "",
    amount: penceToPounds(t.amountPence).toFixed(2),
  }));
  const csv = toCsv(["date", "direction", "category", "vendor", "description", "amount"], rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions.csv"`,
    },
  });
}
```

- [ ] **Step 2: Catch parse errors in the add action**

In `src/app/(app)/transactions/actions.ts`, wrap the parse + create in try/catch and redirect with an error on failure:

```typescript
import { redirect } from "next/navigation";
// ...
export async function addTransactionAction(formData: FormData) {
  const property = await getOrCreateDefaultProperty();
  let amountPence: number;
  try {
    amountPence = parseAmountToPence(String(formData.get("amount") ?? ""));
  } catch (e) {
    redirect(`/transactions?error=${encodeURIComponent((e as Error).message)}`);
  }
  await createTransaction({
    propertyId: property.id,
    categoryId: String(formData.get("categoryId")),
    date: new Date(String(formData.get("date"))),
    amountPence,
    direction: String(formData.get("direction")) as Direction,
    vendorId: String(formData.get("vendorId") ?? "") || null,
    description: String(formData.get("description") ?? "") || null,
  });
  revalidatePath("/transactions");
}
```

Note: `redirect` throws internally, so after the `catch` block `amountPence` is definitely assigned on the happy path; if TypeScript complains about use-before-assignment, declare `let amountPence!: number` or `return` after redirect.

- [ ] **Step 3: Add export link + error banner to the page**

In `src/app/(app)/transactions/page.tsx`: read `error` from awaited `searchParams`; if present, render a red banner above the form. Add an "Export CSV" link that points to `/export/transactions` carrying the current filter query string.

- [ ] **Step 4: Verify build + tests + manual**

Run: `npm run build` and `npm test` (expect all green). Manual: submit an invalid amount (`abc`) and confirm a friendly red message appears instead of a crash; click "Export CSV" and confirm a `transactions.csv` downloads with correct rows; apply a filter and confirm the export respects it.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: CSV export route and friendly amount-validation errors"
```

---

## Self-Review

**Spec coverage (Phase 1 reporting portion + Plan 2 follow-ups):**
- Dashboard with income/expenses/profit + estimated tax → Tasks 3, 4, 6. ✓
- SA105 summary screen → Tasks 3, 4, 7. ✓
- Tax estimate inputs (other income, region, allowance) → Task 2 (profile) + Task 6 (UI). ✓
- Filtering (tax year, category, direction) → Task 8. ✓
- CSV export → Tasks 5, 9. ✓
- listCategories wrapper + remove direct prisma calls → Task 1. ✓
- materialiseDue per-property → Task 1. ✓
- Generate-count feedback → Task 1. ✓
- Friendly amount-validation errors → Task 9. ✓
- (Deferred to a future plan: inline editing of transactions/vendors, PDF export, attachment upload UI, AI extraction, charts, multi-property UI, company mode. All explicitly out of Phase 1.)

**Placeholder scan:** No TBD/TODO. Each code step has complete code. UI wiring steps (Task 8 Step 5, Task 9 Step 3) describe concrete edits against named files with the exact data already shown in earlier steps.

**Type consistency:** `buildTaxYearSummary`/`TaxYearSummary` consumed unchanged by `getTaxYearSummary`; `SummaryProfile` fields match what `getTaxYearSummary` passes; `TransactionFilter`/`TransactionWhere` shared by `transactionFilter.ts`, `listTransactionsFiltered`, the page, and the export route; `formatGBP`/`penceToPounds` reused from Plan 1; `getTaxYear`/`taxYearRange` reused. `materialiseDue`'s new optional `propertyId` is backward-compatible with Plan 2's no-arg callers.

---

## Notes for the implementer

- Next.js 16: `searchParams` is a `Promise` in server components — always `await` it. Route handlers receive a standard `Request`; use `new URL(request.url).searchParams`.
- `getTaxYearSummary` calls `getOrCreateProfile`, which writes a row — acceptable (idempotent upsert) and keeps the dashboard simple.
- The estimated tax is a marginal estimate stacked on the user's stated other income — the UI already labels it "estimates only". Do not present it as a definitive liability.
- Keep all amounts in pence end-to-end; only convert to pounds for display (`penceToPounds`) or CSV.
