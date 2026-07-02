# Deductions Assistant — Phase 1 (Checklist Framework) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-tax-year deductions checklist that flags commonly-missed landlord deductions (a `/deductions` page + a pre-filing nudge on the SA105 page), with a self-contained "Log it" quick-add.

**Architecture:** A built-in curated catalog of deduction items + a pure, unit-tested detection function (`assessDeductions`) that classifies each item as covered / consider / dismissed for a tax year, using the year's personal transactions (category name + description) and per-year dismissals. A server-only data layer wraps it; the `/deductions` page and an SA105 nudge component render it. "Log it" creates an ordinary categorised transaction — the existing SA105 engine already sums it, so tax figures are unchanged.

**Tech Stack:** Next.js 16 (App Router, server components + server actions), Prisma v7 + SQLite (better-sqlite3 adapter), Vitest, Tailwind v4 ("Quiet Ledger" design system).

Design spec: `docs/superpowers/specs/2026-07-02-deductions-assistant-design.md`.

**Phasing note:** Phase 1 of 3. Mileage (`mileage.ts`, `Property.roundTripMiles`, `Transaction.miles`) and the use-of-home helper are deferred to Phases 2 & 3. Phase 1 ships the checklist with a generic self-contained "Log it" for every item (including the mileage and use-of-home items, which Phases 2/3 later upgrade to dedicated helpers). We do NOT add the mileage pure module here (no consumer yet — YAGNI). Detection uses a purpose-built `DeductionTxn { categoryName, description }` rather than the tax engine's `TaxTxn` (which lacks description/name).

---

## Conventions (read before starting)

- Pure logic lives in `src/lib/**` and is unit-tested with Vitest (`npm test`). Server-only
  data access imports `"server-only"` and uses `prisma` from `src/lib/db.ts`.
- Migrations are hand-authored SQL folders `prisma/migrations/<UTC timestamp>_<name>/migration.sql`,
  applied with `npx prisma migrate deploy` then `npx prisma generate` (NEVER `migrate dev`).
- Server actions: `"use server"`, call `await requireSession()` first, then `redirect(...)`
  with `?ok=` / `?error=` query flags (see `src/app/(app)/transactions/actions.ts`).
- Pages are async server components reading `searchParams: Promise<{...}>`.
- UI primitives in `src/app/(app)/_ui/`: `PageHeader`, `Banner` (variants error/success/info),
  `EmptyState`, `MoneyInput`, `ConfirmSubmit`.
- Tax-year helpers in `src/lib/tax/taxYear.ts`: `latestConfiguredTaxYear()`, `taxYearOptions()`,
  `taxYearRange(taxYear) → { start, end }`.
- Amount parsing: `parseAmountToPence(str)` from `src/lib/money/parseAmount` (throws on bad input).
- Active property: `getActiveProperty()` from `src/lib/data/activeProperty` → `{ propertyId, isAll }`.
- New-transaction shape (see `src/lib/data/transactions.ts` `createTransaction` / `TransactionInput`):
  `{ propertyId, categoryId, date: Date, amountPence, direction: "in"|"out", vendorId: string|null, description: string|null }`.

## File Structure

```
src/lib/deductions/catalog.ts        # DeductionItem, DeductionTxn, DeductionAction, the catalog + CATEGORY_NAMES
src/lib/deductions/catalog.test.ts   # integrity: every item's categoryName is a real Quidly category
src/lib/deductions/assess.ts         # assessDeductions (pure)                      [tested]
src/lib/deductions/assess.test.ts
src/lib/data/deductions.ts           # server-only: getDeductionStatuses, addDismissal, removeDismissal, listPersonalProperties
src/app/(app)/deductions/actions.ts  # dismiss / undismiss / logDeduction
src/app/(app)/deductions/LogItForm.tsx        # client: expandable quick-add form
src/app/(app)/deductions/DeductionsNudge.tsx  # client: dismissible SA105 nudge banner
src/app/(app)/deductions/page.tsx    # the Deductions page
prisma/schema.prisma                 # + DeductionDismissal model
prisma/migrations/20260702140000_deduction_dismissal/migration.sql
prisma/seed.ts                       # + "Travel & mileage" and "Use of home" categories
src/app/(app)/layout.tsx             # add /deductions to the Tax nav group
src/app/(app)/sa105/page.tsx         # mount the nudge
```

