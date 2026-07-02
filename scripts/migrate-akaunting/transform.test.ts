import { describe, expect, it } from "vitest";
import { decimalStringToPence } from "./transform";
import { validateMapping } from "./transform";
import type { SourceSnapshot, Mapping } from "./types";

function baseSnapshot(): SourceSnapshot {
  return {
    akauntingVersion: "3.0",
    companies: [{ id: 1, name: "42 Example St" }],
    contacts: [{ id: 7, name: "Acme Plumbing", type: "vendor", email: null, phone: null, address: null }],
    categories: [
      { id: 5, name: "Repairs", type: "expense" },
      { id: 6, name: "Rent", type: "income" },
    ],
    transactions: [
      { id: 100, companyId: 1, type: "expense", categoryId: 5, contactId: 7, paidAt: "2025-06-01T00:00:00.000Z", amount: "150.00", currencyCode: "GBP", description: "Leak" },
      { id: 101, companyId: 1, type: "income", categoryId: 6, contactId: null, paidAt: "2025-06-05T00:00:00.000Z", amount: "800.00", currencyCode: "GBP", description: "June rent" },
    ],
    attachments: [],
    otherTableCounts: {},
  };
}

function baseMapping(): Mapping {
  return {
    currency: { assume: "GBP" },
    properties: [
      { akauntingCompanyId: 1, akauntingCompanyName: "42 Example St", target: { createNew: true, name: "42 Example St", address: null } },
    ],
    categories: [
      { akauntingId: 5, akauntingName: "Repairs", akauntingType: "expense", count: 1, suggestion: "Property repairs and maintenance", target: "Property repairs and maintenance" },
      { akauntingId: 6, akauntingName: "Rent", akauntingType: "income", count: 1, suggestion: "Rent received", target: "Rent received" },
    ],
  };
}

describe("decimalStringToPence", () => {
  it("converts 4dp Akaunting decimals to pence", () => {
    expect(decimalStringToPence("123.4500")).toBe(12345);
  });
  it("handles whole numbers", () => {
    expect(decimalStringToPence("100")).toBe(10000);
    expect(decimalStringToPence("0")).toBe(0);
  });
  it("handles one and two decimal places", () => {
    expect(decimalStringToPence("12.3")).toBe(1230);
    expect(decimalStringToPence("12.34")).toBe(1234);
  });
  it("rounds half up at the pence boundary using the third digit", () => {
    expect(decimalStringToPence("0.125")).toBe(13);
    expect(decimalStringToPence("0.124")).toBe(12);
    expect(decimalStringToPence("1.005")).toBe(101);
  });
  it("handles negatives", () => {
    expect(decimalStringToPence("-50.00")).toBe(-5000);
  });
  it("rounds negatives half-away-from-zero", () => {
    expect(decimalStringToPence("-0.125")).toBe(-13);
  });
  it("ignores the 4th decimal digit (3rd digit is the sole tie-breaker)", () => {
    expect(decimalStringToPence("1.9994")).toBe(200); // 3rd digit 9 rounds up; 4th digit ignored
    expect(decimalStringToPence("1.9944")).toBe(199); // 3rd digit 4 rounds down
  });
  it("throws on empty input rather than silently returning 0", () => {
    expect(() => decimalStringToPence("")).toThrow();
    expect(() => decimalStringToPence("   ")).toThrow();
  });
  it("tolerates surrounding whitespace and leading +", () => {
    expect(decimalStringToPence(" +9.99 ")).toBe(999);
  });
});

describe("validateMapping", () => {
  it("returns no errors for a complete mapping", () => {
    expect(validateMapping(baseSnapshot(), baseMapping())).toEqual([]);
  });
  it("flags a category used by a GBP transaction with a null target", () => {
    const m = baseMapping();
    m.categories[0].target = null;
    const errors = validateMapping(baseSnapshot(), m);
    expect(errors.some((e) => e.includes("Repairs"))).toBe(true);
  });
  it("does not flag an unmapped category only used by non-GBP transactions", () => {
    const s = baseSnapshot();
    s.transactions[0].currencyCode = "EUR";
    const m = baseMapping();
    m.categories[0].target = null;
    expect(validateMapping(s, m)).toEqual([]);
  });
  it("flags a company with no property decision", () => {
    const m = baseMapping();
    m.properties = [];
    const errors = validateMapping(baseSnapshot(), m);
    expect(errors.some((e) => e.includes("company") || e.includes("42 Example St") || e.includes("1"))).toBe(true);
  });
});
