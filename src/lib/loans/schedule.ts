/** Loan payment splitting. All money is integer pence — never floats. */

import type { LoanKind } from "../tax/types";

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

export interface LoanTerms {
  kind: LoanKind;
  annualRateBps: number;
  /** Schedule metadata only. The amount actually debited is `PaymentInput.paidPence` —
   *  never pass this into `derivePayment` as the amount paid, because a landlord who
   *  overpays debits more than the schedule says. */
  scheduledPaymentPence: number;
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

/**
 * Split one payment into its deductible interest and non-deductible capital parts.
 *
 * One formula covers both loan kinds, because the payment amount is known:
 *   capital = paid - interest
 * `kind` therefore only drives the interest-only term-end warning, not the maths.
 *
 * Takes a single options object rather than positional arguments: several of these are
 * same-typed pence values of similar magnitude, and TypeScript cannot catch a transposed
 * pair of positional numbers — the failure mode would be a silently wrong SA105 box 44 figure.
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
