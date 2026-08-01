# Mortgage & Loan Tracking — Design

**Date:** 2026-07-28
**Status:** Approved (brainstorming)

## Goal

Model a landlord's mortgage as a first-class **Loan**, so that each payment is recorded in
the ledger as its correct two parts — deductible **interest** (SA105 box 44) and
non-deductible **capital repayment** — instead of one lump the user has to split by hand.

The bug this prevents: a landlord with a single £750/month direct debit against a £71k
interest-only mortgage at 2.7% has only **~£160/month** of deductible interest. The other
~£590 is capital repayment and attracts no relief at all. Nothing in Quidly today stops
that whole £750 being filed in box 44 — a ~£7,000/year overclaim on one property.

Quidly already has every tax primitive needed:

- `Mortgage / loan interest` category — kind `finance`, SA105 box 44 (`prisma/seed.ts:27`)
- `Capital improvements` category — kind `capital`, `allowable: false` (`prisma/seed.ts:28`)
- `financeCostReducer(financeCostsPence, profitPence, reducerRateBps)` (`src/lib/tax/profit.ts:50`)
- `propertySurchargeBps(taxYear, region)` feeding `buildTaxYearSummary` (`src/lib/tax/summary.ts:37`),
  so the 2027/28 move of the Section 24 reducer from 20% to 22% is **already wired**

So this adds **no new tax rate logic**. It adds the bookkeeping structure that makes the
existing engine receive correct inputs, plus three factual advisory readouts.

## Non-goals (YAGNI)

- **No rate-history table.** `LoanPayment` snapshots `computedInterestPence`, so editing
  `Loan.annualRateBps` affects only future payments; past ones keep their recorded figure.
  Retrospective corrections use the `actualInterestPence` override.
- **No capital-account / BIM45700 headroom.** HMRC rewrote BIM45690/BIM45700 on 2026-07-01
  and the new, more restrictive reading is actively contested by practitioners. Shipping a
  headroom figure based on unsettled guidance would be irresponsible.
- **No overpayment-vs-alternatives comparison.** Comparing mortgage overpayment against
  pension or ISA returns needs assumptions about the user's marginal rate and expected
  returns, and edges into regulated investment advice. Quidly's disclaimer covers tax
  estimates, not that. Deferred.
- **No repayment-pot tracking** for interest-only loans. v1 states the balance outstanding
  at term end; it does not net off a savings pot. (v2 field.)
- **No portfolio loans** spanning multiple properties. One loan belongs to one property; a
  property may have several loans.
- **No amortisation solver.** The payment amount is known, so interest and capital are
  derived from it directly. `kind` drives only the term-end warning.

## Data model (`prisma/schema.prisma`)

```prisma
enum LoanKind { interestOnly repayment }

model Loan {
  id                    String   @id @default(cuid())
  propertyId            String
  property              Property @relation(fields: [propertyId], references: [id])
  name                  String            // "Santander BTL"
  kind                  LoanKind
  openingBalancePence   Int               // balance as at startDate
  annualRateBps         Int               // 2.7% -> 270
  scheduledPaymentPence Int               // what leaves the bank, e.g. 75000
  // schedule fields mirror OccurrenceRule so they feed recurringOccurrences() directly
  intervalUnit          IntervalUnit @default(MONTH)
  intervalCount         Int          @default(1)
  dayOfWeek             Int?
  dayOfMonth            Int?
  monthOfYear           Int?
  startDate             DateTime
  termEndDate           DateTime?         // drives the interest-only warning
  active                Boolean  @default(true)
  lastGeneratedDate     DateTime?
  payments              LoanPayment[]
  createdAt             DateTime @default(now())
}

model LoanPayment {
  id                    String   @id @default(cuid())
  loanId                String
  loan                  Loan     @relation(fields: [loanId], references: [id])
  date                  DateTime
  openingBalancePence   Int               // snapshot
  computedInterestPence Int               // snapshot at generation
  actualInterestPence   Int?              // override from lender statement
  paidPence             Int               // what actually left the bank
  createdAt             DateTime @default(now())

  transactions          Transaction[]

  @@unique([loanId, date])                // idempotent generation
}
```

