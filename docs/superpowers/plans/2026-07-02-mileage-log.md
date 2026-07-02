# Mileage Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A dedicated `/deductions/mileage` page to log & manage multiple mileage trips per tax year (add form, running total with 45p-band remaining, per-trip delete), with the Deductions page's mileage item linking to it in both Consider and Covered states.

**Architecture:** Reuses the existing mileage machinery (`mileageClaimPence`, `logMileageAction`, `MileageForm`, `cumulativeMilesForTaxYear`, "Travel & mileage" category). Adds a pure `mileageSummary`, a `listMileageTrips` query, a `returnTo` on `logMileageAction` + a guarded `deleteMileageAction`, the log page, and turns the Deductions mileage item into a link.

**Tech Stack:** Next.js 16 (App Router, server components + actions), Prisma v7 + SQLite, Vitest, Tailwind v4 ("Quiet Ledger").

Design spec: `docs/superpowers/specs/2026-07-02-mileage-log-design.md`. On branch `feat/deductions-mileage` (extends the open PR #3).

## Conventions
- (npm/npx exit 127 → `/home/ash/.nvm/versions/node/v25.6.1/bin/` paths; run `npx prisma generate` before tsc — editor squiggles about `miles`/`roundTripMiles` are a stale client cache, the CLI tsc is truth.) `dev.db` is REAL data — no resets.
- Server actions: `"use server"`, `requireSession()` first, `back(): never` redirect helper, `taxYear` format guard `^\d{4}-\d{2}$` (see the existing `logMileageAction`).
- No schema change (trips are ordinary "Travel & mileage" transactions with `miles` set).

## File Structure
```
src/lib/tax/mileage.ts                     # + mileageSummary (pure)                    [tested]
src/lib/tax/mileage.test.ts                # + mileageSummary cases
src/lib/data/mileage.ts                    # + listMileageTrips
src/app/(app)/deductions/MileageForm.tsx   # + optional returnTo hidden field
src/app/(app)/deductions/actions.ts        # logMileageAction gains returnTo; + deleteMileageAction
src/app/(app)/deductions/mileage/page.tsx  # the mileage log page (new)
src/app/(app)/deductions/page.tsx          # mileage item → link (Consider + Covered)
```

---

## Task 1: `mileageSummary` (pure, TDD)

**Files:** Modify `src/lib/tax/mileage.ts`; Modify `src/lib/tax/mileage.test.ts`

- [ ] **Step 1: Append the failing tests** to `src/lib/tax/mileage.test.ts`:
```ts
import { mileageSummary } from "./mileage";

describe("mileageSummary", () => {
  it("totals miles and pence and reports the 45p band remaining", () => {
    const s = mileageSummary([{ miles: 24, amountPence: 1080 }, { miles: 48, amountPence: 2160 }], "2025-26");
    expect(s).toEqual({ totalMiles: 72, totalPence: 3240, remainingAt45p: 9928 });
  });
  it("is zero-safe for an empty log", () => {
    expect(mileageSummary([], "2025-26")).toEqual({ totalMiles: 0, totalPence: 0, remainingAt45p: 10000 });
  });
  it("clamps remaining at 0 once past the threshold", () => {
    expect(mileageSummary([{ miles: 10_500, amountPence: 472_500 }], "2025-26").remainingAt45p).toBe(0);
  });
});
```

- [ ] **Step 2:** `npm test -- mileage` → the new block FAILS ("mileageSummary is not a function").

- [ ] **Step 3: Implement** — append to `src/lib/tax/mileage.ts`:
```ts
export interface MileageSummary {
  totalMiles: number;
  totalPence: number;
  remainingAt45p: number;
}

/** Totals for the mileage log's summary line. remainingAt45p clamps at 0 past the threshold. */
export function mileageSummary(trips: { miles: number; amountPence: number }[], taxYear: string): MileageSummary {
  const totalMiles = trips.reduce((sum, t) => sum + (t.miles || 0), 0);
  const totalPence = trips.reduce((sum, t) => sum + (t.amountPence || 0), 0);
  const remainingAt45p = Math.max(0, mileageRatesFor(taxYear).thresholdMiles - totalMiles);
  return { totalMiles, totalPence, remainingAt45p };
}
```

- [ ] **Step 4:** `npm test -- mileage` → PASS. `npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/tax/mileage.ts src/lib/tax/mileage.test.ts
git commit -m "feat(mileage-log): pure mileageSummary (totals + 45p band remaining)"
```

---

## Task 2: `listMileageTrips` (data layer)

**Files:** Modify `src/lib/data/mileage.ts`

- [ ] **Step 1: Add the query** — append to `src/lib/data/mileage.ts`:
```ts
export interface MileageTripRow {
  id: string;
  date: Date;
  description: string | null;
  miles: number;
  amountPence: number;
}

/** This tax year's Travel & mileage trips across personally-owned properties, newest first. */
export async function listMileageTrips(taxYear: string): Promise<MileageTripRow[]> {
  const { start, end } = taxYearRange(taxYear);
  const rows = await prisma.transaction.findMany({
    where: { date: { gte: start, lt: end }, property: { ownershipType: "personal" }, category: { name: TRAVEL_CATEGORY } },
    orderBy: { date: "desc" },
    select: { id: true, date: true, description: true, miles: true, amountPence: true },
  });
  return rows.map((r) => ({ id: r.id, date: r.date, description: r.description, miles: r.miles ?? 0, amountPence: r.amountPence }));
}
```
(`TRAVEL_CATEGORY` and `taxYearRange` are already imported/defined at the top of this file.)

- [ ] **Step 2:** `npx prisma generate && npx tsc --noEmit` → PASS.

- [ ] **Step 3: Commit**
```bash
git add src/lib/data/mileage.ts
git commit -m "feat(mileage-log): listMileageTrips data query"
```

---

## Task 3: `MileageForm` returnTo + actions (`returnTo`, `deleteMileageAction`)

**Files:** Modify `src/app/(app)/deductions/MileageForm.tsx`; Modify `src/app/(app)/deductions/actions.ts`

- [ ] **Step 1: Add an optional `returnTo` to `MileageForm`**

In `src/app/(app)/deductions/MileageForm.tsx`, add `returnTo?: string` to the `Props` interface and destructure it, and render a hidden field when present. Change the interface + signature:
```ts
interface Props {
  taxYear: string;
  propertyId: string;
  propertyName: string;
  roundTripMiles: number | null;
  returnTo?: string;
}

export function MileageForm({ taxYear, propertyId, propertyName, roundTripMiles, returnTo }: Props) {
```
and immediately after the opening `<form action={logMileageAction} ...>` tag's existing hidden `propertyId` input, add:
```tsx
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
```

- [ ] **Step 2: `logMileageAction` — honour a validated `returnTo`**

In `src/app/(app)/deductions/actions.ts`, replace the head of `logMileageAction` (the `back` helper + taxYear guard) so the redirect target is `returnTo` when it is an in-app deductions path. Replace:
```ts
export async function logMileageAction(formData: FormData) {
  await requireSession();
  const taxYear = String(formData.get("taxYear") ?? "");
  const back = (msg: string, ok = false): never =>
    redirect(`/deductions?ty=${encodeURIComponent(taxYear)}&${ok ? "ok" : "error"}=${encodeURIComponent(msg)}`);
  if (!/^\d{4}-\d{2}$/.test(taxYear)) return back("Invalid tax year.");
```
with:
```ts
export async function logMileageAction(formData: FormData) {
  await requireSession();
  const taxYear = String(formData.get("taxYear") ?? "");
  const returnToRaw = String(formData.get("returnTo") ?? "/deductions");
  const dest = returnToRaw.startsWith("/deductions") ? returnToRaw : "/deductions"; // avoid open redirect
  const back = (msg: string, ok = false): never =>
    redirect(`${dest}?ty=${encodeURIComponent(taxYear)}&${ok ? "ok" : "error"}=${encodeURIComponent(msg)}`);
  if (!/^\d{4}-\d{2}$/.test(taxYear)) return back("Invalid tax year.");
```
Also add `revalidatePath("/deductions/mileage");` alongside the existing `revalidatePath("/deductions");` near the end of `logMileageAction` (so the log page refreshes after an add):
```ts
  revalidatePath("/deductions");
  revalidatePath("/deductions/mileage");
  revalidatePath("/transactions");
  back(`Logged ${miles} miles (£${(amountPence / 100).toFixed(2)})`, true);
```

- [ ] **Step 3: Add `deleteMileageAction`** — append to `src/app/(app)/deductions/actions.ts`:
```ts
export async function deleteMileageAction(formData: FormData) {
  await requireSession();
  const taxYear = String(formData.get("taxYear") ?? "");
  const back = (msg: string, ok = false): never =>
    redirect(`/deductions/mileage?ty=${encodeURIComponent(taxYear)}&${ok ? "ok" : "error"}=${encodeURIComponent(msg)}`);

  const id = String(formData.get("id") ?? "");
  const txn = id ? await prisma.transaction.findUnique({ where: { id }, include: { category: true, property: true } }) : null;
  if (!txn || txn.category.name !== "Travel & mileage" || txn.property.ownershipType !== "personal") {
    return back("That trip could not be found.");
  }
  await prisma.transaction.delete({ where: { id } });
  revalidatePath("/deductions/mileage");
  revalidatePath("/deductions");
  revalidatePath("/transactions");
  back("Trip deleted", true);
}
```

- [ ] **Step 4:** `npx prisma generate && npx tsc --noEmit` → PASS. `npm test` → PASS (report count).

- [ ] **Step 5: Commit**
```bash
git add "src/app/(app)/deductions/MileageForm.tsx" "src/app/(app)/deductions/actions.ts"
git commit -m "feat(mileage-log): MileageForm returnTo; logMileageAction returnTo + deleteMileageAction"
```

---

## Task 4: The mileage log page

**Files:** Create `src/app/(app)/deductions/mileage/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/(app)/deductions/mileage/page.tsx`:
```tsx
import { listMileageTrips } from "../../../../lib/data/mileage";
import { listPersonalProperties } from "../../../../lib/data/deductions";
import { getActiveProperty } from "../../../../lib/data/activeProperty";
import { mileageSummary } from "../../../../lib/tax/mileage";
import { latestConfiguredTaxYear, taxYearOptions } from "../../../../lib/tax/taxYear";
import { formatGBP } from "../../../../lib/tax/money";
import { PageHeader } from "../../_ui/PageHeader";
import { Banner } from "../../_ui/Banner";
import { EmptyState } from "../../_ui/EmptyState";
import { MileageForm } from "../MileageForm";
import { deleteMileageAction } from "../actions";

export default async function MileageLogPage({ searchParams }: { searchParams: Promise<{ ty?: string; ok?: string; error?: string }> }) {
  const { ty, ok, error } = await searchParams;
  const taxYear = ty ?? latestConfiguredTaxYear();
  const [trips, properties, active] = await Promise.all([
    listMileageTrips(taxYear),
    listPersonalProperties(),
    getActiveProperty(),
  ]);
  const activePropertyId =
    (active.propertyId && properties.some((p) => p.id === active.propertyId) ? active.propertyId : properties[0]?.id) ?? "";
  const activeProperty = properties.find((p) => p.id === activePropertyId);
  const summary = mileageSummary(trips, taxYear);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader title="Mileage log" subtitle={`Trips to ${activeProperty?.name ?? "your property"} — 45p/mile for the first 10,000, then 25p`}>
        <div className="flex items-center gap-1.5">
          {taxYearOptions().map((y) => (
            <a key={y} href={`/deductions/mileage?ty=${y}`} className={`pill ${y === taxYear ? "" : "opacity-60"}`}>{y}</a>
          ))}
        </div>
        <a className="btn btn-ghost" href={`/deductions?ty=${taxYear}`}>Back to deductions</a>
      </PageHeader>

      {ok && <Banner variant="success">{ok}</Banner>}
      {error && <Banner variant="error">{error}</Banner>}

      {properties.length === 0 ? (
        <EmptyState title="No properties yet" hint="Add a property first, then log trips to it." />
      ) : (
        <>
          <p className="text-sm text-muted">
            <strong>{summary.totalMiles}</strong> miles logged · <strong>{formatGBP(summary.totalPence)}</strong> ·{" "}
            {summary.remainingAt45p.toLocaleString()} miles left at 45p for {taxYear}.
          </p>

          <div className="card p-4">
            <div className="font-medium">Log a trip</div>
            <MileageForm
              taxYear={taxYear}
              propertyId={activePropertyId}
              propertyName={activeProperty?.name ?? "your property"}
              roundTripMiles={activeProperty?.roundTripMiles ?? null}
              returnTo="/deductions/mileage"
            />
          </div>

          {trips.length === 0 ? (
            <EmptyState title="No trips logged yet" hint="Log your first trip above." />
          ) : (
            <div className="card overflow-hidden">
              <table className="ledger">
                <thead>
                  <tr><th>Date</th><th>Purpose</th><th className="text-right">Miles</th><th className="text-right">Claim</th><th></th></tr>
                </thead>
                <tbody>
                  {trips.map((t) => (
                    <tr key={t.id}>
                      <td className="money">{t.date.toISOString().slice(0, 10)}</td>
                      <td>{t.description ?? "Trip"}</td>
                      <td className="money text-right">{t.miles}</td>
                      <td className="money text-right">{formatGBP(t.amountPence)}</td>
                      <td className="text-right">
                        <form action={deleteMileageAction}>
                          <input type="hidden" name="taxYear" value={taxYear} />
                          <input type="hidden" name="id" value={t.id} />
                          <button type="submit" className="text-faint hover:text-negative" aria-label="Delete trip">✕</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```
NOTE: `listPersonalProperties` (in `src/lib/data/deductions.ts`) selects `roundTripMiles`, so `activeProperty.roundTripMiles` is available. If the `.negative`/`.money`/`.ledger`/`.pill` classes differ, match the real ones (grep `globals.css` / the SA105 page which uses `.ledger`/`.money`). The delete `✕` uses `hover:text-negative`; if there's no `text-negative` utility, use `hover:text-forest`.

- [ ] **Step 2:** `npx tsc --noEmit` → PASS.

- [ ] **Step 3: Commit**
```bash
git add "src/app/(app)/deductions/mileage/page.tsx"
git commit -m "feat(mileage-log): /deductions/mileage page — add form, running total, trip list + delete"
```

---

## Task 5: Deductions mileage item → link (both states)

**Files:** Modify `src/app/(app)/deductions/page.tsx`

- [ ] **Step 1: Link in the Consider section + drop the inline form**

In `src/app/(app)/deductions/page.tsx`, remove the `MileageForm` import line (`import { MileageForm } from "./MileageForm";`) and the now-unused `activeRoundTrip` computation line. Then, in the Consider `.map`, replace the mileage branch of the three-way conditional:
```tsx
                  {item.action === "mileage" ? (
                    <MileageForm taxYear={taxYear} propertyId={activePropertyId} propertyName={activePropertyName} roundTripMiles={activeRoundTrip} />
                  ) : item.action === "use-of-home" ? (
```
with:
```tsx
                  {item.action === "mileage" ? (
                    <div className="mt-3"><a className="btn btn-primary" href={`/deductions/mileage?ty=${taxYear}`}>Log a trip</a></div>
                  ) : item.action === "use-of-home" ? (
```

- [ ] **Step 2: "Manage trips" link in the Covered section**

Add `import { listMileageTrips } from "../../../lib/data/mileage";` at the top. After the `covered`/`considered`/`dismissed` filters, compute the count:
```ts
  const mileageTripCount = (await listMileageTrips(taxYear)).length;
```
Then replace the Covered `<li>` render:
```tsx
                {covered.map(({ item }) => (
                  <li key={item.key} className="flex items-center gap-2 text-muted"><span className="text-forest">✓</span> {item.title}</li>
                ))}
```
with:
```tsx
                {covered.map(({ item }) => (
                  <li key={item.key} className="flex items-center gap-2 text-muted">
                    <span className="text-forest">✓</span> {item.title}
                    {item.action === "mileage" && (
                      <a className="underline hover:text-forest" href={`/deductions/mileage?ty=${taxYear}`}>Manage trips ({mileageTripCount})</a>
                    )}
                  </li>
                ))}
```

- [ ] **Step 3:** `npx prisma generate && npx tsc --noEmit` → PASS (confirm no unused-var error from removing `activeRoundTrip`/`MileageForm`). `npm test` → PASS (report count).

- [ ] **Step 4: Commit**
```bash
git add "src/app/(app)/deductions/page.tsx"
git commit -m "feat(mileage-log): deductions mileage item links to the log page (Consider + Covered)"
```

---

## Task 6: Verification & live-run

**Files:** none.

- [ ] **Step 1:** `npx prisma generate && npm test` → PASS (incl. new `mileageSummary` cases); report count. `npx tsc --noEmit` → PASS.
- [ ] **Step 2: Live-run** — dev server (`pkill -9 -f next` first; `DATABASE_URL="file:./dev.db" npm run dev`), log in:
  - `/deductions?ty=2025-26` → the **Mileage** item shows a **"Log a trip"** link (Consider) → click it → lands on `/deductions/mileage?ty=2025-26`.
  - Log 3 trips (e.g. 24, 24, 48 miles). Confirm the summary line updates (96 miles · £43.20 · 9,904 left at 45p) and the trip list shows all three newest-first with correct £.
  - Go back to `/deductions` → the Mileage item is now under **Covered** with a **"Manage trips (3)"** link → click it → back on the log page.
  - Delete one trip (✕) → summary + list update; no error.
  - **Clean up**: delete all test Travel & mileage transactions from dev.db (`deleteMany where category name "Travel & mileage"`), confirm 309 transactions remain. Stop the dev server. Don't commit screenshots with the real property name.
- [ ] **Step 3:** Report results, then run `superpowers:finishing-a-development-branch` (this extends the open PR #3 for the mileage feature).

---

## Done
The Deductions Assistant now supports a full mileage log (many trips/year) — closing the "one trip only" limitation. Phases 1–3 + this improvement are complete.
