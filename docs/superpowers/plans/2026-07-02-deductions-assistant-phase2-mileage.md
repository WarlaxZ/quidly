# Deductions Assistant — Phase 2 (Mileage quick-log) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a landlord log a trip to the property in one tap — a saved round-trip distance + the HMRC simplified mileage rate (45p/mile for the first 10,000 miles, 25p after) — creating a "Travel & mileage" expense, and upgrading the mileage checklist item's "Log it" to this dedicated flow.

**Architecture:** A pure, unit-tested `mileageClaimPence` (per-year rate config) computes the claim, applying the 10k-mile band using miles already logged that tax year. A `Transaction.miles` column records each trip's miles (a trip is a normal transaction in the "Travel & mileage" category); `Property.roundTripMiles` stores the saved distance. A `MileageForm` on `/deductions` replaces the generic quick-add for the mileage item.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma v7 + SQLite, Vitest, Tailwind v4 ("Quiet Ledger").

Design spec: `docs/superpowers/specs/2026-07-02-deductions-assistant-design.md` (Phase 2 section). Builds on Phase 1 (merged): the `/deductions` page, `DEDUCTION_CATALOG` (the `mileage` item has `action: "mileage"`, `categoryName: "Travel & mileage"`), and the "Travel & mileage" seeded category (SA105 box 29) already exist.

---

## Conventions (read before starting)

- `dev.db` holds the user's REAL data — migrations are ADDITIVE only; never reset/wipe. Prisma v7: hand-authored SQL migrations applied with `prisma migrate deploy` (NEVER `migrate dev`), then `prisma generate`.
- If `npm`/`npx` exits 127 (rtk shell-hook quirk), use absolute paths under `/home/ash/.nvm/versions/node/v25.6.1/bin/`.
- Server actions: `"use server"`, `await requireSession()` first, then `redirect(?ok=/?error=)`. Mirror the existing `src/app/(app)/deductions/actions.ts` (esp. the `back()` helper + `return back(...)` for narrowing).
- Money is integer pence; `formatGBP` in `src/lib/tax/money`. Per-year rate config pattern: see `src/lib/tax/nic.ts` (a `Record<year, Rates>` + a LATEST fallback).
- `createTransaction(input: TransactionInput)` in `src/lib/data/transactions.ts`.

## File Structure

```
src/lib/tax/mileage.ts             # MileageRates config + mileageClaimPence (pure)     [tested]
src/lib/tax/mileage.test.ts
src/lib/data/mileage.ts            # server-only: cumulativeMilesForTaxYear
prisma/schema.prisma + migration   # Property.roundTripMiles Int?, Transaction.miles Int?
src/lib/data/transactions.ts       # TransactionInput gains `miles?: number | null`
src/lib/data/deductions.ts         # listPersonalProperties also selects roundTripMiles
src/app/(app)/deductions/actions.ts   # + logMileageAction
src/app/(app)/deductions/MileageForm.tsx  # client: one-tap trip form (replaces LogItForm for the mileage item)
src/app/(app)/deductions/page.tsx  # branch: item.action === "mileage" → MileageForm
```

---

## Task M1: Schema — `Property.roundTripMiles`, `Transaction.miles`, and `TransactionInput.miles`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260702150000_mileage/migration.sql`
- Modify: `src/lib/data/transactions.ts`

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, add to `model Property` (after `acquisitionDate`):
```prisma
  roundTripMiles  Int?
```
Add to `model Transaction` (after `description`):
```prisma
  miles        Int?
```

- [ ] **Step 2: Write the migration**

Create `prisma/migrations/20260702150000_mileage/migration.sql`:
```sql
ALTER TABLE "Property" ADD COLUMN "roundTripMiles" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "miles" INTEGER;
```

- [ ] **Step 3: Apply + regenerate**

Run: `DATABASE_URL="file:./dev.db" npx prisma migrate deploy && npx prisma generate`
Expected: `20260702150000_mileage` applied; client regenerated.

- [ ] **Step 4: Extend `TransactionInput`**

