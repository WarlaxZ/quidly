# Company Profit-Extraction (Dividends + Director's Loan) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add company-level dividends and a director's loan account, with retained-earnings/distributable-reserves, a personal dividend-tax estimate, and s455 + beneficial-loan-BIK + Class 1A NIC, all surfaced on the company accounts page plus a ledger-management page.

**Architecture:** A new company-level `CompanyLedgerEntry` model (one table, three kinds). Pure tax functions (`directorLoan.ts`, `dividendTaxByYear.ts`) compute s455/BIK/dividend-tax in integer basis points. Server-only data layers (`companyLedger.ts`, `companyReserves.ts`, `directorLoan.ts`) compose them with the existing per-period `getCompanyAccounts`. UI: a ledger page for data entry + read-only computed sections on the accounts page.

**Tech Stack:** Next.js 16, TypeScript, Prisma v7 + SQLite, Vitest. Money is integer pence; tax rates are integer basis points.

---

## Conventions & context for the implementer

- **Prisma v7 migrations:** hand-author the SQL, then `npx prisma migrate deploy && npx prisma generate`. NEVER `prisma migrate dev`. After `generate`, the editor may show stale "property does not exist on PrismaClient" diagnostics — trust `npx tsc --noEmit` (0 errors) and passing tests, not the editor.
- **Integration tests** use `import { resetDb } from "../../../test/setup/resetDb"` + `beforeEach(async () => { await resetDb(); })`. Categories are seeded; get an id with `(await prisma.category.findFirstOrThrow({ where: { name } })).id`. Seeded names used here: income "Rent received".
- **Loan-balance sign convention:** `directorLoanBalance` = Σ`director_loan_out` − Σ`director_loan_in`. Positive = director OWES the company (overdrawn — the s455/BIK case).
- **Rates flagged to verify against HMRC** (2025/26): s455 33.75% (`3375` bps), official rate of interest 3.75% (`375` bps), Class 1A NIC 15% (`1500` bps), beneficial-loan threshold £10,000.
- All money math uses the integer basis-point idiom: `Math.round(amountPence * bps / 10000)`.

---

## Task 1: Ledger model + CRUD data layer

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260630160000_company_ledger/migration.sql`
- Modify: `test/setup/resetDb.ts`
- Create: `src/lib/data/companyLedger.ts`
- Modify: `src/lib/data/company.ts` (extend `deleteCompanyIfEmpty`)
- Test: `src/lib/data/companyLedger.test.ts`

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**

Add the enum and model (anywhere after the `Company` model), and add the back-relation field to `Company`:

```prisma
enum CompanyLedgerKind {
  dividend
  director_loan_in
  director_loan_out
}

model CompanyLedgerEntry {
  id          String            @id @default(cuid())
  companyId   String
  company     Company           @relation(fields: [companyId], references: [id])
  date        DateTime
  kind        CompanyLedgerKind
  amountPence Int
  note        String?
  createdAt   DateTime          @default(now())

  @@index([companyId, date])
}
```

In the existing `model Company { ... }`, add this line (alongside `properties Property[]`):

```prisma
  ledgerEntries          CompanyLedgerEntry[]
```

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260630160000_company_ledger/migration.sql`:

```sql
CREATE TABLE "CompanyLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "kind" TEXT NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyLedgerEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CompanyLedgerEntry_companyId_date_idx" ON "CompanyLedgerEntry"("companyId", "date");
```

- [ ] **Step 3: Apply the migration and regenerate the client**

Run: `cd /home/ash/projects/akaunting-ng && npx prisma migrate deploy && npx prisma generate`
Expected: "All migrations have been successfully applied." and the client regenerates with no error.

- [ ] **Step 4: Update `test/setup/resetDb.ts`**

Add a line to clear the new table BEFORE `company.deleteMany()` (it references Company):

```ts
import { prisma } from "../../src/lib/db";
export async function resetDb() {
  await prisma.loginAttempt.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.recurringRule.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.property.deleteMany();
  await prisma.companyLedgerEntry.deleteMany();
  await prisma.company.deleteMany();
  await prisma.taxYearProfile.deleteMany();
}
```

- [ ] **Step 5: Write the failing test `src/lib/data/companyLedger.test.ts`**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { listLedgerEntries, createLedgerEntry, deleteLedgerEntry } from "./companyLedger";
import { createCompany, deleteCompanyIfEmpty } from "./company";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => { await resetDb(); });

async function aCompany() {
  return createCompany({ name: "Co", accountingYearEndDay: 31, accountingYearEndMonth: 12 });
}

