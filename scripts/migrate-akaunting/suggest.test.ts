import { describe, expect, it } from "vitest";
import { suggestCategory } from "./suggest";

describe("suggestCategory", () => {
  it("maps rent received income to box 20", () => {
    expect(suggestCategory("Rent received", "income")).toBe("Rent received");
    expect(suggestCategory("Rental income", "income")).toBe("Rent received");
  });
  it("maps other income to box 21", () => {
    expect(suggestCategory("Parking fees", "income")).toBe("Other property income");
  });
  it("maps repairs/maintenance to box 25", () => {
    expect(suggestCategory("Repairs", "expense")).toBe("Property repairs and maintenance");
    expect(suggestCategory("Boiler maintenance", "expense")).toBe("Property repairs and maintenance");
  });
  it("maps mortgage/interest to box 44 but not capital repayments", () => {
    expect(suggestCategory("Mortgage interest", "expense")).toBe("Mortgage / loan interest");
    expect(suggestCategory("Loan interest", "expense")).toBe("Mortgage / loan interest");
    expect(suggestCategory("Loan repayment", "expense")).toBeNull();
    expect(suggestCategory("Mortgage repayment", "expense")).toBeNull();
  });
  it("maps insurance/rates/ground rent/service charge to box 24", () => {
    expect(suggestCategory("Landlord insurance", "expense")).toBe("Rent, rates, insurance, ground rents");
    expect(suggestCategory("Ground rent", "expense")).toBe("Rent, rates, insurance, ground rents");
    expect(suggestCategory("Service charge", "expense")).toBe("Rent, rates, insurance, ground rents");
  });
  it("maps professional fees to box 27", () => {
    expect(suggestCategory("Letting agent fees", "expense")).toBe("Legal, management, other professional fees");
    expect(suggestCategory("Accountant", "expense")).toBe("Legal, management, other professional fees");
  });
  it("maps services/wages/cleaning to box 28", () => {
    expect(suggestCategory("Cleaning", "expense")).toBe("Costs of services provided, including wages");
    expect(suggestCategory("Gardening wages", "expense")).toBe("Costs of services provided, including wages");
  });
  it("maps capital improvements to the capital category", () => {
    expect(suggestCategory("Kitchen renovation", "expense")).toBe("Capital improvements");
    expect(suggestCategory("Capital improvement", "expense")).toBe("Capital improvements");
  });
  it("returns null when not confident", () => {
    expect(suggestCategory("Miscellaneous", "expense")).toBeNull();
    expect(suggestCategory("Sundry", "income")).toBe("Other property income"); // any income → 21
  });
  it("never suggests an income category for an expense", () => {
    expect(suggestCategory("Rent", "expense")).not.toBe("Rent received");
  });
  it("exact-matches a Quidly category name, including behind a 'TAX:' prefix", () => {
    expect(suggestCategory("Other allowable property expenses", "expense")).toBe("Other allowable property expenses");
    expect(suggestCategory("TAX: Other allowable property expenses", "expense")).toBe("Other allowable property expenses");
    expect(suggestCategory("TAX: Rent, rates, insurance, ground rents", "expense")).toBe("Rent, rates, insurance, ground rents");
    expect(suggestCategory("TAX: Costs of services provided, including wages", "expense")).toBe("Costs of services provided, including wages");
  });
  it("leaves a TAX-prefixed category with no Quidly equivalent unmapped", () => {
    expect(suggestCategory("TAX: Non-residential property finance costs", "expense")).toBeNull();
  });
  it("does not exact-match an income category for an expense-typed input", () => {
    expect(suggestCategory("Rent received", "expense")).toBeNull();
    expect(suggestCategory("Other allowable property expenses", "income")).toBe("Other property income"); // income fallback, not the expense box
  });
  it("uses transaction descriptions to map a generically-named income category to rent", () => {
    expect(suggestCategory("Deposit", "income", ["Rent", "Rent", "June rent"])).toBe("Rent received");
    expect(suggestCategory("Deposit", "income", [])).toBe("Other property income"); // no evidence → box 21
    expect(suggestCategory("Deposit", "income", ["Security deposit refund"])).toBe("Other property income");
  });
  it("still routes clearly-other income names to box 21 regardless of descriptions", () => {
    expect(suggestCategory("Parking fees", "income", ["Rent"])).toBe("Other property income");
  });
  it("does not fire on substring or semantic false positives", () => {
    expect(suggestCategory("Fixtures and fittings", "expense")).toBeNull(); // not "fix"→repairs
    expect(suggestCategory("Coffee for viewings", "expense")).toBeNull();   // not "fee"→professional
    expect(suggestCategory("Interest free appliance", "expense")).toBeNull(); // not box 44
    expect(suggestCategory("Extension lead", "expense")).toBeNull();        // not capital
    expect(suggestCategory("Current account", "income")).toBe("Other property income"); // "current"≠rent
  });
});
