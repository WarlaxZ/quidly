import { describe, expect, it } from "vitest";
import { getTaxYear, taxYearRange, latestConfiguredTaxYear, isConfiguredTaxYear, taxYearOptions } from "./taxYear";

describe("getTaxYear", () => {
  it("puts 6 April into the new tax year", () => {
    expect(getTaxYear(new Date("2025-04-06"))).toBe("2025-26");
  });
  it("puts 5 April into the old tax year", () => {
    expect(getTaxYear(new Date("2025-04-05"))).toBe("2024-25");
  });
  it("handles mid-year and year-end dates", () => {
    expect(getTaxYear(new Date("2025-12-31"))).toBe("2025-26");
    expect(getTaxYear(new Date("2026-01-01"))).toBe("2025-26");
  });
});

describe("taxYearRange", () => {
  it("returns inclusive start and exclusive end for a tax year", () => {
    const { start, end } = taxYearRange("2025-26");
    expect(start.toISOString().slice(0, 10)).toBe("2025-04-06");
    expect(end.toISOString().slice(0, 10)).toBe("2026-04-06");
  });
});

describe("configured tax years", () => {
  it("latestConfiguredTaxYear is the most recent configured year", () => {
    expect(latestConfiguredTaxYear()).toBe("2025-26");
  });
  it("isConfiguredTaxYear distinguishes configured from not", () => {
    expect(isConfiguredTaxYear("2025-26")).toBe(true);
    expect(isConfiguredTaxYear("2026-27")).toBe(false);
  });
  it("taxYearOptions lists the configured years (newest first)", () => {
    expect(taxYearOptions()).toEqual(["2025-26"]);
  });
});
