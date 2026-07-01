/** Director's loan account: balance, s455 charge, and the beneficial-loan benefit-in-kind.
 *  v1 estimates with documented simplifications — not a P11D or a filed CT600.
 *  Rates are per-year basis-point config; VERIFY against HMRC each year. */

export interface LedgerEntryLike {
  date: Date;
  kind: string; // "dividend" | "director_loan_in" | "director_loan_out"
  amountPence: number;
}

export interface DLARates {
  s455Bps: number;                 // 3375 = 33.75%
  officialRateBps: number;         // 375 = 3.75% (official rate of interest) — VERIFY
  class1aBps: number;              // 1500 = 15% (employer Class 1A NIC) — VERIFY
  beneficialLoanThresholdPence: number; // 10,000
}

const DLA_2025_26: DLARates = {
  s455Bps: 3375,
  officialRateBps: 225, // 2.25% (2025-26 HMRC official rate of interest)
  class1aBps: 1500,
  beneficialLoanThresholdPence: 10_000_00,
};

const DLA_RATES: Record<string, DLARates> = { "2025-26": DLA_2025_26 };
const LATEST_YEAR = "2025-26";
// Unknown years fall back to the latest known year (v1 behaviour); update DLA_RATES each April.
function ratesFor(year: string): DLARates {
  return DLA_RATES[year] ?? DLA_RATES[LATEST_YEAR];
}

/** Σ director_loan_out − Σ director_loan_in for entries dated on/before `asOf`.
 *  Positive = director owes the company (overdrawn). Dividends are ignored. */
export function directorLoanBalance(entries: LedgerEntryLike[], asOf: Date): number {
  let balance = 0;
  for (const e of entries) {
    if (e.date.getTime() > asOf.getTime()) continue;
    if (e.kind === "director_loan_out") balance += e.amountPence;
    else if (e.kind === "director_loan_in") balance -= e.amountPence;
  }
  return balance;
}

/** s455 charge on an overdrawn balance (0 if in credit/nil). */
export function s455Charge(overdrawnPence: number, year: string): number {
  if (overdrawnPence <= 0) return 0;
  return Math.round((overdrawnPence * ratesFor(year).s455Bps) / 10000);
}

export interface BeneficialLoanInput {
  startBalancePence: number;
  endBalancePence: number;
  interestPaidPence: number;
  year: string;
}
export interface BeneficialLoanResult {
  applies: boolean;
  bikPence: number;
  class1aNicPence: number;
}

/** Beneficial-loan BIK by the averaging method, plus the company's Class 1A NIC.
 *  Applies only when the balance exceeds the £10,000 threshold at the year's start or end. */
export function beneficialLoanBenefit(input: BeneficialLoanInput): BeneficialLoanResult {
  const r = ratesFor(input.year);
  const peak = Math.max(input.startBalancePence, input.endBalancePence);
  if (peak <= r.beneficialLoanThresholdPence) {
    return { applies: false, bikPence: 0, class1aNicPence: 0 };
  }
  // Defer rounding to a single step (combine ÷2 averaging and ÷10000 rate), matching the
  // single-round money idiom used across the tax module.
  const sumClamped = Math.max(0, input.startBalancePence) + Math.max(0, input.endBalancePence);
  const gross = Math.round((sumClamped * r.officialRateBps) / 20000);
  const interestPaid = Math.max(0, input.interestPaidPence); // defensive: never inflate the BIK
  const bikPence = Math.max(0, gross - interestPaid);
  const class1aNicPence = Math.round((bikPence * r.class1aBps) / 10000);
  return { applies: true, bikPence, class1aNicPence };
}
