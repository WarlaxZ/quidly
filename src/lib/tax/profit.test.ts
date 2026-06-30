import { describe, expect, it } from "vitest";
import { computeProfit, propertyAllowanceAdvice, financeCostReducer } from "./profit";
import type { TaxTxn } from "./types";

const t = (over: Partial<TaxTxn>): TaxTxn => ({
  date: new Date("2025-06-01"),
  amountPence: 0,
  direction: "in",
  categoryKind: "income",
  allowable: true,
  sa105Box: null,
  ...over,
});

describe("computeProfit", () => {
  it("is allowable income minus allowable expenses, excluding finance and capital", () => {
    const txns: TaxTxn[] = [
      t({ amountPence: 1_200_00, direction: "in", categoryKind: "income" }),
      t({ amountPence: 200_00, direction: "out", categoryKind: "expense" }),
      t({ amountPence: 500_00, direction: "out", categoryKind: "finance" }),
      t({ amountPence: 999_00, direction: "out", categoryKind: "capital", allowable: false }),
    ];
    const r = computeProfit(txns);
    expect(r.incomePence).toBe(1_200_00);
    expect(r.expensesPence).toBe(200_00);
    expect(r.profitPence).toBe(1_000_00);
  });
  it("returns zeros for an empty transaction list", () => {
    const r = computeProfit([]);
    expect(r).toEqual({ incomePence: 0, expensesPence: 0, profitPence: 0 });
  });
});

describe("propertyAllowanceAdvice", () => {
  it("recommends the £1,000 allowance when expenses are below £1,000", () => {
    const advice = propertyAllowanceAdvice(5_000_00, 300_00);
    expect(advice.useAllowance).toBe(true);
    expect(advice.taxableProfitPence).toBe(4_000_00);
  });
  it("recommends actual expenses when they exceed £1,000", () => {
    const advice = propertyAllowanceAdvice(5_000_00, 1_500_00);
    expect(advice.useAllowance).toBe(false);
    expect(advice.taxableProfitPence).toBe(3_500_00);
  });
  it("gives full relief when gross income is at or below £1,000", () => {
    const advice = propertyAllowanceAdvice(800_00, 0);
    expect(advice.fullReliefNoReportingNeeded).toBe(true);
    expect(advice.taxableProfitPence).toBe(0);
  });
  it("treats gross income of exactly £1,000 as full relief", () => {
    const advice = propertyAllowanceAdvice(1_000_00, 0);
    expect(advice.fullReliefNoReportingNeeded).toBe(true);
    expect(advice.taxableProfitPence).toBe(0);
  });
});

describe("financeCostReducer", () => {
  it("is 20% of finance costs, capped at the property profit", () => {
    expect(financeCostReducer(3_000_00, 10_000_00)).toBe(600_00);
    expect(financeCostReducer(12_000_00, 5_000_00)).toBe(1_000_00);
  });
  it("is zero in a loss year (negative profit)", () => {
    expect(financeCostReducer(5_000_00, -1_000_00)).toBe(0);
  });
});
