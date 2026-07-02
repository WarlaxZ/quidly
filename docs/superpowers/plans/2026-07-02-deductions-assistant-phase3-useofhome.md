# Deductions Assistant — Phase 3 (Use-of-home helper) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A guided "use of home for property admin" claim — pick a weekly/monthly amount, the app computes the year's total and creates/updates a single "Use of home" expense for the tax year (re-runnable, no duplicates) — upgrading the use-of-home checklist item's "Log it" to this helper.

**Architecture:** A pure `useOfHomeAnnualPence(amountPence, basis)` computes the annual total. A server action find-or-creates one "Use of home" transaction per (tax year, property). A `UseOfHomeForm` on `/deductions` replaces the generic quick-add for the use-of-home item.

**Tech Stack:** Next.js 16, Prisma v7 + SQLite, Vitest, Tailwind v4.

Builds on Phases 1 & 2 (on branch `feat/deductions-mileage`): the `/deductions` page already branches `item.action === "mileage"` → `MileageForm`; this phase adds a `"use-of-home"` branch. The "Use of home" category (SA105 box 29) is already seeded. No schema change.

## Conventions
- (npm/npx exit 127 → `/home/ash/.nvm/versions/node/v25.6.1/bin/`). `dev.db` is REAL data — no resets.
- Server actions mirror `logMileageAction` in `src/app/(app)/deductions/actions.ts` (auth, `back(): never`, taxYear format guard, personal-property validation, category resolved from the catalog item).
- Money is integer pence; `parseAmountToPence`, `formatGBP`.

## File Structure
```
src/lib/tax/useOfHome.ts            # useOfHomeAnnualPence (pure)   [tested]
src/lib/tax/useOfHome.test.ts
src/lib/data/useOfHome.ts           # server-only: getUseOfHomeClaim (existing claim for prefill/upsert)
src/app/(app)/deductions/actions.ts # + logUseOfHomeAction
src/app/(app)/deductions/UseOfHomeForm.tsx  # client: guided claim form
src/app/(app)/deductions/page.tsx   # branch: item.action === "use-of-home" → UseOfHomeForm
```

---

## Task U1: `useOfHome.ts` — pure annual calc (TDD)

**Files:** Create `src/lib/tax/useOfHome.ts`, `src/lib/tax/useOfHome.test.ts`

- [ ] **Step 1: Failing test** — `src/lib/tax/useOfHome.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { useOfHomeAnnualPence } from "./useOfHome";

describe("useOfHomeAnnualPence", () => {
  it("multiplies a monthly amount by 12", () => {
    expect(useOfHomeAnnualPence(2_600, "monthly")).toBe(31_200); // £26/mo → £312/yr
  });
  it("multiplies a weekly amount by 52", () => {
    expect(useOfHomeAnnualPence(500, "weekly")).toBe(26_000); // £5/wk → £260/yr
  });
  it("returns 0 for a zero amount", () => {
    expect(useOfHomeAnnualPence(0, "monthly")).toBe(0);
  });
});
```

- [ ] **Step 2:** `npm test -- useOfHome` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/tax/useOfHome.ts`:
```ts
export type UseOfHomeBasis = "weekly" | "monthly";

/** Annualise a use-of-home admin estimate. Integer pence in → integer pence out. */
export function useOfHomeAnnualPence(amountPence: number, basis: UseOfHomeBasis): number {
  const a = Math.max(0, Math.round(amountPence));
  return basis === "weekly" ? a * 52 : a * 12;
}
```

- [ ] **Step 4:** `npm test -- useOfHome` → PASS (3).
- [ ] **Step 5: Commit**
```bash
git add src/lib/tax/useOfHome.ts src/lib/tax/useOfHome.test.ts
git commit -m "feat(use-of-home): pure useOfHomeAnnualPence (weekly×52 / monthly×12)"
```

---

## Task U2: data helper + action + form + page branch

**Files:** Create `src/lib/data/useOfHome.ts`, `src/app/(app)/deductions/UseOfHomeForm.tsx`; modify `src/app/(app)/deductions/actions.ts`, `src/app/(app)/deductions/page.tsx`

- [ ] **Step 1: Data helper** — `src/lib/data/useOfHome.ts`:
```ts
import "server-only";
import { prisma } from "../db";
import { taxYearRange } from "../tax/taxYear";

