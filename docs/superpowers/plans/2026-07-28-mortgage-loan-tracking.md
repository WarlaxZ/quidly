# Mortgage & Loan Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Model a landlord's mortgage as a first-class `Loan` so every payment is recorded as its two correct parts — deductible interest (SA105 box 44) and non-deductible capital repayment — instead of one lump the user must split by hand.

**Architecture:** A `Loan` holds the terms and a schedule that mirrors `OccurrenceRule`, so the existing `recurringOccurrences()` generates payment dates with zero refactoring. Each generated `LoanPayment` writes up to two `Transaction` rows (one `finance`/box 44, one `capital`/not allowable), tagged with `loanPaymentId` exactly as recurring rules use `recurringId`. The tax engine is untouched — it already sums by `categoryKind`.

**Tech Stack:** Next.js 16 App Router (server components + server actions) · Prisma v7 + SQLite (hand-authored SQL migrations, `migrate deploy`) · Tailwind v4 · Vitest.

**Spec:** `docs/superpowers/specs/2026-07-28-mortgage-loan-tracking-design.md`

---

## AMENDMENT — `derivePayment` takes an options object

Raised in review of Tasks 3-4 and applied before Task 7. The original signature was
positional: `derivePayment({ terms: terms, openingBalancePence: openingBalancePence, daysInPeriod: daysInPeriod, paidPence: paidPence, actualInterestPence: actualInterestPence? })`
— three adjacent `number` parameters, two of them pence of similar magnitude. TypeScript
cannot catch a transposition between same-typed positional arguments, and Task 7 calls this
in a loop. The failure mode is a silently wrong SA105 figure, which is the exact class of bug
this feature exists to prevent.

The signature is now:

```ts
export interface PaymentInput {
  terms: LoanTerms;
  openingBalancePence: number;
  /** Days since the previous payment date, or since the loan's startDate for the first. */
  daysInPeriod: number;
  /** The amount that ACTUALLY left the bank this period — not `terms.scheduledPaymentPence`,
   *  which is schedule metadata and may differ when the landlord overpays. */
  paidPence: number;
  /** The lender's real figure, when reconciling against a statement. */
  actualInterestPence?: number | null;
}

export function derivePayment(input: PaymentInput): DerivedPayment;
```

Two related changes landed with it:

