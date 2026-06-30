# Foundation & Tax Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the self-hosted Next.js app skeleton with a SQLite/Prisma data model, seeded UK tax categories, and a fully unit-tested pure tax engine that turns transactions into SA105 figures and an income-tax estimate.

**Architecture:** A single Next.js (App Router) TypeScript project. Persistence via Prisma + SQLite. All tax/money logic lives in a pure, dependency-free module under `src/lib/tax/` (no React, no Prisma imports) so it is trivially unit-testable with Vitest. Money is handled exclusively as integer **pence**. Tax bands live in versioned per-year config.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Prisma, SQLite, Vitest, Tailwind CSS.

This plan is Plan 1 of 3 for Phase 1. It produces a running app skeleton plus a tested tax engine — working, testable software on its own. Plans 2 (data-entry CRUD + recurring) and 3 (dashboard/reports/filtering/CSV) follow.

---

## File Structure

- `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts` — project config
- `prisma/schema.prisma` — the 7-table data model
- `prisma/seed.ts` — seeds UK categories with SA105 box mapping
- `src/lib/tax/taxYear.ts` — UK tax-year bucketing (date → "2025-26")
- `src/lib/tax/bands.ts` — versioned per-year income-tax band config
- `src/lib/tax/money.ts` — pence helpers + formatting
- `src/lib/tax/profit.ts` — profit, property-allowance helper, finance-cost reducer
- `src/lib/tax/incomeTax.ts` — income-tax band calculator + property tax estimate
- `src/lib/tax/sa105.ts` — map transactions → SA105 box totals
- `src/lib/tax/types.ts` — shared TS types for the tax engine
- `src/lib/tax/*.test.ts` — colocated Vitest unit tests

---

### Task 1: Scaffold the Next.js + TypeScript project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/page.tsx`, `src/app/layout.tsx`

- [ ] **Step 1: Create the Next.js app**

Run (from `/home/ash/projects/akaunting-ng`, which already contains `docs/` and a git repo):

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --no-import-alias --use-npm --no-eslint --yes
```

If `create-next-app` refuses because the directory is non-empty, run it in a temp dir and copy in:

```bash
npx create-next-app@latest /tmp/ppa --typescript --tailwind --app --src-dir --no-import-alias --use-npm --no-eslint --yes
cp -r /tmp/ppa/. /home/ash/projects/akaunting-ng/ && rm -rf /tmp/ppa
```

- [ ] **Step 2: Verify the dev server boots**

Run: `npm run build`
Expected: build completes with no type errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + TypeScript + Tailwind app"
```

---

### Task 2: Add Vitest and a smoke test

**Files:**
- Modify: `package.json` (add scripts + dev deps)
- Create: `vitest.config.ts`
- Create: `src/lib/tax/money.ts`
- Test: `src/lib/tax/money.test.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: Add the test script to `package.json`**

In the `"scripts"` object add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write the failing test**

`src/lib/tax/money.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { poundsToPence, penceToPounds, formatGBP } from "./money";

