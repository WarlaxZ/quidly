# Property-Income Rates + Tax Year 2027-28 — Design Spec

**Date:** 2026-07-01
**Status:** Approved (design); ready for implementation planning
**Phase:** 5 (rate maintenance) — introduces property-specific income-tax rates

## Problem & context

From **6 April 2027 (tax year 2027-28)** the UK taxes **property income at its own rates** —
England/Wales/NI: **22% / 42% / 47%** (the ordinary non-savings rates **+2 percentage points**),
same frozen thresholds. The Section-24 finance-cost reducer for E/W/NI rises to the property basic
rate (**22%**). (Finance Act 2026; gov.uk technical note "Change to tax rates for property, savings
and dividend income".)

Quidly currently taxes property profit at ordinary rates via `estimatePropertyTax`, which computes a
marginal difference (`incomeTaxOn(other+property) − incomeTaxOn(other)`) using a single band set, and
a hardcoded 20% `financeCostReducer`. This spec introduces property-specific rates and configures
2027-28.

**Decisions from brainstorming (user-approved):**
- **Expose 2027-28 now.** England/Wales/NI is fully knowable and accurate; add it as a selectable year.
- **Scotland is provisional.** A Scottish landlord's property income stays on Scottish NSND rates
  (19–48%, **no +2pp surcharge** — Holyrood has a *power* to add one from 2027-28 but hasn't), and
  Scottish 2027-28 bands aren't set until the post-May-2026 Scottish Budget. So Scotland 2027-28
  reuses the 2026-27 Scottish rates, flagged **provisional** with a banner.
- **CT / NIC / director's-loan** use the standing regime for 2027-28 (thresholds frozen through
  2030-31; rates carried forward from 2026-27).
- **Dividends unchanged** (10.75 / 35.75 / 39.35, £500 — confirmed for 2027-28).

**Constraint:** the mechanism must be **regression-safe** — for every existing year/region the
property surcharge is 0, so results are byte-for-byte identical and the 207 tests stay green. Money =
integer pence, rates = integer basis points.

## Section 1 — Scope

**In (`src/lib/tax/`):**
- `bands.ts`: two optional fields on `TaxBands` — `propertyRateSurchargeBps?` (default 0) and
  `provisional?` (default false); helpers `propertySurchargeBps(year, region)` and
  `isProvisionalTaxYear(year, region)`.
- `incomeTax.ts`: `estimatePropertyTax` adds the property surcharge to its existing (unchanged)
  marginal computation.
- `profit.ts`: `financeCostReducer` takes a `reducerRateBps` parameter (default 2000).
- Add 2027-28 configs: `bands.ts` (E/W/NI + Scotland), `dividendTax.ts`, `corporationTax.ts`,
  `nic.ts`, `directorLoan.ts`; add `"2027-28"` to `CONFIGURED_TAX_YEARS`.
- Callers (`summary.ts`, `scenario.ts`) compute the reducer rate as `2000 + surcharge`.

**In (UI):** a provisional banner (dashboard, planner, SA105) when the effective region is Scotland
and the year is provisional; make the planner's "20% Section-24 relief" note dynamic.

**Out:** the savings-income rate change (22/42/47 on savings — the app doesn't track savings income);
a Scottish property surcharge (undecided by Holyrood); property *threshold* changes (none — bands are
frozen); 2028-29/2029-30 (mechanism supports them, but out of scope now); modelling the official rate
of interest's quarterly review.

## Section 2 — Mechanism

**`TaxBands` (bands.ts)** gains two optional fields:
```ts
export interface TaxBands {
  // …existing…
  /** Property income is taxed at ordinary rate + this surcharge (basis points). Default 0.
   *  Also raises the Section-24 reducer to (basic rate + surcharge). E/W/NI 2027-28 = 200. */
  propertyRateSurchargeBps?: number;
  /** True when this year/region's rates are placeholders pending official confirmation. */
  provisional?: boolean;
}
```
Helpers:
```ts
export function propertySurchargeBps(taxYear: string, region: Region): number  // getBands(...).propertyRateSurchargeBps ?? 0
export function isProvisionalTaxYear(taxYear: string, region: Region): boolean  // getBands(...).provisional ?? false
```

**`estimatePropertyTax` (incomeTax.ts).** Because the +2pp is uniform across every property band
(22=20+2, 42=40+2, 47=45+2) *including* the top rate, the surcharge tax is a flat
`surcharge × taxable-property-amount`. The existing marginal computation is kept verbatim (so
ordinary-rate behaviour, including the personal-allowance-taper interaction, is unchanged), and the
surcharge is added:
```
base       = incomeTaxOn(other+property) − incomeTaxOn(other)     // UNCHANGED
pa         = effectivePersonalAllowance(other+property, bands)
totalTax   = max(0, other+property − pa)
otherTax   = max(0, other − pa)
taxableProperty = max(0, totalTax − otherTax)                     // property amount actually taxed
surchargeTax    = round(taxableProperty × surchargeBps / 10000)
gross      = base + surchargeTax
taxOnPropertyPence = max(0, gross − financeReducerPence)
marginalRate       = property > 0 ? gross / property : 0
```
With `surchargeBps = 0` this is identical to the current function (surchargeTax = 0). For E/W/NI
2027-28 (`surchargeBps = 200`) it adds 2pp on the taxable property income and the marginal rate
reflects property rates.

**`financeCostReducer` (profit.ts):** signature becomes
`financeCostReducer(financeCostsPence, profitPence, reducerRateBps = 2000)`; body uses `reducerRateBps`
instead of the literal 2000. Default preserves all existing callers/tests. `summary.ts` and
`scenario.ts` pass `2000 + propertySurchargeBps(taxYear, region)` → 2200 for E/W/NI 2027-28, 2000
otherwise (Scotland surcharge is 0, so its reducer correctly stays at the UK basic rate 20%).

## Section 3 — 2027-28 configuration

- **`CONFIGURED_TAX_YEARS`** → `["2025-26", "2026-27", "2027-28"]`.
- **E/W/NI bands 2027-28** (`ENGLAND_WALES_NI_2027_28`): identical to 2026-27 (PA £12,570, basic band
  £37,700 @20%, higher @40% to £125,140, top 45%) **plus `propertyRateSurchargeBps: 200`**. Bump
  `bands.ts` `LATEST_YEAR` to `"2027-28"`.
- **Scotland bands 2027-28** (`SCOTLAND_2027_28`): copy of `SCOTLAND_2026_27` (starter 19%→£16,537,
  basic 20%→£29,526, intermediate 21%→£43,662, higher 42%, advanced 45%, top 48%) **plus
  `provisional: true`** (no surcharge — surcharge omitted/0).
- **Dividend 2027-28** (`DIVIDEND_2027_28`): identical to 2026-27 (ordinary 1075, upper 3575,
  additional 3935, allowance 500_00). Bump its `LATEST_YEAR`.
- **Corporation tax 2027-28** (`CT_2027_28`): identical to 2026-27 (standing regime). Bump
  `LATEST_CT_YEAR`.
- **NIC 2027-28** (`NIC_2027_28`): identical to 2026-27 (standing/frozen). Bump `LATEST_YEAR`.
- **Director's loan 2027-28** (`DLA_2027_28`): s455 3575, class1a 1500, threshold 10_000_00,
  officialRateBps 375 (carried forward — 2027-28 ORI unpublished; existing per-year "VERIFY" caveat
  covers it). Bump `LATEST_YEAR`.

## Section 4 — UI

- **Provisional banner** (dashboard, planner, SA105): when `isProvisionalTaxYear(taxYear, region)`,
  show `Banner variant="info"`: *"Scottish 2027-28 rates aren't set yet — figures use the latest
  known Scottish rates provisionally. Verify when the Scottish Budget confirms them."* This is
  additional to (not replacing) the existing `!isConfiguredTaxYear` banner. Region source: dashboard &
  planner have an explicit region; SA105 uses the summary's region.
- **Dynamic Section-24 note** (`scenario.ts`): the `personal-actual` note "…20% Section-24 relief…"
  becomes the actual reducer percentage for the year/region (22% for E/W/NI 2027-28, else 20%).

## Section 5 — Testing & verification

- **Regression (must stay identical):** the full 207 existing tests pass unchanged (surcharge 0
  everywhere pre-2027-28). Add explicit parity assertions that `estimatePropertyTax` for 2025-26 /
  2026-27 is unchanged.
- **New unit tests:**
  - E/W/NI 2027-28: a higher-rate landlord's property tax computed at 42% (with worked pence), and a
    basic-rate case at 22%; the Section-24 reducer applied at 22% (worked example).
  - Scotland 2027-28: property tax uses Scottish rates with **no** surcharge (equal to a 2026-27
    Scottish computation), reducer at 20%, and `isProvisionalTaxYear("2027-28","scotland") === true`.
  - `propertySurchargeBps`: 200 for E/W/NI 2027-28, 0 for E/W/NI 2026-27 and Scotland 2027-28.
  - `taxYear.test.ts`: `latestConfiguredTaxYear()` → "2027-28"; options `["2027-28","2026-27","2025-26"]`.
  - dividend/CT/NIC 2027-28 parity with 2026-27.
- **tsc:** 0. **Live-run:** dashboard/planner at 2027-28, region E/W/NI → property tax visibly higher
  than 2026-27 for the same figures (≈ +2pp), no provisional banner; switch region to Scotland →
  provisional banner shows and the figure matches the Scottish rates (no +2pp); 2025-26/2026-27
  unaffected.

## Risks & caveats

- **Regression safety is the top risk.** The surcharge is purely additive on top of the existing,
  tested marginal computation; surcharge 0 ⇒ zero change. Guard with parity tests and by NOT altering
  the existing marginal/`incomeTaxOn` code paths.
- **Scotland provisional:** reusing 2026-27 Scottish rates for 2027-28 is a placeholder — the banner
  makes this explicit. If Holyrood later adds a property surcharge, it's a one-field change
  (`propertyRateSurchargeBps` on the Scottish config) plus removing `provisional`.
- **Standing-regime CT/NIC/ORI:** carried forward from 2026-27; thresholds are frozen through
  2030-31, rates set nearer the time — re-verify at the Autumn 2026 Budget. The director's-loan ORI is
  a known unknown (now reviewed quarterly).
- **Property-income ordering:** the app models the taxpayer's property profit stacked on "other
  income"; savings/dividend interactions beyond the existing dividend engine are out of scope.