`Transaction` gains, mirroring the existing `recurringId` pattern (`schema.prisma:101`):

```prisma
  loanPaymentId String?
  loanPayment   LoanPayment? @relation(fields: [loanPaymentId], references: [id])
```

The role of each line (interest vs capital) is derived from `category.kind` — consistent
with how the rest of the app already dispatches on `CategoryKind`, and one FK instead of
two typed pointers.

Migration is **hand-authored SQL** under `prisma/migrations/<timestamp>_add_loans/migration.sql`
and applied with `migrate deploy` (Prisma v7; see README). Use a unique timestamp to avoid
ordering collisions with concurrent branches.

## New seed category (`prisma/seed.ts`)

```ts
{ name: "Loan capital repayment", kind: "capital", sa105Box: null, allowable: false },
```

Reusing `Capital improvements` for loan principal would be semantically wrong and would
corrupt any future enhancement-expenditure (TCGA s.38) reporting for CGT, where genuine
improvement spend is deductible against the gain but principal repayment is not.

## Pure schedule logic (`src/lib/loans/schedule.ts` — tested)

```ts
export interface LoanTerms {
  kind: "interestOnly" | "repayment";
  annualRateBps: number;
  scheduledPaymentPence: number;
}

export interface DerivedPayment {
  openingBalancePence: number;
  computedInterestPence: number;
  interestPence: number;   // actual ?? computed
  capitalPence: number;
  closingBalancePence: number;
  fullyRedeemed: boolean;
}

/** Interest accrued over `daysInPeriod` on `openingBalancePence`. Integer pence. */
export function computeInterestPence(
  openingBalancePence: number, annualRateBps: number, daysInPeriod: number,
): number;

/** Split one payment into interest + capital. Throws on negative capital (see below). */
export function derivePayment(
  terms: LoanTerms,
  openingBalancePence: number,
  daysInPeriod: number,
  paidPence: number,
  actualInterestPence?: number | null,
): DerivedPayment;
```

The maths, one formula for both loan kinds:

```
computedInterest = round(openingBalance × annualRateBps / 10000 × daysInPeriod / 365)
interest         = actualInterestPence ?? computedInterest
capital          = paidPence − interest
closingBalance   = openingBalance − capital
```

Daily accrual (`daysInPeriod / 365`) rather than `rate / 12`, because that is what lenders
actually do and it makes February correct. `daysInPeriod` is the gap from the previous
scheduled occurrence (or `startDate` for the first payment).

All arithmetic in integer pence via the existing `src/lib/tax/money.ts` helpers — no floats
in the money path, per the README's guarantee.

**Guards:**

- `interest > paidPence` (negative capital) → throw. Surfaced in the UI as "the interest
  for this period exceeds the payment — record this as an arrears/shortfall period or
  correct the rate." Not silently clamped, because silently absorbing it would misstate
  box 44.
- `capital > openingBalance` → clamp `capital` to `openingBalance`, set
  `closingBalancePence: 0` and `fullyRedeemed: true`; the caller marks the loan inactive.
- `openingBalancePence === 0` → interest is 0; no payments generated.

## Advisory logic (`src/lib/loans/advice.ts` — tested, pure)

```ts
export interface LoanAdvice {
  nominalRateBps: number;
  reducerBps: number | null;          // null for company-owned (full deduction instead)
  effectiveRateBps: number;
  reliefBasis: "section24Reducer" | "fullDeduction";
  capitalNoReliefPence: number;       // this tax year's capital lines
  termEnd: { date: Date; balanceDuePence: number } | null;
}
```

1. **Effective cost of debt.** `effectiveRateBps = round(nominalRateBps × (1 − reducerBps / 10000))`,
   with `reducerBps = 2000 + propertySurchargeBps(taxYear, region)` — so it self-updates to
   22% for 2027/28 with no code change. For a 2.7% loan: **2.16%** in 2026/27, **2.11%** from
   2027/28.
2. **Capital overpayment callout.** Sums the tax year's capital lines for the loan: "£7,080
   of payments attracted no tax relief — capital repayment is not deductible."