- **`LoanKind` moved to `src/lib/tax/types.ts`**, next to the existing hand-rolled
  `CategoryKind`, so "where do domain-kind unions live" has one answer. `schedule.ts` imports
  it. (Prisma also generates a `LoanKind` enum; the hand-rolled union is the pure-function
  layer's copy, mirroring the established `CategoryKind` arrangement.)
- **Thrown messages carry no pence values.** Server actions in this repo surface caught
  `Error.message` straight to the user via `?error=`, so a message reading `"Interest of
  16281p exceeds the payment of 75000p"` would show a landlord `16281p` rather than `£162.81`.
  Messages are now pence-free; formatting stays out of the calculation module.

All call sites below reflect the amended signature.

---

## File structure

```
prisma/schema.prisma                                    # + Loan, LoanPayment, LoanKind; Transaction.loanPaymentId
prisma/migrations/20260728120000_add_loans/migration.sql
prisma/seed.ts                                          # + "Loan capital repayment" category
src/lib/loans/schedule.ts                               # pure split maths                    [tested]
src/lib/loans/schedule.test.ts
src/lib/loans/advice.ts                                 # pure advisory readouts              [tested]
src/lib/loans/advice.test.ts
src/lib/loans/categories.ts                             # shared category-name constants
src/lib/data/loans.ts                                   # list/get/generate/override/reconcile
src/lib/data/loans.test.ts
src/lib/import/loanMatch.ts                             # pure CSV matcher                    [tested]
src/lib/import/loanMatch.test.ts
src/app/(app)/loans/page.tsx                            # list
src/app/(app)/loans/actions.ts                          # server actions
src/app/(app)/loans/LoanForm.tsx                        # create/edit form
src/app/(app)/loans/new/page.tsx
src/app/(app)/loans/[id]/page.tsx                       # detail: advice + schedule + override
src/app/(app)/loans/[id]/edit/page.tsx
src/app/(app)/loans/[id]/reconcile/page.tsx             # year-end statement reconcile
src/app/(app)/layout.tsx                                # + nav entry
README.md                                               # + feature bullet
```

**Two deviations from the spec, both deliberate — call them out in the final handoff:**

1. `LoanPayment` gains `closingBalancePence`. The spec derived it. Storing it makes the next payment's opening balance a single field read instead of a recomputation, and makes the schedule table trivial to render. Denormalised but written in the same transaction that computes it.
2. `src/lib/loans/categories.ts` holds the two category-name constants, so the data layer and the seed cannot drift apart on a string literal.

---

## Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260728120000_add_loans/migration.sql`

- [ ] **Step 1: Add the models to `prisma/schema.prisma`**

Append after the `DeductionDismissal` model:

```prisma
enum LoanKind {
  interestOnly
  repayment
}

model Loan {
  id                    String        @id @default(cuid())
  propertyId            String
  property              Property      @relation(fields: [propertyId], references: [id])
  name                  String
  kind                  LoanKind
  openingBalancePence   Int
  annualRateBps         Int
  scheduledPaymentPence Int
  intervalUnit          IntervalUnit  @default(MONTH)
  intervalCount         Int           @default(1)
  dayOfWeek             Int?
  dayOfMonth            Int?
  monthOfYear           Int?
  startDate             DateTime
  termEndDate           DateTime?
  active                Boolean       @default(true)
  lastGeneratedDate     DateTime?
  payments              LoanPayment[]
  createdAt             DateTime      @default(now())

  @@index([propertyId])
}

model LoanPayment {
  id                    String        @id @default(cuid())
  loanId                String
  loan                  Loan          @relation(fields: [loanId], references: [id])
  date                  DateTime
  openingBalancePence   Int
  computedInterestPence Int
  actualInterestPence   Int?
  paidPence             Int
  closingBalancePence   Int
  transactions          Transaction[]
  createdAt             DateTime      @default(now())

  @@unique([loanId, date])
}
```

- [ ] **Step 2: Add the back-relation on `Property` and the FK on `Transaction`**

In `model Property`, after the `recurringRules` line:

```prisma
  loans           Loan[]
```

In `model Transaction`, after the `recurring` relation line:

```prisma
  loanPaymentId String?
  loanPayment   LoanPayment? @relation(fields: [loanPaymentId], references: [id])
```

And add to `Transaction`'s index block, alongside the existing `@@index([propertyId, date])`:

```prisma
  @@index([loanPaymentId])
```

- [ ] **Step 3: Write the migration SQL**

Create `prisma/migrations/20260728120000_add_loans/migration.sql`:

```sql
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "openingBalancePence" INTEGER NOT NULL,
    "annualRateBps" INTEGER NOT NULL,
    "scheduledPaymentPence" INTEGER NOT NULL,
    "intervalUnit" TEXT NOT NULL DEFAULT 'MONTH',
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "monthOfYear" INTEGER,
    "startDate" DATETIME NOT NULL,
    "termEndDate" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Loan_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Loan_propertyId_idx" ON "Loan"("propertyId");

CREATE TABLE "LoanPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loanId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "openingBalancePence" INTEGER NOT NULL,
    "computedInterestPence" INTEGER NOT NULL,
    "actualInterestPence" INTEGER,
    "paidPence" INTEGER NOT NULL,
    "closingBalancePence" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoanPayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LoanPayment_loanId_date_key" ON "LoanPayment"("loanId", "date");

ALTER TABLE "Transaction" ADD COLUMN "loanPaymentId" TEXT REFERENCES "LoanPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Transaction_loanPaymentId_idx" ON "Transaction"("loanPaymentId");
```

- [ ] **Step 4: Apply the migration and regenerate the client**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: `Applying migration '20260728120000_add_loans'` then `Generated Prisma Client`.

Do **not** run `migrate dev` — this project hand-authors SQL (see README).

- [ ] **Step 5: Verify the schema compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260728120000_add_loans/migration.sql
git commit -m "feat(loans): add Loan and LoanPayment models"
```

---

## Task 2: Seed the capital repayment category

**Files:**
- Create: `src/lib/loans/categories.ts`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Create the shared constants**

`src/lib/loans/categories.ts`:

```ts
import type { CategoryKind } from "../tax/types";

/** The two categories the loan engine writes to.
 *
 *  Kept here so the seed, the data layer and the tests cannot drift apart on a string
 *  literal. The kinds matter as much as the names: `finance` is what routes interest into
 *  the Section 24 reducer and SA105 box 44, and `capital` (non-allowable) is what keeps
 *  principal repayment out of the profit computation entirely. A mismatch here would not
 *  fail the build — it would silently produce a wrong tax figure. */
export const INTEREST_CATEGORY_NAME = "Mortgage / loan interest";
export const INTEREST_CATEGORY_KIND: CategoryKind = "finance";

export const CAPITAL_CATEGORY_NAME = "Loan capital repayment";
export const CAPITAL_CATEGORY_KIND: CategoryKind = "capital";
```

- [ ] **Step 2: Add the category to the seed**

`prisma/seed.ts` must **import** the constants rather than repeat the literals, so seed-vs-
constant drift is impossible by construction rather than merely detected by a test. This is
viable: the seed runs via `npx tsx prisma/seed.ts` (see `prisma.config.ts`), `src/lib/tax/types.ts`
has no imports of its own, and `import type` is erased at compile time — so nothing
Next.js-specific is dragged into the script. `scripts/set-password.ts` and
`scripts/migrate-akaunting/report.ts` already import from `src/lib/` under `tsx`, so this is
an established pattern here.

Add the import at the top of `prisma/seed.ts`:

```ts
import {
  INTEREST_CATEGORY_NAME, INTEREST_CATEGORY_KIND,
  CAPITAL_CATEGORY_NAME, CAPITAL_CATEGORY_KIND,
} from "../src/lib/loans/categories";
```

Then replace the existing interest entry and add the capital entry beneath it:

```ts
  { name: INTEREST_CATEGORY_NAME, kind: INTEREST_CATEGORY_KIND, sa105Box: "44", allowable: true },
  { name: CAPITAL_CATEGORY_NAME, kind: CAPITAL_CATEGORY_KIND, sa105Box: null, allowable: false },
```

Do **not** reuse `Capital improvements` — that category is genuine enhancement expenditure
(deductible against a future capital gain under TCGA 1992 s.38), whereas loan principal
never is. Mixing them would corrupt any future CGT reporting.

Note there are two independent declarations of "category kind" in this repo: Prisma's
generated `CategoryKind` (which `CategorySeed.kind` is typed against) and the hand-rolled one
in `src/lib/tax/types.ts`. They are structurally identical string-literal unions so the
assignment typechecks, but that duplication is a latent drift risk of its own. Pre-existing
and out of scope — do not attempt to unify them here.

- [ ] **Step 3: Teach `resetDb` about the new tables**

`test/setup/resetDb.ts` deletes tables in foreign-key order between tests. Without this,
loan rows leak between test files. `Transaction` references `LoanPayment`, `LoanPayment`
references `Loan`, and `Loan` references `Property` with `ON DELETE RESTRICT` — so the two
new deletes must sit **after** `transaction` and **before** `property`:

```ts
import { prisma } from "../../src/lib/db";
export async function resetDb() {
  await prisma.loginAttempt.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.loanPayment.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.recurringRule.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.property.deleteMany();
  await prisma.companyLedgerEntry.deleteMany();
  await prisma.company.deleteMany();
  await prisma.taxYearProfile.deleteMany();
}
```

- [ ] **Step 4: Write a test that pins the seeded categories**

The whole feature's correctness rests on two category *names* resolving to the right
`CategoryKind`. A rename or a typo would not fail the build — it would silently mis-file
money and produce a wrong tax figure. Pin it.

`test.db` is created, migrated and seeded by `test/setup/globalSetup.ts`, so the seeded rows
are available to tests. Note Vitest's `include` is `src/**/*.test.ts` and
`scripts/**/*.test.ts` — a test cannot live under `prisma/`.

`src/lib/loans/categories.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "../db";
import {
  INTEREST_CATEGORY_NAME, CAPITAL_CATEGORY_NAME,
  INTEREST_CATEGORY_KIND, CAPITAL_CATEGORY_KIND,
} from "./categories";

describe("loan categories are seeded with the kinds the tax engine relies on", () => {
  it("files interest as a finance cost against SA105 box 44", async () => {
    const c = await prisma.category.findUnique({ where: { name: INTEREST_CATEGORY_NAME } });
    expect(c).not.toBeNull();
    expect(c!.kind).toBe(INTEREST_CATEGORY_KIND);
    expect(c!.kind).toBe("finance");
    expect(c!.sa105Box).toBe("44");
    expect(c!.allowable).toBe(true);
  });

  it("files capital repayment as non-allowable capital with no SA105 box", async () => {
    const c = await prisma.category.findUnique({ where: { name: CAPITAL_CATEGORY_NAME } });
    expect(c).not.toBeNull();
    expect(c!.kind).toBe(CAPITAL_CATEGORY_KIND);
    expect(c!.kind).toBe("capital");
    // A box here would leak capital repayment into the SA105 — the exact bug this feature prevents.
    expect(c!.sa105Box).toBeNull();
    expect(c!.allowable).toBe(false);
  });

  it("keeps capital repayment distinct from capital improvements", async () => {
    // Improvements are deductible against a future capital gain (TCGA 1992 s.38);
    // loan principal never is. They must not be the same category.
    expect(CAPITAL_CATEGORY_NAME).not.toBe("Capital improvements");
    const improvements = await prisma.category.findUnique({ where: { name: "Capital improvements" } });
    expect(improvements).not.toBeNull();
  });
});
```

- [ ] **Step 5: Run the seed and the test**

Run: `npx vitest run src/lib/loans/categories.test.ts`
Expected: PASS — 3 tests. (`globalSetup` seeds `test.db` automatically; you do not need to
seed manually for the test to pass.)

To seed a real dev database you would run `npx prisma db seed`, which prints
`Seeded 1 new categories (11 already existed).` — but only do that if a dev database and
`.env` already exist. Do not create one.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts src/lib/loans/categories.ts src/lib/loans/categories.test.ts test/setup/resetDb.ts
git commit -m "feat(loans): seed the Loan capital repayment category"
```

---

## Task 3: Interest accrual (pure)

**Files:**
- Create: `src/lib/loans/schedule.ts`
- Test: `src/lib/loans/schedule.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/loans/schedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeInterestPence, daysBetween } from "./schedule";

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween(new Date("2026-01-01T00:00:00Z"), new Date("2026-02-01T00:00:00Z"))).toBe(31);
  });
  it("is zero for the same day", () => {
    expect(daysBetween(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"))).toBe(0);
  });
});

describe("computeInterestPence", () => {
  // £71,000 at 2.7% => £1,917/yr. Over 31 days: 1917 * 31/365 = £162.81
  it("accrues daily over a 31-day period", () => {
    expect(computeInterestPence(7_100_000, 270, 31)).toBe(16_281);
  });

  // February is genuinely cheaper — this is why we don't use rate/12.
  it("accrues less over a 28-day period", () => {
    expect(computeInterestPence(7_100_000, 270, 28)).toBe(14_706);
  });

  it("returns zero for a zero balance", () => {
    expect(computeInterestPence(0, 270, 31)).toBe(0);
  });

  it("returns zero for a zero-day period", () => {
    expect(computeInterestPence(7_100_000, 270, 0)).toBe(0);
  });

  it("returns zero for a zero rate", () => {
    expect(computeInterestPence(7_100_000, 0, 31)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/loans/schedule.test.ts`
Expected: FAIL — `Failed to resolve import "./schedule"`.

- [ ] **Step 3: Write the implementation**

`src/lib/loans/schedule.ts`:

```ts
/** Loan payment splitting. All money is integer pence — never floats. */

const DAYS_PER_YEAR = 365;
const BPS_DIVISOR = 10_000;

/** Whole days from `from` to `to`. Both are treated as UTC instants. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Interest accrued on `openingBalancePence` over `daysInPeriod`.
 *
 * Daily accrual (days/365) rather than rate/12, because that is what lenders
 * actually do — and it makes February correctly cheaper than January.
 */
export function computeInterestPence(
  openingBalancePence: number,
  annualRateBps: number,
  daysInPeriod: number,
): number {
  if (openingBalancePence <= 0 || annualRateBps <= 0 || daysInPeriod <= 0) return 0;
  return Math.round(
    (openingBalancePence * annualRateBps * daysInPeriod) / (BPS_DIVISOR * DAYS_PER_YEAR),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/loans/schedule.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/loans/schedule.ts src/lib/loans/schedule.test.ts
git commit -m "feat(loans): daily interest accrual in integer pence"
```

---

## Task 4: Split a payment into interest and capital (pure)

**Files:**
- Modify: `src/lib/loans/schedule.ts`
- Test: `src/lib/loans/schedule.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/loans/schedule.test.ts`:

```ts
import { derivePayment, type LoanTerms } from "./schedule";

const INTEREST_ONLY: LoanTerms = { kind: "interestOnly", annualRateBps: 270, scheduledPaymentPence: 75_000 };

describe("derivePayment", () => {
  // The bug this whole feature exists to prevent: £750 paid, only ~£163 is deductible.
  it("splits a £750 payment on a £71k interest-only loan at 2.7%", () => {
    const d = derivePayment({ terms: INTEREST_ONLY, openingBalancePence: 7_100_000, daysInPeriod: 31, paidPence: 75_000 });
    expect(d.computedInterestPence).toBe(16_281);
    expect(d.interestPence).toBe(16_281);
    expect(d.capitalPence).toBe(58_719);      // £587.19 — no tax relief whatsoever
    expect(d.closingBalancePence).toBe(7_041_281);
    expect(d.fullyRedeemed).toBe(false);
  });

  it("keeps interest + capital equal to the amount paid", () => {
    const d = derivePayment({ terms: INTEREST_ONLY, openingBalancePence: 7_100_000, daysInPeriod: 31, paidPence: 75_000 });
    expect(d.interestPence + d.capitalPence).toBe(75_000);
  });

  it("uses the actual interest override in place of the computed figure", () => {
    const d = derivePayment({ terms: INTEREST_ONLY, openingBalancePence: 7_100_000, daysInPeriod: 31, paidPence: 75_000, actualInterestPence: 16_000 });
    expect(d.computedInterestPence).toBe(16_281);  // snapshot preserved
    expect(d.interestPence).toBe(16_000);
    expect(d.capitalPence).toBe(59_000);
  });

  it("treats a payment equal to the interest as pure interest, no capital", () => {
    const d = derivePayment({ terms: INTEREST_ONLY, openingBalancePence: 7_100_000, daysInPeriod: 31, paidPence: 16_281 });
    expect(d.capitalPence).toBe(0);
    expect(d.closingBalancePence).toBe(7_100_000);
  });

  it("clamps capital at the outstanding balance and flags full redemption", () => {
    const d = derivePayment({ terms: INTEREST_ONLY, openingBalancePence: 50_000, daysInPeriod: 31, paidPence: 75_000 });
    expect(d.capitalPence).toBe(50_000);
    expect(d.closingBalancePence).toBe(0);
    expect(d.fullyRedeemed).toBe(true);
  });

  it("flags full redemption when capital exactly clears the balance", () => {
    const interest = computeInterestPence(58_719, 270, 31);
    const d = derivePayment({ terms: INTEREST_ONLY, openingBalancePence: 58_719, daysInPeriod: 31, paidPence: 58_719 + interest });
    expect(d.closingBalancePence).toBe(0);
    expect(d.fullyRedeemed).toBe(true);
  });

  // Silently absorbing this would understate box 44's sibling — the capital line — and
  // overstate relief. Refuse instead.
  it("throws when interest exceeds the payment", () => {
    expect(() => derivePayment({ terms: INTEREST_ONLY, openingBalancePence: 7_100_000, daysInPeriod: 31, paidPence: 10_000 })).toThrow(/exceeds the payment/);
  });

  it("throws on a negative interest override", () => {
    expect(() => derivePayment({ terms: INTEREST_ONLY, openingBalancePence: 7_100_000, daysInPeriod: 31, paidPence: 75_000, actualInterestPence: -1 })).toThrow(/cannot be negative/);
  });

  it("accrues no interest over a zero-day first period", () => {
    const d = derivePayment({ terms: INTEREST_ONLY, openingBalancePence: 7_100_000, daysInPeriod: 0, paidPence: 75_000 });
    expect(d.interestPence).toBe(0);
    expect(d.capitalPence).toBe(75_000);
  });

  it("applies the same formula to a repayment loan", () => {
    const terms: LoanTerms = { kind: "repayment", annualRateBps: 500, scheduledPaymentPence: 100_000 };
    const d = derivePayment({ terms: terms, openingBalancePence: 10_000_000, daysInPeriod: 30, paidPence: 100_000 });
    expect(d.computedInterestPence).toBe(41_096);
    expect(d.capitalPence).toBe(58_904);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/loans/schedule.test.ts`
Expected: FAIL — `derivePayment` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/loans/schedule.ts`:

```ts
import type { LoanKind } from "../tax/types";

export interface LoanTerms {
  kind: LoanKind;
  annualRateBps: number;
  /** Schedule metadata only. The amount actually debited is `PaymentInput.paidPence` —
   *  never pass this into `derivePayment` as the amount paid, because a landlord who
   *  overpays debits more than the schedule says. */
  scheduledPaymentPence: number;
}

export interface PaymentInput {
  terms: LoanTerms;
  openingBalancePence: number;
  /** Days since the previous payment date, or since the loan's startDate for the first. */
  daysInPeriod: number;
  /** The amount that ACTUALLY left the bank this period. */
  paidPence: number;
  /** The lender's real figure, when reconciling against a statement. */
  actualInterestPence?: number | null;
}

export interface DerivedPayment {
  openingBalancePence: number;
  /** What the rate implies for this period — snapshotted even when overridden. */
  computedInterestPence: number;
  /** The figure that reaches SA105 box 44: the override when present, else computed. */
  interestPence: number;
  capitalPence: number;
  closingBalancePence: number;
  fullyRedeemed: boolean;
}

/**
 * Split one payment into its deductible interest and non-deductible capital parts.
 *
 * One formula covers both loan kinds, because the payment amount is known:
 *   capital = paid - interest
 * `kind` therefore only drives the interest-only term-end warning, not the maths.
 */
export function derivePayment({
  terms,
  openingBalancePence,
  daysInPeriod,
  paidPence,
  actualInterestPence,
}: PaymentInput): DerivedPayment {
  if (openingBalancePence < 0) {
    // Surfaced rather than clamped: a negative balance means the caller's balance chain
    // has desynced, and silently coercing it to zero would hide that behind a plausible figure.
    throw new Error("The loan's outstanding balance cannot be negative.");
  }

  const computedInterestPence = computeInterestPence(
    openingBalancePence,
    terms.annualRateBps,
    daysInPeriod,
  );
  const interestPence = actualInterestPence ?? computedInterestPence;

  if (interestPence < 0) {
    throw new Error("Interest cannot be negative.");
  }
  if (interestPence > paidPence) {
    // Messages reach the user verbatim via `?error=`, so they carry no raw pence.
    throw new Error(
      "Interest for this period exceeds the payment. " +
        "Record this as an arrears period, or correct the rate.",
    );
  }

  let capitalPence = paidPence - interestPence;
  let fullyRedeemed = false;
  if (capitalPence >= openingBalancePence) {
    capitalPence = openingBalancePence;
    fullyRedeemed = true;
  }

  return {
    openingBalancePence,
    computedInterestPence,
    interestPence,
    capitalPence,
    closingBalancePence: openingBalancePence - capitalPence,
    fullyRedeemed,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/loans/schedule.test.ts`
Expected: PASS — 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/loans/schedule.ts src/lib/loans/schedule.test.ts
git commit -m "feat(loans): split payments into interest and capital"
```

---

## Task 5: Regression test — the overclaim must be impossible

This is the test that encodes the actual bug. Write it before any UI exists.

**Files:**
- Test: `src/lib/loans/schedule.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/loans/schedule.test.ts`:

```ts
import { computeProfit } from "../tax/profit";
import { buildTaxYearSummary } from "../tax/summary";
import type { TaxTxn } from "../tax/types";

/** A year of £750/month payments on a £71k interest-only loan at 2.7%, as the
 *  tax engine would see them once the loan engine has split each one.
 *  Dates run 1 May 2026 → 1 Apr 2027, all inside tax year 2026-27 (which ends 5 Apr 2027).
 *  Interest accrues from 1 Apr 2026, so the 12 periods span exactly 365 days. */
function yearOfSplitPayments(): TaxTxn[] {
  const txns: TaxTxn[] = [];
  let balance = 7_100_000;
  let prev = new Date("2026-04-01T00:00:00Z");
  for (let m = 0; m < 12; m++) {
    const date = new Date(Date.UTC(2026, 4 + m, 1));
    const d = derivePayment({
      terms: { kind: "interestOnly", annualRateBps: 270, scheduledPaymentPence: 75_000 },
      openingBalancePence: balance,
      daysInPeriod: daysBetween(prev, date),
      paidPence: 75_000,
    });
    txns.push({ date, amountPence: d.interestPence, direction: "out", categoryKind: "finance", allowable: true, sa105Box: "44" });
    txns.push({ date, amountPence: d.capitalPence, direction: "out", categoryKind: "capital", allowable: false, sa105Box: null });
    balance = d.closingBalancePence;
    prev = date;
  }
  return txns;
}

describe("SA105 treatment of a split mortgage payment", () => {
  const RENT: TaxTxn = {
    date: new Date("2026-06-01T00:00:00Z"), amountPence: 1_200_000,
    direction: "in", categoryKind: "income", allowable: true, sa105Box: "20",
  };

  it("puts only the interest in box 44 — never the whole payment", () => {
    const txns = yearOfSplitPayments();
    const summary = buildTaxYearSummary([RENT, ...txns], {
      taxYear: "2026-27", otherIncomePence: 7_347_000,
      region: "englandWalesNI", usePropertyAllowance: false,
    });

    // A full year of payments is £9,000. Only £1,829.00 of it is deductible.
    // Asserted exactly, not as a range: everything here is deterministic integer pence
    // with no floating point, so a range would let a real rate drift pass unnoticed —
    // which would defeat the purpose of the one test named for pinning box 44.
    expect(summary.financeCostsPence).toBe(182_900);
    expect(summary.sa105["44"]).toBe(182_900);
  });

  it("excludes capital repayment from profit entirely", () => {
    const txns = yearOfSplitPayments();
    const capitalPence = txns.filter((t) => t.categoryKind === "capital")
      .reduce((sum, t) => sum + t.amountPence, 0);
    const interestPence = txns.filter((t) => t.categoryKind === "finance")
      .reduce((sum, t) => sum + t.amountPence, 0);

    // Guard against this test going vacuous: the capital rows must actually be present
    // and material, and together with interest must account for every penny debited.
    expect(capitalPence).toBeGreaterThan(700_000);
    expect(capitalPence + interestPence).toBe(12 * 75_000);

    const { profitPence, expensesPence } = computeProfit([RENT, ...txns]);
    // Capital is neither an expense nor a finance cost — profit is rent, untouched.
    expect(expensesPence).toBe(0);
    expect(profitPence).toBe(1_200_000);
  });

  // The assertion above would pass even if the capital rows were simply absent, because
  // computeProfit ignores them for two independent reasons (allowable: false, and no
  // "capital" arm in its categoryKind switch). This mutation test is what actually proves
  // the categorisation is load-bearing: recategorise capital as a deductible expense and
  // the profit must move by exactly that amount.
  it("would wrongly reduce profit if capital were miscategorised as an expense", () => {
    const txns = yearOfSplitPayments();
    const miscategorised = txns.map((t) =>
      t.categoryKind === "capital"
        ? { ...t, categoryKind: "expense" as const, allowable: true, sa105Box: "29" }
        : t,
    );

    const right = computeProfit([RENT, ...txns]);
    const wrong = computeProfit([RENT, ...miscategorised]);

    expect(right.expensesPence).toBe(0);
    expect(wrong.expensesPence).toBeGreaterThan(700_000);
    // The whole difference is the capital that must never have been deducted.
    expect(right.profitPence - wrong.profitPence).toBe(wrong.expensesPence);
  });

  it("would have overclaimed by over £7,000 if the payment were filed unsplit", () => {
    const unsplit: TaxTxn[] = Array.from({ length: 12 }, (_, m) => ({
      date: new Date(Date.UTC(2026, 4 + m, 1)), amountPence: 75_000,
      direction: "out", categoryKind: "finance", allowable: true, sa105Box: "44",
    }));
    const wrong = buildTaxYearSummary([RENT, ...unsplit], {
      taxYear: "2026-27", otherIncomePence: 7_347_000,
      region: "englandWalesNI", usePropertyAllowance: false,
    });
    const right = buildTaxYearSummary([RENT, ...yearOfSplitPayments()], {
      taxYear: "2026-27", otherIncomePence: 7_347_000,
      region: "englandWalesNI", usePropertyAllowance: false,
    });
    // £9,000 filed vs £1,829 actually deductible: a £7,171.00 overclaim, asserted exactly.
    expect(wrong.financeCostsPence).toBe(900_000);
    expect(wrong.financeCostsPence - right.financeCostsPence).toBe(717_100);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/lib/loans/schedule.test.ts`
Expected: PASS — 20 tests. (The engine already handles this correctly; the test proves the
split feeds it the right inputs and locks the behaviour against regression.)

- [ ] **Step 3: Confirm the tax engine was not disturbed**

Run: `npx vitest run src/lib/tax/`
Expected: PASS, all existing tests unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/lib/loans/schedule.test.ts
git commit -m "test(loans): lock box 44 against the unsplit-payment overclaim"
```

---

## Task 6: Advisory readouts (pure)

**Files:**
- Create: `src/lib/loans/advice.ts`
- Test: `src/lib/loans/advice.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/loans/advice.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loanAdvice, type LoanAdviceInput } from "./advice";

const BASE: LoanAdviceInput = {
  annualRateBps: 270,
  ownershipType: "personal",
  taxYear: "2026-27",
  region: "englandWalesNI",
  kind: "interestOnly",
  capitalNoReliefPence: 708_000,
  termEndDate: null,
  currentBalancePence: 7_100_000,
};

describe("loanAdvice", () => {
  it("gives the effective cost of debt after the 20% reducer", () => {
    const a = loanAdvice(BASE);
    expect(a.reducerBps).toBe(2000);
    expect(a.effectiveRateBps).toBe(216); // 2.7% -> 2.16%
    expect(a.reliefBasis).toBe("section24Reducer");
  });

  it("tracks the reducer up to 22% for 2027-28 in England", () => {
    const a = loanAdvice({ ...BASE, taxYear: "2027-28" });
    expect(a.reducerBps).toBe(2200);
    expect(a.effectiveRateBps).toBe(211); // 2.7% -> 2.11%
  });

  it("keeps the 20% reducer for Scotland in 2027-28 (no Holyrood surcharge)", () => {
    const a = loanAdvice({ ...BASE, taxYear: "2027-28", region: "scotland" });
    expect(a.reducerBps).toBe(2000);
    expect(a.effectiveRateBps).toBe(216);
  });

  it("reports full deduction for a company-owned property", () => {
    const a = loanAdvice({ ...BASE, ownershipType: "company" });
    expect(a.reliefBasis).toBe("fullDeduction");
    expect(a.reducerBps).toBeNull();
    // No single "effective rate" exists: the real post-relief cost depends on the
    // company's corporation tax rate, which loanAdvice does not know.
    expect(a.effectiveRateBps).toBeNull();
  });

  it("passes through the capital that attracted no relief", () => {
    expect(loanAdvice(BASE).capitalNoReliefPence).toBe(708_000);
  });

  it("warns about the balance due at term end for an interest-only loan", () => {
    const a = loanAdvice({ ...BASE, termEndDate: new Date("2031-06-30T00:00:00Z") });
    expect(a.termEnd).toEqual({
      date: new Date("2031-06-30T00:00:00Z"),
      balanceDuePence: 7_100_000,
    });
  });

  it("does not warn when there is no term end date", () => {
    expect(loanAdvice(BASE).termEnd).toBeNull();
  });

  it("does not warn for a repayment loan", () => {
    const a = loanAdvice({ ...BASE, kind: "repayment", termEndDate: new Date("2031-06-30T00:00:00Z") });
    expect(a.termEnd).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/loans/advice.test.ts`
Expected: FAIL — `Failed to resolve import "./advice"`.

- [ ] **Step 3: Write the implementation**

`src/lib/loans/advice.ts`:

```ts
import { propertySurchargeBps } from "../tax/bands";
import type { Region, LoanKind } from "../tax/types";

/** The Section 24 reducer is the property basic rate: 20% plus any year/region surcharge. */
const BASIC_REDUCER_BPS = 2000;

export interface LoanAdviceInput {
  annualRateBps: number;
  ownershipType: "personal" | "company";
  taxYear: string;
  region: Region;
  kind: LoanKind;
  /** This tax year's capital repayments — money that attracted no relief at all. */
  capitalNoReliefPence: number;
  termEndDate: Date | null;
  currentBalancePence: number;
}

interface LoanAdviceCommon {
  nominalRateBps: number;
  /** This tax year's capital repayments — money that attracted no relief at all. */
  capitalNoReliefPence: number;
  termEnd: { date: Date; balanceDuePence: number } | null;
}

/**
 * Discriminated on `reliefBasis` so the company case cannot be misread.
 *
 * An earlier draft had `effectiveRateBps: number` always populated, holding the *nominal*
 * rate for company-owned property with a comment telling the UI not to label it
 * "after relief". A comment is not enough on a financial disclosure surface: a caller
 * destructuring `{ effectiveRateBps }` without checking `reliefBasis` would silently show a
 * wrong figure. Narrowing on `reliefBasis` now narrows the rate fields too, so the compiler
 * enforces the branch.
 */
export type LoanAdvice =
  | (LoanAdviceCommon & {
      reliefBasis: "section24Reducer";
      /** The property basic rate: 20%, plus any year/region surcharge. */
      reducerBps: number;
      /** The nominal rate after Section 24 relief. */
      effectiveRateBps: number;
    })
  | (LoanAdviceCommon & {
      /** Company-held: interest is deducted in full against profits, so there is no
       *  Section 24 restriction and no single "effective rate" — the real post-relief cost
       *  depends on the company's corporation tax rate, which this function does not know. */
      reliefBasis: "fullDeduction";
      reducerBps: null;
      effectiveRateBps: null;
    });

export function loanAdvice(input: LoanAdviceInput): LoanAdvice {
  // Only interest-only loans get the term-end warning. A repayment loan's balance
  // amortises to zero by design, so warning on its *current* balance would false-alarm for
  // its entire life. Detecting genuine underpayment on a repayment loan needs a projection
  // to the term-end date, which is out of scope (see the spec's non-goals) — so the
  // omission is deliberate, not an oversight of the `kind` gate.
  const termEnd =
    input.kind === "interestOnly" && input.termEndDate
      ? { date: input.termEndDate, balanceDuePence: input.currentBalancePence }
      : null;

  // Company-held property deducts interest in full against profits; there is no
  // Section 24 restriction, and the post-relief cost depends on the company's CT rate.
  if (input.ownershipType === "company") {
    return {
      nominalRateBps: input.annualRateBps,
      reducerBps: null,
      effectiveRateBps: null,
      reliefBasis: "fullDeduction",
      capitalNoReliefPence: input.capitalNoReliefPence,
      termEnd,
    };
  }

  const reducerBps = BASIC_REDUCER_BPS + propertySurchargeBps(input.taxYear, input.region);
  return {
    nominalRateBps: input.annualRateBps,
    reducerBps,
    effectiveRateBps: Math.round((input.annualRateBps * (10_000 - reducerBps)) / 10_000),
    reliefBasis: "section24Reducer",
    capitalNoReliefPence: input.capitalNoReliefPence,
    termEnd,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/loans/advice.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/loans/advice.ts src/lib/loans/advice.test.ts
git commit -m "feat(loans): effective cost of debt, capital callout, term-end warning"
```

---

## Task 7: Data layer — CRUD and payment generation

**Files:**
- Create: `src/lib/data/loans.ts`
- Test: `src/lib/data/loans.test.ts`

- [ ] **Step 1: Write the CRUD and generation module**

`src/lib/data/loans.ts`:

```ts
import "server-only";
import { prisma } from "../db";
import { recurringOccurrences, type IntervalUnit, type OccurrenceRule } from "../recurring/occurrences";
import { derivePayment, daysBetween, type LoanTerms } from "../loans/schedule";
import type { LoanKind } from "../tax/types";
import { INTEREST_CATEGORY_NAME, CAPITAL_CATEGORY_NAME } from "../loans/categories";
import { taxYearRange } from "../tax/taxYear";

export interface LoanInput {
  propertyId: string;
  name: string;
  kind: LoanKind;
  openingBalancePence: number;
  annualRateBps: number;
  scheduledPaymentPence: number;
  intervalUnit: IntervalUnit;
  intervalCount: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  monthOfYear?: number | null;
  startDate: Date;
  termEndDate?: Date | null;
}

export function listLoans(propertyId: string | null) {
  return prisma.loan.findMany({
    where: propertyId ? { propertyId } : {},
    orderBy: [{ active: "desc" }, { startDate: "asc" }],
    include: { property: true },
  });
}

export function getLoan(id: string) {
  return prisma.loan.findUnique({
    where: { id },
    include: {
      property: true,
      payments: { orderBy: { date: "asc" } },
    },
  });
}

export function createLoan(input: LoanInput) {
  return prisma.loan.create({ data: input });
}

export function updateLoan(id: string, input: LoanInput) {
  return prisma.loan.update({ where: { id }, data: input });
}

export function setLoanActive(id: string, active: boolean) {
  return prisma.loan.update({ where: { id }, data: { active } });
}

/** Refuses while payments exist, so generated transactions are never orphaned. */
export async function deleteLoan(id: string): Promise<void> {
  const count = await prisma.loanPayment.count({ where: { loanId: id } });
  if (count > 0) {
    throw new Error(
      `This loan has ${count} recorded payment(s). Delete those first, or pause the loan instead.`,
    );
  }
  await prisma.loan.delete({ where: { id } });
}

function toLoanOccurrenceRule(loan: {
  intervalUnit: string; intervalCount: number;
  dayOfWeek: number | null; dayOfMonth: number | null; monthOfYear: number | null;
  startDate: Date; termEndDate: Date | null; lastGeneratedDate: Date | null;
}): OccurrenceRule {
  return {
    intervalUnit: loan.intervalUnit as IntervalUnit,
    intervalCount: loan.intervalCount,
    dayOfWeek: loan.dayOfWeek,
    dayOfMonth: loan.dayOfMonth,
    monthOfYear: loan.monthOfYear,
    startDate: loan.startDate,
    endDate: loan.termEndDate,
    // A loan's startDate is the accrual ORIGIN, not a payment date: openingBalancePence is
    // defined as the balance *as at* that date. recurringOccurrences() emits startDate itself
    // when the schedule's day matches it (correct for a RecurringRule, where a rent rule
    // starting on the 1st should pay on the 1st) — but for a loan that yields a phantom
    // payment with zero elapsed days, zero interest and the whole amount as capital.
    // Seeding lastGeneratedDate with startDate reuses that function's existing
    // "skip anything on or before" rule to mean "first payment strictly after the origin".
    lastGeneratedDate: loan.lastGeneratedDate ?? loan.startDate,
  };
}

function termsOf(loan: { kind: string; annualRateBps: number; scheduledPaymentPence: number }): LoanTerms {
  return {
    kind: loan.kind as LoanKind,
    annualRateBps: loan.annualRateBps,
    scheduledPaymentPence: loan.scheduledPaymentPence,
  };
}

async function loanCategoryIds(): Promise<{ interestId: string; capitalId: string }> {
  const [interest, capital] = await Promise.all([
    prisma.category.findUnique({ where: { name: INTEREST_CATEGORY_NAME } }),
    prisma.category.findUnique({ where: { name: CAPITAL_CATEGORY_NAME } }),
  ]);
  if (!interest || !capital) {
    throw new Error("Loan categories are missing. Run `npx prisma db seed`.");
  }
  return { interestId: interest.id, capitalId: capital.id };
}

/**
 * Generate LoanPayments and their transaction pairs up to `asOf`.
 *
 * Idempotent: `lastGeneratedDate` advances past each emitted date and
 * `@@unique([loanId, date])` is the backstop, exactly as recurring rules work.
 *
 * Interest accrues from the previous payment date, or from `startDate` for the first
 * payment. The first payment is the first scheduled date strictly *after* `startDate`, so
 * it always has a non-zero accrual period — see `toLoanOccurrenceRule` for why.
 */
export async function generateLoanPayments(loanId: string, asOf: Date): Promise<number> {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });
  if (!loan || !loan.active) return 0;

  const dates = recurringOccurrences(toLoanOccurrenceRule(loan), asOf);
  if (dates.length === 0) return 0;

  const { interestId, capitalId } = await loanCategoryIds();
  const last = await prisma.loanPayment.findFirst({
    where: { loanId },
    orderBy: { date: "desc" },
  });

  let balance = last?.closingBalancePence ?? loan.openingBalancePence;
  let boundary = last?.date ?? loan.startDate;
  let created = 0;

  for (const date of dates) {
    if (balance <= 0) break;
    const d = derivePayment({
      terms: termsOf(loan),
      openingBalancePence: balance,
      daysInPeriod: daysBetween(boundary, date),
      paidPence: loan.scheduledPaymentPence,
    });

    await prisma.$transaction(async (tx) => {
      const payment = await tx.loanPayment.create({
        data: {
          loanId,
          date,
          openingBalancePence: d.openingBalancePence,
          computedInterestPence: d.computedInterestPence,
          paidPence: loan.scheduledPaymentPence,
          closingBalancePence: d.closingBalancePence,
        },
      });
      await tx.transaction.createMany({
        data: buildPaymentTransactions(loan, payment.id, date, d.interestPence, d.capitalPence, interestId, capitalId),
      });
      await tx.loan.update({
        where: { id: loanId },
        data: { lastGeneratedDate: date, ...(d.fullyRedeemed ? { active: false } : {}) },
      });
    });

    balance = d.closingBalancePence;
    boundary = date;
    created++;
    if (d.fullyRedeemed) break;
  }

  return created;
}

/** The one or two ledger rows for a payment. Zero-value lines are omitted. */
function buildPaymentTransactions(
  loan: { propertyId: string; name: string },
  loanPaymentId: string,
  date: Date,
  interestPence: number,
  capitalPence: number,
  interestId: string,
  capitalId: string,
) {
  const rows: {
    propertyId: string; categoryId: string; date: Date; amountPence: number;
    direction: "out"; source: "recurring"; loanPaymentId: string; description: string;
  }[] = [];
  if (interestPence > 0) {
    rows.push({
      propertyId: loan.propertyId, categoryId: interestId, date, amountPence: interestPence,
      direction: "out", source: "recurring", loanPaymentId, description: `${loan.name} — interest`,
    });
  }
  if (capitalPence > 0) {
    rows.push({
      propertyId: loan.propertyId, categoryId: capitalId, date, amountPence: capitalPence,
      direction: "out", source: "recurring", loanPaymentId, description: `${loan.name} — capital repayment`,
    });
  }
  return rows;
}
```

- [ ] **Step 2: Write the test**

This is a **real integration test against Prisma**, following the established pattern in
`src/lib/data/recurring.test.ts`. Do not write a pure function that mirrors the generation
loop — that would test a duplicate of the logic rather than `generateLoanPayments` itself,
and would miss the transaction pairing, the idempotency and the category wiring, which are
the parts most likely to be wrong.

`test/setup/globalSetup.ts` creates `test.db`, applies migrations and seeds it. `resetDb()`
clears it between tests (Task 2 taught it about the new tables).

`src/lib/data/loans.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createLoan, listLoans, deleteLoan, generateLoanPayments, type LoanInput } from "./loans";
import { getOrCreateDefaultProperty } from "./property";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";
import { INTEREST_CATEGORY_NAME, CAPITAL_CATEGORY_NAME } from "../loans/categories";

/** £71k interest-only at 2.7%, £750/month on the 1st, accruing from 1 Apr 2026. */
function interestOnly(overrides: Partial<LoanInput>): LoanInput {
  return {
    propertyId: "", name: "Test BTL", kind: "interestOnly",
    openingBalancePence: 7_100_000, annualRateBps: 270, scheduledPaymentPence: 75_000,
    intervalUnit: "MONTH", intervalCount: 1, dayOfWeek: null, dayOfMonth: 1, monthOfYear: null,
    startDate: new Date("2026-04-01"), termEndDate: null, ...overrides,
  };
}

async function ledgerFor(loanId: string) {
  return prisma.transaction.findMany({
    where: { loanPayment: { loanId } },
    include: { category: true },
    orderBy: [{ date: "asc" }, { amountPence: "asc" }],
  });
}

beforeEach(async () => { await resetDb(); });

describe("loans data layer", () => {
  it("creates and lists loans for a property", async () => {
    const property = await getOrCreateDefaultProperty();
    await createLoan(interestOnly({ propertyId: property.id }));
    expect(await listLoans(property.id)).toHaveLength(1);
  });

  it("writes one interest line and one capital line per payment", async () => {
    const property = await getOrCreateDefaultProperty();
    const loan = await createLoan(interestOnly({ propertyId: property.id }));
    expect(await generateLoanPayments(loan.id, new Date("2026-06-15"))).toBe(2); // 1 May, 1 Jun

    const txns = await ledgerFor(loan.id);
    expect(txns).toHaveLength(4);
    expect(txns.filter((t) => t.category.name === INTEREST_CATEGORY_NAME)).toHaveLength(2);
    expect(txns.filter((t) => t.category.name === CAPITAL_CATEGORY_NAME)).toHaveLength(2);
    expect(txns.every((t) => t.direction === "out")).toBe(true);

    // The whole point: interest is a fraction of the payment, capital is the rest.
    const first = txns.filter((t) => t.date.toISOString().startsWith("2026-05-01"));
    const interest = first.find((t) => t.category.kind === "finance")!;
    const capital = first.find((t) => t.category.kind === "capital")!;
    expect(interest.amountPence + capital.amountPence).toBe(75_000);
    expect(interest.amountPence).toBeLessThan(20_000);
    expect(capital.category.allowable).toBe(false);
  });

  it("is idempotent — re-running records nothing further", async () => {
    const property = await getOrCreateDefaultProperty();
    const loan = await createLoan(interestOnly({ propertyId: property.id }));
    expect(await generateLoanPayments(loan.id, new Date("2026-06-15"))).toBe(2);
    expect(await generateLoanPayments(loan.id, new Date("2026-06-15"))).toBe(0);
    expect(await ledgerFor(loan.id)).toHaveLength(4);
    expect(await generateLoanPayments(loan.id, new Date("2026-07-02"))).toBe(1);
  });

  it("carries the closing balance forward, unbroken, so the balance always falls", async () => {
    const property = await getOrCreateDefaultProperty();
    const loan = await createLoan(interestOnly({ propertyId: property.id }));
    await generateLoanPayments(loan.id, new Date("2026-07-15"));
    const payments = await prisma.loanPayment.findMany({ where: { loanId: loan.id }, orderBy: { date: "asc" } });
    expect(payments).toHaveLength(3); // 1 May, 1 Jun, 1 Jul

    // Chain integrity: each period opens exactly where the last one closed.
    expect(payments[1].openingBalancePence).toBe(payments[0].closingBalancePence);
    expect(payments[2].openingBalancePence).toBe(payments[1].closingBalancePence);

    // The balance falls every period. This holds unconditionally.
    expect(payments[1].closingBalancePence).toBeLessThan(payments[0].closingBalancePence);
    expect(payments[2].closingBalancePence).toBeLessThan(payments[1].closingBalancePence);

    // Interest is deliberately NOT asserted to fall month-over-month, because under daily
    // accrual it does not: a 31-day period adds ~3.3% of accrual, which outweighs the ~0.8%
    // the balance dropped, so 1 Jun (31 days) costs MORE than 1 May (30 days) —
    // £161.46 vs £157.56 on this loan. Interest only falls between periods of equal length.
    // 1 May and 1 Jul are both 30-day periods, so the falling balance shows through there.
    const may = payments[0], jul = payments[2];
    expect(jul.computedInterestPence).toBeLessThan(may.computedInterestPence);
    expect(may.computedInterestPence).toBe(15_756);   // 30 days on £71,000.00
    expect(payments[1].computedInterestPence).toBe(16_146); // 31 days on £70,407.56 — higher
    expect(jul.computedInterestPence).toBe(15_494);   // 30 days on £69,819.02
  });

  it("omits a zero-value capital line when the payment is pure interest", async () => {
    const property = await getOrCreateDefaultProperty();
    // First period is 1 Apr -> 1 May (30 days) on £71k at 2.7% = 15,756p. Pay exactly that.
    const loan = await createLoan(interestOnly({
      propertyId: property.id, scheduledPaymentPence: 15_756,
    }));
    expect(await generateLoanPayments(loan.id, new Date("2026-05-15"))).toBe(1);
    const txns = await ledgerFor(loan.id);
    expect(txns).toHaveLength(1);
    expect(txns[0].category.name).toBe(INTEREST_CATEGORY_NAME);
    const payment = await prisma.loanPayment.findFirstOrThrow({ where: { loanId: loan.id } });
    expect(payment.closingBalancePence).toBe(7_100_000);
  });

  it("stops and deactivates the loan on full redemption", async () => {
    const property = await getOrCreateDefaultProperty();
    const loan = await createLoan(interestOnly({
      propertyId: property.id, openingBalancePence: 50_000,
    }));
    expect(await generateLoanPayments(loan.id, new Date("2026-08-15"))).toBe(1);
    const refreshed = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(refreshed.active).toBe(false);
    const payment = await prisma.loanPayment.findFirstOrThrow({ where: { loanId: loan.id } });
    expect(payment.closingBalancePence).toBe(0);
  });

  it("does not generate for a paused loan", async () => {
    const property = await getOrCreateDefaultProperty();
    const loan = await createLoan(interestOnly({ propertyId: property.id }));
    await prisma.loan.update({ where: { id: loan.id }, data: { active: false } });
    expect(await generateLoanPayments(loan.id, new Date("2026-06-15"))).toBe(0);
  });

  it("refuses to delete a loan that has recorded payments", async () => {
    const property = await getOrCreateDefaultProperty();
    const loan = await createLoan(interestOnly({ propertyId: property.id }));
    await generateLoanPayments(loan.id, new Date("2026-06-15"));
    await expect(deleteLoan(loan.id)).rejects.toThrow(/recorded payment/);
    expect(await listLoans(property.id)).toHaveLength(1);
  });

  it("deletes a loan that has no payments", async () => {
    const property = await getOrCreateDefaultProperty();
    const loan = await createLoan(interestOnly({ propertyId: property.id }));
    await deleteLoan(loan.id);
    expect(await listLoans(property.id)).toHaveLength(0);
  });

  // Cross-check against the hand-rolled `yearOfSplitPayments()` helper in
  // sa105Regression.test.ts. That helper reimplements this balance-carry-forward loop in
  // memory, so without this test the two could drift — the regression suite would keep
  // passing against its own private copy of the sequencing while the real generator broke.
  it("produces the same annual interest as the in-memory regression model", async () => {
    const property = await getOrCreateDefaultProperty();
    const loan = await createLoan(interestOnly({
      propertyId: property.id, startDate: new Date("2026-04-01"),
    }));
    await generateLoanPayments(loan.id, new Date("2027-04-02"));

    const payments = await prisma.loanPayment.findMany({ where: { loanId: loan.id }, orderBy: { date: "asc" } });
    expect(payments).toHaveLength(12);
    const totalInterest = payments.reduce(
      (sum, p) => sum + (p.actualInterestPence ?? p.computedInterestPence), 0,
    );
    // £1,829.00 — the same figure the in-memory model produces for 365 days of accrual.
    expect(totalInterest).toBe(182_900);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/lib/data/loans.test.ts`
Expected: PASS — 9 tests.

If the "pure interest" test's expected figure (15,756p) is off by a penny or two, compute the
real value with `computeInterestPence(7_100_000, 270, 30)` and use that — do not change
`computeInterestPence` to fit the test.

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/loans.ts src/lib/data/loans.test.ts
git commit -m "feat(loans): CRUD and idempotent payment generation"
```

---

## Task 8: Data layer — override and year-end reconcile

**Files:**
- Modify: `src/lib/data/loans.ts`

- [ ] **Step 1: Add the override and reconcile functions**

Append to `src/lib/data/loans.ts`:

```ts
/**
 * Replace one payment's interest with the lender's actual figure, rewriting both ledger
 * rows to match.
 *
 * Known limitation: later payments' opening balances are NOT recalculated, so overriding a
 * mid-year payment leaves subsequent balances slightly stale. `applyYearVariance` targets
 * the final payment of the year precisely to keep that contained.
 */
export async function setActualInterest(paymentId: string, actualInterestPence: number): Promise<void> {
  const payment = await prisma.loanPayment.findUnique({
    where: { id: paymentId },
    include: { loan: true },
  });
  if (!payment) throw new Error("That payment could not be found.");

  const d = derivePayment({
    terms: termsOf(payment.loan),
    openingBalancePence: payment.openingBalancePence,
    daysInPeriod: 0, // irrelevant: the override supplies the interest
    paidPence: payment.paidPence,
    actualInterestPence,
  });

  const { interestId, capitalId } = await loanCategoryIds();

  await prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { loanPaymentId: paymentId } });
    await tx.transaction.createMany({
      data: buildPaymentTransactions(
        payment.loan, paymentId, payment.date,
        d.interestPence, d.capitalPence, interestId, capitalId,
      ),
    });
    await tx.loanPayment.update({
      where: { id: paymentId },
      data: { actualInterestPence, closingBalancePence: d.closingBalancePence },
    });
  });
}

export interface YearReconcile {
  recordedInterestPence: number;
  paymentCount: number;
  lastPaymentId: string | null;
}

/** Total interest recorded for a tax year — the figure that reaches SA105 box 44. */
export async function reconcileYear(loanId: string, taxYear: string): Promise<YearReconcile> {
  const { start, end } = taxYearRange(taxYear);
  const payments = await prisma.loanPayment.findMany({
    where: { loanId, date: { gte: start, lt: end } },
    orderBy: { date: "asc" },
  });
  return {
    recordedInterestPence: payments.reduce(
      (sum, p) => sum + (p.actualInterestPence ?? p.computedInterestPence),
      0,
    ),
    paymentCount: payments.length,
    lastPaymentId: payments.at(-1)?.id ?? null,
  };
}

/**
 * Make the year's recorded interest match the lender's annual statement exactly, by
 * adjusting the final payment of the year. Box 44 then sits on the lender's number —
 * the figure HMRC would check against.
 */
export async function applyYearVariance(
  loanId: string,
  taxYear: string,
  statementInterestPence: number,
): Promise<void> {
  const { recordedInterestPence, lastPaymentId } = await reconcileYear(loanId, taxYear);
  if (!lastPaymentId) throw new Error("No payments are recorded for that tax year.");
  const delta = statementInterestPence - recordedInterestPence;
  if (delta === 0) return;

  const last = await prisma.loanPayment.findUnique({ where: { id: lastPaymentId } });
  if (!last) throw new Error("That payment could not be found.");
  const current = last.actualInterestPence ?? last.computedInterestPence;
  // derivePayment throws if this pushes interest above the payment — surfaced to the user.
  await setActualInterest(lastPaymentId, current + delta);
}

/** This tax year's capital repayments for a loan — money that attracted no relief. */
export async function capitalNoReliefPence(loanId: string, taxYear: string): Promise<number> {
  const { start, end } = taxYearRange(taxYear);
  const rows = await prisma.transaction.findMany({
    where: {
      loanPayment: { loanId },
      date: { gte: start, lt: end },
      category: { name: CAPITAL_CATEGORY_NAME },
    },
    select: { amountPence: true },
  });
  return rows.reduce((sum, r) => sum + r.amountPence, 0);
}
```

- [ ] **Step 2: Test the override and reconcile paths**

These four functions are what put the lender's *actual* figure into SA105 box 44, so they
need real coverage. Append to `src/lib/data/loans.test.ts`.

Reference figures for the standard fixture (£71,000 at 2.7%, £750/month on the 1st,
accruing from 2026-04-01), generated to 2026-07-15 — three payments:

| Date | Opening | Interest | Capital | Closing |
|---|---|---|---|---|
| 1 May | 7,100,000 | 15,756 | 59,244 | 7,040,756 |
| 1 Jun | 7,040,756 | 16,146 | 58,854 | 6,981,902 |
| 1 Jul | 6,981,902 | 15,494 | 59,506 | 6,922,396 |

Totals: interest 47,396; capital 177,604 (together 225,000 = 3 × £750).

```ts
import {
  setActualInterest, reconcileYear, applyYearVariance, capitalNoReliefPence,
} from "./loans";

/** The standard fixture generated to three payments. Returns them date-ascending. */
async function threePayments() {
  const property = await getOrCreateDefaultProperty();
  const loan = await createLoan(interestOnly({ propertyId: property.id }));
  await generateLoanPayments(loan.id, new Date("2026-07-15"));
  const payments = await prisma.loanPayment.findMany({
    where: { loanId: loan.id }, orderBy: { date: "asc" },
  });
  return { loan, payments };
}

describe("reconcileYear", () => {
  it("totals the year's interest — the figure that reaches SA105 box 44", async () => {
    const { loan, payments } = await threePayments();
    const r = await reconcileYear(loan.id, "2026-27");
    expect(r.paymentCount).toBe(3);
    expect(r.recordedInterestPence).toBe(47_396);
    expect(r.lastPaymentId).toBe(payments[2].id);
  });

  it("prefers the actual figure over the computed one once overridden", async () => {
    const { loan, payments } = await threePayments();
    await setActualInterest(payments[2].id, 16_000);
    const r = await reconcileYear(loan.id, "2026-27");
    expect(r.recordedInterestPence).toBe(47_902); // 15,756 + 16,146 + 16,000
  });

  it("reports an empty year without throwing", async () => {
    const { loan } = await threePayments();
    const r = await reconcileYear(loan.id, "2025-26");
    expect(r).toEqual({ recordedInterestPence: 0, paymentCount: 0, lastPaymentId: null });
  });
});

describe("setActualInterest", () => {
  it("preserves the computed snapshot while changing the actual figure", async () => {
    const { payments } = await threePayments();
    await setActualInterest(payments[2].id, 16_000);
    const after = await prisma.loanPayment.findUniqueOrThrow({ where: { id: payments[2].id } });
    // The rate-derived snapshot is the audit trail and must survive the override.
    expect(after.computedInterestPence).toBe(15_494);
    expect(after.actualInterestPence).toBe(16_000);
    expect(after.closingBalancePence).toBe(6_922_902); // 6,981,902 − (75,000 − 16,000)
  });

  it("rewrites both ledger rows to match the new split", async () => {
    const { loan, payments } = await threePayments();
    await setActualInterest(payments[2].id, 16_000);
    const rows = await prisma.transaction.findMany({
      where: { loanPaymentId: payments[2].id }, include: { category: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.category.kind === "finance")!.amountPence).toBe(16_000);
    expect(rows.find((r) => r.category.kind === "capital")!.amountPence).toBe(59_000);
    // The other payments' rows are untouched — the delete must scope to one payment.
    const all = await prisma.transaction.findMany({ where: { loanPayment: { loanId: loan.id } } });
    expect(all).toHaveLength(6);
  });

  it("refuses an override larger than the payment", async () => {
    const { payments } = await threePayments();
    await expect(setActualInterest(payments[0].id, 80_000)).rejects.toThrow(/exceeds the payment/);
  });

  it("leaves later payments' opening balances stale — the documented limitation", async () => {
    const { payments } = await threePayments();
    await setActualInterest(payments[0].id, 10_000); // less interest ⇒ more capital repaid
    const jun = await prisma.loanPayment.findUniqueOrThrow({ where: { id: payments[1].id } });
    // Deliberately NOT recalculated. applyYearVariance targets the year's final payment
    // precisely so this staleness stays contained. Pinned so the limitation is explicit.
    expect(jun.openingBalancePence).toBe(7_040_756);
  });
});

describe("applyYearVariance", () => {
  it("makes the year's total match the lender's statement exactly", async () => {
    const { loan, payments } = await threePayments();
    await applyYearVariance(loan.id, "2026-27", 50_000);
    expect((await reconcileYear(loan.id, "2026-27")).recordedInterestPence).toBe(50_000);
    // The whole £26.04 delta landed on the final payment, not spread around.
    const jul = await prisma.loanPayment.findUniqueOrThrow({ where: { id: payments[2].id } });
    expect(jul.actualInterestPence).toBe(18_098); // 15,494 + 2,604
    const may = await prisma.loanPayment.findUniqueOrThrow({ where: { id: payments[0].id } });
    expect(may.actualInterestPence).toBeNull();
  });

  it("does nothing when the statement already agrees", async () => {
    const { loan, payments } = await threePayments();
    await applyYearVariance(loan.id, "2026-27", 47_396);
    const jul = await prisma.loanPayment.findUniqueOrThrow({ where: { id: payments[2].id } });
    expect(jul.actualInterestPence).toBeNull(); // no write at all
  });

  it("errors helpfully when the year has no payments", async () => {
    const { loan } = await threePayments();
    await expect(applyYearVariance(loan.id, "2025-26", 50_000)).rejects.toThrow(/no payments/i);
  });

  it("surfaces the guard when the variance exceeds a single payment", async () => {
    const { loan } = await threePayments();
    await expect(applyYearVariance(loan.id, "2026-27", 200_000)).rejects.toThrow(/exceeds the payment/);
  });
});

describe("capitalNoReliefPence", () => {
  it("sums the year's capital repayments — the money that got no relief", async () => {
    const { loan } = await threePayments();
    expect(await capitalNoReliefPence(loan.id, "2026-27")).toBe(177_604);
  });

  it("counts a 6 April payment in the new tax year only, never both", async () => {
    const property = await getOrCreateDefaultProperty();
    // First payment strictly after the 2027-03-06 origin is 2027-04-06 — the exact boundary.
    // The 2026-27 year ends 2027-04-06 exclusive, so this belongs to 2027-28 alone.
    const loan = await createLoan(interestOnly({
      propertyId: property.id, startDate: new Date("2027-03-06"), dayOfMonth: 6,
    }));
    await generateLoanPayments(loan.id, new Date("2027-04-10"));
    const payments = await prisma.loanPayment.findMany({ where: { loanId: loan.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].date.toISOString().slice(0, 10)).toBe("2027-04-06");

    expect(await capitalNoReliefPence(loan.id, "2026-27")).toBe(0);
    expect(await capitalNoReliefPence(loan.id, "2027-28")).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/lib/data/loans.test.ts`
Expected: PASS — 10 from Task 7 plus 12 new = **22 tests**.

Every figure above was computed independently. If one does not match, report the discrepancy
with your derivation rather than adjusting the expectation.

- [ ] **Step 4: Verify types and the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: only the one known pre-existing failure (`scripts/migrate-akaunting/apply.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/loans.ts src/lib/data/loans.test.ts
git commit -m "feat(loans): interest override and year-end statement reconcile"
```

---

## Task 9: Server actions

**Files:**
- Create: `src/app/(app)/loans/actions.ts`

- [ ] **Step 1: Write the actions**

`src/app/(app)/loans/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createLoan, updateLoan, deleteLoan, setLoanActive, type LoanInput } from "../../../lib/data/loans";
import {
  generateLoanPayments, setActualInterest, applyYearVariance,
} from "../../../lib/data/loanGeneration";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import type { IntervalUnit } from "../../../lib/recurring/occurrences";
import type { LoanKind } from "../../../lib/tax/types";
import { requireSession } from "../../../lib/auth/session";

const UNITS: IntervalUnit[] = ["DAY", "WEEK", "MONTH", "YEAR"];
const KINDS: LoanKind[] = ["interestOnly", "repayment"];

function parseNullableInt(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}

function parseDate(raw: string, label: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw `Choose a valid ${label}.`;
  return d;
}

/** Percent string ("2.7") to basis points (270). */
function parseRateToBps(raw: string): number {
  const n = Number(String(raw).trim().replace("%", ""));
  if (!Number.isFinite(n) || n < 0) throw "Enter a valid interest rate.";
  return Math.round(n * 100);
}

function parseLoanInput(formData: FormData): Omit<LoanInput, "propertyId"> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw "Give the loan a name.";

  const kind = String(formData.get("kind") ?? "") as LoanKind;
  if (!KINDS.includes(kind)) throw "Choose whether the loan is interest-only or repayment.";

  const openingBalancePence = parseAmountToPence(String(formData.get("openingBalance") ?? ""));
  if (!(openingBalancePence > 0)) throw "Enter the outstanding balance.";

  const annualRateBps = parseRateToBps(String(formData.get("annualRate") ?? ""));

  const scheduledPaymentPence = parseAmountToPence(String(formData.get("scheduledPayment") ?? ""));
  if (!(scheduledPaymentPence > 0)) throw "Enter the payment amount.";

  const intervalUnit = String(formData.get("intervalUnit") ?? "") as IntervalUnit;
  if (!UNITS.includes(intervalUnit)) throw "Choose a valid frequency.";
  const rawCount = Number(formData.get("intervalCount") ?? 1);
  const intervalCount = Number.isFinite(rawCount) ? Math.max(1, Math.floor(rawCount)) : 1;

  const dayOfWeek = parseNullableInt(formData.get("dayOfWeek"));
  const dayOfMonth = parseNullableInt(formData.get("dayOfMonth"));
  const monthOfYear = parseNullableInt(formData.get("monthOfYear"));
  if (intervalUnit === "WEEK" && (dayOfWeek == null || dayOfWeek < 0 || dayOfWeek > 6)) {
    throw "Choose a day of the week.";
  }
  if ((intervalUnit === "MONTH" || intervalUnit === "YEAR") && (dayOfMonth == null || dayOfMonth < 1 || dayOfMonth > 31)) {
    throw "Choose a day of the month (1–31).";
  }
  if (intervalUnit === "YEAR" && (monthOfYear == null || monthOfYear < 1 || monthOfYear > 12)) {
    throw "Choose a month.";
  }

  const startRaw = String(formData.get("startDate") ?? "");
  if (!startRaw) throw "Choose a start date.";
  const startDate = parseDate(startRaw, "start date");

  const termRaw = String(formData.get("termEndDate") ?? "");
  const termEndDate = termRaw ? parseDate(termRaw, "term end date") : null;
  if (termEndDate && termEndDate <= startDate) throw "The term end must be after the start date.";

  return {
    name, kind, openingBalancePence, annualRateBps, scheduledPaymentPence,
    intervalUnit, intervalCount,
    dayOfWeek: intervalUnit === "WEEK" ? dayOfWeek : null,
    dayOfMonth: intervalUnit === "MONTH" || intervalUnit === "YEAR" ? dayOfMonth : null,
    monthOfYear: intervalUnit === "YEAR" ? monthOfYear : null,
    startDate, termEndDate,
  };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function addLoanAction(formData: FormData) {
  await requireSession();
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) redirect(`/loans?error=${encodeURIComponent("Choose a property.")}`);
  try {
    const input = parseLoanInput(formData);
    await createLoan({ propertyId, ...input });
  } catch (e) {
    redirect(`/loans/new?error=${encodeURIComponent(message(e))}`);
  }
  revalidatePath("/loans");
  redirect(`/loans?ok=${encodeURIComponent("Loan added")}`);
}

export async function updateLoanAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!id || !propertyId) redirect(`/loans?error=${encodeURIComponent("Missing loan.")}`);
  try {
    const input = parseLoanInput(formData);
    await updateLoan(id, { propertyId, ...input });
  } catch (e) {
    redirect(`/loans/${id}/edit?error=${encodeURIComponent(message(e))}`);
  }
  revalidatePath("/loans");
  redirect(`/loans/${id}?ok=${encodeURIComponent("Loan updated")}`);
}

export async function setLoanActiveAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (id) await setLoanActive(id, active);
  revalidatePath("/loans");
  redirect(`/loans?ok=${encodeURIComponent(active ? "Loan resumed" : "Loan paused")}`);
}

export async function deleteLoanAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(`/loans?error=${encodeURIComponent("Missing loan.")}`);
  try {
    await deleteLoan(id);
  } catch (e) {
    redirect(`/loans?error=${encodeURIComponent(message(e))}`);
  }
  revalidatePath("/loans");
  redirect(`/loans?ok=${encodeURIComponent("Loan deleted")}`);
}

export async function generateLoanPaymentsAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(`/loans?error=${encodeURIComponent("Missing loan.")}`);
  let count = 0;
  try {
    count = await generateLoanPayments(id, new Date());
  } catch (e) {
    redirect(`/loans/${id}?error=${encodeURIComponent(message(e))}`);
  }
  revalidatePath("/transactions");
  revalidatePath(`/loans/${id}`);
  redirect(`/loans/${id}?ok=${encodeURIComponent(`Recorded ${count} payment(s)`)}`);
}

export async function setActualInterestAction(formData: FormData) {
  await requireSession();
  const loanId = String(formData.get("loanId") ?? "");
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!loanId || !paymentId) redirect(`/loans?error=${encodeURIComponent("Missing payment.")}`);
  try {
    const pence = parseAmountToPence(String(formData.get("actualInterest") ?? ""));
    await setActualInterest(paymentId, pence);
  } catch (e) {
    redirect(`/loans/${loanId}?error=${encodeURIComponent(message(e))}`);
  }
  revalidatePath("/transactions");
  revalidatePath(`/loans/${loanId}`);
  redirect(`/loans/${loanId}?ok=${encodeURIComponent("Interest updated")}`);
}

export async function applyYearVarianceAction(formData: FormData) {
  await requireSession();
  const loanId = String(formData.get("loanId") ?? "");
  const taxYear = String(formData.get("taxYear") ?? "");
  if (!loanId || !/^\d{4}-\d{2}$/.test(taxYear)) {
    redirect(`/loans?error=${encodeURIComponent("Missing loan or tax year.")}`);
  }
  try {
    const pence = parseAmountToPence(String(formData.get("statementInterest") ?? ""));
    await applyYearVariance(loanId, taxYear, pence);
  } catch (e) {
    redirect(`/loans/${loanId}/reconcile?ty=${taxYear}&error=${encodeURIComponent(message(e))}`);
  }
  revalidatePath("/transactions");
  revalidatePath(`/loans/${loanId}`);
  redirect(`/loans/${loanId}/reconcile?ty=${taxYear}&ok=${encodeURIComponent("Matched to your statement")}`);
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/loans/actions.ts"
git commit -m "feat(loans): server actions for CRUD, generation and reconcile"
```

---

## Task 10: Loan form component

**Files:**
- Create: `src/app/(app)/loans/LoanForm.tsx`

- [ ] **Step 1: Write the form**

`src/app/(app)/loans/LoanForm.tsx`:

```tsx
import { MoneyInput } from "../_ui/MoneyInput";

export interface LoanFormValues {
  id?: string;
  name: string;
  kind: "interestOnly" | "repayment";
  openingBalancePence: number;
  annualRateBps: number;
  scheduledPaymentPence: number;
  intervalUnit: string;
  intervalCount: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  startDate: Date;
  termEndDate: Date | null;
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export function LoanForm({
  action,
  properties,
  activePropertyId,
  isAll,
  submitLabel,
  values,
}: {
  action: (formData: FormData) => void | Promise<void>;
  properties: { id: string; name: string }[];
  activePropertyId: string | null;
  isAll: boolean;
  submitLabel: string;
  values?: LoanFormValues;
}) {
  return (
    <form action={action} className="card space-y-4 p-5">
      {values?.id && <input type="hidden" name="id" value={values.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Property</span>
          {isAll || !activePropertyId ? (
            <select name="propertyId" required className="field" defaultValue={activePropertyId ?? ""}>
              <option value="">Choose a property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          ) : (
            <>
              <input type="hidden" name="propertyId" value={activePropertyId} />
              <div className="field bg-surface-sunk">
                {properties.find((p) => p.id === activePropertyId)?.name ?? "—"}
              </div>
            </>
          )}
        </label>

        <label className="block">
          <span className="label">Name</span>
          <input name="name" required className="field" placeholder="Santander BTL" defaultValue={values?.name ?? ""} />
        </label>

        <label className="block">
          <span className="label">Type</span>
          <select name="kind" required className="field" defaultValue={values?.kind ?? "interestOnly"}>
            <option value="interestOnly">Interest-only</option>
            <option value="repayment">Repayment</option>
          </select>
        </label>

        <label className="block">
          <span className="label">Outstanding balance</span>
          <MoneyInput name="openingBalance" required defaultValue={values ? (values.openingBalancePence / 100).toFixed(2) : ""} />
          <span className="mt-1 block text-xs text-muted">The balance as at the start date below.</span>
        </label>

        <label className="block">
          <span className="label">Interest rate (%)</span>
          <input
            name="annualRate" required inputMode="decimal" className="field" placeholder="2.7"
            defaultValue={values ? (values.annualRateBps / 100).toString() : ""}
          />
        </label>

        <label className="block">
          <span className="label">Payment amount</span>
          <MoneyInput name="scheduledPayment" required defaultValue={values ? (values.scheduledPaymentPence / 100).toFixed(2) : ""} />
          <span className="mt-1 block text-xs text-muted">The full amount that leaves your bank, including any overpayment.</span>
        </label>

        <label className="block">
          <span className="label">Frequency</span>
          <select name="intervalUnit" className="field" defaultValue={values?.intervalUnit ?? "MONTH"}>
            <option value="MONTH">Monthly</option>
            <option value="WEEK">Weekly</option>
            <option value="YEAR">Yearly</option>
            <option value="DAY">Daily</option>
          </select>
        </label>

        <label className="block">
          <span className="label">Every</span>
          <input name="intervalCount" type="number" min={1} className="field" defaultValue={values?.intervalCount ?? 1} />
        </label>

        <label className="block">
          <span className="label">Day of month</span>
          <input name="dayOfMonth" type="number" min={1} max={31} className="field" defaultValue={values?.dayOfMonth ?? 1} />
          <span className="mt-1 block text-xs text-muted">31 means the last day of the month.</span>
        </label>

        <label className="block">
          <span className="label">Day of week</span>
          <select name="dayOfWeek" className="field" defaultValue={values?.dayOfWeek ?? ""}>
            <option value="">—</option>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">Weekly schedules only.</span>
        </label>

        <label className="block">
          <span className="label">Month</span>
          <input name="monthOfYear" type="number" min={1} max={12} className="field" defaultValue={values?.monthOfYear ?? ""} />
          <span className="mt-1 block text-xs text-muted">Yearly schedules only.</span>
        </label>

        <label className="block">
          <span className="label">First payment from</span>
          <input name="startDate" type="date" required className="field" defaultValue={iso(values?.startDate ?? null)} />
          <span className="mt-1 block text-xs text-muted">The balance above is as at this date, and interest accrues from it. Your first payment will be the next scheduled date after it.</span>
        </label>

        <label className="block">
          <span className="label">Term ends (optional)</span>
          <input name="termEndDate" type="date" className="field" defaultValue={iso(values?.termEndDate ?? null)} />
          <span className="mt-1 block text-xs text-muted">Interest-only loans get a warning about the balance due then.</span>
        </label>
      </div>

      <button type="submit" className="btn btn-primary">{submitLabel}</button>
    </form>
  );
}
```

- [ ] **Step 2: Confirm the class names (already verified — do not substitute)**

`globals.css` defines `.field` (inputs and selects), `.label`, `.card`, `.btn`,
`.btn-primary`, `.btn-ghost`, `.ledger`, `.money`. There is **no** `.input` and **no**
`.hint` class — hints use `mt-1 block text-xs text-muted`, matching `RecurringForm.tsx`.

`MoneyInput` spreads `InputHTMLAttributes<HTMLInputElement>` onto the inner input and applies
`.field` itself, so `name`, `required` and `defaultValue` pass through as written above.

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/loans/LoanForm.tsx"
git commit -m "feat(loans): loan create/edit form"
```

---

## Task 11: Loans list and new-loan pages

**Files:**
- Create: `src/app/(app)/loans/page.tsx`
- Create: `src/app/(app)/loans/new/page.tsx`

- [ ] **Step 1: Write the list page**

`src/app/(app)/loans/page.tsx`:

```tsx
import Link from "next/link";
import { listLoans } from "../../../lib/data/loans";
import { getActiveProperty, listProperties } from "../../../lib/data/activeProperty";
import { formatGBP } from "../../../lib/tax/money";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";
import { ConfirmSubmit } from "../_ui/ConfirmSubmit";
import { deleteLoanAction, setLoanActiveAction } from "./actions";

export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const active = await getActiveProperty();
  const properties = await listProperties();
  const loans = await listLoans(active.propertyId);
  const headingProperty = active.isAll
    ? "All properties"
    : (properties.find((p) => p.id === active.propertyId)?.name ?? "—");

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Mortgages & loans" subtitle={headingProperty} />
      </div>

      {error && <Banner variant="error">{error}</Banner>}
      {ok && <Banner variant="success">{ok}</Banner>}

      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <Link href="/loans/new" className="btn btn-primary">Add a loan</Link>
      </section>

      <section className="reveal" style={{ animationDelay: "120ms" }}>
        {loans.length === 0 ? (
          <EmptyState
            title="No loans yet"
            hint="Only the interest on a mortgage payment is deductible. Add your loan and Quidly will split each payment into interest and capital for you."
          />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ledger">
                <thead>
                  <tr>
                    {active.isAll && <th>Property</th>}
                    <th>Loan</th>
                    <th>Rate</th>
                    <th className="text-right">Payment</th>
                    <th className="text-right">Balance</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loans.map((l) => (
                    <tr key={l.id} className={l.active ? "" : "opacity-55"}>
                      {active.isAll && <td className="text-muted">{l.property?.name}</td>}
                      <td>
                        <Link href={`/loans/${l.id}`} className="font-medium text-ink hover:underline">
                          {l.name}
                        </Link>
                        {!l.active && (
                          <span className="ml-2 rounded-md bg-surface-sunk px-2 py-0.5 text-xs text-muted">Paused</span>
                        )}
                        <div className="text-sm text-muted">
                          {l.kind === "interestOnly" ? "Interest-only" : "Repayment"}
                        </div>
                      </td>
                      <td className="text-muted">{(l.annualRateBps / 100).toFixed(2)}%</td>
                      <td className="money text-right">{formatGBP(l.scheduledPaymentPence)}</td>
                      <td className="money text-right">{formatGBP(l.openingBalancePence)}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-3">
                          <Link href={`/loans/${l.id}/edit`} className="btn btn-ghost !px-3 !py-1.5 text-xs">Edit</Link>
                          <form action={setLoanActiveAction}>
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="active" value={l.active ? "false" : "true"} />
                            <button type="submit" className="btn btn-ghost !px-3 !py-1.5 text-xs">
                              {l.active ? "Pause" : "Resume"}
                            </button>
                          </form>
                          <form action={deleteLoanAction}>
                            <input type="hidden" name="id" value={l.id} />
                            <ConfirmSubmit confirm="Delete this loan? This can't be undone.">Delete</ConfirmSubmit>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
```

Note: the `Balance` column shows `openingBalancePence` (the figure the user entered). The
detail page shows the live balance from the latest payment.

- [ ] **Step 2: Write the new-loan page**

`src/app/(app)/loans/new/page.tsx`:

```tsx
import Link from "next/link";
import { getActiveProperty, listProperties } from "../../../../lib/data/activeProperty";
import { PageHeader } from "../../_ui/PageHeader";
import { Banner } from "../../_ui/Banner";
import { LoanForm } from "../LoanForm";
import { addLoanAction } from "../actions";

export default async function NewLoanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const active = await getActiveProperty();
  const properties = await listProperties();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Add a loan" subtitle="Quidly splits each payment into interest and capital" />
      {error && <Banner variant="error">{error}</Banner>}
      <LoanForm
        action={addLoanAction}
        properties={properties}
        activePropertyId={active.propertyId}
        isAll={active.isAll}
        submitLabel="Add loan"
      />
      <Link href="/loans" className="btn btn-ghost">Back to loans</Link>
    </div>
  );
}
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/loans/page.tsx" "src/app/(app)/loans/new/page.tsx"
git commit -m "feat(loans): loans list and add-loan pages"
```

---

## Task 12: Loan detail page

**Files:**
- Create: `src/app/(app)/loans/[id]/page.tsx`

- [ ] **Step 1: Write the detail page**

`src/app/(app)/loans/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLoan } from "../../../../lib/data/loans";
import { capitalNoReliefPence } from "../../../../lib/data/loanGeneration";
import { loanAdvice } from "../../../../lib/loans/advice";
import { getOrCreateProfile } from "../../../../lib/data/taxProfile";
import { latestConfiguredTaxYear } from "../../../../lib/tax/taxYear";
import { formatGBP } from "../../../../lib/tax/money";
import type { LoanKind } from "../../../../lib/tax/types";
import { PageHeader } from "../../_ui/PageHeader";
import { Banner } from "../../_ui/Banner";
import { generateLoanPaymentsAction, setActualInterestAction } from "../actions";

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function LoanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const loan = await getLoan(id);
  if (!loan) notFound();

  const taxYear = latestConfiguredTaxYear();
  const profile = await getOrCreateProfile(taxYear);
  const capitalPence = await capitalNoReliefPence(id, taxYear);
  const currentBalancePence = loan.payments.at(-1)?.closingBalancePence ?? loan.openingBalancePence;

  const advice = loanAdvice({
    annualRateBps: loan.annualRateBps,
    ownershipType: loan.property.ownershipType,
    taxYear,
    region: profile.region,
    kind: loan.kind as LoanKind,
    capitalNoReliefPence: capitalPence,
    termEndDate: loan.termEndDate,
    currentBalancePence,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title={loan.name}
        subtitle={`${loan.property.name} · ${loan.kind === "interestOnly" ? "Interest-only" : "Repayment"}`}
      />

      {error && <Banner variant="error">{error}</Banner>}
      {ok && <Banner variant="success">{ok}</Banner>}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Balance</div>
          <div className="money mt-1 text-xl text-ink">{formatGBP(currentBalancePence)}</div>
        </div>
        <div className="card p-4">
          <div className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Rate</div>
          <div className="money mt-1 text-xl text-ink">{(advice.nominalRateBps / 100).toFixed(2)}%</div>
          <div className="mt-1 text-sm text-muted">
            {advice.reliefBasis === "section24Reducer"
              ? `${(advice.effectiveRateBps / 100).toFixed(2)}% after ${(advice.reducerBps / 100).toFixed(0)}% relief`
              : "Interest deducted in full against company profits"}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Capital, {taxYear}</div>
          <div className="money mt-1 text-xl text-ink">{formatGBP(advice.capitalNoReliefPence)}</div>
          <div className="mt-1 text-sm text-muted">No tax relief — capital is not deductible</div>
        </div>
      </section>

      {advice.termEnd && (
        <Banner variant="error">
          This is an interest-only loan. {formatGBP(advice.termEnd.balanceDuePence)} is still
          due when the term ends on {fmtDate(advice.termEnd.date)}.
        </Banner>
      )}

      <section className="flex gap-3">
        <form action={generateLoanPaymentsAction}>
          <input type="hidden" name="id" value={loan.id} />
          <button type="submit" className="btn btn-primary">Record payments due</button>
        </form>
        <Link href={`/loans/${loan.id}/reconcile?ty=${taxYear}`} className="btn btn-ghost">
          Check against my statement
        </Link>
      </section>

      <section>
        <div className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Payments</div>
        {loan.payments.length === 0 ? (
          <div className="card p-5 text-muted">
            No payments recorded yet. Use “Record payments due” above.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Opening</th>
                    <th className="text-right">Interest</th>
                    <th className="text-right">Capital</th>
                    <th className="text-right">Closing</th>
                    <th>Actual interest</th>
                  </tr>
                </thead>
                <tbody>
                  {loan.payments.map((p) => {
                    const interest = p.actualInterestPence ?? p.computedInterestPence;
                    return (
                      <tr key={p.id}>
                        <td className="text-muted">{fmtDate(p.date)}</td>
                        <td className="money text-right">{formatGBP(p.openingBalancePence)}</td>
                        <td className="money text-right">
                          {formatGBP(interest)}
                          {p.actualInterestPence != null && (
                            <span className="ml-1.5 text-xs text-muted">actual</span>
                          )}
                        </td>
                        <td className="money text-right">{formatGBP(p.paidPence - interest)}</td>
                        <td className="money text-right">{formatGBP(p.closingBalancePence)}</td>
                        <td>
                          <form action={setActualInterestAction} className="flex items-center gap-2">
                            <input type="hidden" name="loanId" value={loan.id} />
                            <input type="hidden" name="paymentId" value={p.id} />
                            <input
                              name="actualInterest" inputMode="decimal" className="field !py-1 !text-sm"
                              placeholder={(interest / 100).toFixed(2)} aria-label="Actual interest"
                            />
                            <button type="submit" className="btn btn-ghost !px-3 !py-1 text-xs">Set</button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <Link href="/loans" className="btn btn-ghost">Back to loans</Link>
    </div>
  );
}
```

- [ ] **Step 2: Note the profile accessor (already verified)**

`src/lib/data/taxProfile.ts` exports `getOrCreateProfile(taxYear)` — there is no
`getTaxProfile`. It upserts and returns the `TaxYearProfile` row, which carries `region`.
The code above uses the correct name.

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/loans/[id]/page.tsx"
git commit -m "feat(loans): loan detail with advice and payment schedule"
```

---

## Task 13: Edit and reconcile pages

**Files:**
- Create: `src/app/(app)/loans/[id]/edit/page.tsx`
- Create: `src/app/(app)/loans/[id]/reconcile/page.tsx`

- [ ] **Step 1: Write the edit page**

`src/app/(app)/loans/[id]/edit/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLoan } from "../../../../../lib/data/loans";
import { listProperties } from "../../../../../lib/data/activeProperty";
import { PageHeader } from "../../../_ui/PageHeader";
import { Banner } from "../../../_ui/Banner";
import { LoanForm } from "../../LoanForm";
import { updateLoanAction } from "../../actions";

export default async function EditLoanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const loan = await getLoan(id);
  if (!loan) notFound();
  const properties = await listProperties();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Edit loan" subtitle={loan.name} />
      {error && <Banner variant="error">{error}</Banner>}
      <Banner variant="success">
        Changing the rate only affects payments recorded from now on — payments already
        recorded keep the interest figure they were given.
      </Banner>
      <LoanForm
        action={updateLoanAction}
        properties={properties}
        activePropertyId={loan.propertyId}
        isAll={false}
        submitLabel="Save loan"
        values={{
          id: loan.id,
          name: loan.name,
          kind: loan.kind as "interestOnly" | "repayment",
          openingBalancePence: loan.openingBalancePence,
          annualRateBps: loan.annualRateBps,
          scheduledPaymentPence: loan.scheduledPaymentPence,
          intervalUnit: loan.intervalUnit,
          intervalCount: loan.intervalCount,
          dayOfWeek: loan.dayOfWeek,
          dayOfMonth: loan.dayOfMonth,
          monthOfYear: loan.monthOfYear,
          startDate: loan.startDate,
          termEndDate: loan.termEndDate,
        }}
      />
      <Link href={`/loans/${loan.id}`} className="btn btn-ghost">Back to loan</Link>
    </div>
  );
}
```

- [ ] **Step 2: Write the reconcile page**

`src/app/(app)/loans/[id]/reconcile/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLoan } from "../../../../../lib/data/loans";
import { reconcileYear } from "../../../../../lib/data/loanGeneration";
import { latestConfiguredTaxYear, isConfiguredTaxYear, taxYearOptions } from "../../../../../lib/tax/taxYear";
import { formatGBP } from "../../../../../lib/tax/money";
import { PageHeader } from "../../../_ui/PageHeader";
import { Banner } from "../../../_ui/Banner";
import { applyYearVarianceAction } from "../../actions";

export default async function ReconcilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ty?: string; error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { ty, error, ok } = await searchParams;
  const loan = await getLoan(id);
  if (!loan) notFound();

  const taxYear = ty && isConfiguredTaxYear(ty) ? ty : latestConfiguredTaxYear();
  const { recordedInterestPence, paymentCount } = await reconcileYear(id, taxYear);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Check against my statement" subtitle={`${loan.name} · ${taxYear}`} />

      {error && <Banner variant="error">{error}</Banner>}
      {ok && <Banner variant="success">{ok}</Banner>}

      <nav className="flex flex-wrap gap-2">
        {taxYearOptions().map((y) => (
          <Link
            key={y}
            href={`/loans/${id}/reconcile?ty=${y}`}
            className={`btn ${y === taxYear ? "btn-primary" : "btn-ghost"} !px-3 !py-1.5 text-xs`}
          >
            {y}
          </Link>
        ))}
      </nav>

      <div className="card space-y-2 p-5">
        <div className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">
          Interest recorded in {taxYear}
        </div>
        <div className="money text-2xl text-ink">{formatGBP(recordedInterestPence)}</div>
        <div className="text-sm text-muted">
          Across {paymentCount} payment{paymentCount === 1 ? "" : "s"}. This is the figure
          that reaches SA105 box 44.
        </div>
      </div>

      <form action={applyYearVarianceAction} className="card space-y-4 p-5">
        <input type="hidden" name="loanId" value={id} />
        <input type="hidden" name="taxYear" value={taxYear} />
        <label className="block">
          <span className="label">Interest on your lender's annual statement</span>
          <input name="statementInterest" required inputMode="decimal" className="field" placeholder="1917.00" />
          <span className="mt-1 block text-xs text-muted">
            Quidly adjusts the final payment of the year so the total matches your statement
            exactly. Your statement is the figure HMRC would check against.
          </span>
        </label>
        <button type="submit" className="btn btn-primary" disabled={paymentCount === 0}>
          Match my statement
        </button>
        {paymentCount === 0 && (
          <p className="text-sm text-muted">Record some payments for {taxYear} first.</p>
        )}
      </form>

      <Link href={`/loans/${id}`} className="btn btn-ghost">Back to loan</Link>
    </div>
  );
}
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/loans/[id]/edit/page.tsx" "src/app/(app)/loans/[id]/reconcile/page.tsx"
git commit -m "feat(loans): edit and statement-reconcile pages"
```

---

## Task 14: Navigation entry

**Files:**
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Add the nav item**

In `src/app/(app)/layout.tsx`, in the `Bookkeeping` group's `items` array, add after the
`/recurring` entry:

```ts
        { href: "/loans", label: "Mortgages & loans" },
```

The group then reads:

```ts
    {
      heading: "Bookkeeping",
      items: [
        { href: "/transactions", label: "Transactions" },
        { href: "/recurring", label: "Recurring" },
        { href: "/loans", label: "Mortgages & loans" },
        { href: "/import", label: "Import" },
        ...(isExtractionEnabled() ? [{ href: "/scan", label: "Scan a receipt" }] : []),
      ],
    },
```

`MobileNav` receives the same `groups` array from this layout, so no separate change is
needed there.

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat(loans): add Mortgages & loans to the nav"
```

---

## Task 15: CSV import matcher

**Files:**
- Create: `src/lib/import/loanMatch.ts`
- Test: `src/lib/import/loanMatch.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/import/loanMatch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchLoanPayment, type LoanCandidate } from "./loanMatch";

const LOAN: LoanCandidate = {
  loanId: "loan1",
  name: "Santander BTL",
  scheduledPaymentPence: 75_000,
  scheduledDates: [new Date("2026-05-01T00:00:00Z"), new Date("2026-06-01T00:00:00Z")],
};

describe("matchLoanPayment", () => {
  it("matches an exact payment on the scheduled date", () => {
    const m = matchLoanPayment({ date: new Date("2026-05-01T00:00:00Z"), amountPence: 75_000, direction: "out" }, [LOAN]);
    expect(m?.loanId).toBe("loan1");
  });

  it("matches within 5 days of the scheduled date", () => {
    const m = matchLoanPayment({ date: new Date("2026-05-05T00:00:00Z"), amountPence: 75_000, direction: "out" }, [LOAN]);
    expect(m?.loanId).toBe("loan1");
  });

  it("does not match 6 days out", () => {
    const m = matchLoanPayment({ date: new Date("2026-05-07T00:00:00Z"), amountPence: 75_000, direction: "out" }, [LOAN]);
    expect(m).toBeNull();
  });

  // Voluntary overpayments vary, so the amount band is deliberately generous.
  it("matches a slightly different amount within tolerance", () => {
    const m = matchLoanPayment({ date: new Date("2026-05-01T00:00:00Z"), amountPence: 76_400, direction: "out" }, [LOAN]);
    expect(m?.loanId).toBe("loan1");
  });

  it("does not match an amount well outside tolerance", () => {
    const m = matchLoanPayment({ date: new Date("2026-05-01T00:00:00Z"), amountPence: 40_000, direction: "out" }, [LOAN]);
    expect(m).toBeNull();
  });

  it("ignores money coming in", () => {
    const m = matchLoanPayment({ date: new Date("2026-05-01T00:00:00Z"), amountPence: 75_000, direction: "in" }, [LOAN]);
    expect(m).toBeNull();
  });

  it("returns the row's actual amount, not the scheduled figure", () => {
    const m = matchLoanPayment({ date: new Date("2026-05-01T00:00:00Z"), amountPence: 76_400, direction: "out" }, [LOAN]);
    expect(m?.paidPence).toBe(76_400);
  });

  it("returns null when there are no candidate loans", () => {
    expect(matchLoanPayment({ date: new Date("2026-05-01T00:00:00Z"), amountPence: 75_000, direction: "out" }, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/import/loanMatch.test.ts`
Expected: FAIL — `Failed to resolve import "./loanMatch"`.

- [ ] **Step 3: Write the implementation**

`src/lib/import/loanMatch.ts`:

```ts
import type { Direction } from "../tax/types";

const DAY_TOLERANCE = 5;
const MIN_AMOUNT_TOLERANCE_PENCE = 500;
const AMOUNT_TOLERANCE_FRACTION = 0.02;

export interface LoanCandidate {
  loanId: string;
  name: string;
  scheduledPaymentPence: number;
  /** Scheduled dates with no LoanPayment recorded yet. */
  scheduledDates: Date[];
}

export interface LoanMatch {
  loanId: string;
  name: string;
  /** The date on the imported row, not the scheduled date. */
  date: Date;
  /** The imported row's actual amount — voluntary overpayments must carry through. */
  paidPence: number;
}

function amountTolerance(scheduledPaymentPence: number): number {
  return Math.max(MIN_AMOUNT_TOLERANCE_PENCE, scheduledPaymentPence * AMOUNT_TOLERANCE_FRACTION);
}

function withinDays(a: Date, b: Date, days: number): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= days * 86_400_000;
}

/**
 * Suggest a loan for an imported bank debit. Never applies the split automatically —
 * a mis-split lands silently in SA105 box 44, which is the error this whole feature exists
 * to prevent.
 */
export function matchLoanPayment(
  row: { date: Date; amountPence: number; direction: Direction },
  candidates: LoanCandidate[],
): LoanMatch | null {
  if (row.direction !== "out") return null;

  for (const loan of candidates) {
    const closeEnough =
      Math.abs(row.amountPence - loan.scheduledPaymentPence) <= amountTolerance(loan.scheduledPaymentPence);
    if (!closeEnough) continue;
    if (!loan.scheduledDates.some((d) => withinDays(row.date, d, DAY_TOLERANCE))) continue;
    return { loanId: loan.loanId, name: loan.name, date: row.date, paidPence: row.amountPence };
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/import/loanMatch.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/loanMatch.ts src/lib/import/loanMatch.test.ts
git commit -m "feat(loans): suggest loan splits for imported bank debits"
```

---

## Task 16: Flag probable loan payments in the CSV import preview

**This task was rewritten after reading the real import flow.** The original version targeted
`src/app/(app)/import/review/page.tsx` and assumed a per-row category `<select>` to hang a
hint beside. Neither exists:

- There is no `import/review/` route. The whole flow is one page,
  `src/app/(app)/import/page.tsx`, with three steps driven by search params (paste CSV →
  map columns → preview + confirm). The `review/` directory that misled the plan belongs to
  receipt scanning (`src/app/(app)/scan/review/`).
- The import applies **one category to every row** (`confirmImportAction` reads a single
  `categoryId`). There is no per-row category control.

That second point makes the warning *more* important, not less: a landlord importing a
statement picks one category for the batch, so a £750 mortgage debit would be filed whole
under whatever they chose — the exact overclaim this feature exists to prevent.

The right seam is `PreviewRow`, rendered in the step-3 preview table's Status column.

**Files:**
- Modify: `src/lib/data/loanGeneration.ts` (add `loanPaymentCandidates`)
- Modify: `src/app/(app)/import/actions.ts` (`PreviewRow` + `buildPreview`)
- Modify: `src/app/(app)/import/page.tsx` (render the warning)

- [ ] **Step 1: Expose the candidate list**

Append to `src/lib/data/loanGeneration.ts`:

```ts
import { type LoanCandidate } from "../import/loanMatch";

/**
 * Active loans for a property with their scheduled payment dates, for the CSV-import
 * matcher. Unlike generation this lists dates from the loan's origin regardless of what has
 * already been recorded — a landlord importing a statement should still be warned about a
 * row that duplicates a payment they entered by hand, because importing it as one line would
 * file the whole amount as deductible.
 */
export async function loanPaymentCandidates(
  propertyId: string,
  asOf: Date,
): Promise<LoanCandidate[]> {
  const loans = await prisma.loan.findMany({ where: { propertyId, active: true } });
  return loans.map((loan) => ({
    loanId: loan.id,
    name: loan.name,
    scheduledPaymentPence: loan.scheduledPaymentPence,
    scheduledDates: recurringOccurrences(
      { ...toLoanOccurrenceRule(loan), lastGeneratedDate: loan.startDate },
      asOf,
    ),
  }));
}
```

- [ ] **Step 2: Flag matched rows in the preview**

In `src/app/(app)/import/actions.ts`, extend `PreviewRow` and `buildPreview`:

```ts
export interface PreviewRow {
  ok: boolean; date?: string; direction?: string; amountPence?: number;
  description?: string; error?: string; duplicate?: boolean;
  /** Set when this debit looks like a payment on one of the property's loans. */
  loanMatch?: { loanId: string; name: string };
}
```

Add the imports:

```ts
import { matchLoanPayment } from "../../../lib/import/loanMatch";
import { loanPaymentCandidates } from "../../../lib/data/loanGeneration";
```

In `buildPreview`, load candidates once (bounded by the latest row date so the occurrence
walk stays short), then annotate each parsed row:

```ts
export async function buildPreview(csvText: string, mapping: ColumnMapping, propertyId: string): Promise<PreviewRow[]> {
  await requireSession();
  const existing = await listTransactions(propertyId);
  const { rows } = parseCsv(csvText);

  const parsed = rows.map((row) => {
    try { return { m: mapImportRow(row, mapping) }; }
    catch (e) { return { error: (e as Error).message }; }
  });

  // Walk occurrences only as far as the statement actually goes.
  const latest = parsed.reduce<Date | null>(
    (max, p) => (p.m && (!max || p.m.date > max) ? p.m.date : max), null,
  );
  const candidates = latest ? await loanPaymentCandidates(propertyId, latest) : [];

  return parsed.map((p) => {
    if (!p.m) return { ok: false, error: p.error };
    const match = matchLoanPayment(p.m, candidates);
    return {
      ok: true,
      date: p.m.date.toISOString().slice(0, 10),
      direction: p.m.direction,
      amountPence: p.m.amountPence,
      description: p.m.description,
      duplicate: isDuplicate(p.m, existing),
      ...(match ? { loanMatch: { loanId: match.loanId, name: match.name } } : {}),
    };
  });
}
```

`confirmImportAction` is deliberately **unchanged** — the flag is advisory. Blocking the
import would be the wrong call: the user may have a legitimate reason, and silently dropping
rows they asked to import is worse than warning them.

- [ ] **Step 3: Render the warning**

In `src/app/(app)/import/page.tsx`'s step-3 preview table, replace the status cell so a
matched row shows the warning alongside its normal status:

```tsx
                    <td className={!r.ok ? "text-negative text-sm" : r.duplicate ? "text-faint text-sm" : "text-muted text-sm"}>
                      {!r.ok ? `error: ${r.error}` : r.duplicate ? "duplicate (skip)" : "import"}
                      {r.loanMatch && (
                        <span className="mt-1 block text-xs text-negative">
                          Looks like a payment on {r.loanMatch.name}. Only the interest is
                          deductible — record it from{" "}
                          <a href={`/loans/${r.loanMatch.loanId}`} className="underline">the loan page</a>{" "}
                          instead of importing it as one line.
                        </span>
                      )}
                    </td>
```

Also add a summary line above the table, so the warning is visible without scanning every row:

```tsx
        {preview.some((r) => r.loanMatch) && (
          <Banner variant="error">
            {preview.filter((r) => r.loanMatch).length} row(s) look like mortgage payments.
            Importing those as a single line would treat the whole payment as deductible —
            record them from the loan page so the interest and capital are split.
          </Banner>
        )}
```

- [ ] **Step 4: Verify types and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run the build per Task 17's note about the throwaway database.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/loanGeneration.ts "src/app/(app)/import/actions.ts" "src/app/(app)/import/page.tsx"
git commit -m "feat(loans): warn about probable loan payments in the CSV import preview"
```

## Task 17: Documentation and final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the feature bullet**

In `README.md`, under `## Features`, add after the **Bookkeeping** bullet:

```markdown
- **Mortgages & loans** — model a loan once and Quidly splits every payment into deductible
  interest (SA105 box 44) and non-deductible capital repayment, shows your effective rate
  after the Section 24 reducer, and reconciles the year against your lender's statement.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: **one pre-existing failure and nothing else.** `scripts/migrate-akaunting/apply.test.ts`
fails with `Cannot open database because the directory does not exist` because its `beforeAll`
points a bare `better-sqlite3` handle at `akaunting-migration/test-apply.db` and that
directory does not exist in a fresh checkout. This was verified to fail identically on the
commit before this feature branch's work began — it is **not** a regression, and fixing it is
out of scope. Do not "fix" it by creating that directory as a side effect of this task.

So the target is `Test Files 1 failed | N passed`, with the single failure being that file.
If any *other* file fails, that is a real regression — stop and investigate.

New tests added by this feature: 20 in `src/lib/loans/schedule.test.ts` (17 from Tasks 3–4
plus 3 regression from Task 5 — the counts in those tasks are cumulative within the one
file), 8 in `advice.test.ts`, 9 in `src/lib/data/loans.test.ts`, 8 in `loanMatch.test.ts`,
and 3 in `categories.test.ts` — 48 in total.

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 4: Live-run the feature**

Run: `npm run dev`

Then, in the browser:
1. Go to `/loans` → **Add a loan**. Enter: name `Test BTL`, Interest-only, balance
   `71000`, rate `2.7`, payment `750`, Monthly, day of month `1`, start date
   `2026-04-01`, term end `2031-06-30`.
2. On the detail page, confirm the rate card reads **2.70%** and **2.16% after 20% relief**,
   and that the interest-only banner names the balance due on 30 Jun 2031.
3. Click **Record payments due**. Confirm the schedule table shows a falling balance and
   roughly £160 interest / £590 capital per row.
4. Go to `/transactions` and confirm each payment appears as **two** rows — one
   `Mortgage / loan interest`, one `Loan capital repayment`.
5. Go to `/sa105`. Confirm box 44 holds only the interest total, and that the capital
   total appears nowhere in the expenses or profit figures.
6. Back on the loan, click **Check against my statement**, enter `1900`, and confirm the
   recorded total becomes exactly £1,900.00.
7. Click **Record payments due** again and confirm it records **0** further payments
   (idempotency).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: describe mortgage and loan tracking"
```

---

## Self-review notes

**Spec coverage:** every spec section maps to a task — data model (1), seed category (2),
pure schedule logic (3–4), the box-44 regression test (5), advisory readouts (6), data layer
including override/reconcile/`capitalNoReliefPence` (7–8), routing and UI (9–13), nav (14),
CSV import (15–16), docs and verification (17).

**Known limitations, all documented in code comments:**
- Overriding a mid-year payment's interest does not cascade to later opening balances.
  `applyYearVariance` targets the year's final payment to keep this contained.
- `startDate` is the accrual origin, not a payment date. The first payment is the first
  scheduled date strictly after it, so no payment ever has a zero-day accrual period.
  (`derivePayment` still handles `daysInPeriod: 0` defensively, and that is unit-tested.)
- The list page's Balance column shows the entered opening balance; the live balance is on
  the detail page.

**Deviations from the spec to raise at handoff:** `LoanPayment.closingBalancePence` added
(denormalised, written in the same transaction that computes it); `src/lib/loans/categories.ts`
added so the seed and data layer share one string.

**Verified while planning** (do not second-guess these): `.field` is the input class and
there is no `.input` or `.hint`; `MoneyInput` spreads input attributes; the profile accessor
is `getOrCreateProfile`, not `getTaxProfile`; `sa105Boxes()` skips transactions with a null
box, so capital repayments cannot leak into any SA105 figure; `propertySurchargeBps` returns
200 for 2027-28 E/W/NI and 0 for Scotland.

**Task 16 is the one task with an unread dependency** — `src/app/(app)/import/review/page.tsx`
was not read while planning. Read it first and fit the hint into its existing per-row
rendering rather than restructuring it.

**Arithmetic in the tests was hand-checked**: £71,000 at 270bps over 31 days is 16,281p;
over 28 days 14,706p; £100,000 at 500bps over 30 days is 41,096p; 270bps after a 2000bps
reducer is 216bps, after 2200bps is 211bps.
