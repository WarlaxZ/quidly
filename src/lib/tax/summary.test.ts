import { describe, expect, it } from "vitest";
import { buildTaxYearSummary } from "./summary";
import type { TaxTxn } from "./types";

const t = (over: Partial<TaxTxn>): TaxTxn => ({
  date: new Date("2025-06-01"), amountPence: 0, direction: "in",
  categoryKind: "income", allowable: true, sa105Box: null, ...over,
});

describe("buildTaxYearSummary", () => {
  const txns: TaxTxn[] = [
    t({ amountPence: 12_000_00, categoryKind: "income", direction: "in", sa105Box: "20" }),
    t({ amountPence: 2_000_00, categoryKind: "expense", direction: "out", sa105Box: "25" }),
    t({ amountPence: 3_000_00, categoryKind: "finance", direction: "out", sa105Box: "44" }),
  ];
  it("computes profit, finance costs, reducer, taxable profit and SA105 boxes (actual expenses)", () => {
    const s = buildTaxYearSummary(txns, {
      taxYear: "2025-26", otherIncomePence: 40_000_00, region: "englandWalesNI", usePropertyAllowance: false,
    });
    expect(s.incomePence).toBe(12_000_00);
    expect(s.expensesPence).toBe(2_000_00);
    expect(s.profitPence).toBe(10_000_00);
    expect(s.financeCostsPence).toBe(3_000_00);
    expect(s.taxableProfitPence).toBe(10_000_00);
    expect(s.financeReducerPence).toBe(600_00);
    expect(s.sa105["20"]).toBe(12_000_00);
    expect(s.sa105["25"]).toBe(2_000_00);
    expect(s.sa105["44"]).toBe(3_000_00);
    expect(s.estimatedTaxPence).toBe(10_000_00 * 0.2 - 600_00);
  });
  it("uses the £1,000 allowance when the user opts in", () => {
    const s = buildTaxYearSummary(txns, {
      taxYear: "2025-26", otherIncomePence: 40_000_00, region: "englandWalesNI", usePropertyAllowance: true,
    });
    expect(s.taxableProfitPence).toBe(11_000_00);
    expect(s.allowanceRecommended).toBe(false);
  });

  it("taxableProfit is zero when income is at or below the £1,000 allowance (allowance opted in)", () => {
    const s = buildTaxYearSummary(
      [t({ amountPence: 80000, categoryKind: "income", direction: "in" })],
      { taxYear: "2025-26", otherIncomePence: 0, region: "englandWalesNI", usePropertyAllowance: true },
    );
    expect(s.taxableProfitPence).toBe(0);
    expect(s.allowanceRecommended).toBe(true);
  });

  it("taxableProfit, reducer and tax are zero in a loss year", () => {
    const s = buildTaxYearSummary(
      [
        t({ amountPence: 5_000_00, categoryKind: "income", direction: "in" }),
        t({ amountPence: 7_000_00, categoryKind: "expense", direction: "out" }),
      ],
      { taxYear: "2025-26", otherIncomePence: 0, region: "englandWalesNI", usePropertyAllowance: false },
    );
    expect(s.taxableProfitPence).toBe(0);
    expect(s.financeReducerPence).toBe(0);
    expect(s.estimatedTaxPence).toBe(0);
  });

  it("allowance reduces taxableProfit when it beats actual expenses", () => {
    const s = buildTaxYearSummary(
      [
        t({ amountPence: 5_000_00, categoryKind: "income", direction: "in" }),
        t({ amountPence: 50_00, categoryKind: "expense", direction: "out" }),
      ],
      { taxYear: "2025-26", otherIncomePence: 0, region: "englandWalesNI", usePropertyAllowance: true },
    );
    expect(s.taxableProfitPence).toBe(4_000_00); // 5000 income - 1000 allowance
    expect(s.allowanceRecommended).toBe(true);   // allowance route (4000) beats expenses route (4950)
  });
});
