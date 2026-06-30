import { describe, expect, it } from "vitest";
import { buildExtractionTool, parseExtraction } from "./extract";

const categories = [
  { id: "c-rent", name: "Rent received" },
  { id: "c-repairs", name: "Property repairs and maintenance" },
];

describe("buildExtractionTool", () => {
  it("offers the category ids as the categoryId enum", () => {
    const tool = buildExtractionTool(categories);
    expect(tool.name).toBe("record_receipt");
    expect(tool.input_schema.properties.categoryId.enum).toEqual(["c-rent", "c-repairs"]);
  });
});

describe("parseExtraction", () => {
  it("normalises a good extraction", () => {
    const r = parseExtraction(
      { vendorName: "B&Q", date: "2026-06-01", amount: 19.99, direction: "out", categoryId: "c-repairs", confidence: "high" },
      categories,
    );
    expect(r).toEqual({ vendorName: "B&Q", isoDate: "2026-06-01", amountPence: 1999, direction: "out", categoryId: "c-repairs", confidence: "high" });
  });
  it("nulls an unknown category and a bad date, defaults direction to out", () => {
    const r = parseExtraction({ vendorName: "X", date: "01/06/2026", amount: 5, categoryId: "nope" }, categories);
    expect(r.categoryId).toBeNull();
    expect(r.isoDate).toBeNull();
    expect(r.direction).toBe("out");
    expect(r.confidence).toBe("low");
  });
  it("throws when the amount is missing or non-positive", () => {
    expect(() => parseExtraction({ vendorName: "X", amount: 0 }, categories)).toThrow();
    expect(() => parseExtraction({ vendorName: "X" }, categories)).toThrow();
  });
});
