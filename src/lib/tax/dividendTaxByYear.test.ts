import { describe, expect, it } from "vitest";
import { dividendTaxForYears } from "./dividendTaxByYear";

describe("dividendTaxForYears", () => {
  it("applies dividendTax per tax year, preserving order", () => {
    const rows = dividendTaxForYears([
      { taxYear: "2025-26", dividendPence: 10_000_00, otherIncomePence: 20_000_00 },
      { taxYear: "2024-25", dividendPence: 10_000_00, otherIncomePence: 45_000_00 },
    ]);
    expect(rows).toEqual([
      { taxYear: "2025-26", dividendPence: 10_000_00, taxPence: 831_25 },   // ordinary band
      { taxYear: "2024-25", dividendPence: 10_000_00, taxPence: 2_013_75 }, // straddles basic→higher
    ]);
  });
  it("returns an empty array for no dividends", () => {
    expect(dividendTaxForYears([])).toEqual([]);
  });
});