In `src/lib/data/transactions.ts`, add to the `TransactionInput` interface (after `description`):
```ts
  miles?: number | null;
```
(`createTransaction` spreads `input` into `prisma.transaction.create({ data: input })`, so `miles` now flows through.)

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` → PASS. And confirm the columns + data intact:
`DATABASE_URL="file:./dev.db" npx tsx -e "import Database from 'better-sqlite3'; const d=new Database('dev.db'); console.log(d.prepare('PRAGMA table_info(\"Transaction\")').all().map(c=>c.name).includes('miles'), d.prepare('PRAGMA table_info(\"Property\")').all().map(c=>c.name).includes('roundTripMiles'), d.prepare('SELECT COUNT(*) n FROM \"Transaction\"').get());"`
Expected: `true true { n: 309 }` (data intact).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260702150000_mileage/migration.sql src/lib/data/transactions.ts
git commit -m "feat(mileage): add Property.roundTripMiles + Transaction.miles (+ TransactionInput.miles)"
```

---

## Task M2: `mileage.ts` — pure rate config + `mileageClaimPence` (TDD)

**Files:**
- Create: `src/lib/tax/mileage.ts`
- Test: `src/lib/tax/mileage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/tax/mileage.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { mileageClaimPence, mileageRatesFor } from "./mileage";

describe("mileageClaimPence", () => {
  it("charges 45p/mile below the 10,000-mile threshold", () => {
    expect(mileageClaimPence(30, 0, "2025-26")).toBe(1350); // 30 * 45p = £13.50
  });
  it("splits a trip that straddles the threshold", () => {
    // 9,990 already claimed; a 20-mile trip → 10 @ 45p + 10 @ 25p = 450 + 250
    expect(mileageClaimPence(20, 9_990, "2025-26")).toBe(700);
  });
  it("charges 25p/mile once the threshold is reached", () => {
    expect(mileageClaimPence(10, 10_000, "2025-26")).toBe(250);
    expect(mileageClaimPence(5, 12_000, "2025-26")).toBe(125);
  });
  it("returns 0 for a zero/negative trip", () => {
    expect(mileageClaimPence(0, 0, "2025-26")).toBe(0);
    expect(mileageClaimPence(-5, 0, "2025-26")).toBe(0);
  });
  it("falls back to the latest rates for an unconfigured year", () => {
    expect(mileageRatesFor("2099-00")).toEqual(mileageRatesFor("2027-28"));
    expect(mileageClaimPence(10, 0, "2099-00")).toBe(450);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- mileage`
Expected: FAIL ("Failed to resolve import './mileage'").

- [ ] **Step 3: Implement `mileage.ts`**

Create `src/lib/tax/mileage.ts`:
```ts
/** HMRC simplified motoring rate for landlords: 45p/mile for the first 10,000 business
 *  miles in a tax year, 25p thereafter. Per-year config — VERIFY against HMRC each April. */
export interface MileageRates {
  firstRatePence: number; // pence per mile up to the threshold
  afterRatePence: number; // pence per mile beyond the threshold
  thresholdMiles: number;
}

const MILEAGE_2025_26: MileageRates = { firstRatePence: 45, afterRatePence: 25, thresholdMiles: 10_000 };
const MILEAGE_2026_27: MileageRates = { firstRatePence: 45, afterRatePence: 25, thresholdMiles: 10_000 };
const MILEAGE_2027_28: MileageRates = { firstRatePence: 45, afterRatePence: 25, thresholdMiles: 10_000 };

const MILEAGE_RATES: Record<string, MileageRates> = {
  "2025-26": MILEAGE_2025_26,
  "2026-27": MILEAGE_2026_27,
  "2027-28": MILEAGE_2027_28,
};
const LATEST_MILEAGE: MileageRates = MILEAGE_2027_28;

export function mileageRatesFor(taxYear: string): MileageRates {
  return MILEAGE_RATES[taxYear] ?? LATEST_MILEAGE;
}

/**
 * Claimable pence for a trip of `milesThisTrip`, given `cumulativeMilesBefore` business
 * miles already claimed this tax year (applies the 10,000-mile band split). Integer pence,
 * no floating point (miles and pence-per-mile are integers).
 */
export function mileageClaimPence(milesThisTrip: number, cumulativeMilesBefore: number, taxYear: string): number {
  const r = mileageRatesFor(taxYear);
  const miles = Math.max(0, Math.round(milesThisTrip));
  const before = Math.max(0, Math.round(cumulativeMilesBefore));
  const firstRemaining = Math.max(0, r.thresholdMiles - before);
  const atFirst = Math.min(miles, firstRemaining);
  const atAfter = miles - atFirst;
  return atFirst * r.firstRatePence + atAfter * r.afterRatePence;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- mileage` → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/mileage.ts src/lib/tax/mileage.test.ts
