import type { TaxTxn } from "./types";

export const PROPERTY_ALLOWANCE_PENCE = 1_000_00;

export interface ProfitResult {
  incomePence: number;
  expensesPence: number;
  profitPence: number;
}

export function computeProfit(txns: TaxTxn[]): ProfitResult {
  let incomePence = 0;
  let expensesPence = 0;
  for (const tx of txns) {
    if (!tx.allowable) continue;
    if (tx.categoryKind === "income") incomePence += tx.amountPence;
    else if (tx.categoryKind === "expense") expensesPence += tx.amountPence;
  }
  return { incomePence, expensesPence, profitPence: incomePence - expensesPence };
}

export interface AllowanceAdvice {
  useAllowance: boolean;
  taxableProfitPence: number;
  fullReliefNoReportingNeeded: boolean;
}

export function propertyAllowanceAdvice(
  grossIncomePence: number,
  allowableExpensesPence: number,
): AllowanceAdvice {
  if (grossIncomePence <= PROPERTY_ALLOWANCE_PENCE) {
    return { useAllowance: true, taxableProfitPence: 0, fullReliefNoReportingNeeded: true };
  }
  const profitWithExpenses = grossIncomePence - allowableExpensesPence;
  const profitWithAllowance = grossIncomePence - PROPERTY_ALLOWANCE_PENCE;
  const useAllowance = profitWithAllowance < profitWithExpenses;
  return {
    useAllowance,
    taxableProfitPence: Math.max(0, Math.min(profitWithExpenses, profitWithAllowance)),
    fullReliefNoReportingNeeded: false,
  };
}

/**
 * Section 24 finance-cost relief: a 20% basic-rate reducer.
 * Capped at the lower of finance costs and property profit (v1 ignores the rarer
 * adjusted-total-income cap; revisit if the user's other income is very low).
 */
export function financeCostReducer(financeCostsPence: number, profitPence: number): number {
  const base = Math.max(0, Math.min(financeCostsPence, profitPence));
  return Math.round(base * 2000 / 10000); // 2000 bps = 20% Section-24 basic-rate reducer
}
