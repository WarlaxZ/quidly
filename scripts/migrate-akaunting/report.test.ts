import { describe, expect, it } from "vitest";
import { buildReport } from "./report";
import type { SourceSnapshot, Mapping } from "./types";

function snapshot(): SourceSnapshot {
  return {
    akauntingVersion: "3.0",
    companies: [{ id: 1, name: "42 Example St" }],
    contacts: [{ id: 7, name: "Acme", type: "vendor", email: null, phone: null, address: null }],
    categories: [
      { id: 5, name: "Repairs", type: "expense" },
      { id: 9, name: "Misc", type: "expense" },
    ],
    transactions: [
      { id: 100, companyId: 1, type: "expense", categoryId: 5, contactId: 7, paidAt: "2025-06-01T00:00:00.000Z", amount: "150.00", currencyCode: "GBP", description: null },
      { id: 200, companyId: 1, type: "expense", categoryId: 9, contactId: null, paidAt: "2025-06-02T00:00:00.000Z", amount: "10.00", currencyCode: "EUR", description: null },
    ],
    attachments: [{ transactionId: 100, filename: "receipt.pdf", directory: null }],
    otherTableCounts: { documents: 4, items: 12, accounts: 2, taxes: 0 },
  };
}

function mapping(): Mapping {
  return {
    currency: { assume: "GBP" },
    properties: [{ akauntingCompanyId: 1, akauntingCompanyName: "42 Example St", target: { createNew: true, name: "42 Example St", address: null } }],
    categories: [
      { akauntingId: 5, akauntingName: "Repairs", akauntingType: "expense", count: 1, suggestion: "Property repairs and maintenance", target: "Property repairs and maintenance" },
      { akauntingId: 9, akauntingName: "Misc", akauntingType: "expense", count: 1, suggestion: null, target: null },
    ],
  };
}

describe("buildReport", () => {
  const md = buildReport(snapshot(), mapping());
  it("summarises counts", () => {
    expect(md).toContain("Transactions: 2");
    expect(md).toContain("Vendors/contacts: 1");
  });
  it("flags unmapped categories", () => {
    expect(md).toContain("Misc");
    expect(md).toMatch(/unmapped|NEEDS MAPPING/i);
  });
  it("lists skipped transactions with reasons", () => {
    expect(md).toContain("EUR");
    expect(md).toContain("200");
  });
  it("notes attachments cannot be read from the dump alone", () => {
    expect(md).toMatch(/attachment/i);
    expect(md).toContain("1");
  });
  it("reports gaps for feature tables with rows, not empty ones", () => {
    expect(md).toContain("documents");
    expect(md).toContain("items");
    expect(md).not.toContain("taxes"); // 0 rows → not a gap
  });
});
