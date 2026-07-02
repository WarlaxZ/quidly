# Deductions Assistant — Design

**Date:** 2026-07-02
**Status:** Approved (brainstorming)

## Goal

Help landlords capture the allowable expenses they'd otherwise miss, and make
self-assessment less scary, by adding to Quidly:

1. A **deductions checklist + nudges** — a per-tax-year view of commonly-missed
   deductions that flags what hasn't been logged, with plain-English explainers.
2. **Mileage quick-logging** — one-tap "trip to the property" entry that applies the
   HMRC simplified mileage rate.
3. A **use-of-home helper** — a guided claim for the reasonable proportion of home
   costs spent administering the lettings.

These are one cohesive area ("capture more deductions") built in **three phases**.

## Non-goals (YAGNI)

- No user-editable checklist catalog (built-in curated list only).
- No Google Maps distance lookup in v1 (saved round-trip miles instead; Maps is a
  possible later enhancement behind a BYO key).
- No apportionment calculator for use-of-home (guided flat amount only).
- No changes to the tax computation itself — these features only create ordinary
  categorised transactions the existing SA105 engine already sums.

## Tax background (informs the design; not advice)

- **Mileage:** landlords may use HMRC's simplified motoring rate — **45p/mile for the
  first 10,000 business miles in a tax year, 25p thereafter**. Trips: inspections,
  viewings, meeting tradespeople, repairs. Goes in SA105 box 29 (other allowable).
- **Use of home:** a reasonable proportion of household running costs for time spent
  administering the lettings is allowable. Most single-property landlords claim a modest
  flat estimate (commonly ~£4–6/week ≈ £20–26/month) as a reasonable proportion. It must
  genuinely be for the property business, kept reasonable, and documented. Separate from
  any employed working-from-home. SA105 box 29.
- Boxes 20/21 income, 24/25/27/28/29 expenses, 44 residential finance costs — as already
  modelled in Quidly's 9 seeded categories.

---

## Data model & categories

**Two new seeded categories** (idempotent seed additions; both SA105 box 29 so they show
distinctly yet roll into the correct box):

- `Travel & mileage` — kind `expense`, sa105Box `29`, allowable `true`
- `Use of home` — kind `expense`, sa105Box `29`, allowable `true`

**Schema changes** (hand-authored SQL migrations + `prisma migrate deploy`):

- `Property.roundTripMiles Int?` — saved home↔property round-trip distance (per property).
- `Transaction.miles Int?` — miles behind a mileage expense (null otherwise). A mileage
  trip is a normal `Transaction` in the *Travel & mileage* category with `miles` set — no
  separate trip table. Enables tracing/editing and summing annual miles for the 10k band.
- New model `DeductionDismissal { id, taxYear String, itemKey String, createdAt }` with a
  unique constraint on `(taxYear, itemKey)` — remembers checklist items marked "not
  applicable" for a tax year so they stop nudging.

**Mileage rates as per-year config** in the tax engine, mirroring the existing
one-line-per-year pattern:

```ts
export interface MileageRates { firstRatePence: number; afterRatePence: number; thresholdMiles: number; }
export const MILEAGE_RATES: Record<string, MileageRates> = {
  "2025-26": { firstRatePence: 45, afterRatePence: 25, thresholdMiles: 10_000 },
  // 2026-27, 2027-28 = same (frozen) copies
};
// + LATEST fallback, like the other engines.
```

Pure helper:

```ts
/** Pence claimable for a trip, given miles already claimed this tax year (applies the 10k band). */
export function mileageClaimPence(milesThisTrip: number, cumulativeMilesBefore: number, taxYear: string): number;
```

---

## Deduction catalog + detection engine

A **built-in curated catalog**. Each item:

```ts
interface DeductionItem {
  key: string;              // stable id, e.g. "gas-safety"
  title: string;            // "Gas safety certificate (CP12)"
  blurb: string;            // plain-English what/why
  categoryName: string;     // the Quidly category it belongs to
  match: {                  // how "covered" is detected for a tax year
    categoryNames?: string[];      // any transaction in these categories, and/or
    descriptionKeywords?: string[]; // any transaction whose description matches (case-insensitive)
  };
  action: "mileage" | "use-of-home" | "transaction"; // which "Log it" flow to open
}
```

**Pure detection function** (unit-tested):

```ts
type DeductionState = "covered" | "consider" | "dismissed";
interface DeductionStatus { item: DeductionItem; state: DeductionState; }
export function assessDeductions(
  items: DeductionItem[],
  txns: TaxTxn[],            // the tax year's transactions
  dismissedKeys: Set<string>,
): DeductionStatus[];
```

Rules: `dismissed` if the key is in `dismissedKeys`; else `covered` if any of the year's
transactions matches the item's `match` (category and/or description keyword); else
`consider`. Because matching can use description keywords, items sharing box 29 (mileage,
use-of-home, safety certs, subscriptions) are distinguished correctly.

