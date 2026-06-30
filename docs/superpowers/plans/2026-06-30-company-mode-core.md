# Limited-Company Mode (Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add limited-company support: a Company entity owning properties, a corporation-tax engine (mortgage fully deductible; CT 19%/25% + marginal relief), and a per-company accounts view on the company's own accounting period.

**Architecture:** A pure, exhaustively-tested corporation-tax engine and accounting-period helper; a Company data layer + server-only accounts aggregation; Companies CRUD UI + a company accounts page. Company properties stay excluded from the personal SA105 (existing `ownershipType` filter). No change to the personal tax engine.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Prisma v7 + SQLite, Vitest.

Reference spec: `docs/superpowers/specs/2026-06-30-company-mode-core-design.md`. Money is integer pence; new mutations call `requireSession()`; routes gated by `src/proxy.ts`. Prisma v7 migrations: hand-authored SQL + `prisma migrate deploy` + `prisma generate`. Profit-extraction (dividends/director's loan) is a SEPARATE later plan.

---

## File Structure

- `src/lib/tax/corporationTax.ts` — `companyTaxableProfit`, `corporationTax` (pure) (NEW)
- `src/lib/tax/companyPeriod.ts` — `companyAccountingPeriod` (pure) (NEW)
- `prisma/schema.prisma` + migration — `Company` model + `Property.companyId` (MODIFY)
- `src/lib/data/company.ts` — Company CRUD + delete-protection (NEW)
- `src/lib/data/companyAccounts.ts` — `getCompanyAccounts` (NEW)
- `src/lib/data/property.ts` — `PropertyInput.companyId`; thread through create/update (MODIFY)
- `src/app/(app)/properties/page.tsx` + `[id]/edit/page.tsx` + `actions.ts` — company `<select>` (MODIFY)
- `src/app/(app)/companies/` — list page + actions + `[id]/edit` + `[id]/accounts` (NEW)
- `src/app/(app)/layout.tsx` — "Companies" nav link (MODIFY)

---

### Task 1: Corporation-tax engine (pure)

**Files:**
- Create: `src/lib/tax/corporationTax.ts`, `src/lib/tax/corporationTax.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { companyTaxableProfit, corporationTax } from "./corporationTax";
import type { TaxTxn } from "./types";

const t = (over: Partial<TaxTxn>): TaxTxn => ({
  date: new Date("2025-06-01"), amountPence: 0, direction: "in",
  categoryKind: "income", allowable: true, sa105Box: null, ...over,
});

describe("companyTaxableProfit", () => {
  it("deducts finance (mortgage) as an expense, unlike personal", () => {
    const txns: TaxTxn[] = [
      t({ amountPence: 10_000_00, categoryKind: "income" }),
      t({ amountPence: 1_000_00, categoryKind: "expense", direction: "out" }),
      t({ amountPence: 3_000_00, categoryKind: "finance", direction: "out" }),
      t({ amountPence: 9_99_00, categoryKind: "capital", direction: "out", allowable: false }),
    ];
    const r = companyTaxableProfit(txns);
    expect(r.incomePence).toBe(10_000_00);
    expect(r.expensesPence).toBe(4_000_00); // expense + finance
    expect(r.profitPence).toBe(6_000_00);
  });
});

describe("corporationTax (2025-26)", () => {
  it("small profits rate 19% up to £50,000", () => {
    expect(corporationTax(40_000_00)).toEqual({ taxPence: 7_600_00, effectiveRate: 0.19, band: "small" });
    expect(corporationTax(50_000_00).taxPence).toBe(9_500_00); // boundary, still small
  });
  it("main rate 25% at/above £250,000", () => {
    const r = corporationTax(300_000_00);
    expect(r.taxPence).toBe(75_000_00);
    expect(r.band).toBe("main");
  });
  it("applies marginal relief between the limits (£100,000 → £22,750)", () => {
    const r = corporationTax(100_000_00);
    expect(r.taxPence).toBe(22_750_00);
    expect(r.band).toBe("marginal");
  });
  it("is zero for a loss/zero profit", () => {
    expect(corporationTax(0).taxPence).toBe(0);
    expect(corporationTax(-5_000_00).taxPence).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/tax/corporationTax.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/tax/corporationTax.ts`**

```typescript
import type { TaxTxn } from "./types";

export interface CompanyProfit {
  incomePence: number;
  expensesPence: number;
  profitPence: number;
}

/** Company taxable profit: allowable income − ALL allowable expenses INCLUDING finance (mortgage). */
export function companyTaxableProfit(txns: TaxTxn[]): CompanyProfit {
  let incomePence = 0;
  let expensesPence = 0;
  for (const tx of txns) {
    if (!tx.allowable) continue;
    if (tx.categoryKind === "income") incomePence += tx.amountPence;
    else if (tx.categoryKind === "expense" || tx.categoryKind === "finance") expensesPence += tx.amountPence;
    // capital excluded
  }
  return { incomePence, expensesPence, profitPence: incomePence - expensesPence };
}

export interface CTRates {
  lowerLimitPence: number;
  upperLimitPence: number;
  smallRate: number;
  mainRate: number;
  marginalFraction: number;
}

const CT_2025_26: CTRates = {
  lowerLimitPence: 50_000_00,
  upperLimitPence: 250_000_00,
  smallRate: 0.19,
  mainRate: 0.25,
  marginalFraction: 3 / 200,
};

const CT_RATES: Record<string, CTRates> = { "2025-26": CT_2025_26 };
const LATEST_CT_YEAR = "2025-26";

export interface CorporationTaxResult {
  taxPence: number;
  effectiveRate: number;
  band: "small" | "marginal" | "main";
}

/**
 * Corporation tax on a company's profit. v1 assumes a single standalone company, a full
 * 12-month accounting period, and a single CT financial year's rates (no associated-company
 * threshold division, no period pro-rating, no FY-straddle apportionment).
 */
export function corporationTax(profitPence: number, year: string = LATEST_CT_YEAR): CorporationTaxResult {
  const r = CT_RATES[year] ?? CT_RATES[LATEST_CT_YEAR];
  if (profitPence <= 0) return { taxPence: 0, effectiveRate: 0, band: "small" };

  let taxPence: number;
  let band: "small" | "marginal" | "main";
  if (profitPence <= r.lowerLimitPence) {
    taxPence = Math.round(profitPence * r.smallRate);
    band = "small";
  } else if (profitPence >= r.upperLimitPence) {
    taxPence = Math.round(profitPence * r.mainRate);
    band = "main";
  } else {
    taxPence = Math.round(profitPence * r.mainRate - (r.upperLimitPence - profitPence) * r.marginalFraction);
    band = "marginal";
  }
  return { taxPence, effectiveRate: taxPence / profitPence, band };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/tax/corporationTax.test.ts`
Expected: PASS. (£40k→£7,600 @0.19; £50k→£9,500; £100k→£22,750 marginal; £300k→£75,000 main; ≤0→0.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: corporation-tax engine (mortgage deductible, marginal relief)"
```

---

### Task 2: Company accounting period (pure)

**Files:**
- Create: `src/lib/tax/companyPeriod.ts`, `src/lib/tax/companyPeriod.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { companyAccountingPeriod } from "./companyPeriod";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("companyAccountingPeriod", () => {
  it("computes the 12-month period ending on the year-end in the given year", () => {
    const { start, end } = companyAccountingPeriod(31, 3, 2026); // 31 March 2026
    expect(iso(end)).toBe("2026-03-31");
    expect(iso(start)).toBe("2025-04-01"); // day after the previous year-end
  });
  it("handles a 31 December year-end", () => {
    const { start, end } = companyAccountingPeriod(31, 12, 2025);
    expect(iso(end)).toBe("2025-12-31");
    expect(iso(start)).toBe("2025-01-01");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/tax/companyPeriod.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/tax/companyPeriod.ts`**

```typescript
const DAY_MS = 24 * 60 * 60 * 1000;

/** The 12-month accounting period ending on (yearEndDay/yearEndMonth) in periodYear. UTC. */
export function companyAccountingPeriod(yearEndDay: number, yearEndMonth: number, periodYear: number): { start: Date; end: Date } {
  const end = new Date(Date.UTC(periodYear, yearEndMonth - 1, yearEndDay));
  const previousYearEnd = new Date(Date.UTC(periodYear - 1, yearEndMonth - 1, yearEndDay));
  const start = new Date(previousYearEnd.getTime() + DAY_MS);
  return { start, end };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/tax/companyPeriod.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: company accounting-period helper"
```

---

### Task 3: Company schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_company/migration.sql`

- [ ] **Step 1: Add the `Company` model + `Property.companyId` to `prisma/schema.prisma`**

Append the model:

```prisma
model Company {
  id                     String     @id @default(cuid())
  name                   String
  accountingYearEndDay   Int
  accountingYearEndMonth Int
  createdAt              DateTime   @default(now())
  properties             Property[]
}
```

In the `Property` model, add the nullable relation (alongside existing fields):

```prisma
  companyId String?
  company   Company? @relation(fields: [companyId], references: [id])
```

- [ ] **Step 2: Hand-author the migration**

Check `ls prisma/migrations` for the latest timestamp; create `prisma/migrations/20260630150000_company/migration.sql` (timestamp must sort after all existing):

```sql
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "accountingYearEndDay" INTEGER NOT NULL,
    "accountingYearEndMonth" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "Property" ADD COLUMN "companyId" TEXT;
CREATE INDEX "Property_companyId_idx" ON "Property"("companyId");
```

Apply: `DATABASE_URL="file:./dev.db" npx prisma migrate deploy` then `DATABASE_URL="file:./dev.db" npx prisma generate`.

- [ ] **Step 3: Verify build + tests**

Run: `npm run build` (success) and `npm test` (still green — the test harness applies the new migration to a fresh test.db; the Property model now has the optional `company` relation).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: Company model and Property.companyId"
```

---

### Task 4: Company data layer

**Files:**
- Create: `src/lib/data/company.ts`, `src/lib/data/company.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { createCompany, getCompany, listCompanies, updateCompany, getCompanyPropertyCount, deleteCompanyIfEmpty } from "./company";
import { createProperty } from "./property";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => { await resetDb(); });

describe("company data layer", () => {
  it("creates, lists, fetches and updates", async () => {
    const c = await createCompany({ name: "Acme SPV Ltd", accountingYearEndDay: 31, accountingYearEndMonth: 3 });
    expect((await getCompany(c.id))?.name).toBe("Acme SPV Ltd");
    expect(await listCompanies()).toHaveLength(1);
    await updateCompany(c.id, { name: "Renamed Ltd" });
    expect((await getCompany(c.id))?.name).toBe("Renamed Ltd");
  });
  it("deletes only when it owns no properties", async () => {
    const c = await createCompany({ name: "Has property", accountingYearEndDay: 5, accountingYearEndMonth: 4 });
    await createProperty({ name: "SPV flat", ownershipType: "company", companyId: c.id });
    expect(await getCompanyPropertyCount(c.id)).toBe(1);
    await expect(deleteCompanyIfEmpty(c.id)).rejects.toThrow();
    const empty = await createCompany({ name: "Empty", accountingYearEndDay: 31, accountingYearEndMonth: 12 });
    await deleteCompanyIfEmpty(empty.id);
    expect(await getCompany(empty.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/data/company.test.ts`
Expected: FAIL — module/functions missing (and `createProperty` does not yet accept `companyId` — that comes in Task 6; for this test to pass, Task 6's `PropertyInput.companyId` is needed. So implement the `company.ts` functions here AND add `companyId` to `PropertyInput`/`createProperty` now as the minimal change to make the test pass — Task 6 then wires the UI).

- [ ] **Step 3: Implement `src/lib/data/company.ts`**

```typescript
import "server-only";
import { prisma } from "../db";

export interface CompanyInput {
  name: string;
  accountingYearEndDay: number;
  accountingYearEndMonth: number;
}

export function listCompanies() {
  return prisma.company.findMany({ orderBy: { createdAt: "asc" } });
}

export function getCompany(id: string) {
  return prisma.company.findUnique({ where: { id } });
}

export function createCompany(input: CompanyInput) {
  return prisma.company.create({ data: input });
}

export function updateCompany(id: string, input: Partial<CompanyInput>) {
  return prisma.company.update({ where: { id }, data: input });
}

export function getCompanyPropertyCount(id: string) {
  return prisma.property.count({ where: { companyId: id } });
}

export async function deleteCompanyIfEmpty(id: string): Promise<void> {
  if ((await getCompanyPropertyCount(id)) > 0) {
    throw new Error("Can't delete a company that still owns properties.");
  }
  await prisma.company.delete({ where: { id } });
}
```

- [ ] **Step 4: Add `companyId` to `PropertyInput` + `createProperty` (minimal, to satisfy the test)**

In `src/lib/data/property.ts`: add `companyId?: string | null;` to `PropertyInput`, and in `createProperty` include `companyId: input.companyId ?? null` in the `data`. (Task 6 threads it through `updateProperty` and the UI.)

- [ ] **Step 5: Run to verify it passes**

Run: `npm test src/lib/data/company.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: company data layer with delete-protection"
```

---

### Task 5: Company accounts aggregation

**Files:**
- Create: `src/lib/data/companyAccounts.ts`, `src/lib/data/companyAccounts.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { getCompanyAccounts } from "./companyAccounts";
import { createCompany } from "./company";
import { createProperty } from "./property";
import { createTransaction } from "./transactions";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function cat(name: string) {
  return (await prisma.category.findFirstOrThrow({ where: { name } })).id;
}
beforeEach(async () => { await resetDb(); });

describe("getCompanyAccounts", () => {
  it("aggregates the company's properties over its period; mortgage reduces profit", async () => {
    const c = await createCompany({ name: "SPV", accountingYearEndDay: 31, accountingYearEndMonth: 3 });
    const p = await createProperty({ name: "SPV flat", ownershipType: "company", companyId: c.id });
    const other = await createProperty({ name: "Personal", ownershipType: "personal" });
    const rent = await cat("Rent received");
    const mortgage = await cat("Mortgage / loan interest");
    // period 2026 = 2025-04-01..2026-03-31
    await createTransaction({ propertyId: p.id, categoryId: rent, date: new Date("2025-09-01"), amountPence: 30_000_00, direction: "in" });
    await createTransaction({ propertyId: p.id, categoryId: mortgage, date: new Date("2025-09-01"), amountPence: 8_000_00, direction: "out" });
    await createTransaction({ propertyId: other.id, categoryId: rent, date: new Date("2025-09-01"), amountPence: 5_000_00, direction: "in" }); // excluded (personal)
    await createTransaction({ propertyId: p.id, categoryId: rent, date: new Date("2026-06-01"), amountPence: 9_999_00, direction: "in" }); // excluded (out of period)

    const acc = await getCompanyAccounts(c.id, 2026);
    expect(acc).not.toBeNull();
    expect(acc!.incomePence).toBe(30_000_00);
    expect(acc!.expensesPence).toBe(8_000_00); // mortgage deducted
    expect(acc!.profitBeforeTaxPence).toBe(22_000_00);
    // CT on £22,000 (small rate 19%) = £4,180
    expect(acc!.corporationTaxPence).toBe(4_180_00);
    expect(acc!.profitAfterTaxPence).toBe(17_820_00);
    expect(acc!.band).toBe("small");
  });

  it("returns null for an unknown company", async () => {
    expect(await getCompanyAccounts("nope", 2026)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/data/companyAccounts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/data/companyAccounts.ts`**

```typescript
import "server-only";
import { prisma } from "../db";
import { getCompany } from "./company";
import { companyAccountingPeriod } from "../tax/companyPeriod";
import { toTaxTxn } from "../tax/fromPrisma";
import { companyTaxableProfit, corporationTax } from "../tax/corporationTax";

export interface CompanyAccounts {
  company: { id: string; name: string };
  period: { start: Date; end: Date };
  incomePence: number;
  expensesPence: number;
  profitBeforeTaxPence: number;
  corporationTaxPence: number;
  profitAfterTaxPence: number;
  band: "small" | "marginal" | "main";
  effectiveRate: number;
}

export async function getCompanyAccounts(companyId: string, periodYear: number): Promise<CompanyAccounts | null> {
  const company = await getCompany(companyId);
  if (!company) return null;
  const period = companyAccountingPeriod(company.accountingYearEndDay, company.accountingYearEndMonth, periodYear);
  const rows = await prisma.transaction.findMany({
    where: { property: { companyId }, date: { gte: period.start, lte: period.end } },
    include: { category: true },
  });
  const { incomePence, expensesPence, profitPence } = companyTaxableProfit(rows.map((r) => toTaxTxn(r)));
  const ct = corporationTax(profitPence);
  return {
    company: { id: company.id, name: company.name },
    period,
    incomePence,
    expensesPence,
    profitBeforeTaxPence: profitPence,
    corporationTaxPence: ct.taxPence,
    profitAfterTaxPence: profitPence - ct.taxPence,
    band: ct.band,
    effectiveRate: ct.effectiveRate,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/data/companyAccounts.test.ts`
Expected: PASS (£22,000 profit → £4,180 CT @19% → £17,820 after tax; personal + out-of-period excluded).

- [ ] **Step 5: Run full suite + commit**

Run: `npm test` (all green).

```bash
git add -A && git commit -m "feat: company accounts aggregation"
```

---

### Task 6: Property → company assignment (UI)

**Files:**
- Modify: `src/lib/data/property.ts` (thread `companyId` through `updateProperty` — verify), `src/app/(app)/properties/page.tsx`, `src/app/(app)/properties/[id]/edit/page.tsx`, `src/app/(app)/properties/actions.ts`

**Context:** `PropertyInput.companyId` + `createProperty` were added in Task 4. `updateProperty` spreads `Partial<PropertyInput>` so it already accepts `companyId`. This task wires the UI: a company `<select>` on the add/edit forms, and the actions set `companyId` only when ownership is "company".

- [ ] **Step 1: Properties add form + action**

In `src/app/(app)/properties/page.tsx`: import `listCompanies` from `../../../lib/data/company`; load `const companies = await listCompanies();`. In the add form, after the ownership `<select>`, add a company `<select>` (always rendered; used only when ownership is company):

```tsx
        <select name="companyId" defaultValue="" className="border px-2 py-1">
          <option value="">— company (if company-owned) —</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
```

In `src/app/(app)/properties/actions.ts` `addPropertyAction`: compute companyId from ownership:

```typescript
  const ownershipType = String(formData.get("ownershipType")) === "company" ? "company" : "personal";
  const companyId = ownershipType === "company" ? String(formData.get("companyId") || "") || null : null;
  await createProperty({
    name,
    address: String(formData.get("address") ?? "") || null,
    ownershipType,
    companyId,
  });
```

- [ ] **Step 2: Properties edit form + action**

In `src/app/(app)/properties/[id]/edit/page.tsx`: load `listCompanies()`; add the same company `<select>` with `defaultValue={property.companyId ?? ""}`. In `updatePropertyAction`, set `companyId` the same way (null when personal):

```typescript
  const ownershipType = String(formData.get("ownershipType")) === "company" ? "company" : "personal";
  const companyId = ownershipType === "company" ? String(formData.get("companyId") || "") || null : null;
  await updateProperty(id, {
    name: String(formData.get("name") ?? "").trim() || "Unnamed",
    address: String(formData.get("address") ?? "") || null,
    ownershipType,
    companyId,
  });
```

- [ ] **Step 3: Show the owning company on the properties list**

In `src/app/(app)/properties/page.tsx`, the list already shows ownership type; when a property has a `companyId`, show the company name. Build a lookup from `companies` and render ` · {companyName}` after the ownership label for company-owned properties.

- [ ] **Step 4: Verify build + manual**

Run: `npm run build` (success) and `npm test` (green).
Manual: create a company (via /companies — Task 7), set a property to "company" + pick the company, save; confirm the list shows the company name; set it back to "personal" and confirm `companyId` clears.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: assign properties to a company"
```

---

### Task 7: Companies management UI

**Files:**
- Create: `src/app/(app)/companies/actions.ts`, `src/app/(app)/companies/page.tsx`, `src/app/(app)/companies/[id]/edit/page.tsx`
- Modify: `src/app/(app)/layout.tsx` (nav link)

- [ ] **Step 1: Create `src/app/(app)/companies/actions.ts`**

```typescript
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "../../../lib/auth/session";
import { createCompany, updateCompany, deleteCompanyIfEmpty } from "../../../lib/data/company";

function dayMonth(formData: FormData): { day: number; month: number } {
  const day = Number(formData.get("accountingYearEndDay"));
  const month = Number(formData.get("accountingYearEndMonth"));
  return { day, month };
}

export async function addCompanyAction(formData: FormData) {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/companies?error=Name+required");
  const { day, month } = dayMonth(formData);
  await createCompany({ name, accountingYearEndDay: day, accountingYearEndMonth: month });
  revalidatePath("/companies");
  redirect("/companies");
}

export async function updateCompanyAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  const { day, month } = dayMonth(formData);
  await updateCompany(id, { name: String(formData.get("name") ?? "").trim() || "Unnamed", accountingYearEndDay: day, accountingYearEndMonth: month });
  revalidatePath("/companies");
  redirect("/companies");
}

export async function deleteCompanyAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  try {
    await deleteCompanyIfEmpty(id);
  } catch (e) {
    redirect(`/companies?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath("/companies");
  redirect("/companies");
}
```

- [ ] **Step 2: Create `src/app/(app)/companies/page.tsx`**

```tsx
import { listCompanies, getCompanyPropertyCount } from "../../../lib/data/company";
import { addCompanyAction, deleteCompanyAction } from "./actions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const companies = await listCompanies();
  const counts = await Promise.all(companies.map((c) => getCompanyPropertyCount(c.id)));

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Companies</h1>
      {error && <p className="rounded bg-red-100 px-3 py-2 text-red-700">{error}</p>}

      <form action={addCompanyAction} className="flex flex-wrap items-end gap-2">
        <input name="name" placeholder="Company name (e.g. Acme SPV Ltd)" required className="border px-2 py-1" />
        <label className="text-sm">Year end
          <input name="accountingYearEndDay" type="number" min="1" max="31" defaultValue="31" required className="ml-1 w-16 border px-2 py-1" />
        </label>
        <select name="accountingYearEndMonth" defaultValue="3" className="border px-2 py-1">
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Add company</button>
      </form>

      {companies.length === 0 && <p className="text-gray-500">Add a company to manage limited-company properties.</p>}

      <ul className="divide-y border">
        {companies.map((c, i) => (
          <li key={c.id} className="flex items-center justify-between px-3 py-2">
            <span>
              {c.name} · <span className="text-gray-500">year end {c.accountingYearEndDay} {MONTHS[c.accountingYearEndMonth - 1]}</span>
              <span className="ml-2 text-xs text-gray-400">{counts[i]} propert{counts[i] === 1 ? "y" : "ies"}</span>
            </span>
            <span className="flex items-center gap-2">
              <a href={`/companies/${c.id}/accounts`} className="text-blue-600 hover:underline">Accounts</a>
              <a href={`/companies/${c.id}/edit`} className="text-blue-600 hover:underline">Edit</a>
              <form action={deleteCompanyAction}>
                <input type="hidden" name="id" value={c.id} />
                <button type="submit" className="text-red-600">Delete</button>
              </form>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/(app)/companies/[id]/edit/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getCompany } from "../../../../../lib/data/company";
import { updateCompanyAction } from "../../actions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompany(id);
  if (!company) notFound();
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Edit company</h1>
      <form action={updateCompanyAction} className="space-y-3">
        <input type="hidden" name="id" value={company.id} />
        <label className="block"><span className="block text-sm">Name</span>
          <input name="name" defaultValue={company.name} required className="w-full border px-2 py-1" /></label>
        <div className="flex items-end gap-2">
          <label className="text-sm">Year end day
            <input name="accountingYearEndDay" type="number" min="1" max="31" defaultValue={company.accountingYearEndDay} required className="ml-1 w-16 border px-2 py-1" /></label>
          <select name="accountingYearEndMonth" defaultValue={company.accountingYearEndMonth} className="border px-2 py-1">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Save</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Add the "Companies" nav link**

In `src/app/(app)/layout.tsx`, add `{ href: "/companies", label: "Companies" }` to the `nav` array (after "Properties").

- [ ] **Step 5: Verify build + manual**

Run: `npm run build` (success; `/companies` + `/companies/[id]/edit` routes) and `npm test` (green).
Manual: add a company, edit its year-end, try to delete one that owns a property (blocked), delete an empty one.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: companies management UI"
```

---

### Task 8: Company accounts page

**Files:**
- Create: `src/app/(app)/companies/[id]/accounts/page.tsx`

- [ ] **Step 1: Implement the accounts page**

```tsx
import { notFound } from "next/navigation";
import { getCompanyAccounts } from "../../../../../lib/data/companyAccounts";
import { formatGBP } from "../../../../../lib/tax/money";

export default async function CompanyAccountsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string }> }) {
  const { id } = await params;
  const { year } = await searchParams;
  const periodYear = year ? Number(year) : new Date().getUTCFullYear();
  const accounts = await getCompanyAccounts(id, periodYear);
  if (!accounts) notFound();

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const Row = ({ label, pence, bold }: { label: string; pence: number; bold?: boolean }) => (
    <tr className={`border-b ${bold ? "font-semibold" : ""}`}>
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 text-right">{formatGBP(pence)}</td>
    </tr>
  );

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">{accounts.company.name} — accounts</h1>
      <p className="text-sm text-gray-600">
        Accounting period {iso(accounts.period.start)} to {iso(accounts.period.end)}.{" "}
        <span className="inline-flex gap-2">
          <a href={`/companies/${id}/accounts?year=${periodYear - 1}`} className="text-blue-600 hover:underline">← {periodYear - 1}</a>
          <a href={`/companies/${id}/accounts?year=${periodYear + 1}`} className="text-blue-600 hover:underline">{periodYear + 1} →</a>
        </span>
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

      <p className="text-xs text-gray-400">
        Estimate only — not filed accounts or a CT600. Assumes a standalone company, a full 12-month
        period, and a single corporation-tax year. Have your accountant prepare and file the company
        accounts and CT return.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + tests + manual**

Run: `npm run build` (success; `/companies/[id]/accounts` route), `npm test` (green), `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"` (0).
Manual: with a company owning a property that has rent + mortgage in the period, open the accounts page; confirm profit-before-tax deducts the mortgage, the CT line shows the band/rate, and profit-after-tax = profit − CT; step the period year and confirm the dates shift.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: company accounts page"
```

---

## Self-Review

**Spec coverage:**
- Company entity + `Property.companyId` + migration → Task 3. ✓
- Corporation-tax engine (mortgage deductible; 19%/25%/marginal relief; documented assumptions) → Task 1. ✓
- Accounting-period helper → Task 2. ✓
- Company CRUD + delete-protection → Tasks 4, 7. ✓
- Per-company accounts aggregation (own period; excludes personal + other companies; mortgage deducted; CT + after-tax) → Task 5. ✓
- Property → company assignment (UI select; clears on personal) → Task 6. ✓
- Company accounts page with the accountant caveat → Task 8. ✓
- Personal SA105/dashboard unchanged (company excluded already) → no task needed (verified by the existing `ownershipType` filter). ✓
- Testing: pure (corporationTax bands, companyTaxableProfit deducts finance, companyAccountingPeriod), integration (company CRUD + delete-protection, getCompanyAccounts excludes personal/other/out-of-period), flow (live-run) → Tasks 1-8. ✓
- Non-goals respected (no dividends/DLA/retained/balance sheet, no associated-company division, no proration, no FY straddle). ✓

**Placeholder scan:** None. Migration timestamp `20260630150000` must sort after existing ones — Task 3 Step 2 says to verify with `ls` and bump if needed.

**Type consistency:** `CompanyInput` (Task 4) used by Task 7 actions. `CompanyAccounts` (Task 5) consumed by Task 8 page. `companyTaxableProfit`/`corporationTax` (Task 1) used by Task 5. `companyAccountingPeriod` (Task 2) used by Task 5. `PropertyInput.companyId` added in Task 4, used by Task 6 actions; `corporationTax`'s optional `year` defaults so Task 5 calls it with one arg. `getCompany` shared by Tasks 5, 7, 8. The `band` union (`small|marginal|main`) is identical across `corporationTax`, `CompanyAccounts`, and the accounts page.

---

## Notes for the implementer

- **The CT engine is the correctness heart** — its band-boundary tests (£40k/£50k/£100k/£250k/£300k) must pass on the exact pence figures. If one fails, fix the formula/limits, never the expected value. The marginal-relief formula is `profit×0.25 − (250k−profit)×3/200`.
- **`companyTaxableProfit` differs from personal `computeProfit` by design** — it DEDUCTS finance (mortgage). Don't "align" them.
- **Task 4 deliberately reaches slightly into `property.ts`** (adding `PropertyInput.companyId` + `createProperty`) so its test passes; Task 6 finishes the property/UI wiring. This ordering keeps each task's tests green.
- **Company tax stays out of the personal SA105/dashboard** — those filter by `ownershipType: "personal"`. Do not add company figures there.
- **Period query is inclusive** (`gte: start, lte: end`) — a transaction dated exactly on the year-end belongs to that period.
- **Prisma v7:** migrations are manual SQL + `migrate deploy` + `generate` (never `migrate dev`).
