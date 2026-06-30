# Polish Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four independent quality-of-life features: Scottish tax bands + region picker, inline editing of transactions/vendors, a downloadable SA105 PDF, and generic bank-statement CSV import.

**Architecture:** Each feature is a self-contained unit over the existing Next.js 16 + Prisma v7 app. The tax engine's band model is generalised to ordered brackets (EWNI results regression-locked). New server actions/routes are auth-guarded. Pure logic (band evaluation, CSV parsing, row mapping, dedup) is TDD; UI is build + manual verified.

**Tech Stack:** Next.js 16 (App Router, route handlers, server actions), TypeScript, Prisma v7 + SQLite, Vitest, pdf-lib.

Reference spec: `docs/superpowers/specs/2026-06-30-polish-bundle-design.md`. Money is integer pence. Prisma v7 migrations: hand-authored SQL + `prisma migrate deploy` + `prisma generate`.

---

## File Structure

- `src/lib/tax/bands.ts` — generalised bracket-based `TaxBands` + EWNI & Scotland (MODIFY)
- `src/lib/tax/bands.test.ts` — updated to new shape (MODIFY)
- `src/lib/tax/incomeTax.ts` — bracket-iterating `incomeTaxOn` (MODIFY)
- `src/app/(app)/dashboard/page.tsx` + `actions.ts` — region picker (MODIFY)
- `src/lib/data/transactions.ts`, `vendors.ts` — add `getTransaction`/`getVendor` (MODIFY)
- `src/app/(app)/transactions/[id]/edit/page.tsx` + `src/app/(app)/transactions/edit-actions.ts` — edit transaction (NEW)
- `src/app/(app)/vendors/[id]/edit/page.tsx` + `src/app/(app)/vendors/edit-actions.ts` — edit vendor (NEW)
- `src/lib/tax/sa105Boxes-labels.ts` — shared `BOX_LABELS` (NEW; extracted from the SA105 page)
- `src/app/(app)/export/sa105.pdf/route.ts` — PDF route (NEW)
- `src/lib/reports/csv.ts` — add `parseCsv` (MODIFY)
- `src/lib/import/bankImport.ts` — `mapImportRow`, `isDuplicate`, types (NEW)
- `src/lib/data/transactions.ts` — add `bulkCreateTransactions` (MODIFY)
- `src/app/(app)/import/page.tsx` + `src/app/(app)/import/actions.ts` — import flow (NEW)

---

## UNIT 1 — Scottish tax bands + region picker

### Task 1: Generalise the tax-band model and add Scotland

**Files:**
- Modify: `src/lib/tax/bands.ts`, `src/lib/tax/bands.test.ts`, `src/lib/tax/incomeTax.ts`

**Context:** The current `TaxBands` hard-codes 3 rates. We replace it with an ordered bracket list plus a top rate above a fixed gross threshold. This model reproduces every existing EWNI value exactly (verified): the bands are *taxable-income widths*; the last normal band fills up to `(topThresholdPence − personalAllowance)`, and the top rate applies beyond. The personal-allowance taper is unchanged.

- [ ] **Step 1: Rewrite `src/lib/tax/bands.ts`**

```typescript
import type { Region } from "./types";

export interface TaxBand {
  /** Width of this band in taxable income (pence), above the personal allowance. null = fills to the top threshold. */
  widthPence: number | null;
  rate: number;
}

export interface TaxBands {
  personalAllowancePence: number;
  paTaperStartPence: number;
  /** Gross income at which the personal allowance reaches zero and the top rate begins. */
  topThresholdPence: number;
  topRate: number;
  /** Ordered bands below the top rate; the final band must have widthPence: null. */
  bands: TaxBand[];
}

const ENGLAND_WALES_NI_2025_26: TaxBands = {
  personalAllowancePence: 12_570_00,
  paTaperStartPence: 100_000_00,
  topThresholdPence: 125_140_00,
  topRate: 0.45,
  bands: [
    { widthPence: 37_700_00, rate: 0.2 }, // basic
    { widthPence: null, rate: 0.4 }, // higher (fills to top threshold)
  ],
};

const SCOTLAND_2025_26: TaxBands = {
  personalAllowancePence: 12_570_00,
  paTaperStartPence: 100_000_00,
  topThresholdPence: 125_140_00,
  topRate: 0.48, // top
  bands: [
    { widthPence: 2_306_00, rate: 0.19 }, // starter
    { widthPence: 11_685_00, rate: 0.2 }, // basic
    { widthPence: 17_101_00, rate: 0.21 }, // intermediate
    { widthPence: 31_338_00, rate: 0.42 }, // higher
    { widthPence: null, rate: 0.45 }, // advanced (fills to top threshold)
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
  return bands;
}
```

