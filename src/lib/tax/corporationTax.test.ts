import { describe, expect, it } from "vitest";
import { companyTaxableProfit, corporationTax } from "./corporationTax";
import type { TaxTxn } from "./types";

const t = (over: Partial<TaxTxn>): TaxTxn => ({
  date: new Date("2025-06-01"), amountPence: 0, direction: "in",
  categoryKind: "income", allowable: true, sa105Box: null, ...over,
});

describe("companyTaxableProfit", () => {
  it("deducts finance (mortgage) as an expense, unlike personal", () => {
    const txns: TaxTxn[] = [
      t({ amountPence: 10_000_00, categoryKind: "income" }),
      t({ amountPence: 1_000_00, categoryKind: "expense", direction: "out" }),
      t({ amountPence: 3_000_00, categoryKind: "finance", direction: "out" }),
      t({ amountPence: 9_99_00, categoryKind: "capital", direction: "out", allowable: false }),
    ];
    const r = companyTaxableProfit(txns);
    expect(r.incomePence).toBe(10_000_00);
    expect(r.expensesPence).toBe(4_000_00);
    expect(r.profitPence).toBe(6_000_00);
  });
});

describe("corporationTax (2025-26)", () => {
  it("small profits rate 19% up to £50,000", () => {
    expect(corporationTax(40_000_00)).toEqual({ taxPence: 7_600_00, effectiveRate: 0.19, band: "small" });
    expect(corporationTax(50_000_00).taxPence).toBe(9_500_00);
  });
  it("main rate 25% at/above £250,000", () => {
    const r = corporationTax(300_000_00);
    expect(r.taxPence).toBe(75_000_00);
    expect(r.band).toBe("main");
  });
  it("applies marginal relief between the limits (£100,000 → £22,750)", () => {
    const r = corporationTax(100_000_00);
    expect(r.taxPence).toBe(22_750_00);
    expect(r.band).toBe("marginal");
  });
  it("is zero for a loss/zero profit", () => {
    expect(corporationTax(0).taxPence).toBe(0);
    expect(corporationTax(-5_000_00).taxPence).toBe(0);
  });
});
