# Mileage Log — Design

**Date:** 2026-07-02
**Status:** Approved (brainstorming)

## Goal

Let a landlord log and manage **multiple** mileage trips per tax year. Today the
Deductions page can log a mileage trip, but once the mileage item is "Covered" its action
disappears (the Covered/Consider checklist hides logged items), so only one trip is
reachable from there. This adds a dedicated **mileage log page** with an add-trip form, a
running total (incl. how much of the 10,000-mile 45p band remains), and per-trip delete —
and makes the Deductions mileage item link to it in both states.

Builds on Phase 2 (branch `feat/deductions-mileage`): `Transaction.miles`,
`src/lib/tax/mileage.ts` (`mileageClaimPence`), `logMileageAction`, `MileageForm`,
`cumulativeMilesForTaxYear`, and the "Travel & mileage" category (SA105 box 29).

## Non-goals (YAGNI)

- No per-trip **edit** (delete + re-add covers it).
- No recompute of already-recorded trips' rate split when an earlier trip is deleted (the
  annual total is order-invariant; the split only differs at the 10k boundary — out of
  scope for a single-property landlord). Documented, not handled.
- No new nav entry — the log is reached from the Deductions mileage item.

## Routing & flow

- New page **`/deductions/mileage?ty=YYYY-YY`** (async server component; `ty` defaults to
  `latestConfiguredTaxYear()`), auth-gated like every `(app)` route.
- Trip entry **moves to this page**: the existing `MileageForm` is reused here; its submit
  (`logMileageAction`) redirects back to `/deductions/mileage?ty=...` instead of
  `/deductions`.
- The **Deductions page mileage item becomes a link** (not the inline form):
  - 0 trips this year → "Log a trip" → `/deductions/mileage?ty=...`
  - ≥1 trip → "Manage trips · N logged" → same link.
  Detection (covered/consider) is unchanged; only the rendered control changes for the
  `mileage` item, in both the Consider and Covered sections.

## Data layer (`src/lib/data/mileage.ts`, additions)

```ts
export interface MileageTripRow { id: string; date: Date; description: string | null; miles: number; amountPence: number; }

/** This tax year's Travel & mileage trips across personally-owned properties, newest first. */
export function listMileageTrips(taxYear: string): Promise<MileageTripRow[]>;
```

(`cumulativeMilesForTaxYear` already exists and is reused for the band remaining.)

## Pure summary (`src/lib/tax/mileage.ts`, addition — tested)

```ts
export interface MileageSummary { totalMiles: number; totalPence: number; remainingAt45p: number; }
/** Totals for the log page's summary line. remainingAt45p = max(0, threshold − totalMiles). */
export function mileageSummary(trips: { miles: number; amountPence: number }[], taxYear: string): MileageSummary;
```

- `totalMiles` = Σ miles; `totalPence` = Σ amountPence; `remainingAt45p` = `max(0,
  mileageRatesFor(taxYear).thresholdMiles − totalMiles)`.

## The log page UI

- Header: "Mileage" + tax-year switcher (pills, like `/deductions`) + subtitle "for
  {active property}". A back link to `/deductions`.
- **Summary line:** `{totalMiles} miles logged · {formatGBP(totalPence)} · {remainingAt45p}
  miles left at 45p`.
- **Add-trip form** (reused `MileageForm`), at the top, submitting to `/deductions/mileage`.
- **Trip list** (a `.ledger` table): date · purpose (from the description) · miles · £ · a
  delete (✕) form-button per row. Empty-state when there are none.
- `?ok=` / `?error=` banners (from the add/delete actions).

## Actions (`src/app/(app)/deductions/actions.ts`)

- **`logMileageAction`** (existing) gains an optional `returnTo` form field: redirect target
  defaults to `/deductions`; the log-page form sets it to `/deductions/mileage`. (Keeps the
  action reusable; the `taxYear` is preserved in the redirect.)
- **`deleteMileageAction`** (new): auth; reads `id` + `taxYear`; loads the transaction with
  its category + property; only deletes if `category.name === "Travel & mileage"` and the
  property is personally-owned (never deletes an arbitrary transaction); revalidate; redirect
  back to `/deductions/mileage?ty=...`.

## Error handling

- Delete of a non-mileage / non-personal / missing transaction → no-op with an error banner
  ("That trip could not be found."). Guards mean the action can't be abused to delete other
  transactions.
- `returnTo` is validated to be an in-app path (`startsWith("/deductions")`) to avoid an
  open redirect; otherwise falls back to `/deductions`.
- Invalid `taxYear` in either action → the existing `^\d{4}-\d{2}$` guard.

## Testing

- Pure `mileageSummary` unit-tested (empty, single trip, multiple, band-remaining clamps at
  0 past 10k).
- Existing `mileageClaimPence` tests unchanged.
- The data layer (`listMileageTrips`) and the two actions follow the established
  server-only / server-action patterns; verified by a live-run (log 3 trips → running total
  + band remaining correct; delete one → updates; item on `/deductions` links correctly in
  both states). Full suite + tsc must stay green.

## File structure

```
src/lib/tax/mileage.ts                    # + mileageSummary (pure)                 [tested]
src/lib/tax/mileage.test.ts               # + mileageSummary cases
src/lib/data/mileage.ts                   # + listMileageTrips
src/app/(app)/deductions/actions.ts       # logMileageAction gains returnTo; + deleteMileageAction
src/app/(app)/deductions/MileageForm.tsx  # + optional returnTo hidden field
src/app/(app)/deductions/mileage/page.tsx # the mileage log page
src/app/(app)/deductions/page.tsx         # mileage item → link (both Consider & Covered)
```