describe("money", () => {
  it("converts pounds to integer pence without float error", () => {
    expect(poundsToPence(19.99)).toBe(1999);
    expect(poundsToPence(0.1 + 0.2)).toBe(30); // classic float trap
  });

  it("converts pence back to pounds", () => {
    expect(penceToPounds(1999)).toBe(19.99);
  });

  it("formats pence as GBP", () => {
    expect(formatGBP(123456)).toBe("£1,234.56");
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `money.ts` does not exist / functions not defined.

- [ ] **Step 6: Implement `src/lib/tax/money.ts`**

```typescript
/** All monetary values in this app are integer pence. Never use floats for money. */

export function poundsToPence(pounds: number): number {
  return Math.round(pounds * 100);
}

export function penceToPounds(pence: number): number {
  return Math.round(pence) / 100;
}

export function formatGBP(pence: number): string {
  const pounds = penceToPounds(pence);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pounds);
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test: add Vitest with pence-based money helpers"
```

---

### Task 3: Define the Prisma data model

**Files:**
- Create: `prisma/schema.prisma`
- Modify: `package.json` (add prisma dev dep + scripts)
- Create: `.env` (SQLite URL)

- [ ] **Step 1: Install Prisma**

```bash
npm install -D prisma
npm install @prisma/client
```

- [ ] **Step 2: Create `.env`**

```
DATABASE_URL="file:./dev.db"
```

- [ ] **Step 3: Create `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

enum OwnershipType {
  personal
  company
}

enum CategoryKind {
  income
  expense
  finance
  capital
}

enum Direction {
  in
  out
}

enum RecurFrequency {
  monthly
  quarterly
  annual
}

enum TxnSource {
  manual
  recurring
  imported
}

enum Region {
  englandWalesNI
  scotland
}

enum Basis {
  cash
  accruals
}

model Property {
  id              String        @id @default(cuid())
  name            String
  address         String?
  ownershipType   OwnershipType @default(personal)
  acquisitionDate DateTime?
  transactions    Transaction[]
  recurringRules  RecurringRule[]
  createdAt       DateTime      @default(now())
}

model Vendor {
  id                String        @id @default(cuid())
  name              String
  contactDetails    String?
  notes             String?
  defaultCategoryId String?
  defaultCategory   Category?     @relation(fields: [defaultCategoryId], references: [id])
  transactions      Transaction[]
  recurringRules    RecurringRule[]
}

model Category {
  id             String         @id @default(cuid())
  name           String
  kind           CategoryKind
  sa105Box       String?
  allowable      Boolean        @default(true)
  transactions   Transaction[]
  recurringRules RecurringRule[]
  vendors        Vendor[]
}

model Transaction {
  id           String       @id @default(cuid())
  propertyId   String
  property     Property     @relation(fields: [propertyId], references: [id])
  date         DateTime
  amountPence  Int
  direction    Direction
  categoryId   String
  category     Category     @relation(fields: [categoryId], references: [id])
  vendorId     String?
  vendor       Vendor?      @relation(fields: [vendorId], references: [id])
  description  String?
  recurringId  String?
  recurring    RecurringRule? @relation(fields: [recurringId], references: [id])
  source       TxnSource    @default(manual)
  attachmentId String?
  attachment   Attachment?  @relation(fields: [attachmentId], references: [id])
  createdAt    DateTime     @default(now())

  @@index([propertyId, date])
}

model RecurringRule {
  id                String         @id @default(cuid())
  propertyId        String
  property          Property       @relation(fields: [propertyId], references: [id])
  categoryId        String
  category          Category       @relation(fields: [categoryId], references: [id])
  vendorId          String?
  vendor            Vendor?        @relation(fields: [vendorId], references: [id])
  amountPence       Int
  direction         Direction
  frequency         RecurFrequency
  dayOfMonth        Int
  startDate         DateTime
  endDate           DateTime?
  lastGeneratedDate DateTime?
  transactions      Transaction[]
}

model Attachment {
  id            String        @id @default(cuid())
  filePath      String
  originalName  String
  extractedData String?       // JSON string, populated by AI extraction later
  transactions  Transaction[]
  createdAt     DateTime      @default(now())
}

model TaxYearProfile {
  id                   String  @id @default(cuid())
  taxYear              String  @unique // e.g. "2025-26"
  otherIncomePence     Int     @default(0)
  region               Region  @default(englandWalesNI)
  basis                Basis   @default(cash)
  usePropertyAllowance Boolean @default(false)
}
```

- [ ] **Step 4: Add Prisma scripts to `package.json`**

In `"scripts"`:

```json
"db:migrate": "prisma migrate dev",
"db:seed": "prisma db seed",
"db:studio": "prisma studio"
```

And add at top level of `package.json`:

```json
"prisma": { "seed": "npx tsx prisma/seed.ts" }
```

- [ ] **Step 5: Install tsx for running the seed in TS**

```bash
npm install -D tsx
```

- [ ] **Step 6: Create the initial migration**

Run: `npm run db:migrate -- --name init`
Expected: migration created under `prisma/migrations/`, `dev.db` generated, Prisma Client generated, no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Prisma SQLite schema for properties, transactions, categories"
```

---

### Task 4: Seed UK tax categories mapped to SA105 boxes

**Files:**
- Create: `prisma/seed.ts`

- [ ] **Step 1: Write the seed script**

`prisma/seed.ts`. SA105 box numbers reflect the 2025/26 form — VERIFY against the current SA105 notes (https://www.gov.uk/government/publications/self-assessment-uk-property-sa105) at implementation time and adjust the `sa105Box` values if HMRC has renumbered.

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const categories = [
  // Income
  { name: "Rent received", kind: "income", sa105Box: "20", allowable: true },
  { name: "Other property income", kind: "income", sa105Box: "21", allowable: true },
  // Allowable expenses (boxes 24-29)
  { name: "Rent, rates, insurance, ground rents", kind: "expense", sa105Box: "24", allowable: true },
  { name: "Property repairs and maintenance", kind: "expense", sa105Box: "25", allowable: true },
  { name: "Legal, management, other professional fees", kind: "expense", sa105Box: "27", allowable: true },
  { name: "Costs of services provided, including wages", kind: "expense", sa105Box: "28", allowable: true },
  { name: "Other allowable property expenses", kind: "expense", sa105Box: "29", allowable: true },
  // Finance costs (box 44 — NOT a deduction; 20% tax reducer)
  { name: "Mortgage / loan interest", kind: "finance", sa105Box: "44", allowable: true },
  // Capital — NOT allowable against rental profit
  { name: "Capital improvements", kind: "capital", sa105Box: null, allowable: false },
] as const;

async function main() {
  for (const c of categories) {
    const existing = await prisma.category.findFirst({ where: { name: c.name } });
    if (!existing) {
      await prisma.category.create({ data: c });
    }
  }
  console.log(`Seeded ${categories.length} categories.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Run the seed**

Run: `npm run db:seed`
Expected: prints `Seeded 9 categories.`

- [ ] **Step 3: Verify idempotency**

Run: `npm run db:seed` again.
Expected: prints `Seeded 9 categories.` and `prisma studio` (or a query) shows 9 category rows, not 18.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: seed UK tax categories mapped to SA105 boxes"
```

---

### Task 5: Tax engine — shared types

**Files:**
- Create: `src/lib/tax/types.ts`

- [ ] **Step 1: Define the engine's input types**

These are plain types (decoupled from Prisma) so the engine stays pure.

```typescript
export type CategoryKind = "income" | "expense" | "finance" | "capital";
export type Direction = "in" | "out";
export type Region = "englandWalesNI" | "scotland";

/** A transaction as the tax engine sees it — money in pence, plus its category facts. */
export interface TaxTxn {
  date: Date;
  amountPence: number;
  direction: Direction;
  categoryKind: CategoryKind;
  allowable: boolean;
  sa105Box: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add tax engine shared types"
```

---

### Task 6: Tax engine — UK tax-year bucketing

**Files:**
- Create: `src/lib/tax/taxYear.ts`
- Test: `src/lib/tax/taxYear.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { getTaxYear, taxYearRange } from "./taxYear";

describe("getTaxYear", () => {
  it("puts 6 April into the new tax year", () => {
    expect(getTaxYear(new Date("2025-04-06"))).toBe("2025-26");
  });
  it("puts 5 April into the old tax year", () => {
    expect(getTaxYear(new Date("2025-04-05"))).toBe("2024-25");
  });
  it("handles mid-year and year-end dates", () => {
    expect(getTaxYear(new Date("2025-12-31"))).toBe("2025-26");
    expect(getTaxYear(new Date("2026-01-01"))).toBe("2025-26");
  });
});

describe("taxYearRange", () => {
  it("returns inclusive start and exclusive end for a tax year", () => {
    const { start, end } = taxYearRange("2025-26");
    expect(start.toISOString().slice(0, 10)).toBe("2025-04-06");
    expect(end.toISOString().slice(0, 10)).toBe("2026-04-06");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/lib/tax/taxYear.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/tax/taxYear.ts`**

```typescript
/** UK tax year runs 6 April → 5 April. Labelled like "2025-26". */

export function getTaxYear(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0 = Jan, 3 = Apr
  const day = date.getUTCDate();
  const afterApril6 = month > 3 || (month === 3 && day >= 6);
  const startYear = afterApril6 ? year : year - 1;
  const endShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endShort}`;
}

export function taxYearRange(taxYear: string): { start: Date; end: Date } {
  const startYear = Number(taxYear.slice(0, 4));
  const start = new Date(Date.UTC(startYear, 3, 6)); // 6 April
  const end = new Date(Date.UTC(startYear + 1, 3, 6)); // exclusive
  return { start, end };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/lib/tax/taxYear.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: UK tax-year bucketing helpers"
```

---

### Task 7: Tax engine — profit, property allowance, finance-cost reducer

**Files:**
- Create: `src/lib/tax/profit.ts`
- Test: `src/lib/tax/profit.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { computeProfit, propertyAllowanceAdvice, financeCostReducer } from "./profit";
import type { TaxTxn } from "./types";

const t = (over: Partial<TaxTxn>): TaxTxn => ({
  date: new Date("2025-06-01"),
  amountPence: 0,
  direction: "in",
  categoryKind: "income",
  allowable: true,
  sa105Box: null,
  ...over,
});

describe("computeProfit", () => {
  it("is allowable income minus allowable expenses, excluding finance and capital", () => {
    const txns: TaxTxn[] = [
      t({ amountPence: 1_200_00, direction: "in", categoryKind: "income" }),
      t({ amountPence: 200_00, direction: "out", categoryKind: "expense" }),
      t({ amountPence: 500_00, direction: "out", categoryKind: "finance" }), // excluded
      t({ amountPence: 999_00, direction: "out", categoryKind: "capital", allowable: false }), // excluded
    ];
    const r = computeProfit(txns);
    expect(r.incomePence).toBe(1_200_00);
    expect(r.expensesPence).toBe(200_00);
    expect(r.profitPence).toBe(1_000_00);
  });
});

describe("propertyAllowanceAdvice", () => {
  it("recommends the £1,000 allowance when expenses are below £1,000", () => {
    const advice = propertyAllowanceAdvice(5_000_00, 300_00);
    expect(advice.useAllowance).toBe(true);
    expect(advice.taxableProfitPence).toBe(4_000_00); // 5000 - 1000 allowance
  });
  it("recommends actual expenses when they exceed £1,000", () => {
    const advice = propertyAllowanceAdvice(5_000_00, 1_500_00);
    expect(advice.useAllowance).toBe(false);
    expect(advice.taxableProfitPence).toBe(3_500_00);
  });
  it("gives full relief when gross income is at or below £1,000", () => {
    const advice = propertyAllowanceAdvice(800_00, 0);
    expect(advice.fullReliefNoReportingNeeded).toBe(true);
    expect(advice.taxableProfitPence).toBe(0);
  });
});

describe("financeCostReducer", () => {
  it("is 20% of finance costs, capped at the property profit", () => {
    expect(financeCostReducer(3_000_00, 10_000_00)).toBe(600_00); // 20% of 3000
    expect(financeCostReducer(12_000_00, 5_000_00)).toBe(1_000_00); // capped at 20% of profit
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/lib/tax/profit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/tax/profit.ts`**

```typescript
import type { TaxTxn } from "./types";

const PROPERTY_ALLOWANCE_PENCE = 1_000_00;

export interface ProfitResult {
  incomePence: number;
  expensesPence: number;
  profitPence: number;
}

export function computeProfit(txns: TaxTxn[]): ProfitResult {
  let incomePence = 0;
  let expensesPence = 0;
  for (const tx of txns) {
    if (!tx.allowable) continue;
    if (tx.categoryKind === "income") incomePence += tx.amountPence;
    else if (tx.categoryKind === "expense") expensesPence += tx.amountPence;
    // finance and capital are excluded from profit
  }
  return { incomePence, expensesPence, profitPence: incomePence - expensesPence };
}

export interface AllowanceAdvice {
  useAllowance: boolean;
  taxableProfitPence: number;
  fullReliefNoReportingNeeded: boolean;
}

export function propertyAllowanceAdvice(
  grossIncomePence: number,
  allowableExpensesPence: number,
): AllowanceAdvice {
  if (grossIncomePence <= PROPERTY_ALLOWANCE_PENCE) {
    return { useAllowance: true, taxableProfitPence: 0, fullReliefNoReportingNeeded: true };
  }
  const profitWithExpenses = grossIncomePence - allowableExpensesPence;
  const profitWithAllowance = grossIncomePence - PROPERTY_ALLOWANCE_PENCE;
  const useAllowance = profitWithAllowance < profitWithExpenses;
  return {
    useAllowance,
    taxableProfitPence: Math.max(0, Math.min(profitWithExpenses, profitWithAllowance)),
    fullReliefNoReportingNeeded: false,
  };
}

/**
 * Section 24 finance-cost relief: a 20% basic-rate reducer.
 * Capped at the lower of finance costs and property profit (v1 ignores the rarer
 * adjusted-total-income cap; revisit if the user's other income is very low).
 */
export function financeCostReducer(financeCostsPence: number, profitPence: number): number {
  const base = Math.max(0, Math.min(financeCostsPence, profitPence));
  return Math.round(base * 0.2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/lib/tax/profit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: profit, property-allowance advice, finance-cost reducer"
```

---

### Task 8: Tax engine — versioned income-tax bands

**Files:**
- Create: `src/lib/tax/bands.ts`
- Test: `src/lib/tax/bands.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { getBands } from "./bands";

describe("getBands", () => {
  it("returns 2025-26 England/Wales/NI bands in pence", () => {
    const b = getBands("2025-26", "englandWalesNI");
    expect(b.personalAllowancePence).toBe(12_570_00);
    expect(b.basicRateLimitPence).toBe(37_700_00);
    expect(b.higherRateLimitPence).toBe(125_140_00);
    expect(b.basicRate).toBeCloseTo(0.2);
    expect(b.higherRate).toBeCloseTo(0.4);
    expect(b.additionalRate).toBeCloseTo(0.45);
  });
  it("falls back to the latest known year for an unknown future year", () => {
    expect(() => getBands("2099-00", "englandWalesNI")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/lib/tax/bands.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/tax/bands.ts`**

Values are 2025/26. Update each April by adding a new entry to `BANDS`.

```typescript
import type { Region } from "./types";

export interface TaxBands {
  personalAllowancePence: number;
  /** Band widths/limits are amounts of taxable income ABOVE the personal allowance. */
  basicRateLimitPence: number; // top of basic-rate band, above PA
  higherRateLimitPence: number; // total income above which additional rate applies
  paTaperStartPence: number; // income above which PA tapers (£1 lost per £2)
  basicRate: number;
  higherRate: number;
  additionalRate: number;
}

const ENGLAND_WALES_NI_2025_26: TaxBands = {
  personalAllowancePence: 12_570_00,
  basicRateLimitPence: 37_700_00,
  higherRateLimitPence: 125_140_00,
  paTaperStartPence: 100_000_00,
  basicRate: 0.2,
  higherRate: 0.4,
  additionalRate: 0.45,
};

const BANDS: Record<string, Partial<Record<Region, TaxBands>>> = {
  "2025-26": { englandWalesNI: ENGLAND_WALES_NI_2025_26 },
};

const LATEST_YEAR = "2025-26";

export function getBands(taxYear: string, region: Region): TaxBands {
  const year = BANDS[taxYear] ?? BANDS[LATEST_YEAR];
  const bands = year[region] ?? year.englandWalesNI;
  if (!bands) throw new Error(`No tax bands configured for ${taxYear}/${region}`);
  return bands;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/lib/tax/bands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: versioned UK income-tax band config"
```

---

### Task 9: Tax engine — income-tax estimate

**Files:**
- Create: `src/lib/tax/incomeTax.ts`
- Test: `src/lib/tax/incomeTax.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { incomeTaxOn, estimatePropertyTax } from "./incomeTax";

describe("incomeTaxOn (2025-26 EWNI)", () => {
  it("is zero below the personal allowance", () => {
    expect(incomeTaxOn(10_000_00, "2025-26", "englandWalesNI")).toBe(0);
  });
  it("taxes basic-rate income at 20%", () => {
    // £20,000 income: (20000 - 12570) * 20% = 1486.00
    expect(incomeTaxOn(20_000_00, "2025-26", "englandWalesNI")).toBe(1_486_00);
  });
  it("applies higher rate above the basic-rate limit", () => {
    // £60,000: 37700*20% + (60000-50270)*40% = 7540 + 3892 = 11432.00
    expect(incomeTaxOn(60_000_00, "2025-26", "englandWalesNI")).toBe(11_432_00);
  });
});

describe("estimatePropertyTax", () => {
  it("returns the marginal tax on property profit after the finance-cost reducer", () => {
    // Other income £40,000, property profit £8,000, finance reducer £600.
    // Tax on 48000 minus tax on 40000, less £600 reducer.
    const r = estimatePropertyTax({
      otherIncomePence: 40_000_00,
      taxableProfitPence: 8_000_00,
      financeReducerPence: 600_00,
      taxYear: "2025-26",
      region: "englandWalesNI",
    });
    // 48000 income tax: 7540 + (48000-50270 <0 => none higher) -> all basic above PA: (48000-12570)*20% = 7086
    // 40000 income tax: (40000-12570)*20% = 5486
    // property tax = 7086 - 5486 = 1600; minus 600 reducer = 1000.00
    expect(r.taxOnPropertyPence).toBe(1_000_00);
    expect(r.marginalRate).toBeCloseTo(0.2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/lib/tax/incomeTax.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/tax/incomeTax.ts`**

```typescript
import { getBands } from "./bands";
import type { Region } from "./types";

/** Personal allowance after the >£100k taper (£1 lost per £2 over the threshold). */
function effectivePersonalAllowance(totalIncomePence: number, bands: ReturnType<typeof getBands>): number {
  if (totalIncomePence <= bands.paTaperStartPence) return bands.personalAllowancePence;
  const excess = totalIncomePence - bands.paTaperStartPence;
  const reduced = bands.personalAllowancePence - Math.floor(excess / 2);
  return Math.max(0, reduced);
}

export function incomeTaxOn(totalIncomePence: number, taxYear: string, region: Region): number {
  const bands = getBands(taxYear, region);
  const pa = effectivePersonalAllowance(totalIncomePence, bands);
  const taxable = Math.max(0, totalIncomePence - pa);

  const basicBand = bands.basicRateLimitPence;
  const higherBand = bands.higherRateLimitPence - pa - basicBand;

  let tax = 0;
  const basic = Math.min(taxable, basicBand);
  tax += basic * bands.basicRate;
  const higher = Math.min(Math.max(0, taxable - basicBand), Math.max(0, higherBand));
  tax += higher * bands.higherRate;
  const additional = Math.max(0, taxable - basicBand - Math.max(0, higherBand));
  tax += additional * bands.additionalRate;

  return Math.round(tax);
}

export interface PropertyTaxInput {
  otherIncomePence: number;
  taxableProfitPence: number;
  financeReducerPence: number;
  taxYear: string;
  region: Region;
}

export interface PropertyTaxResult {
  taxOnPropertyPence: number;
  marginalRate: number;
}

export function estimatePropertyTax(input: PropertyTaxInput): PropertyTaxResult {
  const { otherIncomePence, taxableProfitPence, financeReducerPence, taxYear, region } = input;
  const taxWith = incomeTaxOn(otherIncomePence + taxableProfitPence, taxYear, region);
  const taxWithout = incomeTaxOn(otherIncomePence, taxYear, region);
  const gross = taxWith - taxWithout;
  const taxOnPropertyPence = Math.max(0, gross - financeReducerPence);
  const marginalRate = taxableProfitPence > 0 ? gross / taxableProfitPence : 0;
  return { taxOnPropertyPence, marginalRate };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/lib/tax/incomeTax.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: income-tax estimate with PA taper and finance reducer"
```

---

### Task 10: Tax engine — SA105 box mapping

**Files:**
- Create: `src/lib/tax/sa105.ts`
- Test: `src/lib/tax/sa105.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { sa105Boxes } from "./sa105";
import type { TaxTxn } from "./types";

const t = (over: Partial<TaxTxn>): TaxTxn => ({
  date: new Date("2025-06-01"),
  amountPence: 0,
  direction: "in",
  categoryKind: "income",
  allowable: true,
  sa105Box: null,
  ...over,
});

describe("sa105Boxes", () => {
  it("totals transactions by their SA105 box", () => {
    const txns: TaxTxn[] = [
      t({ amountPence: 1_200_00, sa105Box: "20", categoryKind: "income" }),
      t({ amountPence: 300_00, sa105Box: "20", categoryKind: "income" }),
      t({ amountPence: 150_00, sa105Box: "25", categoryKind: "expense", direction: "out" }),
      t({ amountPence: 500_00, sa105Box: "44", categoryKind: "finance", direction: "out" }),
    ];
    const boxes = sa105Boxes(txns);
    expect(boxes["20"]).toBe(1_500_00);
    expect(boxes["25"]).toBe(150_00);
    expect(boxes["44"]).toBe(500_00);
  });

  it("ignores transactions with no box (e.g. capital)", () => {
    const boxes = sa105Boxes([t({ amountPence: 999_00, sa105Box: null, categoryKind: "capital", allowable: false })]);
    expect(Object.keys(boxes)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/lib/tax/sa105.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/tax/sa105.ts`**

```typescript
import type { TaxTxn } from "./types";

/** Sum transaction amounts (pence) grouped by SA105 box. Transactions with no box are ignored. */
export function sa105Boxes(txns: TaxTxn[]): Record<string, number> {
  const boxes: Record<string, number> = {};
  for (const tx of txns) {
    if (!tx.sa105Box) continue;
    boxes[tx.sa105Box] = (boxes[tx.sa105Box] ?? 0) + tx.amountPence;
  }
  return boxes;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/lib/tax/sa105.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests across money, taxYear, profit, bands, incomeTax, sa105 PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: SA105 box mapping; tax engine complete"
```

---

## Self-Review

**Spec coverage (Phase 1 foundation portion):**
- Stack (Next.js + SQLite/Prisma + Tailwind) → Tasks 1, 3. ✓
- Integer-pence money rule → Task 2 (money.ts) + every tax module uses pence. ✓
- 7-table data model with future-shaped fields → Task 3. ✓
- Seeded UK categories mapped to SA105 boxes → Task 4. ✓
- Pure isolated tax engine → Tasks 5–10 (no Prisma/React imports). ✓
- Tax-year bucketing → Task 6. ✓
- Profit, property-allowance helper, finance-cost reducer → Task 7. ✓
- Tax-bracket estimate with PA taper → Tasks 8–9. ✓
- SA105 output → Task 10. ✓
- Versioned per-year bands → Task 8. ✓
- (Deferred to Plans 2–3: transactions/vendors/recurring CRUD, dashboard, reports, filtering, CSV, attachment upload UI. Out of Phase-1-foundation scope by design.)

**Placeholder scan:** No TBD/TODO left in code steps; SA105 box numbers carry an explicit "verify against current notes" instruction, which is a real implementation check, not a placeholder.

**Type consistency:** `TaxTxn` (Task 5) is consumed unchanged by `computeProfit`/`sa105Boxes`. `getBands` return type is reused via `ReturnType<typeof getBands>` in `incomeTax.ts`. Function names are stable across tasks (`computeProfit`, `financeCostReducer`, `incomeTaxOn`, `estimatePropertyTax`, `sa105Boxes`).

---

## Notes for the implementer

- The £8,000-profit estimate test in Task 9 assumes the user stays within the basic-rate band; the engine itself handles higher/additional correctly (tested separately in `incomeTaxOn`).
- Scotland bands are intentionally unimplemented in v1 — `getBands` will fall back to England/Wales/NI. Add a `scotland` entry to `BANDS` when needed.
- Re-verify SA105 box numbers and the £12,570/£37,700/£125,140 thresholds against current-year HMRC sources before relying on filed figures.
