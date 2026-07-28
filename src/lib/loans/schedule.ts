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

export type LoanKind = "interestOnly" | "repayment";

export interface LoanTerms {
  kind: LoanKind;
  annualRateBps: number;
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

/**
 * Split one payment into its deductible interest and non-deductible capital parts.
 *
 * One formula covers both loan kinds, because the payment amount is known:
 *   capital = paid - interest
 * `kind` therefore only drives the interest-only term-end warning, not the maths.
 */
export function derivePayment(
  terms: LoanTerms,
  openingBalancePence: number,
  daysInPeriod: number,
  paidPence: number,
  actualInterestPence?: number | null,
): DerivedPayment {
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
      `Interest of ${interestPence}p exceeds the payment of ${paidPence}p. ` +
        `Record this as an arrears period, or correct the rate.`,
    );
  }

  let capitalPence = paidPence - interestPence;
  let fullyRedeemed = false;
  if (capitalPence >= openingBalancePence) {
    capitalPence = Math.max(0, openingBalancePence);
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
