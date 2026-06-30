# Data Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user record property income and expenses, manage vendors, and define recurring payments (rent, mortgage, insurance) that auto-generate transactions — all persisted via Prisma/SQLite and feedable into the existing pure tax engine.

**Architecture:** A Prisma client singleton (Prisma v7 + better-sqlite3 driver adapter) backs a thin, server-only **data-access layer** (`src/lib/data/*`). Pure domain logic (amount parsing, Prisma→`TaxTxn` mapping, recurring-occurrence generation) lives in small testable modules. Next.js App Router **server actions** call the data layer; minimal React forms/lists provide the UI. The tax engine from Plan 1 is untouched and consumed read-only.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Prisma v7 + SQLite, Vitest.

This is Plan 2 of 3 for Phase 1. It produces a working data-entry app. Plan 3 adds the dashboard, reports, filtering, CSV export, and the SA105 summary screen.

**Prisma v7 notes (carried from Plan 1 — important):**
- The datasource URL lives in `prisma.config.ts`, NOT `schema.prisma`.
- `PrismaClient` MUST be constructed with the better-sqlite3 driver adapter. Mirror the exact adapter import/constructor already used in `prisma/seed.ts` — read that file first and copy the pattern; do not invent an import path.
- `prisma migrate dev` fails non-interactively; use `prisma migrate deploy` then `prisma generate`.

---

## File Structure

- `src/lib/db.ts` — Prisma client singleton (server-only), driver-adapter wired
- `src/lib/money/parseAmount.ts` — parse a pounds string → integer pence (+ validation)
- `src/lib/tax/fromPrisma.ts` — map Prisma Transaction(+Category) rows → `TaxTxn[]`
- `src/lib/recurring/occurrences.ts` — pure: occurrence dates for a recurring rule up to a date
- `src/lib/data/categories.ts` — list/create categories
- `src/lib/data/vendors.ts` — vendor CRUD
- `src/lib/data/property.ts` — ensure/get/update the (single) property
- `src/lib/data/transactions.ts` — transaction CRUD + tax-year query
- `src/lib/data/recurring.ts` — recurring-rule CRUD + `materialiseDue` (generate transactions)
- `test/setup/globalSetup.ts`, `test/setup/resetDb.ts` — integration-test DB harness
- `src/app/(app)/layout.tsx` + nav — app shell
- `src/app/(app)/transactions/` — list page + form + `actions.ts`
- `src/app/(app)/vendors/` — list page + form + `actions.ts`
- `src/app/(app)/recurring/` — list page + form + `actions.ts`
- `src/app/(app)/settings/` — property settings page + `actions.ts`

---

### Task 1: Prisma client singleton

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: Read the adapter pattern**

Read `prisma/seed.ts` and note the exact import (e.g. `@prisma/adapter-better-sqlite3`) and constructor used to build `PrismaClient` with the adapter. You will mirror it.

- [ ] **Step 2: Create `src/lib/db.ts`**

Use the SAME adapter import/constructor as `prisma/seed.ts`. The shape (adjust the adapter class name to match seed.ts):

```typescript
import "server-only";
import { PrismaClient } from "@prisma/client";
// import the SAME adapter class that prisma/seed.ts uses:
import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";

const url = process.env.DATABASE_URL ?? "file:./dev.db";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter: new PrismaBetterSQLite3({ url }) });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

Install the server-only guard package if not present: `npm install server-only`.

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: success. (No test yet — that comes with the harness in Task 2.)

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add Prisma client singleton with driver adapter"
```

---

### Task 2: Integration-test DB harness

**Files:**
- Create: `test/setup/globalSetup.ts`
- Create: `test/setup/resetDb.ts`
- Modify: `vitest.config.ts`

**Context:** Data-layer tests need a real SQLite DB with the schema + seeded categories, isolated from `dev.db`. We point `DATABASE_URL` at a throwaway `test.db`, apply migrations + seed once before the suite, and truncate non-seed tables between tests.

- [ ] **Step 1: Create `test/setup/globalSetup.ts`**

```typescript
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const TEST_DB = "file:./test.db";

export default function setup() {
  rmSync("test.db", { force: true });
  const env = { ...process.env, DATABASE_URL: TEST_DB };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
  return () => {
    rmSync("test.db", { force: true });
  };
}
```

- [ ] **Step 2: Create `test/setup/resetDb.ts`**

Deletes all rows EXCEPT seeded categories, in FK-safe order. Import the singleton from `src/lib/db.ts`.

```typescript
import { prisma } from "../../src/lib/db";

/** Clear all transactional data between tests; keep seeded categories. */
export async function resetDb() {
  await prisma.transaction.deleteMany();
  await prisma.recurringRule.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.property.deleteMany();
  await prisma.taxYearProfile.deleteMany();
}
```

- [ ] **Step 3: Wire vitest config**