---

## Task 1: Seed the two new categories

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add the categories to the seed array**

In `prisma/seed.ts`, add these two entries to the `categories` array (after the existing "Other allowable property expenses" line):

```ts
  { name: "Travel & mileage", kind: "expense", sa105Box: "29", allowable: true },
  { name: "Use of home", kind: "expense", sa105Box: "29", allowable: true },
```

- [ ] **Step 2: Run the seed (idempotent upsert by name)**

Run: `DATABASE_URL="file:./dev.db" npx prisma db seed`
Expected: prints `Seeded 2 new categories (9 already existed).` (or all existed on a re-run).

- [ ] **Step 3: Verify the categories exist**

Run: `DATABASE_URL="file:./dev.db" npx tsx -e "import Database from 'better-sqlite3'; const d=new Database('dev.db'); console.log(d.prepare(\"SELECT name,sa105Box FROM Category WHERE name IN ('Travel & mileage','Use of home')\").all());"`
Expected: two rows, both `sa105Box: '29'`.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(deductions): seed Travel & mileage and Use of home categories (SA105 box 29)"
```

---

## Task 2: `DeductionDismissal` model + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260702140000_deduction_dismissal/migration.sql`

- [ ] **Step 1: Add the model to the schema**

Append to `prisma/schema.prisma`:

```prisma
model DeductionDismissal {
  id        String   @id @default(cuid())
  taxYear   String
  itemKey   String
  createdAt DateTime @default(now())

  @@unique([taxYear, itemKey])
}
```

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260702140000_deduction_dismissal/migration.sql`:

```sql
CREATE TABLE "DeductionDismissal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taxYear" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "DeductionDismissal_taxYear_itemKey_key" ON "DeductionDismissal"("taxYear", "itemKey");
```

- [ ] **Step 3: Apply and regenerate**

Run: `DATABASE_URL="file:./dev.db" npx prisma migrate deploy && npx prisma generate`
Expected: `20260702140000_deduction_dismissal` applied; client regenerated.

- [ ] **Step 4: Verify the table exists**

Run: `DATABASE_URL="file:./dev.db" npx tsx -e "import Database from 'better-sqlite3'; const d=new Database('dev.db'); console.log(d.prepare(\"PRAGMA table_info('DeductionDismissal')\").all().map(c=>c.name).join(','));"`
Expected: `id,taxYear,itemKey,createdAt`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260702140000_deduction_dismissal/migration.sql
git commit -m "feat(deductions): DeductionDismissal model for per-year 'not applicable' items"
```

---

## Task 3: Catalog + types + integrity test

**Files:**
- Create: `src/lib/deductions/catalog.ts`
- Test: `src/lib/deductions/catalog.test.ts`

- [ ] **Step 1: Write the failing integrity test**

Create `src/lib/deductions/catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEDUCTION_CATALOG, CATEGORY_NAMES } from "./catalog";

describe("deduction catalog", () => {
  it("every item's categoryName is a real Quidly category", () => {
    for (const item of DEDUCTION_CATALOG) expect(CATEGORY_NAMES).toContain(item.categoryName);
  });
  it("every item has a unique key", () => {
    const keys = DEDUCTION_CATALOG.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("every item has at least one match rule", () => {
    for (const item of DEDUCTION_CATALOG) {
      const hasRule = (item.match.categoryNames?.length ?? 0) > 0 || (item.match.descriptionKeywords?.length ?? 0) > 0;
      expect(hasRule).toBe(true);
    }
  });
  it("all description keywords are lowercase (matching is case-insensitive)", () => {
    for (const item of DEDUCTION_CATALOG) for (const k of item.match.descriptionKeywords ?? []) expect(k).toBe(k.toLowerCase());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- catalog`
Expected: FAIL ("Failed to resolve import './catalog'").

