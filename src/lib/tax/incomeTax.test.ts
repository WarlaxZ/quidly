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
});

describe("estimatePropertyTax", () => {
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
