import { computeProfit, propertyAllowanceAdvice, financeCostReducer } from "./profit";
import { estimatePropertyTax } from "./incomeTax";
import { sa105Boxes } from "./sa105";
import type { Region, TaxTxn } from "./types";

const PROPERTY_ALLOWANCE_PENCE = 1_000_00;

export interface SummaryProfile {
  taxYear: string;
  otherIncomePence: number;
  region: Region;
  usePropertyAllowance: boolean;
}
export interface TaxYearSummary {
  incomePence: number;
  expensesPence: number;
  profitPence: number;
  financeCostsPence: number;
  taxableProfitPence: number;
  financeReducerPence: number;
  estimatedTaxPence: number;
  marginalRate: number;
  allowanceRecommended: boolean;
  sa105: Record<string, number>;
}
export function buildTaxYearSummary(txns: TaxTxn[], profile: SummaryProfile): TaxYearSummary {
  const { incomePence, expensesPence, profitPence } = computeProfit(txns);
  const financeCostsPence = txns
    .filter((t) => t.allowable && t.categoryKind === "finance")
    .reduce((sum, t) => sum + t.amountPence, 0);
  const advice = propertyAllowanceAdvice(incomePence, expensesPence);
  const taxableProfitPence = profile.usePropertyAllowance
    ? Math.max(0, incomePence - PROPERTY_ALLOWANCE_PENCE)
    : Math.max(0, profitPence);
  // The £1,000 property allowance is in lieu of ALL actual costs, including finance costs,
  // so the Section-24 finance reducer does not apply when the allowance is elected.
  const financeReducerPence = profile.usePropertyAllowance
    ? 0
    : financeCostReducer(financeCostsPence, taxableProfitPence);
  const { taxOnPropertyPence, marginalRate } = estimatePropertyTax({
    otherIncomePence: profile.otherIncomePence,
    taxableProfitPence,
    financeReducerPence,
    taxYear: profile.taxYear,
    region: profile.region,
  });
  return {
    incomePence, expensesPence, profitPence, financeCostsPence,
    taxableProfitPence, financeReducerPence,
    estimatedTaxPence: taxOnPropertyPence, marginalRate,
    allowanceRecommended: advice.useAllowance,
    sa105: sa105Boxes(txns),
  };
}