NOTE: the Scottish band widths reflect 2025/26 figures (starter to £14,876, basic to £26,561, intermediate to £43,662, higher to £75,000, advanced to £125,140, top above). VERIFY against current HMRC Scottish rates at implementation time and adjust the `widthPence` values if they have changed.

- [ ] **Step 2: Update `src/lib/tax/bands.test.ts` to the new shape**

```typescript
import { describe, expect, it } from "vitest";
import { getBands } from "./bands";

describe("getBands", () => {
  it("returns 2025-26 England/Wales/NI bands", () => {
    const b = getBands("2025-26", "englandWalesNI");
    expect(b.personalAllowancePence).toBe(12_570_00);
    expect(b.topThresholdPence).toBe(125_140_00);
    expect(b.topRate).toBeCloseTo(0.45);
    expect(b.bands).toEqual([
      { widthPence: 37_700_00, rate: 0.2 },
      { widthPence: null, rate: 0.4 },
    ]);
  });
  it("returns 2025-26 Scotland bands with 6 rates total", () => {
    const b = getBands("2025-26", "scotland");
    expect(b.bands).toHaveLength(5); // 5 normal bands + topRate = 6 rates
    expect(b.topRate).toBeCloseTo(0.48);
    expect(b.bands[0]).toEqual({ widthPence: 2_306_00, rate: 0.19 });
  });
  it("falls back to the latest year and to EWNI for an unknown region/year", () => {
    expect(() => getBands("2099-00", "englandWalesNI")).not.toThrow();
  });
});
```

- [ ] **Step 3: Run to verify bands.test fails (old assertions/shape gone)**

Run: `npm test src/lib/tax/bands.test.ts`
Expected: PASS after Step 1+2 are both in (the test now matches the new shape). If it fails, reconcile the shape.

- [ ] **Step 4: Rewrite `incomeTaxOn` in `src/lib/tax/incomeTax.ts`**

Replace the body of `incomeTaxOn` (keep `effectivePersonalAllowance`, `estimatePropertyTax`, and all exports/signatures unchanged):

```typescript
export function incomeTaxOn(totalIncomePence: number, taxYear: string, region: Region): number {
  const bands = getBands(taxYear, region);
  const pa = effectivePersonalAllowance(totalIncomePence, bands);
  const taxable = Math.max(0, totalIncomePence - pa);

  // Taxable income up to this point is taxed by the normal bands; beyond it, the top rate.
  const cap = Math.max(0, bands.topThresholdPence - pa);
  let remaining = Math.min(taxable, cap);
  let tax = 0;

  for (const band of bands.bands) {
    if (remaining <= 0) break;
    const width = band.widthPence ?? remaining; // null = fill remainder up to the cap
    const slice = Math.min(remaining, width);
    tax += slice * band.rate;
    remaining -= slice;
  }

  const aboveCap = Math.max(0, taxable - cap);
  tax += aboveCap * bands.topRate;

  return Math.round(tax);
}
```

`effectivePersonalAllowance` must read `bands.personalAllowancePence` and `bands.paTaperStartPence` (rename its parameter usage to the new field names if needed — they are unchanged from before).

- [ ] **Step 5: Run the income-tax tests (EWNI regression must hold)**

Run: `npm test src/lib/tax/incomeTax.test.ts`
Expected: PASS — all existing EWNI assertions (£20k→£1,486; £60k→£11,432; £110k→£33,432; £130k→£44,703; the property estimate) reproduce exactly under the new model.

- [ ] **Step 6: Add a Scottish regression test**

Append to `src/lib/tax/incomeTax.test.ts` inside the `describe("incomeTaxOn ...")` block:

```typescript
  it("applies Scottish bands (2025-26)", () => {
    // £50,000 Scottish: PA 12,570; starter/basic/intermediate/higher slices.
    // 2306*.19 + 11685*.20 + 17101*.21 + (37430-2306-11685-17101)*.42 = 902831 pence
    expect(incomeTaxOn(50_000_00, "2025-26", "scotland")).toBe(9_028_31);
  });
```

Run: `npm test src/lib/tax/incomeTax.test.ts`
Expected: PASS. (If the assertion is off, recompute by hand from the band widths in Step 1 and use the correct value — do NOT change the engine to fit a wrong expectation.)

- [ ] **Step 7: Run the full suite + commit**

Run: `npm test` (all green) and `npm run build` (success).

```bash
git add -A && git commit -m "feat: generalise tax bands to brackets; add Scottish rates"
```

---

### Task 2: Region picker on the dashboard

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/dashboard/actions.ts`

- [ ] **Step 1: Persist region in `saveOtherIncomeAction`**

In `src/app/(app)/dashboard/actions.ts`, read `region` from the form and include it in the `updateProfile` call. The action currently reads `taxYear`, `otherIncome`, `usePropertyAllowance`. Add:

```typescript
  const regionRaw = String(formData.get("region") ?? "englandWalesNI");
  const region = regionRaw === "scotland" ? "scotland" : "englandWalesNI";