git commit -m "feat(mileage): pure mileage rate config + mileageClaimPence (45p/25p, 10k band)"
```

---

## Task M3: Data layer — cumulative miles + expose `roundTripMiles`

**Files:**
- Create: `src/lib/data/mileage.ts`
- Modify: `src/lib/data/deductions.ts`

- [ ] **Step 1: Create the mileage data helper**

Create `src/lib/data/mileage.ts`:
```ts
import "server-only";
import { prisma } from "../db";
import { taxYearRange } from "../tax/taxYear";

const TRAVEL_CATEGORY = "Travel & mileage";

/** Business miles already logged (Travel & mileage transactions) across personally-owned
 *  properties in the tax year — drives the 10,000-mile rate band. */
export async function cumulativeMilesForTaxYear(taxYear: string): Promise<number> {
  const { start, end } = taxYearRange(taxYear);
  const rows = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lt: end },
      property: { ownershipType: "personal" },
      category: { name: TRAVEL_CATEGORY },
      miles: { not: null },
    },
    select: { miles: true },
  });
  return rows.reduce((sum, r) => sum + (r.miles ?? 0), 0);
}
```

- [ ] **Step 2: Add `roundTripMiles` to `listPersonalProperties`**

In `src/lib/data/deductions.ts`, change the `listPersonalProperties` select from `{ id: true, name: true }` to:
```ts
    select: { id: true, name: true, roundTripMiles: true },
```

- [ ] **Step 3: Verify**

Run: `npx prisma generate && npx tsc --noEmit` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/mileage.ts src/lib/data/deductions.ts
git commit -m "feat(mileage): cumulativeMilesForTaxYear + expose roundTripMiles on personal properties"
```

---

## Task M4: `logMileageAction`, `MileageForm`, and page wiring

**Files:**
- Modify: `src/app/(app)/deductions/actions.ts`
- Create: `src/app/(app)/deductions/MileageForm.tsx`
- Modify: `src/app/(app)/deductions/page.tsx`

- [ ] **Step 1: Add `logMileageAction`**

In `src/app/(app)/deductions/actions.ts`, add these imports at the top (alongside the existing ones):
```ts
import { mileageClaimPence } from "../../../lib/tax/mileage";
import { cumulativeMilesForTaxYear } from "../../../lib/data/mileage";
```
Append this action:
```ts
export async function logMileageAction(formData: FormData) {
  await requireSession();
  const taxYear = String(formData.get("taxYear") ?? "");
  const back = (msg: string, ok = false): never =>
    redirect(`/deductions?ty=${encodeURIComponent(taxYear)}&${ok ? "ok" : "error"}=${encodeURIComponent(msg)}`);

  const propertyId = String(formData.get("propertyId") ?? "");
  const property = propertyId
    ? await prisma.property.findFirst({ where: { id: propertyId, ownershipType: "personal" } })
    : null;
  if (!property) return back("Choose a valid property.");

  const rawDate = String(formData.get("date") ?? "");
  const date = new Date(rawDate);
  if (!rawDate || Number.isNaN(date.getTime())) return back("Enter a valid date.");

  const miles = Math.round(Number(formData.get("miles")));
  if (!Number.isFinite(miles) || miles <= 0) return back("Enter the miles for the trip.");

  const purpose = String(formData.get("purpose") ?? "").trim() || "Trip to property";

  const category = await prisma.category.findUnique({ where: { name: "Travel & mileage" } });
  if (!category) return back('Category "Travel & mileage" not found — run the seed.');

  const before = await cumulativeMilesForTaxYear(taxYear);
  const amountPence = mileageClaimPence(miles, before, taxYear);

  await createTransaction({
    propertyId: property.id,
    categoryId: category.id,
    date,
    amountPence,
    direction: "out",
    description: `${purpose} — ${miles} miles`,
    miles,
  });

  if (formData.get("remember") === "on") {
    await prisma.property.update({ where: { id: property.id }, data: { roundTripMiles: miles } });
  }

  revalidatePath("/deductions");
  revalidatePath("/transactions");
  back(`Logged ${miles} miles (£${(amountPence / 100).toFixed(2)})`, true);
}
```

