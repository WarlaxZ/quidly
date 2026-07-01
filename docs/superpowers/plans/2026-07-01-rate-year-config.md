# Rate-Year Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the app presenting tax years it has no rates for — introduce a single source of truth for configured tax years, default tools to the latest configured year, restrict pickers to configured years, and show an honest notice when an unconfigured year is viewed.

**Architecture:** A tiny configured-years module in `taxYear.ts`; personal tools + the SA105 PDF route default/pick from it and show a `Banner` for unconfigured years; `getCompanyAccounts` derives and reports the CT year it used. No rate maths changes — the full suite stays green.

**Tech Stack:** TypeScript, Vitest, Next.js 16 (server components + GET forms), the existing design-system primitives (`Banner`).

---

## Reference

- `src/lib/tax/taxYear.ts` currently exports `getTaxYear(date)` and `taxYearRange(taxYear)` — leave both unchanged; they classify transaction dates (still correct, and used to derive the company CT year).
- The per-engine `LATEST_YEAR`/`LATEST_CT_YEAR = "2025-26"` fallbacks stay as defence-in-depth.
- `Banner` primitive: `import { Banner } from "../_ui/Banner"` (adjust depth per file) — `variant="info"` renders a neutral notice.
- Presentation/defaults only; every existing test must still pass unchanged.

---

## Task 1: Configured-tax-year source of truth

**Files:** Modify `src/lib/tax/taxYear.ts`; modify `src/lib/tax/taxYear.test.ts`.

- [ ] **Step 1: Append the helpers to `src/lib/tax/taxYear.ts`** (keep the existing `getTaxYear`/`taxYearRange`):
```ts
/** Tax years for which every rate engine (bands, corporation tax, dividend, NIC) has real config.
 *  Update this list — and each engine's per-year config — when a new year's figures are confirmed. */
export const CONFIGURED_TAX_YEARS = ["2025-26"] as const;

export function latestConfiguredTaxYear(): string {
  return CONFIGURED_TAX_YEARS[CONFIGURED_TAX_YEARS.length - 1];
}

export function isConfiguredTaxYear(taxYear: string): boolean {
  return (CONFIGURED_TAX_YEARS as readonly string[]).includes(taxYear);
}

/** Year values for pickers, newest first. */
export function taxYearOptions(): string[] {
  return [...CONFIGURED_TAX_YEARS].reverse();
}
```

- [ ] **Step 2: Add tests to `src/lib/tax/taxYear.test.ts`** — update the import line to `import { getTaxYear, taxYearRange, latestConfiguredTaxYear, isConfiguredTaxYear, taxYearOptions } from "./taxYear";` and append this describe block at the end of the file:
```ts
describe("configured tax years", () => {
  it("latestConfiguredTaxYear is the most recent configured year", () => {
    expect(latestConfiguredTaxYear()).toBe("2025-26");
  });
  it("isConfiguredTaxYear distinguishes configured from not", () => {
    expect(isConfiguredTaxYear("2025-26")).toBe(true);
    expect(isConfiguredTaxYear("2026-27")).toBe(false);
  });
  it("taxYearOptions lists the configured years (newest first)", () => {
    expect(taxYearOptions()).toEqual(["2025-26"]);
  });
});
```

- [ ] **Step 3: Run + verify.** `cd /home/ash/projects/akaunting-ng && npx vitest run src/lib/tax/taxYear.test.ts` → all pass. `npx tsc --noEmit 2>&1 | grep -c "error TS"` → 0.

- [ ] **Step 4: Commit.** `git add src/lib/tax/taxYear.ts src/lib/tax/taxYear.test.ts && git commit -m "feat: single source of truth for configured tax years"`

---

## Task 2: Company accounts reports its CT year

**Files:** Modify `src/lib/data/companyAccounts.ts`; modify `src/lib/data/companyAccounts.test.ts`; modify `src/app/(app)/companies/[id]/accounts/page.tsx`.

- [ ] **Step 1: Update `getCompanyAccounts` in `src/lib/data/companyAccounts.ts`.**
Add to the imports: `import { getTaxYear, isConfiguredTaxYear } from "../tax/taxYear";`. Add two fields to the `CompanyAccounts` interface (after `effectiveRate`):
```ts
  ctYear: string;
  ctYearConfigured: boolean;
```
In the function body, replace `const ct = corporationTax(profitPence);` with:
```ts
  // The CT financial year for this period (6-Apr vs 1-Apr boundary is immaterial for rate selection).
  const ctYear = getTaxYear(period.end);
  const ct = corporationTax(profitPence, ctYear);
```
and add these two fields to the returned object (after `effectiveRate: ct.effectiveRate,`):
```ts
    ctYear,
    ctYearConfigured: isConfiguredTaxYear(ctYear),
```
(`corporationTax` still falls back to 2025-26 rates for an unconfigured `ctYear`, so all existing figures are unchanged.)

