export interface DividendRates {
  allowancePence: number;        // 0% dividend allowance (still occupies band space)
  personalAllowancePence: number;
  paTaperStartPence: number;     // income above which the personal allowance tapers
  basicLimitPence: number;       // width of the basic-rate band above the personal allowance
  additionalStartPence: number;  // total income at which the additional rate begins
  ordinaryRate: number;
  upperRate: number;
  additionalRate: number;
}

const DIVIDEND_2025_26: DividendRates = {
  allowancePence: 500_00,
  personalAllowancePence: 12_570_00,
  paTaperStartPence: 100_000_00,
  basicLimitPence: 37_700_00,
  additionalStartPence: 125_140_00,
  ordinaryRate: 0.0875,
  upperRate: 0.3375,
  additionalRate: 0.3935,
};

const DIVIDEND_RATES: Record<string, DividendRates> = { "2025-26": DIVIDEND_2025_26 };
const LATEST_YEAR = "2025-26";

function effectivePersonalAllowance(totalIncomePence: number, r: DividendRates): number {
  if (totalIncomePence <= r.paTaperStartPence) return r.personalAllowancePence;
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
  const basicTop = pa + r.basicLimitPence;   // total-income boundary: ordinary → upper
  const addStart = r.additionalStartPence;   // total-income boundary: upper → additional

  // The taxable dividend is the part of [otherIncome, total] above the personal allowance.
  let cursor = Math.max(otherIncomePence, pa);
  let remaining = Math.max(0, total - cursor);
  let allowanceLeft = r.allowancePence;
  let tax = 0;

  while (remaining > 0) {
    let rate: number;
    let bandEnd: number;
    if (cursor < basicTop) { rate = r.ordinaryRate; bandEnd = basicTop; }
    else if (cursor < addStart) { rate = r.upperRate; bandEnd = addStart; }
    else { rate = r.additionalRate; bandEnd = Infinity; }

    const slice = Math.min(remaining, bandEnd - cursor);
    const zeroPart = Math.min(slice, allowanceLeft); // dividend allowance: 0% but uses band space
    tax += (slice - zeroPart) * rate;
    allowanceLeft -= zeroPart;
    cursor += slice;
    remaining -= slice;
  }

  return Math.round(tax);
}