describe("companyLedger CRUD", () => {
  it("creates, lists (newest first) and deletes entries scoped to the company", async () => {
    const co = await aCompany();
    await createLedgerEntry({ companyId: co.id, date: new Date("2025-09-01"), kind: "dividend", amountPence: 5_000_00, note: "interim" });
    await createLedgerEntry({ companyId: co.id, date: new Date("2025-02-01"), kind: "director_loan_out", amountPence: 12_000_00 });
    const rows = await listLedgerEntries(co.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe("dividend"); // 2025-09-01 is newer than 2025-02-01
    expect(rows[0].amountPence).toBe(5_000_00);
    await deleteLedgerEntry(rows[1].id);
    expect(await listLedgerEntries(co.id)).toHaveLength(1);
  });

  it("blocks deleting a company that still has ledger entries", async () => {
    const co = await aCompany();
    await createLedgerEntry({ companyId: co.id, date: new Date("2025-09-01"), kind: "dividend", amountPence: 1_00 });
    await expect(deleteCompanyIfEmpty(co.id)).rejects.toThrow(/ledger|dividend|loan/i);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd /home/ash/projects/akaunting-ng && npx vitest run src/lib/data/companyLedger.test.ts`
Expected: FAIL — "Failed to resolve import './companyLedger'".

- [ ] **Step 7: Implement `src/lib/data/companyLedger.ts`**

```ts
import "server-only";
import { prisma } from "../db";
import type { CompanyLedgerKind } from "@prisma/client";

export interface LedgerEntryInput {
  companyId: string;
  date: Date;
  kind: CompanyLedgerKind;
  amountPence: number;
  note?: string | null;
}

export function listLedgerEntries(companyId: string) {
  return prisma.companyLedgerEntry.findMany({
    where: { companyId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

export function createLedgerEntry(input: LedgerEntryInput) {
  return prisma.companyLedgerEntry.create({
    data: {
      companyId: input.companyId,
      date: input.date,
      kind: input.kind,
      amountPence: input.amountPence,
      note: input.note ?? null,
    },
  });
}

export function deleteLedgerEntry(id: string) {
  return prisma.companyLedgerEntry.delete({ where: { id } });
}
```

Note: `CompanyLedgerKind` is imported from `@prisma/client` — the repo's Prisma client output location (confirmed: `src/lib/db.ts` imports `PrismaClient` from `@prisma/client`). The type is available after `prisma generate` (Task 1 Step 3).

- [ ] **Step 8: Extend `deleteCompanyIfEmpty` in `src/lib/data/company.ts`**

Replace the `deleteCompanyIfEmpty` function with one that also refuses when ledger entries exist:

```ts
export async function deleteCompanyIfEmpty(id: string): Promise<void> {
  if ((await getCompanyPropertyCount(id)) > 0) {
    throw new Error("Can't delete a company that still owns properties.");
  }
  const ledgerCount = await prisma.companyLedgerEntry.count({ where: { companyId: id } });
  if (ledgerCount > 0) {
    throw new Error("Can't delete a company that still has dividend or director's-loan entries.");
  }
  await prisma.company.delete({ where: { id } });
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd /home/ash/projects/akaunting-ng && npx vitest run src/lib/data/companyLedger.test.ts`
Expected: PASS (2 tests). Then `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260630160000_company_ledger src/lib/data/companyLedger.ts src/lib/data/company.ts src/lib/data/companyLedger.test.ts test/setup/resetDb.ts
git commit -m "feat: company ledger model + dividends/director-loan CRUD"
```

---

## Task 2: Director's-loan tax functions (pure)

**Files:**
- Create: `src/lib/tax/directorLoan.ts`
- Test: `src/lib/tax/directorLoan.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/tax/directorLoan.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { directorLoanBalance, s455Charge, beneficialLoanBenefit, type LedgerEntryLike } from "./directorLoan";

const e = (kind: string, amountPence: number, date: string): LedgerEntryLike => ({ kind, amountPence, date: new Date(date) });

describe("directorLoanBalance", () => {
  it("nets loan_out minus loan_in up to the as-of date; ignores dividends", () => {
    const entries = [
      e("director_loan_out", 5_000_00, "2025-06-01"),
      e("director_loan_in", 2_000_00, "2025-07-01"),
      e("dividend", 9_999_00, "2025-07-15"),
    ];
    expect(directorLoanBalance(entries, new Date("2025-12-31"))).toBe(3_000_00); // overdrawn
    expect(directorLoanBalance(entries, new Date("2025-06-15"))).toBe(5_000_00); // before the loan_in
  });
  it("is negative (in credit) when the director has lent the company money", () => {
    expect(directorLoanBalance([e("director_loan_in", 1_000_00, "2025-06-01")], new Date("2025-12-31"))).toBe(-1_000_00);
  });
});

describe("s455Charge (2025-26)", () => {
  it("is 33.75% of an overdrawn balance", () => {
    expect(s455Charge(3_000_00, "2025-26")).toBe(1_012_50); // 3,000 × 33.75%
  });
  it("is zero when the loan is in credit or nil", () => {
    expect(s455Charge(-500_00, "2025-26")).toBe(0);
    expect(s455Charge(0, "2025-26")).toBe(0);
  });
});

describe("beneficialLoanBenefit (2025-26)", () => {
  it("does not apply below the £10,000 threshold", () => {
    expect(beneficialLoanBenefit({ startBalancePence: 5_000_00, endBalancePence: 8_000_00, interestPaidPence: 0, year: "2025-26" }))
      .toEqual({ applies: false, bikPence: 0, class1aNicPence: 0 });
  });
  it("uses the averaging method and 3.75% official rate above the threshold", () => {
    // avg(12,000, 20,000) = 16,000; × 3.75% = 600 BIK; Class 1A = 15% × 600 = 90
    expect(beneficialLoanBenefit({ startBalancePence: 12_000_00, endBalancePence: 20_000_00, interestPaidPence: 0, year: "2025-26" }))
      .toEqual({ applies: true, bikPence: 600_00, class1aNicPence: 90_00 });
  });
  it("subtracts interest the director actually paid, flooring the BIK at zero", () => {
    expect(beneficialLoanBenefit({ startBalancePence: 12_000_00, endBalancePence: 20_000_00, interestPaidPence: 100_00, year: "2025-26" }))
      .toEqual({ applies: true, bikPence: 500_00, class1aNicPence: 75_00 });
    const r = beneficialLoanBenefit({ startBalancePence: 12_000_00, endBalancePence: 12_000_00, interestPaidPence: 500_00, year: "2025-26" });
    expect(r.bikPence).toBe(0); // 450 gross − 500 paid → floored
    expect(r.class1aNicPence).toBe(0);
    expect(r.applies).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/ash/projects/akaunting-ng && npx vitest run src/lib/tax/directorLoan.test.ts`
Expected: FAIL — "Failed to resolve import './directorLoan'".

- [ ] **Step 3: Implement `src/lib/tax/directorLoan.ts`**

```ts
/** Director's loan account: balance, s455 charge, and the beneficial-loan benefit-in-kind.
 *  v1 estimates with documented simplifications — not a P11D or a filed CT600.
 *  Rates are per-year basis-point config; VERIFY against HMRC each year. */

export interface LedgerEntryLike {
  date: Date;
  kind: string; // "dividend" | "director_loan_in" | "director_loan_out"
  amountPence: number;
}

export interface DLARates {
  s455Bps: number;                 // 3375 = 33.75%
  officialRateBps: number;         // 375 = 3.75% (official rate of interest) — VERIFY
  class1aBps: number;              // 1500 = 15% (employer Class 1A NIC) — VERIFY
  beneficialLoanThresholdPence: number; // 10,000
}

const DLA_2025_26: DLARates = {
  s455Bps: 3375,
  officialRateBps: 375,
  class1aBps: 1500,
  beneficialLoanThresholdPence: 10_000_00,
};

const DLA_RATES: Record<string, DLARates> = { "2025-26": DLA_2025_26 };
const LATEST_YEAR = "2025-26";
function ratesFor(year: string): DLARates {
  return DLA_RATES[year] ?? DLA_RATES[LATEST_YEAR];
}

/** Σ director_loan_out − Σ director_loan_in for entries dated on/before `asOf`.
 *  Positive = director owes the company (overdrawn). Dividends are ignored. */
export function directorLoanBalance(entries: LedgerEntryLike[], asOf: Date): number {
  let balance = 0;
  for (const e of entries) {
    if (e.date.getTime() > asOf.getTime()) continue;
    if (e.kind === "director_loan_out") balance += e.amountPence;
    else if (e.kind === "director_loan_in") balance -= e.amountPence;
  }
  return balance;
}

/** s455 charge on an overdrawn balance (0 if in credit/nil). */
export function s455Charge(overdrawnPence: number, year: string): number {
  if (overdrawnPence <= 0) return 0;
  return Math.round((overdrawnPence * ratesFor(year).s455Bps) / 10000);
}

export interface BeneficialLoanInput {
  startBalancePence: number;
  endBalancePence: number;
  interestPaidPence: number;
  year: string;
}
export interface BeneficialLoanResult {
  applies: boolean;
  bikPence: number;
  class1aNicPence: number;
}

/** Beneficial-loan BIK by the averaging method, plus the company's Class 1A NIC.
 *  Applies only when the balance exceeds the £10,000 threshold at the year's start or end. */
export function beneficialLoanBenefit(input: BeneficialLoanInput): BeneficialLoanResult {
  const r = ratesFor(input.year);
  const peak = Math.max(input.startBalancePence, input.endBalancePence);
  if (peak <= r.beneficialLoanThresholdPence) {
    return { applies: false, bikPence: 0, class1aNicPence: 0 };
  }
  const avg = Math.round((Math.max(0, input.startBalancePence) + Math.max(0, input.endBalancePence)) / 2);
  const gross = Math.round((avg * r.officialRateBps) / 10000);
  const bikPence = Math.max(0, gross - input.interestPaidPence);
  const class1aNicPence = Math.round((bikPence * r.class1aBps) / 10000);
  return { applies: true, bikPence, class1aNicPence };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/ash/projects/akaunting-ng && npx vitest run src/lib/tax/directorLoan.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/directorLoan.ts src/lib/tax/directorLoan.test.ts
git commit -m "feat: pure director's-loan tax functions (balance, s455, beneficial-loan BIK)"
```

---

## Task 3: Dividend-tax-by-year (pure)

**Files:**
- Create: `src/lib/tax/dividendTaxByYear.ts`
- Test: `src/lib/tax/dividendTaxByYear.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/tax/dividendTaxByYear.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { dividendTaxForYears } from "./dividendTaxByYear";

describe("dividendTaxForYears", () => {
  it("applies dividendTax per tax year, preserving order", () => {
    const rows = dividendTaxForYears([
      { taxYear: "2025-26", dividendPence: 10_000_00, otherIncomePence: 20_000_00 },
      { taxYear: "2024-25", dividendPence: 10_000_00, otherIncomePence: 45_000_00 },
    ]);
    expect(rows).toEqual([
      { taxYear: "2025-26", dividendPence: 10_000_00, taxPence: 831_25 },   // ordinary band
      { taxYear: "2024-25", dividendPence: 10_000_00, taxPence: 2_013_75 }, // straddles basic→higher
    ]);
  });
  it("returns an empty array for no dividends", () => {
    expect(dividendTaxForYears([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/ash/projects/akaunting-ng && npx vitest run src/lib/tax/dividendTaxByYear.test.ts`
Expected: FAIL — "Failed to resolve import './dividendTaxByYear'".

- [ ] **Step 3: Implement `src/lib/tax/dividendTaxByYear.ts`**

```ts
import { dividendTax } from "./dividendTax";

export interface DividendYearInput {
  taxYear: string;
  dividendPence: number;
  otherIncomePence: number;
}
export interface DividendYearTax {
  taxYear: string;
  dividendPence: number;
  taxPence: number;
}

/** Estimate dividend tax for each tax year's dividend total (top-slice of other income). */
export function dividendTaxForYears(rows: DividendYearInput[]): DividendYearTax[] {
  return rows.map((r) => ({
    taxYear: r.taxYear,
    dividendPence: r.dividendPence,
    taxPence: dividendTax(r.dividendPence, r.otherIncomePence, r.taxYear),
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/ash/projects/akaunting-ng && npx vitest run src/lib/tax/dividendTaxByYear.test.ts`
Expected: PASS (2 tests). Note the 2024-25 row falls back to the latest dividend-rate config, which is the intended v1 behaviour.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/dividendTaxByYear.ts src/lib/tax/dividendTaxByYear.test.ts
git commit -m "feat: per-tax-year dividend tax helper"
```

---

## Task 4: Reserves + dividend-tax data layer

**Files:**
- Modify: `src/lib/tax/companyPeriod.ts` (add `companyPeriodYearOf`)
- Modify: `src/lib/tax/companyPeriod.test.ts` (test the new helper)
- Create: `src/lib/data/companyReserves.ts`
- Test: `src/lib/data/companyReserves.test.ts`

- [ ] **Step 1: Add `companyPeriodYearOf` to `src/lib/tax/companyPeriod.ts`**

Append this pure helper (keep the existing `companyAccountingPeriod`):

```ts
/** The accounting-period year that a given date falls in, for a company with this year-end.
 *  e.g. year-end 31 Dec: 2025-06-01 → 2025. Year-end 31 Mar: 2025-06-01 → 2026. */
export function companyPeriodYearOf(date: Date, yearEndDay: number, yearEndMonth: number): number {
  const y = date.getUTCFullYear();
  const endThisCalendarYear = Date.UTC(y, yearEndMonth - 1, yearEndDay);
  return date.getTime() <= endThisCalendarYear ? y : y + 1;
}
```

- [ ] **Step 2: Add a test in `src/lib/tax/companyPeriod.test.ts`**

Add inside the existing describe block (or a new one) — import `companyPeriodYearOf` at the top alongside the existing import:

```ts
  it("maps a date to its accounting-period year", () => {
    expect(companyPeriodYearOf(new Date("2025-06-01"), 31, 12)).toBe(2025);
    expect(companyPeriodYearOf(new Date("2025-06-01"), 31, 3)).toBe(2026);
    expect(companyPeriodYearOf(new Date("2025-03-31"), 31, 3)).toBe(2025);
  });
```

(Update the import line in that test file to include `companyPeriodYearOf`.)

- [ ] **Step 3: Run that test to verify it fails then passes**

Run: `cd /home/ash/projects/akaunting-ng && npx vitest run src/lib/tax/companyPeriod.test.ts`
First it FAILS to import `companyPeriodYearOf`; after Step 1 is saved it PASSES. (If you wrote Step 1 first, it passes directly — that is fine for this pure helper.)

- [ ] **Step 4: Write the failing test `src/lib/data/companyReserves.test.ts`**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { getCompanyReserves, getCompanyDividendTax } from "./companyReserves";
import { createCompany } from "./company";
import { createProperty } from "./property";
import { createTransaction } from "./transactions";
import { createLedgerEntry } from "./companyLedger";
import { updateProfile } from "./taxProfile";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function rentCat() { return (await prisma.category.findFirstOrThrow({ where: { name: "Rent received" } })).id; }
beforeEach(async () => { await resetDb(); });

// Company year-end 31 Dec. £10,000 rent in 2025 and in 2026 → £10,000 profit each → £1,900 CT → £8,100 after tax each.
async function setup() {
  const co = await createCompany({ name: "Bristol", accountingYearEndDay: 31, accountingYearEndMonth: 12 });
  const prop = await createProperty({ name: "Flat", ownershipType: "company", companyId: co.id });
  const rent = await rentCat();
  await createTransaction({ propertyId: prop.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 10_000_00, direction: "in" });
  await createTransaction({ propertyId: prop.id, categoryId: rent, date: new Date("2026-06-01"), amountPence: 10_000_00, direction: "in" });
  return co;
}

describe("getCompanyReserves", () => {
  it("accumulates after-tax profit across periods and subtracts dividends", async () => {
    const co = await setup();
    await createLedgerEntry({ companyId: co.id, date: new Date("2025-09-01"), kind: "dividend", amountPence: 5_000_00 });
    await createLedgerEntry({ companyId: co.id, date: new Date("2026-09-01"), kind: "dividend", amountPence: 3_000_00 });

    const r = await getCompanyReserves(co.id, 2026);
    expect(r).not.toBeNull();
    expect(r!.periodProfitAfterTaxPence).toBe(8_100_00);
    expect(r!.periodDividendsPence).toBe(3_000_00);
    expect(r!.cumulativeProfitAfterTaxPence).toBe(16_200_00);
    expect(r!.cumulativeDividendsPence).toBe(8_000_00);
    expect(r!.retainedEarningsPence).toBe(8_200_00);
    expect(r!.unlawful).toBe(false);
  });

  it("flags an unlawful dividend that exceeds distributable reserves", async () => {
    const co = await setup();
    await createLedgerEntry({ companyId: co.id, date: new Date("2026-09-01"), kind: "dividend", amountPence: 20_000_00 });
    const r = await getCompanyReserves(co.id, 2026);
    expect(r!.cumulativeDividendsPence).toBe(20_000_00);
    expect(r!.unlawful).toBe(true); // 20,000 > 16,200 cumulative after-tax profit
  });

  it("returns zeros (not null) for a company with no activity", async () => {
    const co = await createCompany({ name: "Empty", accountingYearEndDay: 31, accountingYearEndMonth: 12 });
    const r = await getCompanyReserves(co.id, 2026);
    expect(r).toEqual({
      periodProfitAfterTaxPence: 0, periodDividendsPence: 0,
      cumulativeProfitAfterTaxPence: 0, cumulativeDividendsPence: 0,
      retainedEarningsPence: 0, unlawful: false,
    });
  });
});

describe("getCompanyDividendTax", () => {
  it("estimates dividend tax per tax year using the year's other income", async () => {
    const co = await setup();
    await updateProfile("2025-26", { otherIncomePence: 20_000_00 });
    await createLedgerEntry({ companyId: co.id, date: new Date("2025-09-01"), kind: "dividend", amountPence: 10_000_00 });
    const rows = await getCompanyDividendTax(co.id);
    expect(rows).toEqual([{ taxYear: "2025-26", dividendPence: 10_000_00, taxPence: 831_25 }]);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd /home/ash/projects/akaunting-ng && npx vitest run src/lib/data/companyReserves.test.ts`
Expected: FAIL — "Failed to resolve import './companyReserves'".

- [ ] **Step 6: Implement `src/lib/data/companyReserves.ts`**

```ts
import "server-only";
import { prisma } from "../db";
import { getCompany } from "./company";
import { getCompanyAccounts } from "./companyAccounts";
import { getOrCreateProfile } from "./taxProfile";
import { companyAccountingPeriod, companyPeriodYearOf } from "../tax/companyPeriod";
import { getTaxYear } from "../tax/taxYear";
import { dividendTaxForYears, type DividendYearInput } from "../tax/dividendTaxByYear";

export interface CompanyReserves {
  periodProfitAfterTaxPence: number;
  periodDividendsPence: number;
  cumulativeProfitAfterTaxPence: number;
  cumulativeDividendsPence: number;
  retainedEarningsPence: number;
  unlawful: boolean;
}

export async function getCompanyReserves(companyId: string, periodYear: number): Promise<CompanyReserves | null> {
  const company = await getCompany(companyId);
  if (!company) return null;
  const { start, end } = companyAccountingPeriod(company.accountingYearEndDay, company.accountingYearEndMonth, periodYear);

  // Earliest activity across company transactions and dividend entries determines the first period to sum.
  const [firstTxn, firstDiv, dividendsToEnd, periodDividendAgg] = await Promise.all([
    prisma.transaction.findFirst({ where: { property: { companyId } }, orderBy: { date: "asc" }, select: { date: true } }),
    prisma.companyLedgerEntry.findFirst({ where: { companyId, kind: "dividend" }, orderBy: { date: "asc" }, select: { date: true } }),
    prisma.companyLedgerEntry.aggregate({ where: { companyId, kind: "dividend", date: { lte: end } }, _sum: { amountPence: true } }),
    prisma.companyLedgerEntry.aggregate({ where: { companyId, kind: "dividend", date: { gte: start, lte: end } }, _sum: { amountPence: true } }),
  ]);

  const cumulativeDividendsPence = dividendsToEnd._sum.amountPence ?? 0;
  const periodDividendsPence = periodDividendAgg._sum.amountPence ?? 0;

  const earliestTimes = [firstTxn?.date.getTime(), firstDiv?.date.getTime()].filter((t): t is number => t !== undefined);
  if (earliestTimes.length === 0) {
    return {
      periodProfitAfterTaxPence: 0, periodDividendsPence, cumulativeProfitAfterTaxPence: 0,
      cumulativeDividendsPence, retainedEarningsPence: -cumulativeDividendsPence, unlawful: cumulativeDividendsPence > 0,
    };
  }

  const earliest = new Date(Math.min(...earliestTimes));
  const firstYear = companyPeriodYearOf(earliest, company.accountingYearEndDay, company.accountingYearEndMonth);

  let cumulativeProfitAfterTaxPence = 0;
  let periodProfitAfterTaxPence = 0;
  for (let y = firstYear; y <= periodYear; y++) {
    const acc = await getCompanyAccounts(companyId, y);
    const afterTax = acc?.profitAfterTaxPence ?? 0;
    cumulativeProfitAfterTaxPence += afterTax;
    if (y === periodYear) periodProfitAfterTaxPence = afterTax;
  }

  return {
    periodProfitAfterTaxPence,
    periodDividendsPence,
    cumulativeProfitAfterTaxPence,
    cumulativeDividendsPence,
    retainedEarningsPence: cumulativeProfitAfterTaxPence - cumulativeDividendsPence,
    unlawful: cumulativeDividendsPence > cumulativeProfitAfterTaxPence,
  };
}

export interface CompanyDividendTaxRow { taxYear: string; dividendPence: number; taxPence: number; }

export async function getCompanyDividendTax(companyId: string): Promise<CompanyDividendTaxRow[]> {
  const dividends = await prisma.companyLedgerEntry.findMany({
    where: { companyId, kind: "dividend" },
    orderBy: { date: "asc" },
    select: { date: true, amountPence: true },
  });
  const byYear = new Map<string, number>();
  for (const d of dividends) {
    const ty = getTaxYear(d.date);
    byYear.set(ty, (byYear.get(ty) ?? 0) + d.amountPence);
  }
  const inputs: DividendYearInput[] = [];
  for (const [taxYear, dividendPence] of byYear) {
    const profile = await getOrCreateProfile(taxYear);
    inputs.push({ taxYear, dividendPence, otherIncomePence: profile.otherIncomePence });
  }
  return dividendTaxForYears(inputs);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd /home/ash/projects/akaunting-ng && npx vitest run src/lib/data/companyReserves.test.ts`
Expected: PASS (4 tests). Then `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/tax/companyPeriod.ts src/lib/tax/companyPeriod.test.ts src/lib/data/companyReserves.ts src/lib/data/companyReserves.test.ts
git commit -m "feat: company reserves/retained-earnings + per-year dividend tax"
```

---

## Task 5: Director's-loan summary data layer

**Files:**
- Create: `src/lib/data/directorLoan.ts`
- Test: `src/lib/data/directorLoan.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/data/directorLoan.test.ts`**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { getDirectorLoanSummary } from "./directorLoan";
import { createCompany } from "./company";
import { createLedgerEntry } from "./companyLedger";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => { await resetDb(); });

describe("getDirectorLoanSummary", () => {
  it("computes the period-end balance, s455, and the beneficial-loan BIK for the tax year", async () => {
    // Year-end 31 Dec; periodYear 2025. Two loans out → £20,000 overdrawn at 2025-12-31.
    const co = await createCompany({ name: "Co", accountingYearEndDay: 31, accountingYearEndMonth: 12 });
    await createLedgerEntry({ companyId: co.id, date: new Date("2025-02-01"), kind: "director_loan_out", amountPence: 12_000_00 });
    await createLedgerEntry({ companyId: co.id, date: new Date("2025-08-01"), kind: "director_loan_out", amountPence: 8_000_00 });

    const s = await getDirectorLoanSummary(co.id, 2025);
    expect(s).not.toBeNull();
    expect(s!.balancePence).toBe(20_000_00);     // overdrawn
    expect(s!.s455Pence).toBe(6_750_00);         // 20,000 × 33.75%
    expect(s!.taxYear).toBe("2025-26");          // tax year containing 2025-12-31
    // TY-start balance (6 Apr 2025) = 12,000; TY-end balance (5 Apr 2026) = 20,000; avg 16,000 × 3.75% = 600 BIK
    expect(s!.bik).toEqual({ applies: true, bikPence: 600_00, class1aNicPence: 90_00 });
  });

  it("returns null for a missing company", async () => {
    expect(await getDirectorLoanSummary("nope", 2025)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/ash/projects/akaunting-ng && npx vitest run src/lib/data/directorLoan.test.ts`
Expected: FAIL — "Failed to resolve import './directorLoan'".

- [ ] **Step 3: Implement `src/lib/data/directorLoan.ts`**

```ts
import "server-only";
import { prisma } from "../db";
import { getCompany } from "./company";
import { companyAccountingPeriod } from "../tax/companyPeriod";
import { taxYearRange, getTaxYear } from "../tax/taxYear";
import { directorLoanBalance, s455Charge, beneficialLoanBenefit, type LedgerEntryLike, type BeneficialLoanResult } from "../tax/directorLoan";

export interface DirectorLoanSummary {
  balancePence: number;   // signed; positive = director owes the company (overdrawn)
  s455Pence: number;
  taxYear: string;        // the UK tax year containing the period end (the BIK basis)
  bik: BeneficialLoanResult;
}

export async function getDirectorLoanSummary(
  companyId: string,
  periodYear: number,
  interestPaidPence = 0,
): Promise<DirectorLoanSummary | null> {
  const company = await getCompany(companyId);
  if (!company) return null;
  const { end } = companyAccountingPeriod(company.accountingYearEndDay, company.accountingYearEndMonth, periodYear);

  const rows = await prisma.companyLedgerEntry.findMany({
    where: { companyId, kind: { in: ["director_loan_in", "director_loan_out"] } },
    select: { date: true, kind: true, amountPence: true },
  });
  const entries: LedgerEntryLike[] = rows.map((r) => ({ date: r.date, kind: r.kind, amountPence: r.amountPence }));

  const balancePence = directorLoanBalance(entries, end);
  const taxYear = getTaxYear(end);
  const s455Pence = s455Charge(balancePence, taxYear);

  const ty = taxYearRange(taxYear);
  const tyEnd = new Date(ty.end.getTime() - 1); // 5 April (the range end is the exclusive 6 April)
  const startBalancePence = directorLoanBalance(entries, ty.start);
  const endBalancePence = directorLoanBalance(entries, tyEnd);
  const bik = beneficialLoanBenefit({ startBalancePence, endBalancePence, interestPaidPence, year: taxYear });

  return { balancePence, s455Pence, taxYear, bik };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/ash/projects/akaunting-ng && npx vitest run src/lib/data/directorLoan.test.ts`
Expected: PASS (2 tests). Then `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/directorLoan.ts src/lib/data/directorLoan.test.ts
git commit -m "feat: director's-loan summary (balance, s455, beneficial-loan BIK)"
```

---

## Task 6: Ledger actions + ledger page

**Files:**
- Modify: `src/app/(app)/companies/actions.ts` (add two actions)
- Create: `src/app/(app)/companies/[id]/ledger/page.tsx`

- [ ] **Step 1: Add the actions to `src/app/(app)/companies/actions.ts`**

Add these imports at the top (extend the existing import from company-data as needed) and append the two actions. Use the existing `requireSession`, `redirect`, `revalidatePath` already imported in the file:

```ts
import { createLedgerEntry, deleteLedgerEntry } from "../../../lib/data/companyLedger";
import { poundsToPence } from "../../../lib/tax/money";

const LEDGER_KINDS = ["dividend", "director_loan_in", "director_loan_out"] as const;

export async function addLedgerEntryAction(formData: FormData) {
  await requireSession();
  const companyId = String(formData.get("companyId"));
  const base = `/companies/${companyId}/ledger`;
  const kind = String(formData.get("kind"));
  if (!(LEDGER_KINDS as readonly string[]).includes(kind)) redirect(`${base}?error=${encodeURIComponent("Choose a valid entry type.")}`);
  const dateStr = String(formData.get("date") ?? "");
  const date = new Date(dateStr);
  if (!dateStr || Number.isNaN(date.getTime())) redirect(`${base}?error=${encodeURIComponent("Enter a valid date.")}`);
  const amountPence = poundsToPence(Number(formData.get("amount")));
  if (!Number.isFinite(amountPence) || amountPence <= 0) redirect(`${base}?error=${encodeURIComponent("Enter an amount greater than zero.")}`);
  const note = String(formData.get("note") ?? "").trim() || null;
  await createLedgerEntry({ companyId, date, kind: kind as (typeof LEDGER_KINDS)[number], amountPence, note });
  revalidatePath(base);
  redirect(base);
}

export async function deleteLedgerEntryAction(formData: FormData) {
  await requireSession();
  const companyId = String(formData.get("companyId"));
  await deleteLedgerEntry(String(formData.get("id")));
  revalidatePath(`/companies/${companyId}/ledger`);
  redirect(`/companies/${companyId}/ledger`);
}
```

- [ ] **Step 2: Create `src/app/(app)/companies/[id]/ledger/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getCompany } from "../../../../../lib/data/company";
import { listLedgerEntries } from "../../../../../lib/data/companyLedger";
import { addLedgerEntryAction, deleteLedgerEntryAction } from "../../actions";
import { formatGBP } from "../../../../../lib/tax/money";

const KIND_LABEL: Record<string, string> = {
  dividend: "Dividend",
  director_loan_in: "Director loan in (you → company)",
  director_loan_out: "Director loan out (company → you)",
};

export default async function CompanyLedgerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const company = await getCompany(id);
  if (!company) notFound();
  const entries = await listLedgerEntries(id);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{company.name} — dividends & director&apos;s loan</h1>
      <a href={`/companies/${id}/accounts`} className="text-sm text-blue-600 hover:underline">← Back to accounts</a>
      {error && <p className="rounded bg-red-100 px-3 py-2 text-red-700">{error}</p>}

      <form action={addLedgerEntryAction} className="grid grid-cols-2 gap-3 rounded border p-4">
        <input type="hidden" name="companyId" value={id} />
        <label className="block">
          <span className="block text-sm">Type</span>
          <select name="kind" className="w-full border px-2 py-1">
            <option value="dividend">Dividend (company → you)</option>
            <option value="director_loan_out">Director loan out (company → you)</option>
            <option value="director_loan_in">Director loan in (you → company)</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-sm">Date</span>
          <input type="date" name="date" className="w-full border px-2 py-1" />
        </label>
        <label className="block">
          <span className="block text-sm">Amount (£)</span>
          <input name="amount" className="w-full border px-2 py-1" />
        </label>
        <label className="block">
          <span className="block text-sm">Note (optional)</span>
          <input name="note" className="w-full border px-2 py-1" />
        </label>
        <div className="col-span-2">
          <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Add entry</button>
        </div>
      </form>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">No entries yet.</p>
      ) : (
        <table className="w-full border text-sm">
          <thead><tr className="border-b bg-gray-50 text-left"><th className="px-2 py-1">Date</th><th className="px-2 py-1">Type</th><th className="px-2 py-1 text-right">Amount</th><th className="px-2 py-1">Note</th><th className="px-2 py-1"></th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b">
                <td className="px-2 py-1">{iso(e.date)}</td>
                <td className="px-2 py-1">{KIND_LABEL[e.kind] ?? e.kind}</td>
                <td className="px-2 py-1 text-right">{formatGBP(e.amountPence)}</td>
                <td className="px-2 py-1">{e.note}</td>
                <td className="px-2 py-1 text-right">
                  <form action={deleteLedgerEntryAction}>
                    <input type="hidden" name="companyId" value={id} />
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" className="text-red-600 hover:underline">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + full suite**

Run: `cd /home/ash/projects/akaunting-ng && npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.
Run: `npm test` → all pass (no new unit tests this task; the server actions/page are covered by the live-run in Task 7).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/companies/actions.ts" "src/app/(app)/companies/[id]/ledger/page.tsx"
git commit -m "feat: company ledger management page + actions"
```

---

## Task 7: Computed sections on the accounts page

**Files:**
- Modify: `src/app/(app)/companies/[id]/accounts/page.tsx`

- [ ] **Step 1: Replace `src/app/(app)/companies/[id]/accounts/page.tsx`**

This extends the existing page (keep its existing accounts table) with the Reserves, Dividend-tax, and Director's-loan sections, an optional `interestPaid` query param, and a link to the ledger page:

```tsx
import { notFound } from "next/navigation";
import { getCompanyAccounts } from "../../../../../lib/data/companyAccounts";
import { getCompanyReserves, getCompanyDividendTax } from "../../../../../lib/data/companyReserves";
import { getDirectorLoanSummary } from "../../../../../lib/data/directorLoan";
import { formatGBP, poundsToPence } from "../../../../../lib/tax/money";

export default async function CompanyAccountsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string; interestPaid?: string }> }) {
  const { id } = await params;
  const { year, interestPaid } = await searchParams;
  const periodYear = year && !Number.isNaN(Number(year)) ? Number(year) : new Date().getUTCFullYear();
  const interestPaidPence = interestPaid && Number.isFinite(Number(interestPaid)) && Number(interestPaid) >= 0 ? poundsToPence(Number(interestPaid)) : 0;

  const accounts = await getCompanyAccounts(id, periodYear);
  if (!accounts) notFound();
  const reserves = await getCompanyReserves(id, periodYear);
  const dividendTax = await getCompanyDividendTax(id);
  const loan = await getDirectorLoanSummary(id, periodYear, interestPaidPence);

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const Row = ({ label, pence, bold }: { label: string; pence: number; bold?: boolean }) => (
    <tr className={`border-b ${bold ? "font-semibold" : ""}`}>
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 text-right">{formatGBP(pence)}</td>
    </tr>
  );

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{accounts.company.name} — accounts</h1>
      <p className="text-sm text-gray-600">
        Accounting period {iso(accounts.period.start)} to {iso(accounts.period.end)}.{" "}
        <span className="inline-flex gap-2">
          <a href={`/companies/${id}/accounts?year=${periodYear - 1}`} className="text-blue-600 hover:underline">← {periodYear - 1}</a>
          <a href={`/companies/${id}/accounts?year=${periodYear + 1}`} className="text-blue-600 hover:underline">{periodYear + 1} →</a>
        </span>
        {" · "}
        <a href={`/companies/${id}/ledger`} className="text-blue-600 hover:underline">Manage dividends &amp; director&apos;s loan →</a>
      </p>

      <table className="w-full border">
        <tbody>
          <Row label="Rental income" pence={accounts.incomePence} />
          <Row label="Allowable expenses (incl. mortgage interest)" pence={accounts.expensesPence} />
          <Row label="Profit before tax" pence={accounts.profitBeforeTaxPence} bold />
          <Row label={`Corporation tax (${(accounts.effectiveRate * 100).toFixed(1)}%, ${accounts.band} rate)`} pence={accounts.corporationTaxPence} />
          <Row label="Profit after tax" pence={accounts.profitAfterTaxPence} bold />
        </tbody>
      </table>

      {reserves && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Reserves</h2>
          <table className="w-full border">
            <tbody>
              <Row label="Profit after tax (this period)" pence={reserves.periodProfitAfterTaxPence} />
              <Row label="Dividends paid (this period)" pence={reserves.periodDividendsPence} />
              <Row label="Retained earnings carried forward" pence={reserves.retainedEarningsPence} bold />
            </tbody>
          </table>
          {reserves.unlawful && (
            <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-700">
              Dividends paid exceed the company&apos;s distributable profits — this may be an unlawful distribution.
              Dividends can only be paid out of retained, after-tax profits.
            </p>
          )}
        </section>
      )}

      {dividendTax.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Dividend tax (personal, by tax year)</h2>
          <table className="w-full border">
            <thead><tr className="border-b bg-gray-50 text-left"><th className="px-3 py-2">Tax year</th><th className="px-3 py-2 text-right">Dividends</th><th className="px-3 py-2 text-right">Estimated dividend tax</th></tr></thead>
            <tbody>
              {dividendTax.map((d) => (
                <tr key={d.taxYear} className="border-b">
                  <td className="px-3 py-2">{d.taxYear}</td>
                  <td className="px-3 py-2 text-right">{formatGBP(d.dividendPence)}</td>
                  <td className="px-3 py-2 text-right">{formatGBP(d.taxPence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400">Dividend tax is a personal Self-Assessment matter (your other income affects the rate), separate from the company&apos;s accounting period.</p>
        </section>
      )}

      {loan && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Director&apos;s loan account</h2>
          <table className="w-full border">
            <tbody>
              <Row label={loan.balancePence >= 0 ? "Balance owed to the company (overdrawn)" : "Balance owed to the director (in credit)"} pence={Math.abs(loan.balancePence)} bold />
              {loan.balancePence > 0 && <Row label="Potential s455 charge (33.75%)" pence={loan.s455Pence} />}
              {loan.bik.applies && <Row label={`Beneficial-loan benefit-in-kind (${loan.taxYear})`} pence={loan.bik.bikPence} />}
              {loan.bik.applies && <Row label="Employer Class 1A NIC on the benefit" pence={loan.bik.class1aNicPence} />}
            </tbody>
          </table>
          {loan.balancePence > 0 && (
            <p className="text-xs text-gray-500">
              The s455 charge applies only if the loan isn&apos;t repaid within 9 months and 1 day of the period end, and is refundable once repaid.
              The benefit-in-kind uses the averaging method and the official rate of interest.
            </p>
          )}
          <form method="get" className="flex items-end gap-2 text-sm">
            <input type="hidden" name="year" value={periodYear} />
            <label>
              <span className="block">Interest the director paid this year (£)</span>
              <input name="interestPaid" defaultValue={interestPaidPence ? interestPaidPence / 100 : ""} className="border px-2 py-1" />
            </label>
            <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Recalculate</button>
          </form>
        </section>
      )}

      <p className="text-xs text-gray-400">
        Estimate only — not filed accounts, a CT600, or a P11D. Corporation tax assumes a standalone company and a full 12-month period.
        s455, the official rate of interest, and Class 1A NIC rates change and have timing rules — verify the figures with your accountant.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + full suite**

Run: `cd /home/ash/projects/akaunting-ng && npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.
Run: `npm test` → all pass.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/companies/[id]/accounts/page.tsx"
git commit -m "feat: reserves, dividend-tax and director's-loan sections on company accounts"
```

---

## Self-review notes (already reconciled)

- **Spec coverage:** ledger model + CRUD (Task 1); s455/BIK/balance pure fns (Task 2); per-year dividend tax (Task 3); reserves + unlawful guard + dividend-tax data (Task 4); director's-loan summary (Task 5); ledger page + actions (Task 6); accounts-page sections + caveats (Task 7). The flow live-run is performed after Task 7 by the executing skill.
- **Type consistency:** `LedgerEntryLike` (date/kind/amountPence) defined in Task 2 and reused in Task 5; `BeneficialLoanResult` defined in Task 2 and used in Task 5's `DirectorLoanSummary`; `DividendYearInput`/`DividendYearTax` from Task 3 used in Task 4; `getCompanyReserves`/`getCompanyDividendTax`/`getDirectorLoanSummary` signatures match their callers in Task 7; `createLedgerEntry` input shape consistent across Tasks 1/4/6.
- **Verified worked numbers:** £10k company profit → £1,900 CT → £8,100 after tax; two periods → £16,200 cumulative; −£8,000 dividends → £8,200 retained. s455 on £20k = £6,750. BIK avg(£12k,£20k)=£16k × 3.75% = £600, Class 1A 15% = £90. Dividend tax £10k on £20k other income = £831.25. All asserted exactly.
- **Prisma enum import path** is the one open detail (Task 1 Step 7) — the implementer must match the repo's existing client import location; flagged explicitly.
