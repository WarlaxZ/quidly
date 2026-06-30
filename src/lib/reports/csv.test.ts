import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";
import { parseCsv } from "./csv";

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

describe("parseCsv", () => {
  it("parses a header and rows", () => {
    const r = parseCsv("date,amount\n2025-06-01,950.00\n2025-06-02,-12.50");
    expect(r.header).toEqual(["date", "amount"]);
    expect(r.rows).toEqual([["2025-06-01", "950.00"], ["2025-06-02", "-12.50"]]);
  });
  it("handles quoted fields with commas, quotes and newlines", () => {
    const r = parseCsv('desc,amount\n"Rent, ""June""",950\n"line1\nline2",5');
    expect(r.rows[0]).toEqual(['Rent, "June"', "950"]);
    expect(r.rows[1]).toEqual(["line1\nline2", "5"]);
  });
  it("ignores a trailing newline", () => {
    expect(parseCsv("a,b\n1,2\n").rows).toEqual([["1", "2"]]);
  });
  it("strips a leading UTF-8 BOM from the first header", () => {
    expect(parseCsv("﻿date,amount\n1,2").header).toEqual(["date", "amount"]);
  });
});