**Starter catalog (~15 items):** landlord/buildings insurance; gas safety (CP12); EICR
electrical; EPC; mortgage interest; letting/management fees; accountancy/bookkeeping;
mileage to the property; use of home; ground rent / service charges; replacement of
domestic items; safety & servicing (boiler, alarms); advertising / tenant referencing;
bank charges on a landlord account; professional subscriptions (e.g. NRLA). Each carries a
reassuring blurb and the correct `action`.

---

## UX

### `/deductions` page (under the Tax menu)

- Tax-year selector (defaults to `latestConfiguredTaxYear()`, like the other tax pages).
- A reassuring progress line: *"You've captured 9 of 14 relevant deductions."*
- Two groups: **Covered** (✓) and **Consider** (•). Each *Consider* item shows its blurb,
  a **"Log it"** button (opens the item's `action`: mileage helper, use-of-home helper, or
  a category-prefilled transaction form), and a **"Not applicable"** dismiss (writes a
  `DeductionDismissal`). Dismissed items collapse into a small "Not applicable" list with
  an undo.
- Uses the existing "Quiet Ledger" primitives (PageHeader, Banner, cards, pills).

### SA105 pre-filing nudge

- A non-blocking, dismissible panel at the top of the SA105 screen: *"Before you file: 3
  deductions you might be missing"*, listing the *Consider* items with a link to
  `/deductions`. Reuses `assessDeductions`.

---

## Mileage quick-log (Phase 2)

- If the active property has no `roundTripMiles`, the mileage "Log it" first prompts to set
  it (a single number, saved on the property).
- **Log a trip** form: date, purpose (inspection / viewing / meeting tradesperson / repair
  / other), miles pre-filled from `roundTripMiles` (editable). On submit it computes the
  claim via `mileageClaimPence(miles, milesAlreadyClaimedThisYear, taxYear)` and creates a
  *Travel & mileage* expense (`direction: out`, `miles` set, description = purpose). Shows
  the rate applied and the running annual mileage.
- `milesAlreadyClaimedThisYear` = sum of `miles` on *Travel & mileage* transactions in that
  tax year (via `taxYearRange`).

---

## Use-of-home helper (Phase 3)

- Guided form: basis (weekly or monthly) + amount, pre-filled with the last used figure
  (inferred from the most recent *Use of home* transaction) or a ~£26/month default, with a
  plain-English explainer of what the claim is and a "keep it reasonable & documented" note.
- Computes the tax-year total and **creates or updates a single *Use of home* expense** for
  the selected tax year (find-or-create by category + tax year → no duplicates, re-runnable).

---

## Error handling

- Amount/miles validation reuses the existing money-input validation (reject sub-penny,
  non-numeric); a bad value shows a friendly message, not a 500.
- Dismiss/undo are idempotent (unique `(taxYear, itemKey)`; undo deletes the row).
- Mileage with no saved round-trip and no entered miles → prompt, don't create a £0 trip.
- Unconfigured tax year → mileage rates fall back to latest (same banner pattern as the
  other engines).

---

## Testing

- Pure & unit-tested (Vitest): `assessDeductions` (covered/consider/dismissed incl.
  box-29 keyword disambiguation), `mileageClaimPence` (under 10k, straddling 10k, at the
  boundary), the use-of-home annual-total calc, and the catalog's rule integrity (every
  item's `categoryName` exists in the seed).
- Existing SA105/tax tests unaffected — these features only create ordinary categorised
  transactions.
- Live-run screenshots per phase (`/deductions`, SA105 nudge, mileage log, use-of-home).

---

## Phasing (each phase = its own implementation plan)

- **Phase 1 — Checklist framework:** categories + schema (`DeductionDismissal`) + mileage
  rates config + catalog + `assessDeductions` + `/deductions` page + SA105 nudge, with a
  generic "Log it" → category-prefilled transaction form for every item. Delivers the core
  value standalone. (`Property.roundTripMiles` / `Transaction.miles` may land here or in
  Phase 2.)
- **Phase 2 — Mileage quick-log:** `roundTripMiles`, `Transaction.miles`, `mileageClaimPence`,
  the trip form; upgrades the mileage item's "Log it".
- **Phase 3 — Use-of-home helper:** the guided form + find-or-create annual claim; upgrades
  the use-of-home item's "Log it".

## File structure (indicative)

```
src/lib/tax/mileage.ts               # MileageRates config + mileageClaimPence (pure)   [tested]
src/lib/deductions/catalog.ts        # the built-in DeductionItem[] catalog
src/lib/deductions/assess.ts         # assessDeductions (pure)                          [tested]
src/lib/data/deductions.ts           # server-only: dismissals CRUD, status for a year
src/lib/data/mileage.ts              # server-only: log a trip → transaction
src/lib/data/useOfHome.ts            # server-only: find-or-create annual claim
src/app/(app)/deductions/page.tsx    # the Deductions page + actions
   … plus a nudge component reused on the SA105 page
prisma/schema.prisma + migrations    # DeductionDismissal, Property.roundTripMiles, Transaction.miles
prisma/seed.ts                       # + Travel & mileage, Use of home categories
```