- [ ] **Step 3: Implement the catalog**

Create `src/lib/deductions/catalog.ts`:

```ts
/** The Quidly category names an item can belong to (must match prisma/seed.ts). */
export const CATEGORY_NAMES = [
  "Rent received",
  "Other property income",
  "Rent, rates, insurance, ground rents",
  "Property repairs and maintenance",
  "Legal, management, other professional fees",
  "Costs of services provided, including wages",
  "Other allowable property expenses",
  "Mortgage / loan interest",
  "Capital improvements",
  "Travel & mileage",
  "Use of home",
] as const;

/** Which "Log it" flow an item opens. Phase 1 treats all as the generic quick-add;
 *  Phases 2 & 3 branch "mileage" and "use-of-home" to dedicated helpers. */
export type DeductionAction = "transaction" | "mileage" | "use-of-home";

export interface DeductionMatch {
  categoryNames?: string[];        // covered if any of the year's transactions is in one of these categories
  descriptionKeywords?: string[];  // covered if any transaction's description contains one of these (lowercase) keywords
}

export interface DeductionItem {
  key: string;
  title: string;
  blurb: string;
  categoryName: string; // the category "Log it" files into
  match: DeductionMatch;
  action: DeductionAction;
}

/** A transaction reduced to what detection needs. */
export interface DeductionTxn {
  categoryName: string;
  description: string | null;
}

export const DEDUCTION_CATALOG: DeductionItem[] = [
  { key: "landlord-insurance", title: "Landlord & buildings insurance", blurb: "Buildings, landlord contents, rent-guarantee, boiler/emergency and public-liability cover are all allowable.", categoryName: "Rent, rates, insurance, ground rents", match: { descriptionKeywords: ["insurance"] }, action: "transaction" },
  { key: "gas-safety", title: "Gas safety certificate (CP12)", blurb: "The annual gas safety check is a required, allowable cost.", categoryName: "Property repairs and maintenance", match: { descriptionKeywords: ["gas safety", "cp12"] }, action: "transaction" },
  { key: "eicr", title: "Electrical safety (EICR)", blurb: "The 5-yearly electrical installation condition report and any remedial work.", categoryName: "Property repairs and maintenance", match: { descriptionKeywords: ["eicr", "electrical safety", "electrical inspection"] }, action: "transaction" },
  { key: "epc", title: "Energy certificate (EPC)", blurb: "The energy performance certificate needed to let the property.", categoryName: "Other allowable property expenses", match: { descriptionKeywords: ["epc", "energy performance"] }, action: "transaction" },
  { key: "mortgage-interest", title: "Mortgage / loan interest", blurb: "Interest on a buy-to-let mortgage or loan (20% basic-rate relief in box 44 — not the capital repayment).", categoryName: "Mortgage / loan interest", match: { categoryNames: ["Mortgage / loan interest"] }, action: "transaction" },
  { key: "letting-management", title: "Letting & management fees", blurb: "Agent fees for finding tenants and managing the let.", categoryName: "Legal, management, other professional fees", match: { descriptionKeywords: ["letting", "management", "agent"] }, action: "transaction" },
  { key: "accountancy", title: "Accountancy & bookkeeping", blurb: "Fees for preparing the property pages of your return and keeping the books.", categoryName: "Legal, management, other professional fees", match: { descriptionKeywords: ["accountan", "bookkeep", "tax return"] }, action: "transaction" },
  { key: "mileage", title: "Mileage to the property", blurb: "Trips for inspections, viewings, meeting tradespeople and repairs — 45p/mile for the first 10,000 miles.", categoryName: "Travel & mileage", match: { categoryNames: ["Travel & mileage"] }, action: "mileage" },
  { key: "use-of-home", title: "Use of home for admin", blurb: "A reasonable proportion of home costs for time spent administering the lettings.", categoryName: "Use of home", match: { categoryNames: ["Use of home"] }, action: "use-of-home" },
  { key: "ground-rent", title: "Ground rent / service charges", blurb: "Leasehold ground rent, service charges and factor fees.", categoryName: "Rent, rates, insurance, ground rents", match: { descriptionKeywords: ["ground rent", "service charge", "factor"] }, action: "transaction" },
  { key: "replacement-domestic", title: "Replacement of domestic items", blurb: "Replacing furniture, white goods, carpets or curtains in a furnished let (like-for-like).", categoryName: "Other allowable property expenses", match: { descriptionKeywords: ["replace", "furniture", "white good", "carpet", "curtain", "appliance", "fridge", "washing machine", "sofa", "bed"] }, action: "transaction" },
  { key: "safety-servicing", title: "Safety & servicing", blurb: "Boiler service, smoke/CO alarms, PAT testing, Legionella assessment, chimney sweep.", categoryName: "Property repairs and maintenance", match: { descriptionKeywords: ["boiler service", "alarm", "smoke", "carbon monoxide", "pat test", "legionella", "chimney"] }, action: "transaction" },
  { key: "advertising-referencing", title: "Advertising & tenant referencing", blurb: "Advertising the property, referencing, credit checks and inventory clerk fees.", categoryName: "Legal, management, other professional fees", match: { descriptionKeywords: ["advertis", "referenc", "tenant find", "inventory", "credit check"] }, action: "transaction" },
  { key: "bank-charges", title: "Bank charges (landlord account)", blurb: "Fees on a dedicated account used for the lettings.", categoryName: "Other allowable property expenses", match: { descriptionKeywords: ["bank charge", "bank fee", "account fee"] }, action: "transaction" },
  { key: "subscriptions", title: "Professional subscriptions", blurb: "Landlord association membership (e.g. NRLA) and relevant subscriptions.", categoryName: "Other allowable property expenses", match: { descriptionKeywords: ["nrla", "subscription", "membership", "landlord association"] }, action: "transaction" },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- catalog`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/deductions/catalog.ts src/lib/deductions/catalog.test.ts
