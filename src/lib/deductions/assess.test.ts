import { describe, expect, it } from "vitest";
import { assessDeductions } from "./assess";
import type { DeductionItem, DeductionTxn } from "./catalog";

const items: DeductionItem[] = [
  { key: "insurance", title: "Insurance", blurb: "", categoryName: "Rent, rates, insurance, ground rents", match: { descriptionKeywords: ["insurance"] }, action: "transaction" },
  { key: "gas-safety", title: "Gas", blurb: "", categoryName: "Property repairs and maintenance", match: { descriptionKeywords: ["gas safety", "cp12"] }, action: "transaction" },
  { key: "mileage", title: "Mileage", blurb: "", categoryName: "Travel & mileage", match: { categoryNames: ["Travel & mileage"] }, action: "mileage" },
];

describe("assessDeductions", () => {
  it("marks an item covered when a description keyword matches (case-insensitive)", () => {
    const txns: DeductionTxn[] = [{ categoryName: "Rent, rates, insurance, ground rents", description: "Annual Landlord INSURANCE" }];
    expect(assessDeductions(items, txns, new Set()).find((r) => r.item.key === "insurance")!.state).toBe("covered");
  });
  it("distinguishes items sharing a category by keyword", () => {
    const txns: DeductionTxn[] = [{ categoryName: "Property repairs and maintenance", description: "Fix leaking tap" }];
    expect(assessDeductions(items, txns, new Set()).find((r) => r.item.key === "gas-safety")!.state).toBe("consider");
  });
  it("marks an item covered when a transaction is in its category", () => {
    const txns: DeductionTxn[] = [{ categoryName: "Travel & mileage", description: null }];
    expect(assessDeductions(items, txns, new Set()).find((r) => r.item.key === "mileage")!.state).toBe("covered");
  });
  it("marks dismissed items dismissed regardless of transactions", () => {
    const txns: DeductionTxn[] = [{ categoryName: "Travel & mileage", description: null }];
    expect(assessDeductions(items, txns, new Set(["mileage"])).find((r) => r.item.key === "mileage")!.state).toBe("dismissed");
  });
  it("marks unmatched items as consider", () => {
    expect(assessDeductions(items, [], new Set()).every((r) => r.state === "consider")).toBe(true);
  });
});