3. **Interest-only term-end warning.** When `kind === "interestOnly"` and `termEndDate` is
   set, projects the balance outstanding at term end and states it with the date.

Branches on `property.ownershipType` (which already exists, `schema.prisma:53`): company-owned
properties deduct interest **in full** against profits rather than via the Section 24
reducer, and are reported through `src/lib/data/companyAccounts.ts`, not
`buildTaxYearSummary`. `reliefBasis` makes that explicit rather than showing a wrong figure.

All three outputs are arithmetic on data Quidly already holds, and none recommends a course
of action — which keeps them the right side of the tax-estimate/investment-advice line.

## Data layer (`src/lib/data/loans.ts`)

```ts
export function listLoans(propertyId: string): Promise<LoanRow[]>;
export function getLoan(id: string): Promise<LoanDetail | null>;

/** Generate LoanPayments + their transaction pairs up to `asOf`. Idempotent. */
export function generateLoanPayments(loanId: string, asOf: Date): Promise<number>;

/** Override one payment's interest from a lender statement; re-derives capital and rewrites both txns. */
export function setActualInterest(paymentId: string, actualInterestPence: number): Promise<void>;

/** Year-end reconcile: total interest recorded for the tax year. */
export function reconcileYear(loanId: string, taxYear: string): Promise<{
  recordedInterestPence: number; paymentCount: number; lastPaymentId: string | null;
}>;

/** Apply a whole-year variance by adjusting the year's final payment's actual interest. */
export function applyYearVariance(loanId: string, taxYear: string, statementInterestPence: number): Promise<void>;
```

The lender's statement figure is **not persisted** in v1. The reconcile page takes it as
input, displays the variance against `recordedInterestPence`, and offers one action —
`applyYearVariance`, which sets `actualInterestPence` on the year's final payment so the
annual total matches the statement exactly. That makes the variance actionable without a new
field, and box 44 ends up on the lender's number, which is the figure HMRC would check
against.

`generateLoanPayments` builds an `OccurrenceRule` from the loan's schedule fields and calls
the existing `recurringOccurrences()` (`src/lib/recurring/occurrences.ts:49`) — it takes a
structural type, not the Prisma model, so this is direct reuse with no refactoring. Per
occurrence it writes the `LoanPayment` and its transactions in a single transaction, then
advances `lastGeneratedDate`. A £0 capital line is **skipped** rather than written (a pure
interest-only payment with no overpayment produces one transaction, not two).

Idempotency rests on `@@unique([loanId, date])`, exactly as `@@unique([recurringId, date])`
does for recurring rules.

## CSV import (`src/lib/import/bankImport.ts`)

A matcher flags an imported debit as a probable loan payment when **both** hold against an
active loan on the imported row's property:

- amount within `max(500 pence, 2% of scheduledPaymentPence)` of `scheduledPaymentPence`
- date within **5 days** of a scheduled occurrence with no `LoanPayment` already recorded

The generous amount tolerance accommodates varying voluntary overpayments; the matched row's
**actual** amount is used as `paidPence`, not the scheduled figure. The existing review step
then offers "this looks like your loan payment — split it £160/£590?" instead of a plain
category.

Deliberately a **suggestion, never automatic**: a mis-split silently lands in box 44, which
is precisely the failure this feature exists to prevent.

## Routing & UI (`src/app/(app)/loans/`)

- **`/loans`** — list for the active property: name, kind, current balance, rate, effective
  rate, next payment due. Empty state explaining why splitting matters.