```

and change the `updateProfile` call to:

```typescript
  await updateProfile(taxYear, { otherIncomePence, usePropertyAllowance, region });
```

(`ProfileInput` already accepts `region`. Keep the existing taxYear-format validation and the parseAmountToPence try/catch.)

- [ ] **Step 2: Add the region `<select>` to the dashboard form**

In `src/app/(app)/dashboard/page.tsx`, destructure `region` from `getTaxYearSummary` (it already returns `region`): `const { summary, otherIncomePence, usePropertyAllowance, region } = await getTaxYearSummary(property.id, taxYear);`. Add this control to the other-income form, before the submit button:

```tsx
        <label className="flex items-center gap-2">
          <span className="text-sm">Tax region</span>
          <select name="region" defaultValue={region} className="border px-2 py-1">
            <option value="englandWalesNI">England / Wales / NI</option>
            <option value="scotland">Scotland</option>
          </select>
        </label>
```

- [ ] **Step 3: Verify build + manual**

Run: `npm run build` (success).
Manual: on `/dashboard`, switch region to Scotland with a non-zero other income and confirm the estimated tax changes (Scottish rates differ from EWNI).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: tax-region picker on dashboard"
```

---

## UNIT 2 — Inline editing

### Task 3: getTransaction / getVendor fetchers

**Files:**
- Modify: `src/lib/data/transactions.ts`, `src/lib/data/vendors.ts`
- Test: `src/lib/data/transactions.test.ts`, `src/lib/data/vendors.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/lib/data/transactions.test.ts` (helpers `getOrCreateDefaultProperty`, `rentCategoryId`, `createTransaction` are already imported there):

```typescript
  it("fetches a single transaction by id", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const t = await createTransaction({ propertyId: property.id, categoryId, date: new Date("2025-06-01"), amountPence: 5000, direction: "in" });
    const { getTransaction } = await import("./transactions");
    const fetched = await getTransaction(t.id);
    expect(fetched?.amountPence).toBe(5000);
    expect(await getTransaction("nonexistent")).toBeNull();
  });
```

Add to `src/lib/data/vendors.test.ts`:

```typescript
  it("fetches a single vendor by id", async () => {
    const v = await createVendor({ name: "Acme" });
    const { getVendor } = await import("./vendors");
    expect((await getVendor(v.id))?.name).toBe("Acme");
    expect(await getVendor("nope")).toBeNull();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test src/lib/data/transactions.test.ts src/lib/data/vendors.test.ts`
Expected: FAIL — `getTransaction`/`getVendor` not exported.

- [ ] **Step 3: Implement the fetchers**

In `src/lib/data/transactions.ts` add:

```typescript
export function getTransaction(id: string) {
  return prisma.transaction.findUnique({ where: { id }, include: { category: true, vendor: true } });
}
```

In `src/lib/data/vendors.ts` add:

```typescript
export function getVendor(id: string) {
  return prisma.vendor.findUnique({ where: { id } });
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test src/lib/data/transactions.test.ts src/lib/data/vendors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: single-record fetchers for transactions and vendors"
```

---

### Task 4: Transaction edit page + action

**Files:**
- Create: `src/app/(app)/transactions/edit-actions.ts`, `src/app/(app)/transactions/[id]/edit/page.tsx`
- Modify: `src/app/(app)/transactions/page.tsx` (add Edit link)

- [ ] **Step 1: Create `src/app/(app)/transactions/edit-actions.ts`**

```typescript
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "../../../lib/auth/session";
import { updateTransaction } from "../../../lib/data/transactions";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import type { Direction } from "../../../lib/tax/types";

export async function updateTransactionAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  let amountPence: number;
  try {
    amountPence = parseAmountToPence(String(formData.get("amount") ?? ""));
  } catch (e) {
    redirect(`/transactions/${id}/edit?error=${encodeURIComponent((e as Error).message)}`);
  }
  await updateTransaction(id, {
    date: new Date(String(formData.get("date"))),
    amountPence,
    direction: String(formData.get("direction")) as Direction,
    categoryId: String(formData.get("categoryId")),
    vendorId: String(formData.get("vendorId") ?? "") || null,
    description: String(formData.get("description") ?? "") || null,
  });
  revalidatePath("/transactions");
  redirect("/transactions");
}
```