- [ ] **Step 2: Create `MileageForm.tsx`**

Create `src/app/(app)/deductions/MileageForm.tsx`:
```tsx
"use client";
import { useState } from "react";
import { logMileageAction } from "./actions";

interface Props {
  taxYear: string;
  propertyId: string;
  propertyName: string;
  roundTripMiles: number | null;
}

const PURPOSES = ["Inspection", "Viewing", "Meeting a tradesperson", "Repair", "Other"];

export function MileageForm({ taxYear, propertyId, propertyName, roundTripMiles }: Props) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        Log a trip
      </button>
    );
  }
  return (
    <form action={logMileageAction} className="mt-3 w-full space-y-3 border-t border-line pt-3">
      <input type="hidden" name="taxYear" value={taxYear} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="label">Date</span>
          <input className="field" type="date" name="date" required />
        </label>
        <label className="text-sm">
          <span className="label">Purpose</span>
          <select className="field" name="purpose" defaultValue="Inspection">
            {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="label">Round-trip miles</span>
        <input className="field" type="number" name="miles" min="1" step="1" required defaultValue={roundTripMiles ?? undefined} placeholder="e.g. 24" />
      </label>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="remember" defaultChecked={roundTripMiles == null} />
        Remember this as the round trip for {propertyName}
      </label>
      <p className="text-xs text-faint">45p per mile for the first 10,000 miles this tax year, then 25p — worked out for you.</p>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">Log trip</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Wire the page to branch on the mileage item**

In `src/app/(app)/deductions/page.tsx`:
- add import: `import { MileageForm } from "./MileageForm";`
- `listPersonalProperties()` now returns `roundTripMiles`; compute the active property's round trip:
  ```ts
  const activeRoundTrip = properties.find((p) => p.id === activePropertyId)?.roundTripMiles ?? null;
  ```
  (add this right after the `activePropertyName` line.)
- In the Consider `.map`, replace the single `<LogItForm ... />` line with a branch:
  ```tsx
  {item.action === "mileage" ? (
    <MileageForm taxYear={taxYear} propertyId={activePropertyId} propertyName={activePropertyName} roundTripMiles={activeRoundTrip} />
  ) : (
    <LogItForm taxYear={taxYear} itemKey={item.key} title={item.title} activePropertyId={activePropertyId} activePropertyName={activePropertyName} />
  )}
  ```
(The `use-of-home` item keeps the generic `LogItForm` until Phase 3.)

- [ ] **Step 4: Verify**

Run: `npx prisma generate && npx tsc --noEmit` → PASS. Then `npm test` (full suite) → PASS; report count.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/deductions/actions.ts" "src/app/(app)/deductions/MileageForm.tsx" "src/app/(app)/deductions/page.tsx"
git commit -m "feat(mileage): one-tap trip logging on /deductions (45p/25p, saved round trip)"
```

---

## Task M5: Verification & live-run

**Files:** none.

- [ ] **Step 1: Full suite** — `npx prisma generate && npm test` → PASS (prior + the new `mileage` suite). Report count.
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → PASS.
- [ ] **Step 3: Live-run** — start the dev server (`pkill -9 -f next` first if one is running; then `DATABASE_URL="file:./dev.db" npm run dev`), log in, go to `/deductions?ty=2025-26`:
  - The **Mileage to the property** item shows a **"Log a trip"** button (not the generic "Log it").
  - Clicking it reveals the date + purpose + round-trip-miles form. Enter e.g. 24 miles, submit.
  - Confirm the success banner shows the computed claim (24 × 45p = £10.80), the item flips to **Covered**, and a "Travel & mileage" transaction now exists (check `/transactions`). Re-open the form and confirm the miles field pre-fills 24 (round trip remembered).
  - Curl smoke first to confirm no 500: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/deductions` (expect 307 gated).
  - Stop the dev server (`pkill -9 -f next`) when done. Do NOT commit any screenshot containing the real property name/address.
- [ ] **Step 4:** (No commit) — report results, then run `superpowers:finishing-a-development-branch`.

---

## Done

Phase 3 (use-of-home guided annual claim) is a separate plan; it upgrades the `use-of-home` item's "Log it" similarly.
