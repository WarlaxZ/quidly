import { describe, expect, it } from "vitest";
import { incomeTaxOn, estimatePropertyTax } from "./incomeTax";
import { propertySurchargeBps, isProvisionalTaxYear } from "./bands";

describe("incomeTaxOn (2025-26)", () => {
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
    // £50,000 Scottish (pence): 282700*.19 + 1209400*.20 + 1617100*.21 + 633800*.42 = 901380
    expect(incomeTaxOn(50_000_00, "2025-26", "scotland")).toBe(9_013_80);
  });
  it("rounds half-up at a fraction-prone Scottish input (basis points are exact)", () => {
    // £12,570.50 income: £0.50 taxable at the 19% starter rate = 9.5p → half-up to 10p.
    expect(incomeTaxOn(12_570_50, "2025-26", "scotland")).toBe(10);
  });
});

describe("property-income rates (2027-28 surcharge)", () => {
  // £60k other income puts the taxpayer into the higher-rate band, so the £8k property sits there too.
  const higherRateInput = (taxYear: string, region: "englandWalesNI" | "scotland") => ({
    otherIncomePence: 60_000_00, taxableProfitPence: 8_000_00, financeReducerPence: 0, taxYear, region,
  });

  it("surcharge is 200bps for E/W/NI 2027-28, 0 for 2026-27 and Scotland 2027-28", () => {
    expect(propertySurchargeBps("2027-28", "englandWalesNI")).toBe(200);
    expect(propertySurchargeBps("2026-27", "englandWalesNI")).toBe(0);
    expect(propertySurchargeBps("2027-28", "scotland")).toBe(0);
  });

  it("E/W/NI property tax is unchanged 2025-26 → 2026-27 (surcharge 0, both 40% higher band)", () => {
    // £40k other + £8k property → property sits entirely in the 40% higher band. 8,000 × 40% = 3,200.
    const y2526 = estimatePropertyTax(higherRateInput("2025-26", "englandWalesNI")).taxOnPropertyPence;
    const y2627 = estimatePropertyTax(higherRateInput("2026-27", "englandWalesNI")).taxOnPropertyPence;
    expect(y2526).toBe(3_200_00);
    expect(y2627).toBe(3_200_00);
  });

  it("E/W/NI 2027-28 taxes higher-band property at 42% (+2pp)", () => {
    // 8,000 × 42% = 3,360.00
    const r = estimatePropertyTax(higherRateInput("2027-28", "englandWalesNI"));
    expect(r.taxOnPropertyPence).toBe(3_360_00);
    expect(r.marginalRate).toBeCloseTo(0.42);
  });

  it("E/W/NI 2027-28 taxes basic-band property at 22% (+2pp)", () => {
    // £20k other (above PA) + £5k property, all within the basic band → 5,000 × 22% = 1,100.00
    const r = estimatePropertyTax({
      otherIncomePence: 20_000_00, taxableProfitPence: 5_000_00, financeReducerPence: 0,
      taxYear: "2027-28", region: "englandWalesNI",
    });
    expect(r.taxOnPropertyPence).toBe(1_100_00);
  });

  it("Scotland 2027-28 applies NO surcharge (equals the 2026-27 Scottish computation)", () => {
    const y2627 = estimatePropertyTax(higherRateInput("2026-27", "scotland")).taxOnPropertyPence;
    const y2728 = estimatePropertyTax(higherRateInput("2027-28", "scotland")).taxOnPropertyPence;
    expect(y2728).toBe(y2627); // Scottish 42% higher band, no +2pp
  });

  it("marks Scotland 2027-28 provisional, E/W/NI 2027-28 not", () => {
    expect(isProvisionalTaxYear("2027-28", "scotland")).toBe(true);
    expect(isProvisionalTaxYear("2027-28", "englandWalesNI")).toBe(false);
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
