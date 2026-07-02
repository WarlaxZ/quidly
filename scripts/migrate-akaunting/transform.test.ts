import { describe, expect, it } from "vitest";
import { decimalStringToPence, validateMapping, buildPlan } from "./transform";
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
    expect(errors.some((e) => e.includes("42 Example St") && e.includes("(id 1)"))).toBe(true);
  });
  it("flags a category that has no decision entry at all (not just a null target)", () => {
    const m = baseMapping();
    m.categories = m.categories.filter((c) => c.akauntingId !== 5); // remove Repairs entirely
    const errors = validateMapping(baseSnapshot(), m);
    expect(errors.some((e) => e.includes("Repairs"))).toBe(true);
  });
  it("does not require a property decision for a company used only by non-GBP transactions", () => {
    const s = baseSnapshot();
    for (const t of s.transactions) t.currencyCode = "EUR"; // all txns non-GBP
    const m = baseMapping();
    m.properties = []; // no property decisions at all
    expect(validateMapping(s, m)).toEqual([]);
  });
});

describe("buildPlan", () => {
  it("builds vendor and transaction payloads for GBP transactions", () => {
    const plan = buildPlan(baseSnapshot(), baseMapping());
    expect(plan.vendors).toEqual([
      { externalRef: "akaunting:contact:7", name: "Acme Plumbing", contactDetails: null },
    ]);
    expect(plan.transactions).toEqual([
      {
        externalRef: "akaunting:transaction:100",
        akauntingCompanyId: 1,
        date: "2025-06-01T00:00:00.000Z",
        amountPence: 15000,
        direction: "out",
        categoryName: "Property repairs and maintenance",
        vendorExternalRef: "akaunting:contact:7",
        description: "Leak",
      },
      {
        externalRef: "akaunting:transaction:101",
        akauntingCompanyId: 1,
        date: "2025-06-05T00:00:00.000Z",
        amountPence: 80000,
        direction: "in",
        categoryName: "Rent received",
        vendorExternalRef: null,
        description: "June rent",
      },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips non-GBP transactions with a reason and omits their vendor-only references", () => {
    const s = baseSnapshot();
    s.transactions[0].currencyCode = "EUR";
    const plan = buildPlan(s, baseMapping());
    expect(plan.transactions.map((t) => t.externalRef)).toEqual(["akaunting:transaction:101"]);
    expect(plan.skipped).toEqual([{ id: 100, reason: "non-GBP currency EUR" }]);
    // contact 7 was only used by the skipped txn → not created
    expect(plan.vendors).toEqual([]);
  });

  it("builds contactDetails from email/phone/address when present", () => {
    const s = baseSnapshot();
    s.contacts[0] = { id: 7, name: "Acme Plumbing", type: "vendor", email: "a@b.com", phone: "0123", address: "1 High St" };
    const plan = buildPlan(s, baseMapping());
    expect(plan.vendors[0].contactDetails).toBe("a@b.com | 0123 | 1 High St");
  });
});
