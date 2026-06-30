# Multi-Property Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-property app into a multi-property one: an active-property switcher, property CRUD, data entry/lists scoped to the active property, and dashboard/SA105 consolidated across personally-owned properties with a per-property breakdown.

**Architecture:** A cookie holds the active property; a pure `resolveActiveProperty` (validation/fallback) is unit-tested while the cookie-reading wrapper is thin. Reporting aggregates across `ownershipType: "personal"` properties so the £1,000 allowance and cash-basis test apply once per person. The existing per-property `getTaxYearSummary` is reused for the breakdown. No schema change.

**Tech Stack:** Next.js 16 (App Router, server actions, cookies), TypeScript, Prisma v7 + SQLite, Vitest.

Reference spec: `docs/superpowers/specs/2026-06-30-multi-property-design.md`. Money is integer pence; new mutations call `requireSession()`; routes are gated by `src/proxy.ts`. Company/corporation-tax mode is a SEPARATE later plan.

---

## File Structure

- `src/lib/data/activeProperty.ts` — `resolveActiveProperty` (pure) + `getActiveProperty`/`getActivePropertyId`/`listProperties` (NEW)
- `src/lib/data/property.ts` — add `createProperty`, `getProperty`, `getPropertyCounts`, `deletePropertyIfEmpty` (MODIFY)
- `src/lib/data/personalSummary.ts` — `getPersonalTaxYearSummary`, `getPerPropertyBreakdown` (NEW)
- `src/lib/data/transactions.ts` — make `listTransactions` accept all-properties; nullable propertyId in filter (MODIFY)
- `src/lib/data/transactionFilter.ts` + test — `buildTransactionWhere(propertyId: string | null, …)` (MODIFY)
- `src/app/(app)/layout.tsx` — active-property switcher + Properties nav link (MODIFY)
- `src/app/(app)/actions.ts` — `setActivePropertyAction` (NEW)
- `src/app/(app)/properties/` — list page + actions + `[id]/edit` (NEW)
- `src/app/(app)/transactions/`, `recurring/`, `scan/`, `import/`, `export/` — scope to active property (MODIFY)
- `src/app/(app)/dashboard/page.tsx`, `sa105/page.tsx`, `export/sa105.pdf/route.ts` — aggregate + breakdown (MODIFY)

---

### Task 1: Active-property resolution

**Files:**
- Create: `src/lib/data/activeProperty.ts`, `src/lib/data/activeProperty.test.ts`

**Context:** `getActiveProperty` reads the cookie via `next/headers` (request-scoped, not unit-testable), so the validation/fallback logic lives in a pure `resolveActiveProperty` that IS tested.

- [ ] **Step 1: Write the failing test (pure resolver)**

```typescript
import { describe, expect, it } from "vitest";
import { resolveActiveProperty } from "./activeProperty";

const props = [{ id: "p1" }, { id: "p2" }];

describe("resolveActiveProperty", () => {
  it("returns the cookie's property when it exists", () => {
    expect(resolveActiveProperty(props, "p2")).toEqual({ propertyId: "p2", isAll: false });
  });
  it("treats 'all' as the consolidated view", () => {
    expect(resolveActiveProperty(props, "all")).toEqual({ propertyId: null, isAll: true });
  });
  it("falls back to the first property for a missing/stale/absent cookie", () => {
    expect(resolveActiveProperty(props, undefined)).toEqual({ propertyId: "p1", isAll: false });
    expect(resolveActiveProperty(props, "gone")).toEqual({ propertyId: "p1", isAll: false });
  });
  it("returns null id when there are no properties", () => {
    expect(resolveActiveProperty([], undefined)).toEqual({ propertyId: null, isAll: false });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/data/activeProperty.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/data/activeProperty.ts`**