- [ ] **Step 2: Create `src/app/(app)/transactions/[id]/edit/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getTransaction } from "../../../../../lib/data/transactions";
import { listCategories } from "../../../../../lib/data/categories";
import { listVendors } from "../../../../../lib/data/vendors";
import { penceToPounds } from "../../../../../lib/tax/money";
import { updateTransactionAction } from "../../edit-actions";

export default async function EditTransactionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const [txn, categories, vendors] = await Promise.all([getTransaction(id), listCategories(), listVendors()]);
  if (!txn) notFound();

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Edit transaction</h1>
      {error && <p className="rounded bg-red-100 px-3 py-2 text-red-700">{error}</p>}
      <form action={updateTransactionAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={txn.id} />
        <input type="date" name="date" defaultValue={txn.date.toISOString().slice(0, 10)} required className="border px-2 py-1" />
        <input name="amount" defaultValue={penceToPounds(txn.amountPence)} required className="border px-2 py-1" />
        <select name="direction" defaultValue={txn.direction} className="border px-2 py-1">
          <option value="in">In</option>
          <option value="out">Out</option>
        </select>
        <select name="categoryId" defaultValue={txn.categoryId} required className="border px-2 py-1">
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="vendorId" defaultValue={txn.vendorId ?? ""} className="border px-2 py-1">
          <option value="">— vendor —</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <input name="description" defaultValue={txn.description ?? ""} placeholder="Description" className="border px-2 py-1" />
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Save</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Add an Edit link to each transaction row**

In `src/app/(app)/transactions/page.tsx`, in the actions cell of each row (where the delete `×` button is), add before the delete form:

```tsx
                <a href={`/transactions/${t.id}/edit`} className="mr-2 text-blue-600 hover:underline">Edit</a>
```

- [ ] **Step 4: Verify build + manual**

Run: `npm run build` (success; route `/transactions/[id]/edit` listed).
Manual: edit a transaction's amount and category, save, confirm the list reflects the change. Submit an invalid amount and confirm the error banner shows on the edit page.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: edit transactions inline"
```

---

### Task 5: Vendor edit page + action

**Files:**
- Create: `src/app/(app)/vendors/edit-actions.ts`, `src/app/(app)/vendors/[id]/edit/page.tsx`
- Modify: `src/app/(app)/vendors/page.tsx` (add Edit link)

- [ ] **Step 1: Create `src/app/(app)/vendors/edit-actions.ts`**

```typescript
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "../../../lib/auth/session";
import { updateVendor } from "../../../lib/data/vendors";

export async function updateVendorAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  await updateVendor(id, {
    name: String(formData.get("name") ?? "").trim() || "Unnamed",
    contactDetails: String(formData.get("contactDetails") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || null,
  });
  revalidatePath("/vendors");
  redirect("/vendors");
}
```

- [ ] **Step 2: Create `src/app/(app)/vendors/[id]/edit/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getVendor } from "../../../../../lib/data/vendors";
import { updateVendorAction } from "../../edit-actions";

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = await getVendor(id);
  if (!vendor) notFound();

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Edit vendor</h1>
      <form action={updateVendorAction} className="space-y-3">
        <input type="hidden" name="id" value={vendor.id} />
        <label className="block"><span className="block text-sm">Name</span>
          <input name="name" defaultValue={vendor.name} required className="w-full border px-2 py-1" /></label>
        <label className="block"><span className="block text-sm">Contact</span>
          <input name="contactDetails" defaultValue={vendor.contactDetails ?? ""} className="w-full border px-2 py-1" /></label>
        <label className="block"><span className="block text-sm">Notes</span>
          <input name="notes" defaultValue={vendor.notes ?? ""} className="w-full border px-2 py-1" /></label>
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Save</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Add an Edit link to each vendor row**

In `src/app/(app)/vendors/page.tsx`, in each `<li>`, before the delete form, add:

```tsx
            <a href={`/vendors/${v.id}/edit`} className="mr-2 text-blue-600 hover:underline">Edit</a>
```

(Wrap the existing name span and the new link/delete in a flex container if needed so they sit on one row — the `<li>` already uses `flex items-center justify-between`; place the Edit link + delete form together in the right-hand group.)

- [ ] **Step 4: Verify build + manual**

Run: `npm run build` (success).
Manual: edit a vendor's name + notes, save, confirm the list updates.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: edit vendors inline"
```

---

## UNIT 3 — SA105 PDF export

### Task 6: Extract shared BOX_LABELS

**Files:**
- Create: `src/lib/tax/sa105Labels.ts`
- Modify: `src/app/(app)/sa105/page.tsx`

- [ ] **Step 1: Create `src/lib/tax/sa105Labels.ts`**

```typescript
/** SA105 box number → human description. Verify against the current year's SA105 notes. */
export const SA105_BOX_LABELS: Record<string, string> = {
  "20": "Total rents and other income from property",
  "21": "Other property income",
  "24": "Rent, rates, insurance, ground rents",
  "25": "Property repairs and maintenance",
  "27": "Legal, management, other professional fees",
  "28": "Costs of services provided, including wages",
  "29": "Other allowable property expenses",
  "44": "Residential finance costs (mortgage interest)",
};
```

- [ ] **Step 2: Use it in the SA105 page**

