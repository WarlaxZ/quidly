# Multi-Property — Design Spec

**Date:** 2026-06-30
**Status:** Approved (design); ready for implementation planning
**Phase:** 2 (multi-property sub-project; first of two — company mode follows)

## Problem & context

The app currently assumes a single property via `getOrCreateDefaultProperty` (used by transactions, recurring, scan, import, dashboard, sa105, export, settings). The user owns/plans to own several rental properties and wants to manage them all. The data model already supports it: `Property` is 1..n and `Transaction`/`RecurringRule` carry `propertyId`; `Property.ownershipType` (personal/company) exists as the seam for the later company-mode cycle. This sub-project makes the app genuinely multi-property; **company/corporation-tax mode is a separate later spec** (scoped then as fuller company accounts: director's loan, dividends, salary, retained profit, basic statutory-style accounts).

**Key tax fact that keeps this mostly a plumbing/UI change:** for personal tax, the SA105 aggregates *all* of a person's UK property income into one return — there is no per-property filing. So the tax engine doesn't change; reporting just sums across the user's personally-owned properties, applying the £1,000 property allowance and the £150,000 cash-basis test **once across the total**.

**Decisions from brainstorming:** active-property **switcher** in the nav (with "All properties"); dashboard/SA105 default to **consolidated** across personal properties with a **per-property breakdown**; active property stored in a **cookie**; vendors stay **global**.

## Section 1 — Active-property context

- `src/lib/data/activeProperty.ts` (server-only):
  - `listProperties()` → all properties, ordered by `createdAt`.
  - `getActiveProperty()` → reads the `active_property` cookie; if it names an existing property, returns it; otherwise returns the first property (and `null` only if there are no properties at all).
  - The cookie value `"all"` is a sentinel meaning "All properties" (no single active property).
  - `getActivePropertyId()` → the active property's id, or `null` when "all" / none.
- `setActivePropertyAction(formData)` (server action): sets the `active_property` cookie (httpOnly, sameSite=lax) to the chosen id or `"all"`, then `revalidatePath("/")`-equivalent (revalidate the layout) so all screens reflect it.
- **Switcher UI** in `src/app/(app)/layout.tsx`: a `<form>`-wrapped `<select name="propertyId">` listing "All properties" + each property, auto-submitting to `setActivePropertyAction`. Shown only when ≥1 property exists.
- **Bootstrap:** a one-time `getOrCreateDefaultProperty` call path is retained so existing installs keep their single property; new installs with zero properties show a "create your first property" empty state (Section 2).

## Section 2 — Property management (CRUD)

- `src/lib/data/property.ts` gains: `createProperty(input)`, `updateProperty(id, input)` (exists), `deletePropertyIfEmpty(id)`, `getPropertyCounts(id)` (transaction + recurring counts), `getProperty(id)`.
- `deletePropertyIfEmpty(id)` throws a friendly error if the property has any transactions or recurring rules; deletes otherwise.
- `/properties` page (`src/app/(app)/properties/page.tsx`): lists properties (name, address, ownership type, txn count); an add form; an Edit link per property → `/properties/[id]/edit`; a delete control (blocked-with-message when non-empty). Empty state ("Add your first property") when none exist.
- `ownershipType` (personal/company) is selectable on add/edit. In this phase the app treats all properties as personal for tax; the field is stored for company mode.
- A "Properties" nav link is added.

## Section 3 — Scoping data entry & lists

- **Transactions, recurring, scan, import** use `getActiveProperty()` instead of `getOrCreateDefaultProperty`:
  - When a single property is active: lists are scoped to it; new entries attach to it (no per-row property picker needed).
  - When **"All properties"** is active: lists show all rows with a **Property** column; add forms include a required **property `<select>`** so the row has a home.
- `listTransactions`/`listTransactionsFiltered`/`listRecurringRules` already take a `propertyId`; add an "all" path (no `propertyId` filter) returning rows with their property included.
- **`materialiseDue`** (already accepts an optional `propertyId`): generates for the active property, or for all properties when "All".
- **Vendors** remain global (no `propertyId`) — unchanged.
- The **CSV export** route scopes to the active property, or all when "All".

## Section 4 — Aggregated reporting (dashboard & SA105)

- New `src/lib/data/personalSummary.ts`:
  - `getPersonalTaxYearSummary(taxYear)` → loads transactions across **all `ownershipType: "personal"` properties** for the tax year, maps via `toTaxTxn`, and runs the existing `buildTaxYearSummary` on the combined set (so the £1,000 allowance, finance-cost reducer, and SA105 boxes are computed **once on the total**). Returns the summary plus the `TaxYearProfile` fields (otherIncome/region/usePropertyAllowance) as today.
  - `getPerPropertyBreakdown(taxYear)` → per personal property: `{ propertyName, incomePence, expensesPence, profitPence }` (reusing the per-property `getTaxYearSummary`/`computeProfit`), for the breakdown table.
- **Dashboard** (`/dashboard`): headline cards + tax estimate use `getPersonalTaxYearSummary`; a per-property breakdown table is added below. The other-income/region/allowance form is unchanged (those are person-level, on `TaxYearProfile`).
- **SA105** (`/sa105`): box totals use `getPersonalTaxYearSummary`; an optional note lists the contributing properties. The PDF route uses the same aggregate.
- **Forward-compatibility:** filtering by `ownershipType: "personal"` means when company-owned properties arrive (next cycle) they are automatically excluded from the personal SA105 — they'll get their own corporation-tax reporting.

## Section 5 — Testing

- **Integration (test DB):** `getActiveProperty` (valid cookie → that property; invalid/missing → first; "all" → null id); `createProperty`/`deletePropertyIfEmpty` (blocked when it has a transaction, allowed when empty); `getPersonalTaxYearSummary` (sums two properties; allowance applied once on the total, not per-property; excludes an `ownershipType: "company"` property); `getPerPropertyBreakdown` (one row per personal property with correct profit).
- **Flow (build + live-run):** add a second property; switch active property and confirm transactions/recurring scope to it; with "All" active, confirm the Property column + the required property picker on add; confirm the dashboard/SA105 consolidate across both with a correct per-property breakdown; confirm delete is blocked for a property with data and allowed once emptied.

## Non-goals (explicit)

- No corporation tax / company accounts (next cycle).
- No per-property tax returns (SA105 is inherently aggregated for personal income).
- No property-level user permissions / sharing (single-user app).
- No joint-ownership income splitting (a future consideration; out of scope here).
- No data migration beyond the existing single property (it becomes property #1).

## Risks & caveats

- **Touch surface is wide:** many actions/pages currently call `getOrCreateDefaultProperty`. The change is mechanical but broad; each call site must move to `getActiveProperty` (data entry) or the aggregate (reporting). Mitigated by doing it as one focused unit and the live-run.
- **"All properties" add forms** must require a property — silently attaching to a default would misfile data. The add action validates a property was chosen.
- **Allowance/basis once-per-person:** the aggregate summary must apply the £1,000 allowance and £150k cash-basis test on the *total*, never per-property — this is the main correctness point and is unit-tested.
- **Active-property cookie can name a deleted property:** `getActiveProperty` validates existence and falls back, so a stale cookie never breaks a screen.
- **Company-owned properties pre-company-mode:** if a user sets a property to `ownershipType: "company"` now, it would be excluded from the SA105 but have no company reporting yet. Until company mode ships, the Properties page notes that "company" has no effect on tax reporting yet.