```typescript
import "server-only";
import { cookies } from "next/headers";
import { prisma } from "./db";

export const ACTIVE_PROPERTY_COOKIE = "active_property";

export interface ResolvedActiveProperty {
  propertyId: string | null;
  isAll: boolean;
}

/** Pure: pick the active property from the cookie value and the available properties. */
export function resolveActiveProperty(properties: { id: string }[], cookieValue: string | undefined): ResolvedActiveProperty {
  if (cookieValue === "all") return { propertyId: null, isAll: true };
  if (cookieValue && properties.some((p) => p.id === cookieValue)) {
    return { propertyId: cookieValue, isAll: false };
  }
  return { propertyId: properties[0]?.id ?? null, isAll: false };
}

export function listProperties() {
  return prisma.property.findMany({ orderBy: { createdAt: "asc" } });
}

/** Resolve the active property for the current request (reads the cookie). */
export async function getActiveProperty(): Promise<ResolvedActiveProperty> {
  const cookieValue = (await cookies()).get(ACTIVE_PROPERTY_COOKIE)?.value;
  const properties = await listProperties();
  return resolveActiveProperty(properties, cookieValue);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/data/activeProperty.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: active-property resolution (cookie + pure resolver)"
```

---

### Task 2: Property CRUD data layer

**Files:**
- Modify: `src/lib/data/property.ts`, `src/lib/data/property.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/data/property.test.ts` (existing helpers import `getOrCreateDefaultProperty`, `updateProperty`; this file already uses `resetDb`):

```typescript
import { createProperty, getProperty, getPropertyCounts, deletePropertyIfEmpty } from "./property";
import { createTransaction } from "./transactions";
import { prisma } from "../db";

describe("property CRUD", () => {
  it("creates and fetches a property", async () => {
    const p = await createProperty({ name: "Flat 2", ownershipType: "personal" });
    expect((await getProperty(p.id))?.name).toBe("Flat 2");
  });
  it("deletes only when empty", async () => {
    const p = await createProperty({ name: "Empty" });
    const cat = await prisma.category.findFirstOrThrow({ where: { name: "Rent received" } });
    const p2 = await createProperty({ name: "Has data" });
    await createTransaction({ propertyId: p2.id, categoryId: cat.id, date: new Date("2025-06-01"), amountPence: 100, direction: "in" });

    expect((await getPropertyCounts(p2.id)).transactions).toBe(1);
    await expect(deletePropertyIfEmpty(p2.id)).rejects.toThrow();
    await deletePropertyIfEmpty(p.id); // empty → ok
    expect(await getProperty(p.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/data/property.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement in `src/lib/data/property.ts`**

Add (keep existing `getOrCreateDefaultProperty`, `updateProperty`, `PropertyInput`). Extend `PropertyInput` with `ownershipType?: "personal" | "company"`:

```typescript
export interface PropertyInput {
  name: string;
  address?: string | null;
  ownershipType?: "personal" | "company";
}

export function createProperty(input: PropertyInput) {
  return prisma.property.create({ data: { name: input.name, address: input.address ?? null, ownershipType: input.ownershipType ?? "personal" } });
}

export function getProperty(id: string) {
  return prisma.property.findUnique({ where: { id } });
}

export async function getPropertyCounts(id: string): Promise<{ transactions: number; recurring: number }> {
  const [transactions, recurring] = await Promise.all([
    prisma.transaction.count({ where: { propertyId: id } }),
    prisma.recurringRule.count({ where: { propertyId: id } }),
  ]);
  return { transactions, recurring };
}

export async function deletePropertyIfEmpty(id: string): Promise<void> {
  const counts = await getPropertyCounts(id);
  if (counts.transactions > 0 || counts.recurring > 0) {
    throw new Error("Can't delete a property that still has transactions or recurring rules.");
  }
  await prisma.property.delete({ where: { id } });
}
```

NOTE: `updateProperty`'s input type is now `Partial<PropertyInput>` which gains `ownershipType` automatically — confirm it threads through (it spreads input into `data`). If `updateProperty` currently lists explicit fields, add `ownershipType` to its `data`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/data/property.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: property CRUD with delete-protection"
```

---

### Task 3: Aggregated personal summary

**Files:**
- Create: `src/lib/data/personalSummary.ts`, `src/lib/data/personalSummary.test.ts`

**Context:** The correctness heart of this plan — the £1,000 allowance and basis must apply ONCE across all personal properties, and company-owned properties must be excluded.

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { getPersonalTaxYearSummary, getPerPropertyBreakdown } from "./personalSummary";
import { createProperty } from "./property";
import { createTransaction } from "./transactions";
import { updateProfile } from "./taxProfile";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function cat(name: string) {
  return (await prisma.category.findFirstOrThrow({ where: { name } })).id;
}
beforeEach(async () => { await resetDb(); });