Modify `vitest.config.ts` so integration tests run with the test DB. Set `globalSetup` and inject the env var via `test.env`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./test/setup/globalSetup.ts"],
    env: { DATABASE_URL: "file:./test.db" },
  },
});
```

- [ ] **Step 4: Add `test.db` to `.gitignore`**

Confirm `*.db` is already ignored (it is, from Plan 1). No change needed if so.

- [ ] **Step 5: Smoke-test the harness**

Create a temporary `src/lib/data/_harness.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { prisma } from "../db";

describe("test db harness", () => {
  it("has the 9 seeded categories", async () => {
    const count = await prisma.category.count();
    expect(count).toBe(9);
  });
});
```

Run: `npm test src/lib/data/_harness.test.ts`
Expected: PASS (migrations + seed ran against test.db; count is 9).

- [ ] **Step 6: Delete the smoke test, then commit**

```bash
rm src/lib/data/_harness.test.ts
git add -A && git commit -m "test: add integration test DB harness"
```

---

### Task 3: Parse pounds input to pence

**Files:**
- Create: `src/lib/money/parseAmount.ts`
- Test: `src/lib/money/parseAmount.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { parseAmountToPence } from "./parseAmount";

describe("parseAmountToPence", () => {
  it("parses plain pounds and pence", () => {
    expect(parseAmountToPence("19.99")).toBe(1999);
    expect(parseAmountToPence("1000")).toBe(100000);
    expect(parseAmountToPence("0.01")).toBe(1);
  });
  it("tolerates currency symbols, commas and whitespace", () => {
    expect(parseAmountToPence(" £1,234.56 ")).toBe(123456);
  });
  it("rejects negative, empty, and non-numeric input", () => {
    expect(() => parseAmountToPence("-5")).toThrow();
    expect(() => parseAmountToPence("")).toThrow();
    expect(() => parseAmountToPence("abc")).toThrow();
  });
  it("rejects more than two decimal places", () => {
    expect(() => parseAmountToPence("1.234")).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/money/parseAmount.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/money/parseAmount.ts`**

```typescript
/** Parse a user-entered pounds string into a positive integer number of pence. */
export function parseAmountToPence(input: string): number {
  const cleaned = input.replace(/[£,\s]/g, "");
  if (cleaned === "") throw new Error("Amount is required");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Invalid amount: "${input}"`);
  }
  const [pounds, fraction = ""] = cleaned.split(".");
  const pence = Number(pounds) * 100 + Number(fraction.padEnd(2, "0"));
  return pence;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/money/parseAmount.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: parse pounds input to integer pence"
```

---

### Task 4: Map Prisma rows to TaxTxn

**Files:**
- Create: `src/lib/tax/fromPrisma.ts`
- Test: `src/lib/tax/fromPrisma.test.ts`

**Context:** The tax engine consumes `TaxTxn` (from `src/lib/tax/types.ts`). This adapter converts a Prisma `Transaction` joined with its `Category` into a `TaxTxn`, so the engine never imports Prisma.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { toTaxTxn } from "./fromPrisma";

describe("toTaxTxn", () => {
  it("maps a Prisma transaction + category to a TaxTxn", () => {
    const row = {
      date: new Date("2025-06-01"),
      amountPence: 120000,
      direction: "in" as const,
      category: { kind: "income" as const, allowable: true, sa105Box: "20" },
    };
    expect(toTaxTxn(row)).toEqual({
      date: new Date("2025-06-01"),
      amountPence: 120000,
      direction: "in",
      categoryKind: "income",
      allowable: true,
      sa105Box: "20",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/tax/fromPrisma.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/tax/fromPrisma.ts`**

```typescript
import type { CategoryKind, Direction, TaxTxn } from "./types";

/** The minimal shape of a Prisma transaction joined with its category. */
export interface TxnWithCategory {
  date: Date;
  amountPence: number;
  direction: Direction;
  category: { kind: CategoryKind; allowable: boolean; sa105Box: string | null };
}

export function toTaxTxn(row: TxnWithCategory): TaxTxn {
  return {
    date: row.date,
    amountPence: row.amountPence,
    direction: row.direction,
    categoryKind: row.category.kind,
    allowable: row.category.allowable,
    sa105Box: row.category.sa105Box,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/tax/fromPrisma.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: map Prisma transactions to TaxTxn"
```

---

### Task 5: Recurring-occurrence generation

**Files:**
- Create: `src/lib/recurring/occurrences.ts`
- Test: `src/lib/recurring/occurrences.test.ts`

**Context:** Pure function: given a recurring rule and an `asOf` date, return the occurrence dates (on `dayOfMonth`, stepping by frequency) that fall after `lastGeneratedDate` (or from `startDate`) up to and including `asOf`, never past `endDate`. Clamp `dayOfMonth` to the month's last day (e.g. 31 → 28/29 in Feb). All UTC.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { recurringOccurrences } from "./occurrences";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("recurringOccurrences", () => {
  it("lists monthly occurrences from startDate up to asOf", () => {
    const dates = recurringOccurrences(
      { frequency: "monthly", dayOfMonth: 1, startDate: new Date("2025-01-01"), endDate: null, lastGeneratedDate: null },
      new Date("2025-03-15"),
    );
    expect(dates.map(iso)).toEqual(["2025-01-01", "2025-02-01", "2025-03-01"]);
  });

  it("skips occurrences on or before lastGeneratedDate", () => {
    const dates = recurringOccurrences(
      { frequency: "monthly", dayOfMonth: 1, startDate: new Date("2025-01-01"), endDate: null, lastGeneratedDate: new Date("2025-02-01") },
      new Date("2025-04-15"),
    );
    expect(dates.map(iso)).toEqual(["2025-03-01", "2025-04-01"]);
  });

  it("clamps dayOfMonth to the last day of short months", () => {
    const dates = recurringOccurrences(
      { frequency: "monthly", dayOfMonth: 31, startDate: new Date("2025-01-31"), endDate: null, lastGeneratedDate: null },
      new Date("2025-02-28"),
    );
    expect(dates.map(iso)).toEqual(["2025-01-31", "2025-02-28"]);
  });

  it("respects endDate and quarterly/annual steps", () => {
    const q = recurringOccurrences(
      { frequency: "quarterly", dayOfMonth: 15, startDate: new Date("2025-01-15"), endDate: new Date("2025-08-01"), lastGeneratedDate: null },
      new Date("2025-12-31"),
    );
    expect(q.map(iso)).toEqual(["2025-01-15", "2025-04-15", "2025-07-15"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/recurring/occurrences.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/recurring/occurrences.ts`**

```typescript
export type RecurFrequency = "monthly" | "quarterly" | "annual";

export interface OccurrenceRule {
  frequency: RecurFrequency;
  dayOfMonth: number;
  startDate: Date;
  endDate: Date | null;
  lastGeneratedDate: Date | null;
}

const STEP_MONTHS: Record<RecurFrequency, number> = { monthly: 1, quarterly: 3, annual: 12 };

function dateOn(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

export function recurringOccurrences(rule: OccurrenceRule, asOf: Date): Date[] {
  const step = STEP_MONTHS[rule.frequency];
  const out: Date[] = [];
  let year = rule.startDate.getUTCFullYear();
  let month = rule.startDate.getUTCMonth();

  // Walk months by step, emitting clamped dates, until past asOf.
  // Guard the loop to a sane horizon (1200 months) to avoid runaway.
  for (let i = 0; i < 1200; i++) {
    const occ = dateOn(year, month, rule.dayOfMonth);
    if (occ > asOf) break;
    if (rule.endDate && occ > rule.endDate) break;
    const afterStart = occ >= rule.startDate;
    const afterLast = !rule.lastGeneratedDate || occ > rule.lastGeneratedDate;
    if (afterStart && afterLast) out.push(occ);
    month += step;
    year += Math.floor(month / 12);
    month = month % 12;
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/recurring/occurrences.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: pure recurring-occurrence generation"
```

---

### Task 6: Vendors data layer

**Files:**
- Create: `src/lib/data/vendors.ts`
- Test: `src/lib/data/vendors.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { createVendor, listVendors, updateVendor, deleteVendor } from "./vendors";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => {
  await resetDb();
});

describe("vendors data layer", () => {
  it("creates and lists vendors alphabetically", async () => {
    await createVendor({ name: "Zen Plumbing" });
    await createVendor({ name: "Acme Lettings" });
    const vendors = await listVendors();
    expect(vendors.map((v) => v.name)).toEqual(["Acme Lettings", "Zen Plumbing"]);
  });

  it("updates a vendor", async () => {
    const v = await createVendor({ name: "Old Name" });
    await updateVendor(v.id, { name: "New Name", notes: "preferred" });
    const [updated] = await listVendors();
    expect(updated.name).toBe("New Name");
    expect(updated.notes).toBe("preferred");
  });

  it("deletes a vendor", async () => {
    const v = await createVendor({ name: "Temp" });
    await deleteVendor(v.id);
    expect(await listVendors()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/data/vendors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/data/vendors.ts`**

```typescript
import "server-only";
import { prisma } from "../db";

export interface VendorInput {
  name: string;
  contactDetails?: string | null;
  notes?: string | null;
  defaultCategoryId?: string | null;
}

export function listVendors() {
  return prisma.vendor.findMany({ orderBy: { name: "asc" } });
}

export function createVendor(input: VendorInput) {
  return prisma.vendor.create({ data: input });
}

export function updateVendor(id: string, input: VendorInput) {
  return prisma.vendor.update({ where: { id }, data: input });
}

export function deleteVendor(id: string) {
  return prisma.vendor.delete({ where: { id } });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/data/vendors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: vendors data layer"
```

---

### Task 7: Property data layer (single-property helper)

**Files:**
- Create: `src/lib/data/property.ts`
- Test: `src/lib/data/property.test.ts`

**Context:** v1 is single-property. `getOrCreateDefaultProperty` returns the existing property or creates one named "My Property". `updateProperty` edits it. The schema already supports many properties for the future.

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { getOrCreateDefaultProperty, updateProperty } from "./property";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => {
  await resetDb();
});

describe("property data layer", () => {
  it("creates a default property on first call and reuses it after", async () => {
    const a = await getOrCreateDefaultProperty();
    const b = await getOrCreateDefaultProperty();
    expect(a.id).toBe(b.id);
    expect(a.name).toBe("My Property");
  });

  it("updates the property", async () => {
    const p = await getOrCreateDefaultProperty();
    await updateProperty(p.id, { name: "12 Acacia Ave", address: "Anytown" });
    const updated = await getOrCreateDefaultProperty();
    expect(updated.name).toBe("12 Acacia Ave");
    expect(updated.address).toBe("Anytown");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/data/property.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/data/property.ts`**

```typescript
import "server-only";
import { prisma } from "../db";

export async function getOrCreateDefaultProperty() {
  const existing = await prisma.property.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.property.create({ data: { name: "My Property" } });
}

export interface PropertyInput {
  name: string;
  address?: string | null;
}

export function updateProperty(id: string, input: PropertyInput) {
  return prisma.property.update({ where: { id }, data: input });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/data/property.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: single-property data layer"
```

---

### Task 8: Transactions data layer

**Files:**
- Create: `src/lib/data/transactions.ts`
- Test: `src/lib/data/transactions.test.ts`

**Context:** CRUD plus a tax-year-scoped query that returns transactions joined with their category, ready for `toTaxTxn`. Uses `taxYearRange` from `src/lib/tax/taxYear.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { createTransaction, listTransactions, listTransactionsForTaxYear, updateTransaction, deleteTransaction } from "./transactions";
import { getOrCreateDefaultProperty } from "./property";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function rentCategoryId() {
  const c = await prisma.category.findFirstOrThrow({ where: { name: "Rent received" } });
  return c.id;
}

beforeEach(async () => {
  await resetDb();
});

describe("transactions data layer", () => {
  it("creates, lists, updates and deletes a transaction", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();

    const t = await createTransaction({
      propertyId: property.id,
      categoryId,
      date: new Date("2025-06-01"),
      amountPence: 95000,
      direction: "in",
      description: "June rent",
    });

    let all = await listTransactions(property.id);
    expect(all).toHaveLength(1);
    expect(all[0].amountPence).toBe(95000);

    await updateTransaction(t.id, { amountPence: 96000 });
    all = await listTransactions(property.id);
    expect(all[0].amountPence).toBe(96000);

    await deleteTransaction(t.id);
    expect(await listTransactions(property.id)).toHaveLength(0);
  });

  it("filters by UK tax year and includes the category for tax mapping", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    await createTransaction({ propertyId: property.id, categoryId, date: new Date("2025-04-05"), amountPence: 100, direction: "in" });
    await createTransaction({ propertyId: property.id, categoryId, date: new Date("2025-04-06"), amountPence: 200, direction: "in" });

    const rows = await listTransactionsForTaxYear(property.id, "2025-26");
    expect(rows).toHaveLength(1);
    expect(rows[0].amountPence).toBe(200);
    expect(rows[0].category.sa105Box).toBe("20");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/data/transactions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/data/transactions.ts`**

```typescript
import "server-only";
import { prisma } from "../db";
import { taxYearRange } from "../tax/taxYear";
import type { Direction } from "../tax/types";

export interface TransactionInput {
  propertyId: string;
  categoryId: string;
  date: Date;
  amountPence: number;
  direction: Direction;
  vendorId?: string | null;
  description?: string | null;
}

export function listTransactions(propertyId: string) {
  return prisma.transaction.findMany({
    where: { propertyId },
    orderBy: { date: "desc" },
    include: { category: true, vendor: true },
  });
}

export function listTransactionsForTaxYear(propertyId: string, taxYear: string) {
  const { start, end } = taxYearRange(taxYear);
  return prisma.transaction.findMany({
    where: { propertyId, date: { gte: start, lt: end } },
    orderBy: { date: "asc" },
    include: { category: true },
  });
}

export function createTransaction(input: TransactionInput) {
  return prisma.transaction.create({ data: input });
}

export function updateTransaction(id: string, input: Partial<TransactionInput>) {
  return prisma.transaction.update({ where: { id }, data: input });
}

export function deleteTransaction(id: string) {
  return prisma.transaction.delete({ where: { id } });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/data/transactions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: transactions data layer with tax-year query"
```

---

### Task 9: Recurring-rule data layer + materialisation

**Files:**
- Create: `src/lib/data/recurring.ts`
- Test: `src/lib/data/recurring.test.ts`

**Context:** CRUD for recurring rules, plus `materialiseDue(asOf)`: for every rule, generate the due occurrences (via `recurringOccurrences`) as real Transactions (tagged `source: "recurring"`, `recurringId`), then advance the rule's `lastGeneratedDate`. Idempotent — running twice creates no duplicates.

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { createRecurringRule, listRecurringRules, deleteRecurringRule, materialiseDue } from "./recurring";
import { getOrCreateDefaultProperty } from "./property";
import { listTransactions } from "./transactions";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function rentCategoryId() {
  const c = await prisma.category.findFirstOrThrow({ where: { name: "Rent received" } });
  return c.id;
}

beforeEach(async () => {
  await resetDb();
});

describe("recurring data layer", () => {
  it("creates and lists rules", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    await createRecurringRule({
      propertyId: property.id, categoryId, amountPence: 95000, direction: "in",
      frequency: "monthly", dayOfMonth: 1, startDate: new Date("2025-01-01"), endDate: null,
    });
    expect(await listRecurringRules(property.id)).toHaveLength(1);
  });

  it("materialises due occurrences as transactions, idempotently", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const rule = await createRecurringRule({
      propertyId: property.id, categoryId, amountPence: 95000, direction: "in",
      frequency: "monthly", dayOfMonth: 1, startDate: new Date("2025-01-01"), endDate: null,
    });

    const created = await materialiseDue(new Date("2025-03-15"));
    expect(created).toBe(3); // Jan, Feb, Mar
    expect(await listTransactions(property.id)).toHaveLength(3);

    // Running again generates nothing new.
    const again = await materialiseDue(new Date("2025-03-15"));
    expect(again).toBe(0);
    expect(await listTransactions(property.id)).toHaveLength(3);

    // Advancing time generates only the new month.
    const more = await materialiseDue(new Date("2025-04-02"));
    expect(more).toBe(1);
    expect(await listTransactions(property.id)).toHaveLength(4);

    const refreshed = await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(refreshed.lastGeneratedDate?.toISOString().slice(0, 10)).toBe("2025-04-01");
  });

  it("deletes a rule", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const r = await createRecurringRule({
      propertyId: property.id, categoryId, amountPence: 100, direction: "out",
      frequency: "annual", dayOfMonth: 10, startDate: new Date("2025-05-10"), endDate: null,
    });
    await deleteRecurringRule(r.id);
    expect(await listRecurringRules(property.id)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/data/recurring.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/data/recurring.ts`**

```typescript
import "server-only";
import { prisma } from "../db";
import { recurringOccurrences, type RecurFrequency } from "../recurring/occurrences";
import type { Direction } from "../tax/types";

export interface RecurringInput {
  propertyId: string;
  categoryId: string;
  vendorId?: string | null;
  amountPence: number;
  direction: Direction;
  frequency: RecurFrequency;
  dayOfMonth: number;
  startDate: Date;
  endDate?: Date | null;
}

export function listRecurringRules(propertyId: string) {
  return prisma.recurringRule.findMany({
    where: { propertyId },
    orderBy: { startDate: "asc" },
    include: { category: true, vendor: true },
  });
}

export function createRecurringRule(input: RecurringInput) {
  return prisma.recurringRule.create({ data: input });
}

export function deleteRecurringRule(id: string) {
  return prisma.recurringRule.delete({ where: { id } });
}

/** Generate due transactions for all rules up to `asOf`. Returns count created. Idempotent. */
export async function materialiseDue(asOf: Date): Promise<number> {
  const rules = await prisma.recurringRule.findMany();
  let created = 0;

  for (const rule of rules) {
    const dates = recurringOccurrences(
      {
        frequency: rule.frequency as RecurFrequency,
        dayOfMonth: rule.dayOfMonth,
        startDate: rule.startDate,
        endDate: rule.endDate,
        lastGeneratedDate: rule.lastGeneratedDate,
      },
      asOf,
    );
    if (dates.length === 0) continue;

    await prisma.transaction.createMany({
      data: dates.map((date) => ({
        propertyId: rule.propertyId,
        categoryId: rule.categoryId,
        vendorId: rule.vendorId,
        date,
        amountPence: rule.amountPence,
        direction: rule.direction,
        source: "recurring" as const,
        recurringId: rule.id,
        description: "Recurring",
      })),
    });
    created += dates.length;

    await prisma.recurringRule.update({
      where: { id: rule.id },
      data: { lastGeneratedDate: dates[dates.length - 1] },
    });
  }
  return created;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/data/recurring.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass (Plan 1 tax-engine tests + the new data-layer tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: recurring-rule data layer with idempotent materialisation"
```

---

### Task 10: App shell + navigation, replace boilerplate

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Modify: `src/app/page.tsx` (redirect to /transactions)
- Modify: `README.md`

**Context:** Replace the create-next-app boilerplate (a Plan 1 follow-up) and add a simple nav shell for the data-entry screens. Keep styling minimal — Plan 3 does polish.

- [ ] **Step 1: Replace `src/app/page.tsx`**

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/transactions");
}
```

- [ ] **Step 2: Create `src/app/(app)/layout.tsx`**

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

const NAV = [
  { href: "/transactions", label: "Transactions" },
  { href: "/recurring", label: "Recurring" },
  { href: "/vendors", label: "Vendors" },
  { href: "/settings", label: "Settings" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="flex gap-4 border-b px-6 py-4">
        <span className="font-semibold">Property Accounts</span>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="text-blue-600 hover:underline">
            {n.label}
          </Link>
        ))}
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Replace `README.md`** with a short project description:

```markdown
# Property Accounts

A free, self-hosted accounting app for a UK landlord: track rental income and
allowable expenses, manage vendors and recurring payments, and produce figures
for the SA105 Self Assessment property pages.

## Stack
Next.js (App Router) · TypeScript · Prisma + SQLite · Vitest

## Develop
```bash
npm install
npm run db:migrate -- --name init   # first run
npm run db:seed                     # seed UK tax categories
npm run dev
```

## Test
```bash
npm test
```
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: app shell + nav; replace scaffold boilerplate"
```

---

### Task 11: Vendors UI

**Files:**
- Create: `src/app/(app)/vendors/page.tsx`
- Create: `src/app/(app)/vendors/actions.ts`

**Context:** Server component lists vendors; server actions handle create and delete. Minimal form. Editing can be done by delete+recreate in v1 (keep it simple — full edit UI is not required this task; updateVendor exists in the data layer for Plan 3).

- [ ] **Step 1: Create `src/app/(app)/vendors/actions.ts`**

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { createVendor, deleteVendor } from "../../../lib/data/vendors";

export async function addVendorAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await createVendor({
    name,
    contactDetails: String(formData.get("contactDetails") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || null,
  });
  revalidatePath("/vendors");
}

export async function deleteVendorAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (id) await deleteVendor(id);
  revalidatePath("/vendors");
}
```

- [ ] **Step 2: Create `src/app/(app)/vendors/page.tsx`**

```tsx
import { listVendors } from "../../../lib/data/vendors";
import { addVendorAction, deleteVendorAction } from "./actions";

export default async function VendorsPage() {
  const vendors = await listVendors();
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Vendors</h1>

      <form action={addVendorAction} className="flex flex-wrap gap-2">
        <input name="name" placeholder="Name" required className="border px-2 py-1" />
        <input name="contactDetails" placeholder="Contact (optional)" className="border px-2 py-1" />
        <input name="notes" placeholder="Notes (optional)" className="border px-2 py-1" />
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Add</button>
      </form>

      <ul className="divide-y border">
        {vendors.map((v) => (
          <li key={v.id} className="flex items-center justify-between px-3 py-2">
            <span>{v.name}{v.contactDetails ? ` — ${v.contactDetails}` : ""}</span>
            <form action={deleteVendorAction}>
              <input type="hidden" name="id" value={v.id} />
              <button type="submit" className="text-red-600">Delete</button>
            </form>
          </li>
        ))}
        {vendors.length === 0 && <li className="px-3 py-2 text-gray-500">No vendors yet.</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Verify build + manual check**

Run: `npm run build` (expect success).
Manual: `npm run db:seed` if needed, then `npm run dev`, visit `/vendors`, add a vendor, confirm it appears, delete it, confirm it disappears.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: vendors UI"
```

---

### Task 12: Transactions UI

**Files:**
- Create: `src/app/(app)/transactions/page.tsx`
- Create: `src/app/(app)/transactions/actions.ts`

**Context:** Lists this property's transactions and provides an add form. Amount is entered in pounds and parsed via `parseAmountToPence`. Category and vendor come from the DB. Uses `getOrCreateDefaultProperty` so the single property always exists.

- [ ] **Step 1: Create `src/app/(app)/transactions/actions.ts`**

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { createTransaction, deleteTransaction } from "../../../lib/data/transactions";
import { getOrCreateDefaultProperty } from "../../../lib/data/property";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import type { Direction } from "../../../lib/tax/types";

export async function addTransactionAction(formData: FormData) {
  const property = await getOrCreateDefaultProperty();
  const amountPence = parseAmountToPence(String(formData.get("amount") ?? ""));
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

export async function deleteTransactionAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (id) await deleteTransaction(id);
  revalidatePath("/transactions");
}
```

- [ ] **Step 2: Create `src/app/(app)/transactions/page.tsx`**

```tsx
import { listTransactions } from "../../../lib/data/transactions";
import { getOrCreateDefaultProperty } from "../../../lib/data/property";
import { listVendors } from "../../../lib/data/vendors";
import { prisma } from "../../../lib/db";
import { formatGBP } from "../../../lib/tax/money";
import { addTransactionAction, deleteTransactionAction } from "./actions";

export default async function TransactionsPage() {
  const property = await getOrCreateDefaultProperty();
  const [txns, categories, vendors] = await Promise.all([
    listTransactions(property.id),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    listVendors(),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Transactions — {property.name}</h1>

      <form action={addTransactionAction} className="flex flex-wrap items-end gap-2">
        <input type="date" name="date" required className="border px-2 py-1" />
        <input name="amount" placeholder="£ amount" required className="border px-2 py-1" />
        <select name="direction" className="border px-2 py-1">
          <option value="in">In</option>
          <option value="out">Out</option>
        </select>
        <select name="categoryId" required className="border px-2 py-1">
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="vendorId" className="border px-2 py-1">
          <option value="">— vendor —</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <input name="description" placeholder="Description" className="border px-2 py-1" />
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Add</button>
      </form>

      <table className="w-full border text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="px-2 py-1">Date</th><th className="px-2 py-1">Category</th>
            <th className="px-2 py-1">Vendor</th><th className="px-2 py-1">Description</th>
            <th className="px-2 py-1 text-right">Amount</th><th />
          </tr>
        </thead>
        <tbody>
          {txns.map((t) => (
            <tr key={t.id} className="border-b">
              <td className="px-2 py-1">{t.date.toISOString().slice(0, 10)}</td>
              <td className="px-2 py-1">{t.category.name}</td>
              <td className="px-2 py-1">{t.vendor?.name ?? ""}</td>
              <td className="px-2 py-1">{t.description ?? ""}</td>
              <td className="px-2 py-1 text-right">{t.direction === "out" ? "−" : ""}{formatGBP(t.amountPence)}</td>
              <td className="px-2 py-1 text-right">
                <form action={deleteTransactionAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="text-red-600">×</button>
                </form>
              </td>
            </tr>
          ))}
          {txns.length === 0 && <tr><td colSpan={6} className="px-2 py-2 text-gray-500">No transactions yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Verify build + manual check**

Run: `npm run build` (expect success).
Manual: `npm run dev`, visit `/transactions`, add an income and an expense (enter amounts like `950` and `19.99`), confirm they list with correct £ formatting and the expense shows a minus. Confirm an invalid amount (e.g. `abc`) surfaces the parse error (Next will show the thrown error in dev).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: transactions UI with pounds-to-pence entry"
```

---

### Task 13: Recurring UI + generate action; Settings UI

**Files:**
- Create: `src/app/(app)/recurring/page.tsx`
- Create: `src/app/(app)/recurring/actions.ts`
- Create: `src/app/(app)/settings/page.tsx`
- Create: `src/app/(app)/settings/actions.ts`

**Context:** Recurring page lists rules, adds a rule, and has a "Generate due transactions now" button calling `materialiseDue(new Date())`. Settings page edits the property name/address.

- [ ] **Step 1: Create `src/app/(app)/recurring/actions.ts`**

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { createRecurringRule, deleteRecurringRule, materialiseDue } from "../../../lib/data/recurring";
import { getOrCreateDefaultProperty } from "../../../lib/data/property";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import type { Direction } from "../../../lib/tax/types";
import type { RecurFrequency } from "../../../lib/recurring/occurrences";

export async function addRecurringAction(formData: FormData) {
  const property = await getOrCreateDefaultProperty();
  await createRecurringRule({
    propertyId: property.id,
    categoryId: String(formData.get("categoryId")),
    amountPence: parseAmountToPence(String(formData.get("amount") ?? "")),
    direction: String(formData.get("direction")) as Direction,
    frequency: String(formData.get("frequency")) as RecurFrequency,
    dayOfMonth: Number(formData.get("dayOfMonth")),
    startDate: new Date(String(formData.get("startDate"))),
    endDate: String(formData.get("endDate") ?? "") ? new Date(String(formData.get("endDate"))) : null,
  });
  revalidatePath("/recurring");
}

export async function deleteRecurringAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (id) await deleteRecurringRule(id);
  revalidatePath("/recurring");
}

export async function generateNowAction() {
  await materialiseDue(new Date());
  revalidatePath("/recurring");
  revalidatePath("/transactions");
}
```

- [ ] **Step 2: Create `src/app/(app)/recurring/page.tsx`**

```tsx
import { listRecurringRules } from "../../../lib/data/recurring";
import { getOrCreateDefaultProperty } from "../../../lib/data/property";
import { prisma } from "../../../lib/db";
import { formatGBP } from "../../../lib/tax/money";
import { addRecurringAction, deleteRecurringAction, generateNowAction } from "./actions";

export default async function RecurringPage() {
  const property = await getOrCreateDefaultProperty();
  const [rules, categories] = await Promise.all([
    listRecurringRules(property.id),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Recurring payments</h1>

      <form action={addRecurringAction} className="flex flex-wrap items-end gap-2">
        <input name="amount" placeholder="£ amount" required className="border px-2 py-1" />
        <select name="direction" className="border px-2 py-1">
          <option value="in">In</option><option value="out">Out</option>
        </select>
        <select name="categoryId" required className="border px-2 py-1">
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="frequency" className="border px-2 py-1">
          <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option>
        </select>
        <input name="dayOfMonth" type="number" min="1" max="31" defaultValue="1" required className="w-20 border px-2 py-1" />
        <input name="startDate" type="date" required className="border px-2 py-1" />
        <input name="endDate" type="date" className="border px-2 py-1" />
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Add rule</button>
      </form>

      <form action={generateNowAction}>
        <button type="submit" className="bg-green-700 px-3 py-1 text-white">Generate due transactions now</button>
      </form>

      <ul className="divide-y border">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center justify-between px-3 py-2">
            <span>
              {r.frequency} · {r.category.name} · {r.direction === "out" ? "−" : ""}{formatGBP(r.amountPence)} · day {r.dayOfMonth}
            </span>
            <form action={deleteRecurringAction}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" className="text-red-600">Delete</button>
            </form>
          </li>
        ))}
        {rules.length === 0 && <li className="px-3 py-2 text-gray-500">No recurring rules yet.</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/(app)/settings/actions.ts`**

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { getOrCreateDefaultProperty, updateProperty } from "../../../lib/data/property";

export async function savePropertyAction(formData: FormData) {
  const property = await getOrCreateDefaultProperty();
  await updateProperty(property.id, {
    name: String(formData.get("name") ?? "").trim() || "My Property",
    address: String(formData.get("address") ?? "") || null,
  });
  revalidatePath("/settings");
  revalidatePath("/transactions");
}
```

- [ ] **Step 4: Create `src/app/(app)/settings/page.tsx`**

```tsx
import { getOrCreateDefaultProperty } from "../../../lib/data/property";
import { savePropertyAction } from "./actions";

export default async function SettingsPage() {
  const property = await getOrCreateDefaultProperty();
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <form action={savePropertyAction} className="space-y-3">
        <label className="block">
          <span className="block text-sm">Property name</span>
          <input name="name" defaultValue={property.name} className="w-full border px-2 py-1" />
        </label>
        <label className="block">
          <span className="block text-sm">Address</span>
          <input name="address" defaultValue={property.address ?? ""} className="w-full border px-2 py-1" />
        </label>
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Save</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Verify build + manual check**

Run: `npm run build` (expect success).
Manual: `npm run dev`. On `/settings` rename the property. On `/recurring` add a monthly rent rule starting a few months ago, click "Generate due transactions now", then check `/transactions` shows the back-dated rent entries. Click generate again and confirm no duplicates appear.

- [ ] **Step 6: Run full suite + commit**

Run: `npm test` (expect all green).

```bash
git add -A && git commit -m "feat: recurring UI with generate action; property settings UI"
```

---

## Self-Review

**Spec coverage (Phase 1 data-entry portion):**
- Prisma client wired with v7 driver adapter → Task 1. ✓
- Transactions CRUD → Tasks 8, 12. ✓
- Vendors CRUD → Tasks 6, 11. ✓
- Categories available for entry (seeded in Plan 1; listed in UI) → Tasks 8/12. ✓
- Recurring rules + auto-generation → Tasks 5, 9, 13. ✓
- Single-property handling, future-shaped for many → Task 7. ✓
- Pounds-to-pence entry discipline → Task 3, used in Tasks 12/13. ✓
- Prisma→tax-engine bridge (keeps engine pure) → Task 4. ✓
- Replace Plan 1 boilerplate follow-up → Task 10. ✓
- (Deferred to Plan 3: dashboard, reports, filtering, CSV export, SA105 summary screen, full inline editing, attachment upload UI, AI extraction.)

**Placeholder scan:** No TBD/TODO. Every code step shows complete code. The "edit via delete+recreate in v1" note in Task 11 is a deliberate scope decision, not a placeholder (updateVendor exists for Plan 3).

**Type consistency:** `Direction`/`TaxTxn` reused from `src/lib/tax/types.ts`; `RecurFrequency` defined once in `src/lib/recurring/occurrences.ts` and imported by `recurring.ts` and the recurring action; `materialiseDue` signature matches its test; data-layer input interfaces match the Prisma model field names. `formatGBP` reused from Plan 1.

---

## Notes for the implementer

- Server actions and data-layer modules import `src/lib/db.ts`, which is `server-only` — never import these into a client component.
- Integration tests rely on the Task 2 harness; if a data-layer test errors with "no such table", the globalSetup migration step didn't run — check `DATABASE_URL` is `file:./test.db` in `vitest.config.ts`.
- Dates from `<input type="date">` arrive as `YYYY-MM-DD`; `new Date("2025-06-01")` parses these as UTC midnight, which matches the tax engine's UTC assumptions. Keep it that way.
- Do not weaken the `parseAmountToPence` validation to make a form "just work" — surface the error.
