import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("writes a header row and values", () => {
    const csv = toCsv(["date", "amount"], [{ date: "2025-06-01", amount: "950.00" }]);
    expect(csv).toBe("date,amount\n2025-06-01,950.00");
  });
  it("quotes fields containing commas, quotes and newlines", () => {
    const csv = toCsv(["desc"], [{ desc: 'Rent, "June"' }]);
    expect(csv).toBe('desc\n"Rent, ""June"""');
  });
  it("neutralises spreadsheet formula injection by prefixing a quote", () => {
    expect(toCsv(["v"], [{ v: "=HYPERLINK(\"x\")" }])).toBe("v\n\"'=HYPERLINK(\"\"x\"\")\"");
  });
});
