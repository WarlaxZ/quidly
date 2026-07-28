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

export interface LoanAdvice {
  nominalRateBps: number;
  /** Null when relief is by full deduction rather than the Section 24 reducer. */
  reducerBps: number | null;
  /** Rate after relief. Equals the nominal rate when reliefBasis is "fullDeduction" —
   *  the UI must not label it "after relief" in that case. */
  effectiveRateBps: number;
  reliefBasis: "section24Reducer" | "fullDeduction";
  capitalNoReliefPence: number;
  termEnd: { date: Date; balanceDuePence: number } | null;
}

export function loanAdvice(input: LoanAdviceInput): LoanAdvice {
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
      effectiveRateBps: input.annualRateBps,
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
