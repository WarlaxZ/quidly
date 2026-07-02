import { describe, expect, it } from "vitest";
import { DEDUCTION_CATALOG, CATEGORY_NAMES } from "./catalog";

describe("deduction catalog", () => {
  it("every item's categoryName is a real Quidly category", () => {
    for (const item of DEDUCTION_CATALOG) expect(CATEGORY_NAMES).toContain(item.categoryName);
  });
  it("every item has a unique key", () => {
    const keys = DEDUCTION_CATALOG.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("every item has at least one match rule", () => {
    for (const item of DEDUCTION_CATALOG) {
      const hasRule = (item.match.categoryNames?.length ?? 0) > 0 || (item.match.descriptionKeywords?.length ?? 0) > 0;
      expect(hasRule).toBe(true);
    }
  });
  it("all description keywords are lowercase (matching is case-insensitive)", () => {
    for (const item of DEDUCTION_CATALOG) for (const k of item.match.descriptionKeywords ?? []) expect(k).toBe(k.toLowerCase());
  });
});
