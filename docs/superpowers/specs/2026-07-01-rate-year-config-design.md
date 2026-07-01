# Rate-Year Freshness — Design Spec

**Date:** 2026-07-01
**Status:** Approved (design); ready for implementation planning
**Phase:** 3 (correctness hardening)

## Problem & context

Every rate engine (`bands.ts`, `corporationTax.ts`, `dividendTax.ts`, `nic.ts`) only defines **2025-26** figures and silently falls back to that via `?? LATEST_YEAR`. But the tools default to `getTaxYear(new Date())` — which, today (2026-07-01), is **2026-27** — and their year pickers offer surrounding years. So the dashboard/SA105/planner/extraction display "Tax year 2026-27" while quietly computing on 2025-26 rates. For a tax tool this is exactly the silent-wrongness the whole project exists to avoid (cf. Akaunting's VAT bug). The company accounts page has the same issue: `getCompanyAccounts` always uses the latest CT rates regardless of the period.

**Decision from brainstorming (Approach A, full scope):** introduce a single source of truth for which tax years have real rate config; default tools to the latest configured year; build year pickers only from configured years; and where a user still views an unconfigured year, show an honest notice rather than pretending. Include the company accounts page.

**Explicitly NOT chosen:** adding 2026-27 rate configs now (Approach B) — UK thresholds are frozen but Scottish bands change yearly and 2026-27 Scottish figures aren't confirmed, so it would assert unverified numbers. When real 2026-27 figures are known, they're added to the config list and everything lights up automatically.

**Constraint:** presentation/defaults + one additive data-layer return field only — no change to the rate maths. The existing test suite must stay green (rate outputs are unchanged); the company accounts figures for existing periods must not move.

## Section 1 — Scope

**In:** shared configured-tax-year helpers in `taxYear.ts`; default + year-picker changes in `dashboard`, `sa105`, `planner`, `extraction`, and the `export/sa105.pdf` route; an "unconfigured year" info notice on those pages; `getCompanyAccounts` returning the CT year used + a configured flag, and the accounts page showing the notice when unconfigured.

**Out:** adding new tax-year rate data (2026-27 etc.); any change to `getTaxYear`/`taxYearRange` (they classify transaction dates and are correct); the numeric year navigation on company accounts stays (it just gains the notice).

## Section 2 — Configured-year source of truth (`src/lib/tax/taxYear.ts`)

Add (leave the existing `getTaxYear`/`taxYearRange` exactly as-is):
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
This is the single place to extend each April; the per-engine `LATEST_YEAR` fallbacks remain as a safety net but should no longer be hit through the UI.

## Section 3 — Personal tools

For `dashboard/page.tsx`, `sa105/page.tsx`, `planner/page.tsx`, `extraction/page.tsx`, and `export/sa105.pdf/route.ts`:
- **Default year:** replace `?? getTaxYear(new Date())` (and the equivalent in planner/extraction) with `?? latestConfiguredTaxYear()`. The `?ty=` value is still honoured when present and format-valid.
- **Year pickers / nav:** build option lists from `taxYearOptions()` instead of the calendar-derived `[startYear-2 … startYear+1]`. The dashboard's and SA105's `YearNav`/prev-next controls likewise restrict to configured years (with only one configured year, no prev/next targets are offered — render just the current-year pill; when the list grows, prev/next appear between configured years).
- **Unconfigured-year notice:** when the resolved `taxYear` is not `isConfiguredTaxYear`, render `<Banner variant="info">Tax estimate uses {latestConfiguredTaxYear()} rates — {taxYear} isn't configured yet.</Banner>` beneath the header. The page still renders (income/expense sums are correct); only the tax estimate uses fallback rates, now disclosed. The PDF route needs no banner (it just defaults correctly).

Implementation detail for the nav: prefer a small `taxYearOptions()`-driven `<select>` (auto-submitting or plain GET) or, where a `YearNav` prev/next is used, pass it the configured-year neighbours; with a single configured year both prev/next are absent. Keep each page's existing layout/design-system styling.

## Section 4 — Company accounts

- `src/lib/data/companyAccounts.ts` — `getCompanyAccounts` currently calls `corporationTax(profitPence)` (defaulting to the latest CT year). Change it to derive `const ctYear = getTaxYear(period.end)` and call `corporationTax(profitPence, ctYear)`, and add to the returned object `ctYear: string` and `ctYearConfigured: boolean` (via `isConfiguredTaxYear(ctYear)`). Because only 2025-26 is configured, an unconfigured `ctYear` still falls back to 2025-26 rates inside `corporationTax`, so **all existing CT figures are unchanged** — the change only surfaces *which* year was used and whether it's configured.
- `companies/[id]/accounts/page.tsx` — when `!accounts.ctYearConfigured`, show `<Banner variant="info">Corporation tax uses {latestConfiguredTaxYear()} rates — the rates for this period ({accounts.ctYear}) aren't configured yet.</Banner>`.

## Section 5 — Testing

- **Unit (`taxYear.test.ts`):** `latestConfiguredTaxYear()` → `"2025-26"`; `isConfiguredTaxYear("2025-26")` true, `isConfiguredTaxYear("2026-27")` false; `taxYearOptions()` → `["2025-26"]`.
- **Integration (`companyAccounts.test.ts`):** a company period whose end is in 2025-26 → `ctYear "2025-26"`, `ctYearConfigured true`; a period ending in a later year → `ctYearConfigured false` with the CT figures unchanged from the fallback (assert the same `corporationTaxPence` as before). Existing companyAccounts/companyReserves assertions must still pass unchanged.
- **Full suite:** stays green — no rate output changes.
- **Flow (build + live-run):** open `/dashboard` (and `/planner`, `/extraction`, `/sa105`) with no `?ty` → defaults to **2025-26**, picker shows only 2025-26, no notice; then hand-type `?ty=2026-27` → the info Banner appears and the page still renders. Open a company accounts page whose period is beyond 2025-26 → the CT-rates notice appears.

## Risks & caveats

- **Behaviour change is intentional and small:** the visible change is the default year moving from 2026-27 to 2025-26 and pickers narrowing to configured years — which is also better UX (2025-26 is the live Self-Assessment year). No rate maths changes.
- **`getTaxYear` still used for date classification** (grouping transactions/dividends into their tax year, and now deriving the company CT year) — unchanged and correct; only the *rate-year defaults/pickers* move to the configured list.
- **Company accounts CT-year approximation:** using `getTaxYear(period.end)` (6-Apr boundary) to pick the CT financial year (1-Apr boundary) can differ only for period ends on 1–5 April; immaterial for rate selection while a single year is configured, and it never changes a configured-year result. Documented.
- **The per-engine `LATEST_YEAR` fallbacks stay** as defence in depth for any non-UI caller; the UI simply no longer routes unconfigured years to them without disclosure.
- **Single source of truth:** adding a future year is a one-line change to `CONFIGURED_TAX_YEARS` plus that year's config in each engine — the pickers, defaults, and notices all update from it.