- **`/loans/new`**, **`/loans/[id]/edit`** — loan form (schedule fields reuse the
  `RecurringForm` interval controls' patterns).
- **`/loans/[id]`** — detail: the three advisory readouts, the payment schedule table
  (date · opening balance · interest · capital · closing balance), and per-payment override.
- **`/loans/[id]/reconcile?ty=YYYY-YY`** — year-end: recorded interest total vs a field for
  the lender's annual statement figure, with the variance and a link to each payment.

Nav entry added to `SideNav.tsx` and `MobileNav.tsx`. Auth-gated like every `(app)` route.
`?ok=` / `?error=` banners follow the existing action-result convention.

## Error handling

- Negative capital → action fails with the guard's message; nothing written.
- Full redemption → loan set `active: false`; further generation is a no-op.
- Invalid `taxYear` → existing `^\d{4}-\d{2}$` guard.
- Deleting a loan: refuse while it has generated payments; require deleting or detaching
  those first, so transactions are never silently orphaned.
- Deleting a loan-generated transaction directly: blocked with a message pointing at the
  loan, mirroring how loan payments must stay paired.

## Testing

Colocated Vitest, following the existing convention.

- **`src/lib/loans/schedule.test.ts`** — February vs 31-day accrual; day-31 clamping in
  short months; rate change mid-loan (past payments unchanged); voluntary overpayment;
  full-redemption clamping; negative-capital rejection; interest-only with zero capital;
  zero opening balance.
- **`src/lib/loans/advice.test.ts`** — effective rate for 2026/27 (2.16%) vs 2027/28
  (2.11%); Scotland; company ownership takes `fullDeduction`; term-end shortfall present
  and absent.
- **`src/lib/data/loans.test.ts`** — generation idempotency (re-run writes nothing);
  transaction pairing and category kinds; £0 capital line skipped; `setActualInterest`
  rewrites both transactions consistently.
- **Regression, written first** — a £750/month interest-only loan at 2.7% on £71k must put
  **only** the interest in SA105 box 44 and leave `computeProfit().profitPence` untouched by
  the capital lines. This test encodes the actual bug the feature exists to prevent.
- Existing `summary.test.ts` and `profit.test.ts` must pass **unchanged** — that is the
  signal the tax engine was not disturbed.

Full suite plus `tsc` green, and a live run (create the loan, generate a year, reconcile,
check the SA105 page) before completion.

## Implementation phasing

The work is cohesive enough for one plan, but should land in this order so the tax-critical
part is proven before any UI exists:

1. **Schema + seed + pure logic** — migration, `Loan`/`LoanPayment`, the new category,
   `schedule.ts`, and the box-44 regression test. Ends with the overclaim provably impossible
   at the engine level.
2. **Data layer** — `loans.ts`: generation, override, reconcile, idempotency tests.
3. **UI** — list, form, detail, reconcile pages, nav.
4. **Advice + import matcher** — `advice.ts` readouts and the CSV suggestion.

## File structure

```
prisma/schema.prisma                              # + Loan, LoanPayment, LoanKind; Transaction.loanPaymentId
prisma/migrations/<ts>_add_loans/migration.sql    # hand-authored SQL
prisma/seed.ts                                    # + "Loan capital repayment" category
src/lib/loans/schedule.ts                         # pure split maths              [tested]
src/lib/loans/schedule.test.ts
src/lib/loans/advice.ts                           # pure advisory readouts        [tested]
src/lib/loans/advice.test.ts
src/lib/data/loans.ts                             # list/get/generate/override/reconcile
src/lib/data/loans.test.ts
src/lib/import/bankImport.ts                      # + loan-payment matcher
src/app/(app)/loans/page.tsx                      # list
src/app/(app)/loans/actions.ts                    # create/edit/delete/generate/override
src/app/(app)/loans/LoanForm.tsx
src/app/(app)/loans/new/page.tsx
src/app/(app)/loans/[id]/page.tsx                 # detail + schedule + advice
src/app/(app)/loans/[id]/edit/page.tsx
src/app/(app)/loans/[id]/reconcile/page.tsx       # year-end statement reconcile
src/app/(app)/_ui/SideNav.tsx                     # + nav entry
src/app/(app)/_ui/MobileNav.tsx                   # + nav entry
README.md                                         # + feature bullet
```

## Tax references

- SA105 box 44 / Section 24 finance-cost reducer — ITTOIA 2005 ss.272A, 274A
- Capital expenditure not deductible against property income — HMRC PIM3010
- Enhancement expenditure deductible against a gain (not principal) — TCGA 1992 s.38
- Property income rates 22/42/47 and the reducer at 22% from 2027-04-06 — Finance Act 2026

Quidly produces **estimates, not advice**; these readouts are arithmetic, not
recommendations.