In `src/app/(app)/sa105/page.tsx`, remove the local `BOX_LABELS` constant and `import { SA105_BOX_LABELS } from "../../../lib/tax/sa105Labels";`, replacing references to `BOX_LABELS[box]` with `SA105_BOX_LABELS[box]`.

- [ ] **Step 3: Verify build + commit**

Run: `npm run build` (success).

```bash
git add -A && git commit -m "refactor: extract shared SA105 box labels"
```

---

### Task 7: PDF route + download link

**Files:**
- Create: `src/app/(app)/export/sa105.pdf/route.ts`
- Modify: `src/app/(app)/sa105/page.tsx` (add Download PDF link)
- Modify: `package.json` (pdf-lib dep)

- [ ] **Step 1: Install pdf-lib**

```bash
npm install pdf-lib
```

- [ ] **Step 2: Create `src/app/(app)/export/sa105.pdf/route.ts`**

```typescript
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getOrCreateDefaultProperty } from "../../../../lib/data/property";
import { getTaxYearSummary } from "../../../../lib/data/summary";
import { getTaxYear } from "../../../../lib/tax/taxYear";
import { formatGBP } from "../../../../lib/tax/money";
import { SA105_BOX_LABELS } from "../../../../lib/tax/sa105Labels";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const taxYear = url.searchParams.get("ty") ?? getTaxYear(new Date());
  const property = await getOrCreateDefaultProperty();
  const { summary } = await getTaxYearSummary(property.id, taxYear);
  const boxes = Object.keys(summary.sa105).sort((a, b) => Number(a) - Number(b));

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4 portrait
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 800;
  const draw = (text: string, x: number, size = 11, f = font) => { page.drawText(text, { x, y, size, font: f, color: rgb(0, 0, 0) }); };

  draw(`SA105 summary — ${taxYear}`, 50, 18, bold); y -= 28;
  draw(property.name, 50, 12); y -= 28;
  draw("Box", 50, 11, bold); draw("Description", 110, 11, bold); draw("Amount", 460, 11, bold); y -= 18;
  for (const box of boxes) {
    draw(box, 50); draw(SA105_BOX_LABELS[box] ?? "—", 110); draw(formatGBP(summary.sa105[box]), 460); y -= 18;
  }
  y -= 20;
  draw("Box 44 (finance costs) is a 20% basic-rate tax reducer, not a deduction.", 50, 9);
  y -= 14;
  draw("Estimates only — verify box numbers against the current SA105 notes before filing.", 50, 9);

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="sa105-${taxYear}.pdf"`,
    },
  });
}
```

- [ ] **Step 3: Add a Download PDF link to the SA105 page**

In `src/app/(app)/sa105/page.tsx`, under the heading, add:

```tsx
      <a href={`/export/sa105.pdf?ty=${taxYear}`} className="text-blue-600 hover:underline">Download PDF</a>
```

- [ ] **Step 4: Verify build + manual**

Run: `npm run build` (success; route `/export/sa105.pdf` listed) and `npm test` (still green).
Manual: visit `/sa105`, click Download PDF, confirm a `sa105-<year>.pdf` downloads and opens with the box table.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: downloadable SA105 PDF via pdf-lib"
```

---

## UNIT 4 — Bank CSV import

### Task 8: CSV parser

**Files:**
- Modify: `src/lib/reports/csv.ts`, `src/lib/reports/csv.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/lib/reports/csv.test.ts`:

```typescript
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses a header and rows", () => {
    const r = parseCsv("date,amount\n2025-06-01,950.00\n2025-06-02,-12.50");
    expect(r.header).toEqual(["date", "amount"]);
    expect(r.rows).toEqual([["2025-06-01", "950.00"], ["2025-06-02", "-12.50"]]);
  });
  it("handles quoted fields with commas, quotes and newlines", () => {
    const r = parseCsv('desc,amount\n"Rent, ""June""",950\n"line1\nline2",5');
    expect(r.rows[0]).toEqual(['Rent, "June"', "950"]);
    expect(r.rows[1]).toEqual(["line1\nline2", "5"]);
  });
  it("ignores a trailing newline", () => {
    expect(parseCsv("a,b\n1,2\n").rows).toEqual([["1", "2"]]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/reports/csv.test.ts`
Expected: FAIL — `parseCsv` not exported.

- [ ] **Step 3: Implement `parseCsv` in `src/lib/reports/csv.ts`**

Append:

```typescript
export interface ParsedCsv {
  header: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { records.push(row); row = []; };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { pushField(); i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { pushField(); pushRow(); i++; continue; }
    field += c; i++;
  }
  // flush trailing field/row unless the input ended exactly on a row break with nothing pending
  if (field !== "" || row.length > 0) { pushField(); pushRow(); }

  const [header = [], ...rows] = records;
  return { header, rows };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/reports/csv.test.ts`