git commit -m "feat(deductions): built-in deduction catalog + integrity tests"
```

---

## Task 4: `assessDeductions` (pure detection)

**Files:**
- Create: `src/lib/deductions/assess.ts`
- Test: `src/lib/deductions/assess.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/deductions/assess.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assessDeductions } from "./assess";
import type { DeductionItem, DeductionTxn } from "./catalog";

const items: DeductionItem[] = [
  { key: "insurance", title: "Insurance", blurb: "", categoryName: "Rent, rates, insurance, ground rents", match: { descriptionKeywords: ["insurance"] }, action: "transaction" },
  { key: "gas-safety", title: "Gas", blurb: "", categoryName: "Property repairs and maintenance", match: { descriptionKeywords: ["gas safety", "cp12"] }, action: "transaction" },
  { key: "mileage", title: "Mileage", blurb: "", categoryName: "Travel & mileage", match: { categoryNames: ["Travel & mileage"] }, action: "mileage" },
];

describe("assessDeductions", () => {
  it("marks an item covered when a description keyword matches (case-insensitive)", () => {
    const txns: DeductionTxn[] = [{ categoryName: "Rent, rates, insurance, ground rents", description: "Annual Landlord INSURANCE" }];
    expect(assessDeductions(items, txns, new Set()).find((r) => r.item.key === "insurance")!.state).toBe("covered");
  });
  it("distinguishes items sharing a category by keyword", () => {
    const txns: DeductionTxn[] = [{ categoryName: "Property repairs and maintenance", description: "Fix leaking tap" }];
    expect(assessDeductions(items, txns, new Set()).find((r) => r.item.key === "gas-safety")!.state).toBe("consider");
  });
  it("marks an item covered when a transaction is in its category", () => {
    const txns: DeductionTxn[] = [{ categoryName: "Travel & mileage", description: null }];
    expect(assessDeductions(items, txns, new Set()).find((r) => r.item.key === "mileage")!.state).toBe("covered");
  });
  it("marks dismissed items dismissed regardless of transactions", () => {
    const txns: DeductionTxn[] = [{ categoryName: "Travel & mileage", description: null }];
    expect(assessDeductions(items, txns, new Set(["mileage"])).find((r) => r.item.key === "mileage")!.state).toBe("dismissed");
  });
  it("marks unmatched items as consider", () => {
    expect(assessDeductions(items, [], new Set()).every((r) => r.state === "consider")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- assess`
Expected: FAIL ("Failed to resolve import './assess'").

- [ ] **Step 3: Implement `assess.ts`**

Create `src/lib/deductions/assess.ts`:

```ts
import type { DeductionItem, DeductionTxn } from "./catalog";

export type DeductionState = "covered" | "consider" | "dismissed";
export interface DeductionStatus {
  item: DeductionItem;
  state: DeductionState;
}

function txnMatches(item: DeductionItem, txn: DeductionTxn): boolean {
  if (item.match.categoryNames?.includes(txn.categoryName)) return true;
  const desc = (txn.description ?? "").toLowerCase();
  if (desc && item.match.descriptionKeywords?.some((k) => desc.includes(k))) return true;
  return false;
}

/**
 * Classify each catalog item for a tax year:
 *  - "dismissed" if the user marked it not-applicable,
 *  - else "covered" if any of the year's transactions matches its rule,
 *  - else "consider".
 */
export function assessDeductions(
  items: DeductionItem[],
  txns: DeductionTxn[],
  dismissedKeys: Set<string>,
): DeductionStatus[] {
  return items.map((item) => {
    if (dismissedKeys.has(item.key)) return { item, state: "dismissed" as const };
    const covered = txns.some((t) => txnMatches(item, t));
    return { item, state: covered ? ("covered" as const) : ("consider" as const) };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- assess`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/deductions/assess.ts src/lib/deductions/assess.test.ts
git commit -m "feat(deductions): pure assessDeductions detection (covered/consider/dismissed)"
```

---

## Task 5: Data layer (`src/lib/data/deductions.ts`)

**Files:**
- Create: `src/lib/data/deductions.ts`

- [ ] **Step 1: Implement the data layer**

Create `src/lib/data/deductions.ts`:

```ts
import "server-only";
import { prisma } from "../db";
import { taxYearRange } from "../tax/taxYear";
import { DEDUCTION_CATALOG, type DeductionTxn } from "../deductions/catalog";
import { assessDeductions, type DeductionStatus } from "../deductions/assess";

/** Detection over personally-owned properties' transactions for the tax year. */
export async function getDeductionStatuses(taxYear: string): Promise<DeductionStatus[]> {
  const { start, end } = taxYearRange(taxYear);
  const [rows, dismissals] = await Promise.all([
    prisma.transaction.findMany({
      where: { date: { gte: start, lt: end }, property: { ownershipType: "personal" } },
      include: { category: true },
    }),
    prisma.deductionDismissal.findMany({ where: { taxYear } }),
  ]);
  const txns: DeductionTxn[] = rows.map((r) => ({ categoryName: r.category.name, description: r.description }));
  const dismissedKeys = new Set(dismissals.map((d) => d.itemKey));
  return assessDeductions(DEDUCTION_CATALOG, txns, dismissedKeys);
}

export async function addDismissal(taxYear: string, itemKey: string): Promise<void> {
  await prisma.deductionDismissal.upsert({
    where: { taxYear_itemKey: { taxYear, itemKey } },
    update: {},
    create: { taxYear, itemKey },
  });
}

export async function removeDismissal(taxYear: string, itemKey: string): Promise<void> {
  await prisma.deductionDismissal.deleteMany({ where: { taxYear, itemKey } });
}

/** Personal properties for the quick-add property picker. */
export function listPersonalProperties() {
  return prisma.property.findMany({
    where: { ownershipType: "personal" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: PASS. (The `taxYear_itemKey` compound-unique selector is generated from `@@unique([taxYear, itemKey])`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/deductions.ts
git commit -m "feat(deductions): server-only data layer — statuses, dismissals, personal properties"
```

---

## Task 6: `/deductions` page, actions, quick-add form, nav link

**Files:**
- Create: `src/app/(app)/deductions/actions.ts`
- Create: `src/app/(app)/deductions/LogItForm.tsx`
- Create: `src/app/(app)/deductions/page.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create the actions (dismiss / undismiss / logDeduction)**

Create `src/app/(app)/deductions/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "../../../lib/auth/session";
import { prisma } from "../../../lib/db";
import { addDismissal, removeDismissal } from "../../../lib/data/deductions";
import { createTransaction } from "../../../lib/data/transactions";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import { DEDUCTION_CATALOG } from "../../../lib/deductions/catalog";

export async function dismissDeductionAction(formData: FormData) {
  await requireSession();
  const taxYear = String(formData.get("taxYear") ?? "");
  const itemKey = String(formData.get("itemKey") ?? "");
  if (taxYear && itemKey) await addDismissal(taxYear, itemKey);
  revalidatePath("/deductions");
  redirect(`/deductions?ty=${encodeURIComponent(taxYear)}&ok=${encodeURIComponent("Marked not applicable")}`);
}

export async function undismissDeductionAction(formData: FormData) {
  await requireSession();
  const taxYear = String(formData.get("taxYear") ?? "");
  const itemKey = String(formData.get("itemKey") ?? "");
  if (taxYear && itemKey) await removeDismissal(taxYear, itemKey);
  revalidatePath("/deductions");
  redirect(`/deductions?ty=${encodeURIComponent(taxYear)}&ok=${encodeURIComponent("Restored")}`);
}

export async function logDeductionAction(formData: FormData) {
  await requireSession();
  const taxYear = String(formData.get("taxYear") ?? "");
  const back = (msg: string, ok = false) =>
    redirect(`/deductions?ty=${encodeURIComponent(taxYear)}&${ok ? "ok" : "error"}=${encodeURIComponent(msg)}`);

  const item = DEDUCTION_CATALOG.find((i) => i.key === String(formData.get("itemKey") ?? ""));
  if (!item) back("Unknown deduction item.");
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) back("Choose a property.");

  let amountPence!: number;
  try {
    amountPence = parseAmountToPence(String(formData.get("amount") ?? ""));
  } catch (e) {
    back((e as Error).message);
  }

  const category = await prisma.category.findUnique({ where: { name: item!.categoryName } });
  if (!category) back(`Category "${item!.categoryName}" not found — run the seed.`);

  await createTransaction({
    propertyId,
    categoryId: category!.id,
    date: new Date(String(formData.get("date"))),
    amountPence,
    direction: "out", // every catalog item is an expense/finance cost
    vendorId: null,
    description: String(formData.get("description") ?? "") || item!.title,
  });
  revalidatePath("/deductions");
  revalidatePath("/transactions");
  back(`Logged ${item!.title}`, true);
}
```

- [ ] **Step 2: Create the quick-add form (client component)**

Create `src/app/(app)/deductions/LogItForm.tsx`:

```tsx
"use client";
import { useState } from "react";
import { MoneyInput } from "../_ui/MoneyInput";
import { logDeductionAction } from "./actions";

interface Props {
  taxYear: string;
  itemKey: string;
  title: string;
  activePropertyId: string;
  activePropertyName: string;
}

export function LogItForm({ taxYear, itemKey, title, activePropertyId, activePropertyName }: Props) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        Log it
      </button>
    );
  }
  return (
    <form action={logDeductionAction} className="mt-3 w-full space-y-3 border-t border-line pt-3">
      <input type="hidden" name="taxYear" value={taxYear} />
      <input type="hidden" name="itemKey" value={itemKey} />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="label">Date</span>
          <input className="field" type="date" name="date" required />
        </label>
        <label className="text-sm">
          <span className="label">Amount</span>
          <MoneyInput name="amount" required />
        </label>
      </div>
      <label className="block text-sm">
        <span className="label">Description</span>
        <input className="field" type="text" name="description" defaultValue={title} />
      </label>
      <input type="hidden" name="propertyId" value={activePropertyId} />
      <p className="text-xs text-faint">Logged against {activePropertyName}.</p>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">Save expense</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
```

Note: to keep Phase 1 minimal the expense is logged against the **active property** (hidden
`propertyId`), with a small "Logged against X" note for clarity. A per-form property picker
is a trivial later refinement if wanted. If your `MoneyInput`
component's prop signature differs, match it (it renders a `£`-prefixed numeric input and
forwards `name`/`required`).

- [ ] **Step 3: Create the page**

Create `src/app/(app)/deductions/page.tsx`:

```tsx
import { getDeductionStatuses, listPersonalProperties } from "../../../lib/data/deductions";
import { getActiveProperty } from "../../../lib/data/activeProperty";
import { latestConfiguredTaxYear, taxYearOptions } from "../../../lib/tax/taxYear";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";
import { dismissDeductionAction, undismissDeductionAction } from "./actions";
import { LogItForm } from "./LogItForm";

export default async function DeductionsPage({ searchParams }: { searchParams: Promise<{ ty?: string; ok?: string; error?: string }> }) {
  const { ty, ok, error } = await searchParams;
  const taxYear = ty ?? latestConfiguredTaxYear();
  const [statuses, properties, active] = await Promise.all([
    getDeductionStatuses(taxYear),
    listPersonalProperties(),
    getActiveProperty(),
  ]);
  const activePropertyId = active.propertyId ?? properties[0]?.id ?? "";
  const activePropertyName = properties.find((p) => p.id === activePropertyId)?.name ?? "your property";

  const considered = statuses.filter((s) => s.state === "consider");
  const covered = statuses.filter((s) => s.state === "covered");
  const dismissed = statuses.filter((s) => s.state === "dismissed");
  const relevant = considered.length + covered.length;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader title="Deductions" subtitle="Expenses you might be able to claim — prompts, not tax advice">
        <div className="flex items-center gap-1.5">
          {taxYearOptions().map((y) => (
            <a key={y} href={`/deductions?ty=${y}`} className={`pill ${y === taxYear ? "" : "opacity-60"}`}>{y}</a>
          ))}
        </div>
      </PageHeader>

      {ok && <Banner variant="success">{ok}</Banner>}
      {error && <Banner variant="error">{error}</Banner>}

      {properties.length === 0 ? (
        <EmptyState title="No properties yet" hint="Add a property first, then come back to review deductions." />
      ) : (
        <>
          <p className="text-sm text-muted">
            You&apos;ve captured <strong>{covered.length}</strong> of <strong>{relevant}</strong> relevant deductions for {taxYear}.
            The rest are prompts — log the expense to tick one off, or mark any that don&apos;t apply to you.
          </p>

          {considered.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-lg">Consider</h2>
              {considered.map(({ item }) => (
                <div key={item.key} className="card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <p className="mt-1 text-sm text-muted">{item.blurb}</p>
                    </div>
                    <form action={dismissDeductionAction} className="shrink-0">
                      <input type="hidden" name="taxYear" value={taxYear} />
                      <input type="hidden" name="itemKey" value={item.key} />
                      <button className="btn btn-ghost" type="submit">Not applicable</button>
                    </form>
                  </div>
                  <LogItForm taxYear={taxYear} itemKey={item.key} title={item.title} activePropertyId={activePropertyId} activePropertyName={activePropertyName} />
                </div>
              ))}
            </section>
          )}

          {covered.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-display text-lg">Covered</h2>
              <ul className="space-y-1 text-sm">
                {covered.map(({ item }) => (
                  <li key={item.key} className="flex items-center gap-2 text-muted"><span className="text-forest">✓</span> {item.title}</li>
                ))}
              </ul>
            </section>
          )}

          {dismissed.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-display text-sm text-faint">Not applicable</h2>
              <ul className="space-y-1 text-sm">
                {dismissed.map(({ item }) => (
                  <li key={item.key} className="flex items-center gap-2 text-faint">
                    {item.title}
                    <form action={undismissDeductionAction} className="inline">
                      <input type="hidden" name="taxYear" value={taxYear} />
                      <input type="hidden" name="itemKey" value={item.key} />
                      <button className="underline hover:text-forest" type="submit">restore</button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the nav link**

In `src/app/(app)/layout.tsx`, add `/deductions` as the FIRST item in the "Tax" group (before `/sa105`):

```ts
        { href: "/deductions", label: "Deductions" },
```

- [ ] **Step 5: Verify + full test run**

Run: `npx tsc --noEmit && npm test`
Expected: PASS (no regressions). If `MoneyInput`/`.field`/`.label`/`.pill` class or prop names differ from what's used above, adjust to the actual primitives (grep `_ui/MoneyInput.tsx` and `globals.css`).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/deductions/" "src/app/(app)/layout.tsx"
git commit -m "feat(deductions): /deductions page, quick-add, dismiss/restore, nav link"
```

---

## Task 7: SA105 pre-filing nudge

**Files:**
- Create: `src/app/(app)/deductions/DeductionsNudge.tsx`
- Modify: `src/app/(app)/sa105/page.tsx`

- [ ] **Step 1: Create the dismissible nudge (client component)**

Create `src/app/(app)/deductions/DeductionsNudge.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";

/** Non-blocking, dismissible "you might be missing N deductions" banner.
 *  Dismissal is remembered per tax year in localStorage. */
export function DeductionsNudge({ taxYear, considerCount }: { taxYear: string; considerCount: number }) {
  const storageKey = `deductions-nudge-dismissed-${taxYear}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    setHidden(localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  if (considerCount === 0 || hidden) return null;
  return (
    <div className="card flex items-center justify-between gap-4 p-4">
      <p className="text-sm">
        Before you file: <strong>{considerCount}</strong> deduction{considerCount === 1 ? "" : "s"} you might be missing for {taxYear}.{" "}
        <a className="underline hover:text-forest" href={`/deductions?ty=${taxYear}`}>Review them</a>.
      </p>
      <button type="button" className="btn btn-ghost shrink-0" onClick={() => { localStorage.setItem(storageKey, "1"); setHidden(true); }}>
        Dismiss
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Mount it on the SA105 page**

In `src/app/(app)/sa105/page.tsx`:
- add imports: `import { getDeductionStatuses } from "../../../lib/data/deductions";` and `import { DeductionsNudge } from "../deductions/DeductionsNudge";`
- after `const taxYear = ...` (and after the existing `getPersonalTaxYearSummary` await is fine too), compute:
  ```ts
  const considerCount = (await getDeductionStatuses(taxYear)).filter((s) => s.state === "consider").length;
  ```
- render `<DeductionsNudge taxYear={taxYear} considerCount={considerCount} />` immediately after the closing `</div>` of the `PageHeader` wrapper block and before the `!isConfiguredTaxYear` banner.

- [ ] **Step 3: Verify + full test run**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/deductions/DeductionsNudge.tsx" "src/app/(app)/sa105/page.tsx"
git commit -m "feat(deductions): dismissible pre-filing nudge on the SA105 page"
```

---

## Task 8: Final verification & live-run

**Files:** none (verification only).

- [ ] **Step 1: Full test suite** — `npx prisma generate && npm test` → PASS (all prior + new `catalog`/`assess` suites).
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → PASS.
- [ ] **Step 3: Live-run** (`npm run dev`, log in) and verify with the imported data:
  - `/deductions` shows Consider / Covered / (Not applicable) and a sensible progress line — items you already have (rent/insurance/mortgage) show **Covered**; gas-safety/EICR/EPC likely **Consider**.
  - "Log it" expands the inline form; saving creates the expense and it flips to **Covered**.
  - "Not applicable" moves an item to the dismissed list; "restore" brings it back.
  - The SA105 page shows the "Before you file: N deductions…" nudge; Dismiss hides it and it stays hidden on reload.
  - Capture screenshots of `/deductions` (light + dark) and the SA105 nudge.
- [ ] **Step 4:** (No commit) — report results, then run `superpowers:finishing-a-development-branch`.

---

## Done

Phases 2 (mileage quick-log) and 3 (use-of-home helper) are separate plans that build on this framework — they upgrade the `mileage` and `use-of-home` items' "Log it" from the generic add to dedicated helpers, and add `mileage.ts` (rates + `mileageClaimPence`), `Property.roundTripMiles`, and `Transaction.miles`.
```
