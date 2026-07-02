import { describe, expect, it } from "vitest";
import { assessDeductions } from "./assess";
import type { DeductionItem, DeductionTxn } from "./catalog";
import { DEDUCTION_CATALOG } from "./catalog";

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

describe("assessDeductions over the real catalog", () => {
  const stateOf = (key: string, txn: { categoryName: string; description: string | null }) =>
    assessDeductions(DEDUCTION_CATALOG, [txn], new Set()).find((r) => r.item.key === key)!.state;

  it("covers items on representative descriptions", () => {
    expect(stateOf("landlord-insurance", { categoryName: "Rent, rates, insurance, ground rents", description: "Annual landlord insurance renewal" })).toBe("covered");
    expect(stateOf("gas-safety", { categoryName: "Property repairs and maintenance", description: "Gas safety CP12 certificate" })).toBe("covered");
    expect(stateOf("mileage", { categoryName: "Travel & mileage", description: null })).toBe("covered");
    expect(stateOf("use-of-home", { categoryName: "Use of home", description: null })).toBe("covered");
    expect(stateOf("replacement-domestic", { categoryName: "Other allowable property expenses", description: "Replacement carpet for lounge" })).toBe("covered");
  });

  it("does not false-cover on confounding descriptions", () => {
    // "Repaint bedroom" must NOT tick off replacement-domestic (was matched by the removed "bed" keyword)
    expect(stateOf("replacement-domestic", { categoryName: "Property repairs and maintenance", description: "Repaint bedroom" })).toBe("consider");
    // a burglar alarm install must NOT tick off safety-servicing (was matched by the removed bare "alarm")
    expect(stateOf("safety-servicing", { categoryName: "Property repairs and maintenance", description: "Burglar alarm installation" })).toBe("consider");
    // estate-agent sale fees must NOT tick off letting-management (was matched by the removed bare "agent")
    expect(stateOf("letting-management", { categoryName: "Legal, management, other professional fees", description: "Estate agent sale valuation" })).toBe("consider");
  });
});