Expected: PASS (existing toCsv tests + new parseCsv tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: RFC-4180 CSV parser"
```

---

### Task 9: Import row mapper

**Files:**
- Create: `src/lib/import/bankImport.ts`
- Test: `src/lib/import/bankImport.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { mapImportRow, isDuplicate } from "./bankImport";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("mapImportRow", () => {
  const mapping = { dateCol: 0, amountCol: 1, descriptionCol: 2 };
  it("maps a positive amount as income (DD/MM/YYYY)", () => {
    const r = mapImportRow(["01/06/2025", "950.00", "Rent"], mapping);
    expect(iso(r.date)).toBe("2025-06-01");
    expect(r.amountPence).toBe(95000);
    expect(r.direction).toBe("in");
    expect(r.description).toBe("Rent");
  });
  it("maps a negative amount as expense and accepts ISO dates and £/commas", () => {
    const r = mapImportRow(["2025-06-02", "-£1,250.50", "Mortgage"], mapping);
    expect(iso(r.date)).toBe("2025-06-02");
    expect(r.amountPence).toBe(125050);
    expect(r.direction).toBe("out");
  });
  it("throws on an unparseable date or amount", () => {
    expect(() => mapImportRow(["nope", "5", "x"], mapping)).toThrow();
    expect(() => mapImportRow(["01/06/2025", "abc", "x"], mapping)).toThrow();
  });
});

describe("isDuplicate", () => {
  const existing = [{ date: new Date("2025-06-01"), amountPence: 95000, description: "Rent" }];
  it("flags an exact same-day/amount/description match", () => {
    expect(isDuplicate({ date: new Date("2025-06-01"), amountPence: 95000, description: "Rent" }, existing)).toBe(true);
  });
  it("does not flag a different amount or description", () => {
    expect(isDuplicate({ date: new Date("2025-06-01"), amountPence: 95001, description: "Rent" }, existing)).toBe(false);
    expect(isDuplicate({ date: new Date("2025-06-01"), amountPence: 95000, description: "Other" }, existing)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/import/bankImport.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/import/bankImport.ts`**

```typescript
import { parseAmountToPence } from "../money/parseAmount";
import type { Direction } from "../tax/types";

export interface ColumnMapping {
  dateCol: number;
  amountCol: number;
  descriptionCol: number;
}

export interface MappedRow {
  date: Date;
  amountPence: number;
  direction: Direction;
  description: string;
}

function parseUkDate(s: string): Date {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dmy) return new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  throw new Error(`Unrecognised date: "${s}"`);
}

export function mapImportRow(row: string[], mapping: ColumnMapping): MappedRow {
  const date = parseUkDate((row[mapping.dateCol] ?? "").trim());
  const raw = (row[mapping.amountCol] ?? "").trim();
  const negative = raw.startsWith("-") || raw.startsWith("(");
  const magnitude = raw.replace(/[-()]/g, ""); // parseAmountToPence strips £, commas, spaces and rejects 0/non-numeric
  const amountPence = parseAmountToPence(magnitude);
  return {
    date,
    amountPence,
    direction: negative ? "out" : "in",
    description: (row[mapping.descriptionCol] ?? "").trim(),
  };
}

export function isDuplicate(
  candidate: { date: Date; amountPence: number; description: string },
  existing: { date: Date; amountPence: number; description: string | null }[],
): boolean {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return existing.some(
    (e) => day(e.date) === day(candidate.date) && e.amountPence === candidate.amountPence && (e.description ?? "") === candidate.description,
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/import/bankImport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: bank-import row mapper and dedup"
```

---

### Task 10: Bulk-create data function

**Files:**
- Modify: `src/lib/data/transactions.ts`
- Test: `src/lib/data/transactions.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/data/transactions.test.ts`:

```typescript
  it("bulk-creates imported transactions tagged as imported", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const { bulkCreateTransactions } = await import("./transactions");
    const count = await bulkCreateTransactions([
      { propertyId: property.id, categoryId, date: new Date("2025-06-01"), amountPence: 100, direction: "in", description: "a" },
      { propertyId: property.id, categoryId, date: new Date("2025-06-02"), amountPence: 200, direction: "out", description: "b" },
    ]);
    expect(count).toBe(2);
    const all = await listTransactions(property.id);
    expect(all.every((t) => t.source === "imported")).toBe(true);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/data/transactions.test.ts`
Expected: FAIL — `bulkCreateTransactions` not exported.

- [ ] **Step 3: Implement in `src/lib/data/transactions.ts`**

```typescript
export async function bulkCreateTransactions(rows: TransactionInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await prisma.transaction.createMany({
    data: rows.map((r) => ({ ...r, source: "imported" as const })),
  });
  return result.count;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/data/transactions.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite + commit**

Run: `npm test` (all green).

```bash
git add -A && git commit -m "feat: bulk-create imported transactions"
```

---

### Task 11: Import UI (upload → map → preview → confirm)

**Files:**
- Create: `src/app/(app)/import/page.tsx`, `src/app/(app)/import/actions.ts`
- Modify: `src/app/(app)/layout.tsx` (add Import nav link)

**Context:** A single page handles all steps via posted state. The CSV text and chosen mapping travel in the form (hidden fields), so no server-side upload storage is needed. Step is inferred from which fields are present.

- [ ] **Step 1: Create `src/app/(app)/import/actions.ts`**

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "../../../lib/auth/session";
import { getOrCreateDefaultProperty } from "../../../lib/data/property";
import { listTransactions, bulkCreateTransactions } from "../../../lib/data/transactions";
import { parseCsv } from "../../../lib/reports/csv";
import { mapImportRow, isDuplicate, type ColumnMapping } from "../../../lib/import/bankImport";

export interface PreviewRow { ok: boolean; date?: string; direction?: string; amountPence?: number; description?: string; error?: string; duplicate?: boolean; }

/** Parse + map + dedup a CSV against existing transactions. Pure-ish (reads existing txns). */
export async function buildPreview(csvText: string, mapping: ColumnMapping): Promise<PreviewRow[]> {
  const property = await getOrCreateDefaultProperty();
  const existing = await listTransactions(property.id);
  const { rows } = parseCsv(csvText);
  return rows.map((row) => {
    try {
      const m = mapImportRow(row, mapping);
      return {
        ok: true,
        date: m.date.toISOString().slice(0, 10),
        direction: m.direction,
        amountPence: m.amountPence,
        description: m.description,
        duplicate: isDuplicate(m, existing),
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
}

export async function confirmImportAction(formData: FormData) {
  await requireSession();
  const csvText = String(formData.get("csv") ?? "");
  const categoryId = String(formData.get("categoryId"));
  const mapping: ColumnMapping = {
    dateCol: Number(formData.get("dateCol")),
    amountCol: Number(formData.get("amountCol")),
    descriptionCol: Number(formData.get("descriptionCol")),
  };
  const property = await getOrCreateDefaultProperty();
  const existing = await listTransactions(property.id);
  const { rows } = parseCsv(csvText);
  const toCreate = [];
  for (const row of rows) {
    let m;
    try { m = mapImportRow(row, mapping); } catch { continue; } // skip unparseable
    if (isDuplicate(m, existing)) continue; // skip duplicates
    toCreate.push({ propertyId: property.id, categoryId, date: m.date, amountPence: m.amountPence, direction: m.direction, description: m.description });
  }
  await bulkCreateTransactions(toCreate);
  revalidatePath("/transactions");
  redirect("/transactions");
}
```

- [ ] **Step 2: Create `src/app/(app)/import/page.tsx`**

```tsx
import { listCategories } from "../../../lib/data/categories";
import { parseCsv } from "../../../lib/reports/csv";
import { formatGBP } from "../../../lib/tax/money";
import { buildPreview, confirmImportAction, type PreviewRow } from "./actions";

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const categories = await listCategories();

  // Step 1: no csv yet — show the paste box. (File reading is done client-side via a textarea paste for simplicity/no-upload-storage.)
  const csv = sp.csv;
  if (!csv) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">Import bank CSV</h1>
        <p className="text-sm text-gray-600">Open your bank&apos;s CSV export, copy all of it, and paste it below.</p>
        <form method="get" className="space-y-3">
          <textarea name="csv" rows={10} required className="w-full border p-2 font-mono text-xs" placeholder="date,amount,description&#10;01/06/2025,950.00,Rent" />
          <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Next: map columns</button>
        </form>
      </div>
    );
  }

  const { header } = parseCsv(csv);
  const colOptions = header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>);

  // Step 3: mapping chosen — show preview + confirm.
  if (sp.dateCol !== undefined && sp.amountCol !== undefined && sp.descriptionCol !== undefined && sp.categoryId) {
    const mapping = { dateCol: Number(sp.dateCol), amountCol: Number(sp.amountCol), descriptionCol: Number(sp.descriptionCol) };
    const preview: PreviewRow[] = await buildPreview(csv, mapping);
    const importable = preview.filter((r) => r.ok && !r.duplicate).length;
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Preview import</h1>
        <p className="text-sm text-gray-600">{importable} row(s) will be imported. Duplicates and unparseable rows are skipped.</p>
        <table className="w-full border text-sm">
          <thead><tr className="border-b bg-gray-50 text-left"><th className="px-2 py-1">Date</th><th className="px-2 py-1">Dir</th><th className="px-2 py-1 text-right">Amount</th><th className="px-2 py-1">Description</th><th className="px-2 py-1">Status</th></tr></thead>
          <tbody>
            {preview.map((r, i) => (
              <tr key={i} className="border-b">
                <td className="px-2 py-1">{r.date ?? ""}</td>
                <td className="px-2 py-1">{r.direction ?? ""}</td>
                <td className="px-2 py-1 text-right">{r.amountPence !== undefined ? formatGBP(r.amountPence) : ""}</td>
                <td className="px-2 py-1">{r.description ?? ""}</td>
                <td className="px-2 py-1">{!r.ok ? `error: ${r.error}` : r.duplicate ? "duplicate (skip)" : "import"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={confirmImportAction}>
          <input type="hidden" name="csv" value={csv} />
          <input type="hidden" name="dateCol" value={sp.dateCol} />
          <input type="hidden" name="amountCol" value={sp.amountCol} />
          <input type="hidden" name="descriptionCol" value={sp.descriptionCol} />
          <input type="hidden" name="categoryId" value={sp.categoryId} />
          <button type="submit" className="bg-green-700 px-3 py-1 text-white">Import {importable} transaction(s)</button>
        </form>
      </div>
    );
  }

  // Step 2: choose columns + category.
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Map columns</h1>
      <form method="get" className="space-y-3">
        <input type="hidden" name="csv" value={csv} />
        <label className="block">Date column <select name="dateCol" required className="border px-2 py-1">{colOptions}</select></label>
        <label className="block">Amount column <select name="amountCol" required className="border px-2 py-1">{colOptions}</select></label>
        <label className="block">Description column <select name="descriptionCol" required className="border px-2 py-1">{colOptions}</select></label>
        <label className="block">Category for imported rows <select name="categoryId" required className="border px-2 py-1">{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Next: preview</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Add an Import nav link**

In `src/app/(app)/layout.tsx`, add to the `NAV` array (after Transactions):

```typescript
  { href: "/import", label: "Import" },
```

- [ ] **Step 4: Verify build + manual**

Run: `npm run build` (success; `/import` route listed) and `npm test` (all green).
Manual: go to `/import`, paste a small CSV (e.g. `date,amount,description` then `01/06/2025,950.00,Test rent` and a line duplicating an existing transaction), map columns, pick a category, preview (confirm the duplicate is flagged "duplicate (skip)" and a bad row shows "error:"), click Import, confirm only the new rows appear on `/transactions` tagged from the import.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: bank CSV import flow (upload, map, preview, confirm)"
```

---

## Self-Review

**Spec coverage:**
- Scottish bands + generalised model → Task 1. ✓ Region picker → Task 2. ✓
- Inline editing (transactions, vendors) + fetchers → Tasks 3, 4, 5. ✓
- PDF via pdf-lib + shared BOX_LABELS → Tasks 6, 7. ✓
- Bank import: parseCsv → Task 8; mapImportRow + isDuplicate (DD/MM/YYYY + ISO, sign→direction) → Task 9; bulkCreateTransactions (source "imported") → Task 10; upload→map→preview→confirm UI with dedup flagging → Task 11. ✓
- Testing: pure (bands/incomeTax regression + Scotland, parseCsv, mapImportRow, isDuplicate), integration (fetchers, bulkCreate), flow (build + manual) → covered. ✓
- Deferred non-goals (debit/credit columns, other date formats, auto-categorisation, raw-file storage) respected. ✓

**Placeholder scan:** None. The Scottish band widths and SA105 labels carry explicit "verify against current HMRC figures" instructions (real checks, not placeholders).

**Type consistency:** New `TaxBands`/`TaxBand` shape used consistently in `bands.ts` + `incomeTax.ts` + `bands.test.ts`; `getBands` signature unchanged so `summary.ts`/`estimatePropertyTax` are unaffected. `ColumnMapping`/`MappedRow` shared by `bankImport.ts` and the import action. `TransactionInput` (existing) reused by `bulkCreateTransactions`. `updateTransaction`/`updateVendor` (existing, `Partial` inputs) used by the edit actions. `SA105_BOX_LABELS` shared by the SA105 page and PDF route. `parseAmountToPence` reused by `mapImportRow` and the transaction edit action.

---

## Notes for the implementer

- **Tax-engine regression is sacred:** Task 1 must keep every existing EWNI assertion in `incomeTax.test.ts` passing unchanged. If any fails, the bracket model or band widths are wrong — fix those, never the test expectations.
- **Next 16 async params:** the `[id]/edit` pages and any `searchParams` are Promises — `await` them.
- **Auth:** every new server action (`updateTransactionAction`, `updateVendorAction`, `confirmImportAction`) calls `requireSession()` first; the new routes/pages are already gated by `src/proxy.ts`.
- **Import UX is paste-based** (a textarea), not a file `<input type=file>`, to avoid server-side upload handling and keep the CSV text flowing through the form between steps. This is a deliberate v1 simplification; a file picker that reads the file client-side into the textarea can come later.
- **PDF `Buffer`:** `Buffer.from(bytes)` is fine in the Node route runtime; `pdf.save()` returns a `Uint8Array`.
