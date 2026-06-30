import { describe, expect, it } from "vitest";
import { buildTransactionWhere } from "./transactionFilter";

describe("buildTransactionWhere", () => {
  it("scopes to the property when an id is given", () => {
    expect(buildTransactionWhere("prop1", {})).toEqual({ propertyId: "prop1" });
  });
  it("adds category and direction filters", () => {
    expect(buildTransactionWhere("prop1", { categoryId: "c1", direction: "out" }))
      .toEqual({ propertyId: "prop1", categoryId: "c1", direction: "out" });
  });
  it("adds a tax-year date range", () => {
    const where = buildTransactionWhere("prop1", { taxYear: "2025-26" });
    expect(where.propertyId).toBe("prop1");
    expect((where.date as { gte: Date }).gte.toISOString().slice(0, 10)).toBe("2025-04-06");
    expect((where.date as { lt: Date }).lt.toISOString().slice(0, 10)).toBe("2026-04-06");
  });
  it("omits the property scope when propertyId is null (all properties)", () => {
    const where = buildTransactionWhere(null, { direction: "out" });
    expect(where).toEqual({ direction: "out" });
  });
});