const USE_OF_HOME_CATEGORY = "Use of home";

/** The existing use-of-home claim for a (tax year, property), if any — for prefill + upsert. */
export async function getUseOfHomeClaim(taxYear: string, propertyId: string): Promise<{ id: string; amountPence: number } | null> {
  const { start, end } = taxYearRange(taxYear);
  const txn = await prisma.transaction.findFirst({
    where: { propertyId, date: { gte: start, lt: end }, category: { name: USE_OF_HOME_CATEGORY } },
    select: { id: true, amountPence: true },
  });
  return txn;
}
```

- [ ] **Step 2: Action** — append `logUseOfHomeAction` to `src/app/(app)/deductions/actions.ts`. Add imports:
```ts
import { useOfHomeAnnualPence, type UseOfHomeBasis } from "../../../lib/tax/useOfHome";
import { taxYearRange } from "../../../lib/tax/taxYear";
import { getUseOfHomeClaim } from "../../../lib/data/useOfHome";
```
Append:
```ts
export async function logUseOfHomeAction(formData: FormData) {
  await requireSession();
  const taxYear = String(formData.get("taxYear") ?? "");
  const back = (msg: string, ok = false): never =>
    redirect(`/deductions?ty=${encodeURIComponent(taxYear)}&${ok ? "ok" : "error"}=${encodeURIComponent(msg)}`);
  if (!/^\d{4}-\d{2}$/.test(taxYear)) return back("Invalid tax year.");

  const propertyId = String(formData.get("propertyId") ?? "");
  const property = propertyId
    ? await prisma.property.findFirst({ where: { id: propertyId, ownershipType: "personal" } })
    : null;
  if (!property) return back("Choose a valid property.");

  const basis = (String(formData.get("basis") ?? "monthly") === "weekly" ? "weekly" : "monthly") as UseOfHomeBasis;
  let amountPence: number;
  try {
    amountPence = parseAmountToPence(String(formData.get("amount") ?? ""));
  } catch (e) {
    return back((e as Error).message);
  }
  const annualPence = useOfHomeAnnualPence(amountPence, basis);
  if (annualPence <= 0) return back("Enter an amount greater than zero.");

  const item = DEDUCTION_CATALOG.find((i) => i.key === "use-of-home");
  if (!item) return back("Use-of-home item missing from catalog.");
  const category = await prisma.category.findUnique({ where: { name: item.categoryName } });
  if (!category) return back(`Category "${item.categoryName}" not found — run the seed.`);

  const { end } = taxYearRange(taxYear);
  const claimDate = new Date(end.getTime() - 24 * 60 * 60 * 1000); // 5 April — last day of the tax year
  const description = `Use of home — £${(amountPence / 100).toFixed(2)}/${basis === "weekly" ? "week" : "month"}`;

  const existing = await getUseOfHomeClaim(taxYear, property.id);
  if (existing) {
    await prisma.transaction.update({ where: { id: existing.id }, data: { amountPence: annualPence, description, date: claimDate } });
  } else {
    await createTransaction({
      propertyId: property.id,
      categoryId: category.id,
      date: claimDate,
      amountPence: annualPence,
      direction: "out",
      vendorId: null,
      description,
    });
  }
  revalidatePath("/deductions");
  revalidatePath("/transactions");
  back(`Use-of-home claim set to £${(annualPence / 100).toFixed(2)} for ${taxYear}`, true);
}
```

- [ ] **Step 3: Form** — `src/app/(app)/deductions/UseOfHomeForm.tsx`:
```tsx
"use client";
import { useState } from "react";
import { MoneyInput } from "../_ui/MoneyInput";
import { logUseOfHomeAction } from "./actions";

interface Props {
  taxYear: string;
  propertyId: string;
  propertyName: string;
  defaultMonthlyPence: number; // existing claim / 12, or the ~£26 default
}

