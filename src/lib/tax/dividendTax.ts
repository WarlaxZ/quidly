export interface DividendRates {
  allowancePence: number;        // 0% dividend allowance (still occupies band space)
  personalAllowancePence: number;
  paTaperStartPence: number;     // income above which the personal allowance tapers
  basicLimitPence: number;       // width of the basic-rate band above the personal allowance
  additionalStartPence: number;  // total income at which the additional rate begins
  ordinaryBps: number;     // basis points, e.g. 875 = 8.75%
  upperBps: number;
  additionalBps: number;
}

const DIVIDEND_2025_26: DividendRates = {
  allowancePence: 500_00,
  personalAllowancePence: 12_570_00,
  paTaperStartPence: 100_000_00,
  basicLimitPence: 37_700_00,
  additionalStartPence: 125_140_00,
  ordinaryBps: 875,
  upperBps: 3375,
  additionalBps: 3935,
};

const DIVIDEND_2026_27: DividendRates = {
  allowancePence: 500_00,
  personalAllowancePence: 12_570_00,
  paTaperStartPence: 100_000_00,
  basicLimitPence: 37_700_00,
  additionalStartPence: 125_140_00,
  ordinaryBps: 1075, // 10.75% (was 8.75%)
  upperBps: 3575,    // 35.75% (was 33.75%)
  additionalBps: 3935, // 39.35% (unchanged)
};

const DIVIDEND_2027_28: DividendRates = {
  // Unchanged from 2026-27 (the +2pp dividend uplift took effect in 2026-27).
  allowancePence: 500_00,
  personalAllowancePence: 12_570_00,
  paTaperStartPence: 100_000_00,
  basicLimitPence: 37_700_00,
  additionalStartPence: 125_140_00,
  ordinaryBps: 1075,
  upperBps: 3575,
  additionalBps: 3935,
};

const DIVIDEND_RATES: Record<string, DividendRates> = { "2025-26": DIVIDEND_2025_26, "2026-27": DIVIDEND_2026_27, "2027-28": DIVIDEND_2027_28 };
const LATEST_YEAR = "2027-28";

function effectivePersonalAllowance(totalIncomePence: number, r: DividendRates): number {
  if (totalIncomePence <= r.paTaperStartPence) return r.personalAllowancePence;
  // Taper computed in pence (HMRC tapers in whole pounds); the ≤50p divergence only arises
  // for non-whole-pound incomes and is immaterial for this estimation tool.
  const reduced = r.personalAllowancePence - Math.floor((totalIncomePence - r.paTaperStartPence) / 2);
  return Math.max(0, reduced);
}

/**
 * UK dividend tax on `dividendPence`, treated as the top slice of income above `otherIncomePence`.
 * Region-independent by design: Scotland's separate income-tax bands do NOT apply to dividends.
 * v1 assumption: dividends are the top slice; the personal-allowance taper uses total income.
 */
export function dividendTax(dividendPence: number, otherIncomePence: number, taxYear: string): number {
  if (dividendPence <= 0) return 0;
  const r = DIVIDEND_RATES[taxYear] ?? DIVIDEND_RATES[LATEST_YEAR];
  const total = otherIncomePence + dividendPence;
  const pa = effectivePersonalAllowance(total, r);
  const basicTop = pa + r.basicLimitPence;   // total-income boundary: ordinary → upper (PA-relative)
  // addStart is an ABSOLUTE total-income figure (not PA-relative); valid because the personal
  // allowance is already fully tapered to £0 well before £125,140.
  const addStart = r.additionalStartPence;   // total-income boundary: upper → additional

  // The taxable dividend is the part of [otherIncome, total] above the personal allowance.
  let cursor = Math.max(otherIncomePence, pa);
  let remaining = Math.max(0, total - cursor);
  let allowanceLeft = r.allowancePence;
  let taxNumerator = 0; // sum of (taxable pence × basis points); divided by 10,000 at the end

  while (remaining > 0) {
    let bps: number;
    let bandEnd: number;
    if (cursor < basicTop) { bps = r.ordinaryBps; bandEnd = basicTop; }
    else if (cursor < addStart) { bps = r.upperBps; bandEnd = addStart; }
    else { bps = r.additionalBps; bandEnd = Infinity; }

    const slice = Math.min(remaining, bandEnd - cursor);
    const zeroPart = Math.min(slice, allowanceLeft); // dividend allowance: 0% but uses band space
    taxNumerator += (slice - zeroPart) * bps;
    allowanceLeft -= zeroPart;
    cursor += slice;
    remaining -= slice;
  }

  return Math.round(taxNumerator / 10000);
}
