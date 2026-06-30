import { describe, expect, it } from "vitest";
import { incomeTaxOn, estimatePropertyTax } from "./incomeTax";

describe("incomeTaxOn (2025-26 EWNI)", () => {
  it("is zero below the personal allowance", () => {
    expect(incomeTaxOn(10_000_00, "2025-26", "englandWalesNI")).toBe(0);
  });
  it("taxes basic-rate income at 20%", () => {
    expect(incomeTaxOn(20_000_00, "2025-26", "englandWalesNI")).toBe(1_486_00);
  });
  it("applies higher rate above the basic-rate limit", () => {
    expect(incomeTaxOn(60_000_00, "2025-26", "englandWalesNI")).toBe(11_432_00);
  });
  it("tapers the personal allowance between £100k and £125,140", () => {
    // £110,000 income: PA tapered to £7,570; tax = £33,432.00
    expect(incomeTaxOn(110_000_00, "2025-26", "englandWalesNI")).toBe(33_432_00);
  });
  it("applies the additional rate above £125,140", () => {
    // £130,000 income: PA fully tapered to £0; tax = £44,703.00
    expect(incomeTaxOn(130_000_00, "2025-26", "englandWalesNI")).toBe(44_703_00);
  });
  it("applies Scottish bands (2025-26)", () => {
    // £50,000 Scottish (pence): 230600*.19 + 1168500*.20 + 1710100*.21 + 633800*.42 = 902831
    expect(incomeTaxOn(50_000_00, "2025-26", "scotland")).toBe(9_028_31);
  });
  it("rounds half-up at a fraction-prone Scottish input (basis points are exact)", () => {
    // £12,570.50 income: £0.50 taxable at the 19% starter rate = 9.5p → half-up to 10p.
    expect(incomeTaxOn(12_570_50, "2025-26", "scotland")).toBe(10);
  });
});

describe("estimatePropertyTax", () => {
  it("returns zero marginal rate when there is no property profit", () => {
    const r = estimatePropertyTax({
      otherIncomePence: 40_000_00,
      taxableProfitPence: 0,
      financeReducerPence: 0,
      taxYear: "2025-26",
      region: "englandWalesNI",
    });
    expect(r.taxOnPropertyPence).toBe(0);
    expect(r.marginalRate).toBe(0);
  });
  it("returns the marginal tax on property profit after the finance-cost reducer", () => {
    const r = estimatePropertyTax({
      otherIncomePence: 40_000_00,
      taxableProfitPence: 8_000_00,
      financeReducerPence: 600_00,
      taxYear: "2025-26",
      region: "englandWalesNI",
    });
    expect(r.taxOnPropertyPence).toBe(1_000_00);
    expect(r.marginalRate).toBeCloseTo(0.2);
  });
});