export function UseOfHomeForm({ taxYear, propertyId, propertyName, defaultMonthlyPence }: Props) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        Set a claim
      </button>
    );
  }
  const defaultAmount = (defaultMonthlyPence / 100).toFixed(2);
  return (
    <form action={logUseOfHomeAction} className="mt-3 w-full space-y-3 border-t border-line pt-3">
      <input type="hidden" name="taxYear" value={taxYear} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <p className="text-sm text-muted">
        A reasonable proportion of your home running costs for the time you spend administering the
        lettings. Most single-property landlords claim a modest flat amount — keep it reasonable and
        documented. This is separate from any employed working-from-home.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="label">Amount</span>
          <MoneyInput name="amount" required defaultValue={defaultAmount} />
        </label>
        <label className="text-sm">
          <span className="label">Per</span>
          <select className="field" name="basis" defaultValue="monthly">
            <option value="monthly">month</option>
            <option value="weekly">week</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-faint">Sets a single Use-of-home expense for {taxYear} on {propertyName} (re-running updates it).</p>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">Save claim</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
```
NOTE: if `MoneyInput` does not accept `defaultValue`, pass the default via its real prop (check `_ui/MoneyInput.tsx`); it forwards `...rest` to the `<input>`, so `defaultValue` should work.

- [ ] **Step 4: Page branch** — in `src/app/(app)/deductions/page.tsx`:
  - import: `import { UseOfHomeForm } from "./UseOfHomeForm";` and `import { getUseOfHomeClaim } from "../../../lib/data/useOfHome";`
  - after `activeRoundTrip`, compute the use-of-home prefill (default ~£26/mo = 2600 pence; existing claim → annual/12):
    ```ts
    const existingUoH = activePropertyId ? await getUseOfHomeClaim(taxYear, activePropertyId) : null;
    const useOfHomeDefaultMonthlyPence = existingUoH ? Math.round(existingUoH.amountPence / 12) : 2_600;
    ```
  - extend the Consider-map branch to a three-way:
    ```tsx
    {item.action === "mileage" ? (
      <MileageForm taxYear={taxYear} propertyId={activePropertyId} propertyName={activePropertyName} roundTripMiles={activeRoundTrip} />
    ) : item.action === "use-of-home" ? (
      <UseOfHomeForm taxYear={taxYear} propertyId={activePropertyId} propertyName={activePropertyName} defaultMonthlyPence={useOfHomeDefaultMonthlyPence} />
    ) : (
      <LogItForm taxYear={taxYear} itemKey={item.key} title={item.title} activePropertyId={activePropertyId} activePropertyName={activePropertyName} />
    )}
    ```

- [ ] **Step 5: Verify** — `npx prisma generate && npx tsc --noEmit` → PASS; `npm test` → PASS (report count).

- [ ] **Step 6: Commit**
```bash
git add src/lib/data/useOfHome.ts "src/app/(app)/deductions/actions.ts" "src/app/(app)/deductions/UseOfHomeForm.tsx" "src/app/(app)/deductions/page.tsx"
git commit -m "feat(use-of-home): guided annual use-of-home claim on /deductions (find-or-create per year)"
```

---

## Task U3: Verification & live-run

- [ ] **Step 1:** `npx prisma generate && npm test` → PASS (incl. new `useOfHome` suite); `npx tsc --noEmit` → PASS.
- [ ] **Step 2: Live-run** — dev server (pkill -9 -f next first), log in, `/deductions?ty=2025-26`: the **Use of home for admin** item shows a **"Set a claim"** button. Open it → explainer + amount (default £26) + per-month/week. Save £26/month → success banner "Use-of-home claim set to £312.00 for 2025-26"; item flips to **Covered**; a single "Use of home" transaction (£312) exists in `/transactions`. Re-open and save £30/month → confirm the SAME transaction updates to £360 (no duplicate). Then **delete the test transaction from dev.db** so the user's real numbers aren't polluted (it's real data): `DATABASE_URL="file:./dev.db" npx tsx -e "...deleteMany where category name 'Use of home'..."`; confirm 309 transactions remain. Stop the dev server. Do not commit screenshots with the real property name.
- [ ] **Step 3:** Report results.

---

## Done
After U3, both Phases 2 & 3 are on `feat/deductions-mileage` → run `superpowers:finishing-a-development-branch` and open ONE PR covering mileage + use-of-home.
