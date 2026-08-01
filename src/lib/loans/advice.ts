import { propertyReducerBps } from "../tax/bands";
import type { Region, LoanKind } from "../tax/types";

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
  /** See LoanAdviceInput.capitalNoReliefPence. */
  capitalNoReliefPence: number;
  termEnd: { date: Date; balanceDuePence: number } | null;
}

/**
 * Discriminated on `reliefBasis` so the company case cannot be misread. Narrowing on
 * `reliefBasis` narrows the rate fields too, so the compiler enforces the branch.
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

  const reducerBps = propertyReducerBps(input.taxYear, input.region);
  return {
    nominalRateBps: input.annualRateBps,
    reducerBps,
    effectiveRateBps: Math.round((input.annualRateBps * (10_000 - reducerBps)) / 10_000),
    reliefBasis: "section24Reducer",
    capitalNoReliefPence: input.capitalNoReliefPence,
    termEnd,
  };
}