describe("personal tax-year summary", () => {
  it("sums personal properties, applies the £1,000 allowance once, excludes company", async () => {
    const a = await createProperty({ name: "A", ownershipType: "personal" });
    const b = await createProperty({ name: "B", ownershipType: "personal" });
    const co = await createProperty({ name: "Co", ownershipType: "company" });
    await updateProfile("2025-26", { usePropertyAllowance: true });
    const rent = await cat("Rent received");
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 700_00, direction: "in" });
    await createTransaction({ propertyId: b.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 700_00, direction: "in" });
    await createTransaction({ propertyId: co.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 900_00, direction: "in" });

    const { summary } = await getPersonalTaxYearSummary("2025-26");
    expect(summary.incomePence).toBe(1_400_00); // A+B only, not Co
    // allowance applied ONCE on the £1,400 total → taxable £400 (not £0+£0 per-property)
    expect(summary.taxableProfitPence).toBe(400_00);
  });

  it("breaks down per personal property", async () => {
    const a = await createProperty({ name: "A", ownershipType: "personal" });
    const rent = await cat("Rent received");
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 500_00, direction: "in" });
    const rows = await getPerPropertyBreakdown("2025-26");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ propertyName: "A", incomePence: 500_00, profitPence: 500_00 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/data/personalSummary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/data/personalSummary.ts`**

```typescript
import "server-only";
import { prisma } from "../db";
import { taxYearRange } from "../tax/taxYear";
import { getOrCreateProfile } from "./taxProfile";
import { toTaxTxn } from "../tax/fromPrisma";
import { buildTaxYearSummary, type TaxYearSummary } from "../tax/summary";
import { computeProfit } from "../tax/profit";
import type { Region } from "../tax/types";

export async function getPersonalTaxYearSummary(
  taxYear: string,
): Promise<{ summary: TaxYearSummary; otherIncomePence: number; region: Region; usePropertyAllowance: boolean }> {
  const { start, end } = taxYearRange(taxYear);
  const [rows, profile] = await Promise.all([
    prisma.transaction.findMany({
      where: { date: { gte: start, lt: end }, property: { ownershipType: "personal" } },
      include: { category: true },
    }),
    getOrCreateProfile(taxYear),
  ]);
  const summary = buildTaxYearSummary(rows.map((r) => toTaxTxn(r)), {
    taxYear,
    otherIncomePence: profile.otherIncomePence,
    region: profile.region as Region,
    usePropertyAllowance: profile.usePropertyAllowance,
  });
  return { summary, otherIncomePence: profile.otherIncomePence, region: profile.region as Region, usePropertyAllowance: profile.usePropertyAllowance };
}

export interface PropertyBreakdownRow {
  propertyId: string;
  propertyName: string;
  incomePence: number;
  expensesPence: number;
  profitPence: number;
}

