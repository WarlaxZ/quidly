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