- [ ] **Step 2: Add a test to `src/lib/data/companyAccounts.test.ts`.**
Add (inside the existing describe block, matching the file's existing setup helpers for creating a company + a company-owned property + a rent transaction — mirror the patterns already in that test file):
```ts
  it("reports the CT year used and whether it is configured", async () => {
    const co = await createCompany({ name: "CT", accountingYearEndDay: 31, accountingYearEndMonth: 12 });
    const prop = await createProperty({ name: "P", ownershipType: "company", companyId: co.id });
    const rent = (await prisma.category.findFirstOrThrow({ where: { name: "Rent received" } })).id;
    await createTransaction({ propertyId: prop.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 10_000_00, direction: "in" });
    await createTransaction({ propertyId: prop.id, categoryId: rent, date: new Date("2026-06-01"), amountPence: 10_000_00, direction: "in" });

    const in2025 = await getCompanyAccounts(co.id, 2025);
    expect(in2025!.ctYear).toBe("2025-26");
    expect(in2025!.ctYearConfigured).toBe(true);

    const in2026 = await getCompanyAccounts(co.id, 2026);
    expect(in2026!.ctYear).toBe("2026-27");
    expect(in2026!.ctYearConfigured).toBe(false);
    // CT figure is unchanged (falls back to 2025-26 rates): £10,000 × 19% = £1,900
    expect(in2026!.corporationTaxPence).toBe(1_900_00);
  });
```
Ensure the imports at the top of the test file include `createProperty` (from `./property`), `createTransaction` (from `./transactions`), and `prisma` (from `../db`) — add any that are missing, matching how the sibling `companyReserves.test.ts` imports them.

- [ ] **Step 3: Show the notice on the accounts page.**
In `src/app/(app)/companies/[id]/accounts/page.tsx`, import the Banner (`import { Banner } from "../../../_ui/Banner";` — verify the relative depth resolves to `src/app/(app)/_ui/Banner`) and `latestConfiguredTaxYear` (`import { latestConfiguredTaxYear } from "../../../../../lib/tax/taxYear";` — match the depth the file already uses for `lib/...` imports). Directly after the header block (before the P&L table), add:
```tsx
      {!accounts.ctYearConfigured && (
        <Banner variant="info">Corporation tax uses {latestConfiguredTaxYear()} rates — the rates for this period ({accounts.ctYear}) aren&apos;t configured yet.</Banner>
      )}
```

- [ ] **Step 4: Verify.** `npx vitest run src/lib/data/companyAccounts.test.ts` → pass; `npm test` → full suite green (existing companyAccounts/companyReserves numbers unchanged); `npx tsc --noEmit 2>&1 | grep -c "error TS"` → 0.

- [ ] **Step 5: Commit.** `git add src/lib/data/companyAccounts.ts src/lib/data/companyAccounts.test.ts "src/app/(app)/companies/[id]/accounts/page.tsx" && git commit -m "feat: company accounts report + flag the CT rate-year"`

---

## Task 3: Personal tools default to and offer only configured years

**Files:** Modify `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/sa105/page.tsx`, `src/app/(app)/planner/page.tsx`, `src/app/(app)/extraction/page.tsx`, `src/app/(app)/export/sa105.pdf/route.ts`.

Read each file first and apply this recipe (presentation/default only — do not touch the tax computations, field names, or routes):

**(a) Default year.** Wherever the page resolves its tax year, replace the fallback `getTaxYear(new Date())` with `latestConfiguredTaxYear()`. Concretely:
- `dashboard/page.tsx` line ~13: `const taxYear = ty ?? getTaxYear(new Date());` → `const taxYear = ty ?? latestConfiguredTaxYear();`
- `sa105/page.tsx`: `const taxYear = ty ?? getTaxYear(new Date());` → `... ?? latestConfiguredTaxYear();`
- `planner/page.tsx`: `const taxYear = sp.ty && /^\d{4}-\d{2}$/.test(sp.ty) ? sp.ty : getTaxYear(new Date());` → replace the `getTaxYear(new Date())` fallback with `latestConfiguredTaxYear()`.
- `extraction/page.tsx`: same replacement of the `getTaxYear(new Date())` fallback with `latestConfiguredTaxYear()`.
- `export/sa105.pdf/route.ts` line ~9: `const taxYear = url.searchParams.get("ty") ?? getTaxYear(new Date());` → `... ?? latestConfiguredTaxYear();`

Add `latestConfiguredTaxYear` (and `taxYearOptions`, `isConfiguredTaxYear` where used below) to each file's existing import from `../../../lib/tax/taxYear` (route uses `../../../../lib/tax/taxYear` — match its existing depth). Remove the now-unused `getTaxYear` import from a file only if nothing else in it uses `getTaxYear`.

**(b) Year pickers / nav from configured years.**
- `planner/page.tsx` and `extraction/page.tsx`: they build `const yearOptions = [startYear - N … startYear + 1].map(...)`. Replace that array with `const yearOptions = taxYearOptions();` and leave the `{yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}` render as-is. (Remove the now-unused `startYear` line if nothing else uses it.)
- `dashboard/page.tsx`: it renders a prev/next year control using `shiftTaxYear`. Replace the prev/next links so a neighbour link only renders when that neighbour is a configured year. Compute:
  ```tsx
  const opts = taxYearOptions();
  const idx = opts.indexOf(taxYear);
  const older = idx >= 0 && idx < opts.length - 1 ? opts[idx + 1] : null; // opts is newest-first
  const newer = idx > 0 ? opts[idx - 1] : null;
  ```
  and in the header render the `‹` link only when `older` (href `/dashboard?ty=${older}`), the year pill always, and the `›` link only when `newer`. Remove the `shiftTaxYear` helper and the old `prev`/`next` constants if they become unused. (With a single configured year, `older`/`newer` are both null → just the pill shows.)
- `sa105/page.tsx`: it uses `<YearNav basePath="/sa105" paramKey="ty" current={taxYear} label="Tax year" />`. `YearNav` always offers ±1; to restrict it to configured years, replace the `YearNav` usage with the same configured-neighbour pattern as the dashboard (compute `older`/`newer` from `taxYearOptions()`, render `‹`/pill/`›` with the arrow styling already used elsewhere, e.g. `class="grid h-8 w-8 place-items-center rounded-lg border border-line-strong text-muted transition-colors hover:border-forest hover:text-forest"`). Keep the Download-PDF button in the header actions.

**(c) Unconfigured-year notice.** On `dashboard`, `sa105`, `planner`, `extraction`: import `isConfiguredTaxYear` and `Banner`, and directly beneath the page header render:
```tsx
{!isConfiguredTaxYear(taxYear) && (
  <Banner variant="info">Tax estimate uses {latestConfiguredTaxYear()} rates — {taxYear} isn&apos;t configured yet.</Banner>
)}
```
(Place it alongside any existing error banner. The page still renders normally.) The PDF route needs no banner.

- [ ] **Step 1:** Apply (a)+(b)+(c) to `dashboard/page.tsx`.
- [ ] **Step 2:** Apply (a)+(b)+(c) to `sa105/page.tsx`.
- [ ] **Step 3:** Apply (a)+(b)+(c) to `planner/page.tsx`.
- [ ] **Step 4:** Apply (a)+(b)+(c) to `extraction/page.tsx`.
- [ ] **Step 5:** Apply (a) to `export/sa105.pdf/route.ts`.
- [ ] **Step 6: Verify.** `cd /home/ash/projects/akaunting-ng && npx tsc --noEmit 2>&1 | grep -c "error TS"` → 0; `npm test` → full suite green. Grep to confirm the calendar-derived default is gone from these files: `grep -rn "getTaxYear(new Date())" "src/app/(app)/dashboard" "src/app/(app)/sa105" "src/app/(app)/planner" "src/app/(app)/extraction" "src/app/(app)/export"` → no matches.
- [ ] **Step 7: Commit.** `git add "src/app/(app)/dashboard" "src/app/(app)/sa105" "src/app/(app)/planner" "src/app/(app)/extraction" "src/app/(app)/export" && git commit -m "feat: personal tools default to and offer only configured tax years"`

---

## Self-review notes (already reconciled)

- **Spec coverage:** helpers (Task 1) ↔ spec §2; personal tools defaults/pickers/notice (Task 3) ↔ §3; company accounts CT-year report + notice (Task 2) ↔ §4; tests ↔ §5.
- **Type/name consistency:** `CONFIGURED_TAX_YEARS`/`latestConfiguredTaxYear`/`isConfiguredTaxYear`/`taxYearOptions` defined in Task 1, consumed in Tasks 2–3; `ctYear`/`ctYearConfigured` added to `CompanyAccounts` in Task 2 and read on the accounts page in Task 2 Step 3.
- **No rate-maths change:** `getCompanyAccounts` passes `getTaxYear(period.end)` to `corporationTax`, which falls back to 2025-26 for unconfigured years → identical figures; the £10,000 → £1,900 assertion confirms it. All other engines untouched. The suite stays green.
- **`getTaxYear` retained** for date classification and the CT-year derivation; only the calendar-derived *rate-year defaults/pickers* move to the configured list.