export async function getPerPropertyBreakdown(taxYear: string): Promise<PropertyBreakdownRow[]> {
  const { start, end } = taxYearRange(taxYear);
  const properties = await prisma.property.findMany({ where: { ownershipType: "personal" }, orderBy: { createdAt: "asc" } });
  const out: PropertyBreakdownRow[] = [];
  for (const p of properties) {
    const rows = await prisma.transaction.findMany({ where: { propertyId: p.id, date: { gte: start, lt: end } }, include: { category: true } });
    const { incomePence, expensesPence, profitPence } = computeProfit(rows.map((r) => toTaxTxn(r)));
    out.push({ propertyId: p.id, propertyName: p.name, incomePence, expensesPence, profitPence });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/data/personalSummary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: consolidated personal summary + per-property breakdown"
```

---

### Task 4: All-properties transaction queries

**Files:**
- Modify: `src/lib/data/transactionFilter.ts`, `src/lib/data/transactionFilter.test.ts`, `src/lib/data/transactions.ts`, `src/lib/data/transactions.test.ts`

- [ ] **Step 1: Update the filter test for a nullable property**

Add to `src/lib/data/transactionFilter.test.ts`:

```typescript
  it("omits the property scope when propertyId is null (all properties)", () => {
    const where = buildTransactionWhere(null, { direction: "out" });
    expect(where).toEqual({ direction: "out" });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/data/transactionFilter.test.ts`
Expected: FAIL — current builder requires a string propertyId.

- [ ] **Step 3: Make `buildTransactionWhere` accept `string | null`**

In `src/lib/data/transactionFilter.ts`, change the signature and skip the property clause when null:

```typescript
export interface TransactionWhere {
  propertyId?: string;
  categoryId?: string;
  direction?: Direction;
  date?: { gte: Date; lt: Date };
}

export function buildTransactionWhere(propertyId: string | null, filter: TransactionFilter): TransactionWhere {
  const where: TransactionWhere = {};
  if (propertyId) where.propertyId = propertyId;
  if (filter.categoryId) where.categoryId = filter.categoryId;
  if (filter.direction) where.direction = filter.direction;
  if (filter.taxYear) {
    const { start, end } = taxYearRange(filter.taxYear);
    where.date = { gte: start, lt: end };
  }
  return where;
}
```

(The existing tests that pass a string still pass — they set `propertyId`.)

- [ ] **Step 4: Add an all-properties list test**

Add to `src/lib/data/transactions.test.ts`:

```typescript
  it("lists across all properties with the property included when propertyId is null", async () => {
    const { createProperty } = await import("./property");
    const a = await createProperty({ name: "A" });
    const b = await createProperty({ name: "B" });
    const rent = await rentCategoryId();
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 100, direction: "in" });
    await createTransaction({ propertyId: b.id, categoryId: rent, date: new Date("2025-06-02"), amountPence: 200, direction: "in" });
    const all = await listTransactionsFiltered(null, {});
    expect(all).toHaveLength(2);
    expect(all[0].property?.name).toBeDefined();
  });
```

- [ ] **Step 5: Run to verify it fails**

Run: `npm test src/lib/data/transactions.test.ts`
Expected: FAIL — `listTransactionsFiltered` requires a string; `property` not included.

- [ ] **Step 6: Update `listTransactionsFiltered` (and `listTransactions`) in `src/lib/data/transactions.ts`**

```typescript
export function listTransactions(propertyId?: string) {
  return prisma.transaction.findMany({
    where: propertyId ? { propertyId } : {},
    orderBy: { date: "desc" },
    include: { category: true, vendor: true, property: true },
  });
}

export function listTransactionsFiltered(propertyId: string | null, filter: TransactionFilter) {
  return prisma.transaction.findMany({
    where: buildTransactionWhere(propertyId, filter),
    orderBy: { date: "desc" },
    include: { category: true, vendor: true, property: true },
  });
}
```

- [ ] **Step 7: Run to verify it passes**

Run: `npm test src/lib/data/transactionFilter.test.ts src/lib/data/transactions.test.ts`
Expected: PASS.

- [ ] **Step 8: Run full suite + commit**

Run: `npm test` (all green).

```bash
git add -A && git commit -m "feat: all-properties transaction queries"
```

---

### Task 5: Active-property switcher + Properties nav link

**Files:**
- Create: `src/app/(app)/actions.ts`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create `src/app/(app)/actions.ts`**

```typescript
"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireSession } from "../../lib/auth/session";
import { ACTIVE_PROPERTY_COOKIE } from "../../lib/data/activeProperty";

export async function setActivePropertyAction(formData: FormData) {
  await requireSession();
  const value = String(formData.get("propertyId") ?? "all");
  (await cookies()).set(ACTIVE_PROPERTY_COOKIE, value, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
```

- [ ] **Step 2: Add the switcher + Properties link to `src/app/(app)/layout.tsx`**

In the layout (a server component), load properties + active selection and render the switcher. Add imports `import { listProperties, getActiveProperty } from "../../lib/data/activeProperty";` and `import { setActivePropertyAction } from "./actions";`. Make the component `async` (it likely already is for `isExtractionEnabled`; if not, make it async). Before `return`:

```tsx
  const properties = await listProperties();
  const active = await getActiveProperty();
  const activeValue = active.isAll ? "all" : (active.propertyId ?? "");
```

Add `{ href: "/properties", label: "Properties" }` to the `nav` array (after Settings). Inside the `<nav>`, before the logout form, render the switcher when there is at least one property:

```tsx
        {properties.length > 0 && (
          <form action={setActivePropertyAction} className="ml-auto mr-4">
            <select name="propertyId" defaultValue={activeValue} className="border px-2 py-1 text-sm"
                    // submit on change
            >
              <option value="all">All properties</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <noscript><button type="submit" className="ml-1 text-sm">Go</button></noscript>
          </form>
        )}
```

Because `<select>` cannot auto-submit without client JS, make the switcher a tiny client component to call the form's `requestSubmit` on change. Create `src/app/(app)/PropertySwitcher.tsx`:

```tsx
"use client";
import { setActivePropertyAction } from "./actions";

export function PropertySwitcher({ properties, activeValue }: { properties: { id: string; name: string }[]; activeValue: string }) {
  return (
    <form action={setActivePropertyAction} className="ml-auto mr-4">
      <select
        name="propertyId"
        defaultValue={activeValue}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="border px-2 py-1 text-sm"
      >
        <option value="all">All properties</option>
        {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </form>
  );
}
```

and in the layout render `{properties.length > 0 && <PropertySwitcher properties={properties} activeValue={activeValue} />}` (import it). Remove the inline `<form>` sketch above in favour of this component. If `ml-auto` is already used by the logout form, wrap switcher + logout in a right-aligned flex group instead so both sit on the right.

- [ ] **Step 3: Verify build**

Run: `npm run build` (success) and `npm test` (still green).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: active-property switcher and Properties nav link"
```

---

### Task 6: Properties management pages

**Files:**
- Create: `src/app/(app)/properties/page.tsx`, `src/app/(app)/properties/actions.ts`, `src/app/(app)/properties/[id]/edit/page.tsx`

- [ ] **Step 1: Create `src/app/(app)/properties/actions.ts`**

```typescript
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "../../../lib/auth/session";
import { createProperty, updateProperty, deletePropertyIfEmpty } from "../../../lib/data/property";

export async function addPropertyAction(formData: FormData) {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/properties?error=Name+required");
  await createProperty({
    name,
    address: String(formData.get("address") ?? "") || null,
    ownershipType: String(formData.get("ownershipType")) === "company" ? "company" : "personal",
  });
  revalidatePath("/properties");
  redirect("/properties");
}

export async function updatePropertyAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  await updateProperty(id, {
    name: String(formData.get("name") ?? "").trim() || "Unnamed",
    address: String(formData.get("address") ?? "") || null,
    ownershipType: String(formData.get("ownershipType")) === "company" ? "company" : "personal",
  });
  revalidatePath("/properties");
  redirect("/properties");
}

export async function deletePropertyAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  try {
    await deletePropertyIfEmpty(id);
  } catch (e) {
    redirect(`/properties?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath("/properties");
  redirect("/properties");
}
```

- [ ] **Step 2: Create `src/app/(app)/properties/page.tsx`**

```tsx
import { listProperties } from "../../../lib/data/activeProperty";
import { getPropertyCounts } from "../../../lib/data/property";
import { addPropertyAction, deletePropertyAction } from "./actions";

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const properties = await listProperties();
  const counts = await Promise.all(properties.map((p) => getPropertyCounts(p.id)));

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Properties</h1>
      {error && <p className="rounded bg-red-100 px-3 py-2 text-red-700">{error}</p>}

      <form action={addPropertyAction} className="flex flex-wrap items-end gap-2">
        <input name="name" placeholder="Property name" required className="border px-2 py-1" />
        <input name="address" placeholder="Address (optional)" className="border px-2 py-1" />
        <select name="ownershipType" defaultValue="personal" className="border px-2 py-1">
          <option value="personal">Personal</option>
          <option value="company">Company</option>
        </select>
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Add property</button>
      </form>

      {properties.length === 0 && <p className="text-gray-500">Add your first property to get started.</p>}

      <ul className="divide-y border">
        {properties.map((p, i) => (
          <li key={p.id} className="flex items-center justify-between px-3 py-2">
            <span>
              {p.name}{p.address ? ` — ${p.address}` : ""} · <span className="text-gray-500">{p.ownershipType}</span>
              {p.ownershipType === "company" && <span className="ml-1 text-xs text-amber-700">(company tax reporting not built yet)</span>}
              <span className="ml-2 text-xs text-gray-400">{counts[i].transactions} txns</span>
            </span>
            <span className="flex items-center gap-2">
              <a href={`/properties/${p.id}/edit`} className="text-blue-600 hover:underline">Edit</a>
              <form action={deletePropertyAction}>
                <input type="hidden" name="id" value={p.id} />
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

- [ ] **Step 3: Create `src/app/(app)/properties/[id]/edit/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getProperty } from "../../../../../lib/data/property";
import { updatePropertyAction } from "../../actions";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getProperty(id);
  if (!property) notFound();
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Edit property</h1>
      <form action={updatePropertyAction} className="space-y-3">
        <input type="hidden" name="id" value={property.id} />
        <label className="block"><span className="block text-sm">Name</span>
          <input name="name" defaultValue={property.name} required className="w-full border px-2 py-1" /></label>
        <label className="block"><span className="block text-sm">Address</span>
          <input name="address" defaultValue={property.address ?? ""} className="w-full border px-2 py-1" /></label>
        <label className="block"><span className="block text-sm">Ownership</span>
          <select name="ownershipType" defaultValue={property.ownershipType} className="border px-2 py-1">
            <option value="personal">Personal</option>
            <option value="company">Company</option>
          </select></label>
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Save</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Verify build + manual**

Run: `npm run build` (success; `/properties` and `/properties/[id]/edit` routes).
Manual: add a property, edit it, try to delete one with data (blocked with message), delete an empty one (works).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: properties management page"
```

---

### Task 7: Scope data entry & lists to the active property

**Files:**
- Modify: `src/app/(app)/transactions/page.tsx` + `actions.ts`, `src/app/(app)/recurring/page.tsx` + `actions.ts`, `src/app/(app)/scan/actions.ts`, `src/app/(app)/scan/review/actions.ts`, `src/app/(app)/import/actions.ts`, `src/app/(app)/export/transactions/route.ts`, `src/app/(app)/settings/page.tsx` + `actions.ts`

**Context:** Replace `getOrCreateDefaultProperty` with `getActiveProperty` at data-entry call sites. When "all" is active (no `propertyId`), lists show all rows with a Property column and add forms require a property choice.

- [ ] **Step 1: Transactions page — scope list, add Property column + required picker on "all"**

In `src/app/(app)/transactions/page.tsx`: replace `const property = await getOrCreateDefaultProperty();` with:

```tsx
import { getActiveProperty, listProperties } from "../../../lib/data/activeProperty";
// ...
  const active = await getActiveProperty();
  const properties = await listProperties();
  const txns = await listTransactionsFiltered(active.propertyId, { taxYear: sp.taxYear || undefined, categoryId: sp.categoryId || undefined, direction: (sp.direction as "in" | "out") || undefined });
```

Heading: show the active property name or "All properties" (`active.isAll ? "All properties" : (properties.find(p => p.id === active.propertyId)?.name ?? "—")`). In the add form, when `active.isAll`, render a required `<select name="propertyId">` of properties; otherwise a hidden `<input name="propertyId" value={active.propertyId ?? ""}>`. In the table, when `active.isAll`, add a "Property" column showing `t.property?.name`.

- [ ] **Step 2: Transactions add action — use the posted/active property**

In `src/app/(app)/transactions/actions.ts` `addTransactionAction`: read `propertyId` from the form (the page now always submits one, hidden or selected). Replace `const property = await getOrCreateDefaultProperty();` and `propertyId: property.id` with:

```typescript
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) redirect(`/transactions?error=${encodeURIComponent("Choose a property.")}`);
```

and use `propertyId` in `createTransaction`. (Add `import { redirect } from "next/navigation";` if missing.)

- [ ] **Step 3: Recurring page + action — same pattern**

In `src/app/(app)/recurring/page.tsx`: use `getActiveProperty` + `listProperties`; list rules for `active.propertyId` when set, else all (add an all variant to `listRecurringRules` mirroring Task 4: `listRecurringRules(propertyId?: string)` with `where: propertyId ? { propertyId } : {}` and `include: { category, vendor, property }`). Add a Property column when "all"; required property `<select>` (or hidden input) in the add form; the "Generate due transactions now" button scopes to `active.propertyId` (pass it to `generateNowAction`, which calls `materialiseDue(new Date(), active.propertyId ?? undefined)`).
In `src/app/(app)/recurring/actions.ts`: `addRecurringAction` reads `propertyId` from the form (required); `generateNowAction` reads an optional `propertyId` from the form and passes it to `materialiseDue`.

- [ ] **Step 4: Scan, review, import, export — scope to active property**

- `src/app/(app)/scan/actions.ts` `uploadReceiptAction`: this only stores the extraction in the Attachment, not a transaction — no property needed yet. Leave unchanged.
- `src/app/(app)/scan/review/actions.ts` `confirmScanAction`: replace `getOrCreateDefaultProperty` with reading `propertyId` from the form. In `src/app/(app)/scan/review/page.tsx`, add a property `<select>` (default to the active property) so confirm has a target. Pass active property to default the select.
- `src/app/(app)/import/actions.ts` `confirmImportAction` and `buildPreview`: replace `getOrCreateDefaultProperty` with reading the active property; carry the active `propertyId` through the import form as a hidden field (the import page reads `getActiveProperty`); dedup `listTransactions(propertyId ?? undefined)`.
- `src/app/(app)/export/transactions/route.ts`: scope to the active property — read the cookie via `getActiveProperty()` and pass `active.propertyId` to `listTransactionsFiltered`.

- [ ] **Step 5: Settings — edit the active property**

In `src/app/(app)/settings/page.tsx` + `actions.ts`: replace `getOrCreateDefaultProperty` with `getActiveProperty` (edit the active property's name/address). If `active.isAll` or no property, show "select a property to edit its details, or add one on the Properties page."

- [ ] **Step 6: Verify build + tests + manual**

Run: `npm run build` (success) and `npm test` (green). Manual: with two properties, switch active and confirm transactions/recurring scope to it and new entries attach to it; switch to "All" and confirm the Property column appears and adding requires a property choice; confirm CSV export reflects the active scope.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: scope data entry and lists to the active property"
```

---

### Task 8: Consolidated dashboard & SA105

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/sa105/page.tsx`, `src/app/(app)/export/sa105.pdf/route.ts`

- [ ] **Step 1: Dashboard — consolidated headline + per-property breakdown**

In `src/app/(app)/dashboard/page.tsx`: replace the per-property summary with `getPersonalTaxYearSummary(taxYear)` and add the breakdown:

```tsx
import { getPersonalTaxYearSummary, getPerPropertyBreakdown } from "../../../lib/data/personalSummary";
import { formatGBP } from "../../../lib/tax/money";
// ...
  const { summary, otherIncomePence, usePropertyAllowance, region } = await getPersonalTaxYearSummary(taxYear);
  const breakdown = await getPerPropertyBreakdown(taxYear);
```

Remove the `getOrCreateDefaultProperty` usage (the dashboard is person-level now). Keep the cards/estimate/other-income form. Below the cards, add a breakdown table (only when `breakdown.length > 1`):

```tsx
      {breakdown.length > 1 && (
        <table className="w-full border text-sm">
          <thead><tr className="border-b bg-gray-50 text-left"><th className="px-2 py-1">Property</th><th className="px-2 py-1 text-right">Income</th><th className="px-2 py-1 text-right">Expenses</th><th className="px-2 py-1 text-right">Profit</th></tr></thead>
          <tbody>
            {breakdown.map((r) => (
              <tr key={r.propertyId} className="border-b">
                <td className="px-2 py-1">{r.propertyName}</td>
                <td className="px-2 py-1 text-right">{formatGBP(r.incomePence)}</td>
                <td className="px-2 py-1 text-right">{formatGBP(r.expensesPence)}</td>
                <td className="px-2 py-1 text-right">{formatGBP(r.profitPence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
```

The "Tax year" header stays. The dashboard no longer needs the property name in its title (it's consolidated) — title just "Dashboard".

- [ ] **Step 2: SA105 — consolidated boxes**

In `src/app/(app)/sa105/page.tsx`: replace `getOrCreateDefaultProperty` + `getTaxYearSummary(property.id, …)` with `getPersonalTaxYearSummary(taxYear)`. Add a small note: "Aggregated across your personally-owned properties." The box table and labels are unchanged.

- [ ] **Step 3: SA105 PDF — same aggregate**

In `src/app/(app)/export/sa105.pdf/route.ts`: replace `getOrCreateDefaultProperty` + `getTaxYearSummary` with `getPersonalTaxYearSummary(taxYear)`; the PDF "property name" line becomes "All personal properties" (or omit the per-property line).

- [ ] **Step 4: Verify build + tests + manual**

Run: `npm run build` (success), `npm test` (green), `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"` (0).
Manual: with two personal properties holding income, confirm the dashboard headline sums both, the breakdown table lists each, the SA105 boxes total across both, and the PDF downloads with the aggregate. Set one property to "company" and confirm it drops out of the SA105/dashboard totals.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: consolidated dashboard and SA105 across personal properties"
```

---

## Self-Review

**Spec coverage:**
- Active-property context (cookie, resolver, getActiveProperty, listProperties) → Task 1. ✓
- Property CRUD + delete-protection → Task 2; UI → Task 6. ✓
- Aggregated personal summary (allowance once, exclude company) + breakdown → Task 3. ✓
- All-properties queries → Task 4. ✓
- Switcher + Properties nav → Task 5. ✓
- Scope data entry/lists; "All" → Property column + required picker; vendors unchanged (global); export scoped; materialiseDue scoped → Task 7. ✓
- Consolidated dashboard & SA105 (+ PDF) with breakdown; company excluded → Task 8. ✓
- Bootstrap of existing single property: `getOrCreateDefaultProperty` retained; `resolveActiveProperty` falls back to first property → Tasks 1, 5. ✓
- Testing (resolver pure; CRUD + delete-protection; aggregate once-per-person + exclude company; breakdown; all-properties list; flow live-run) → Tasks 1-4 + manual in 5-8. ✓
- Non-goals respected (no corporation tax, no per-property returns, no permissions, no joint-ownership). ✓

**Placeholder scan:** None. Task 5 Step 2 evolves an inline `<form>` sketch into the `PropertySwitcher` client component — the final state (the client component) is fully specified; the sketch is explicitly replaced.

**Type consistency:** `ResolvedActiveProperty {propertyId, isAll}` from Task 1 used by Tasks 5,7,8. `buildTransactionWhere(propertyId: string | null, …)` (Task 4) — callers in Task 7 pass `active.propertyId` (string | null). `listTransactions`/`listTransactionsFiltered` now `include: { property }` and accept null → page uses `t.property?.name`. `PropertyInput.ownershipType` added (Task 2) used by Task 6 forms. `getPersonalTaxYearSummary` return shape matches what the dashboard/sa105 destructure (summary/otherIncome/region/usePropertyAllowance) — same as the old `getTaxYearSummary` shape, so the forms are unchanged. `PropertyBreakdownRow` used by the dashboard table.

---

## Notes for the implementer

- **`<select>` auto-submit needs a tiny client component** (`PropertySwitcher.tsx`, Task 5) — server components can't attach `onChange`. Keep it minimal ("use client" + the select). The action it calls is a server action.
- **`getActiveProperty` is request-scoped** (reads `next/headers` cookies); it is NOT unit-tested — the pure `resolveActiveProperty` is. Don't try to call `getActiveProperty` from a Vitest test.
- **The once-per-person allowance is the key correctness property** (Task 3) — its test must show the aggregate taxable profit, not per-property. If a refactor breaks it, fix the aggregation, not the test.
- **Migration of call sites (Task 7) is broad but mechanical.** After it, grep for `getOrCreateDefaultProperty` — it should remain only as the bootstrap (and in `property.ts`); data-entry/reporting pages should use `getActiveProperty`/`getPersonalTaxYearSummary`.
- **Company-owned properties** are excluded from personal reporting (Task 3 filter) and the Properties page notes company tax isn't built yet — that's the seam for the next plan.
