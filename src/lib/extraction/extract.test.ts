import { describe, expect, it } from "vitest";
import { buildExtractionTool, parseExtraction, extractReceipt, type AnthropicLike } from "./extract";

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
  it("requires the key fields", () => {
    const tool = buildExtractionTool(categories);
    expect(tool.input_schema.required).toEqual(["vendorName", "amount", "direction", "confidence"]);
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
  it("throws on a sub-penny amount that rounds to zero", () => {
    expect(() => parseExtraction({ vendorName: "X", amount: 0.004 }, categories)).toThrow();
  });
  it("throws on a string amount (no coercion)", () => {
    expect(() => parseExtraction({ vendorName: "X", amount: "12.50" }, categories)).toThrow();
  });
  it("nulls a structurally-invalid date", () => {
    expect(parseExtraction({ vendorName: "X", amount: 5, date: "2026-02-30" }, categories).isoDate).toBeNull();
  });
});

describe("extractReceipt", () => {
  it("sends the file and parses the tool-use response", async () => {
    let captured: any = null;
    const fake: AnthropicLike = {
      messages: {
        create: async (params: any) => {
          captured = params;
          return { content: [{ type: "tool_use", name: "record_receipt", input: { vendorName: "Tesco", date: "2026-06-02", amount: 12.5, direction: "out", categoryId: "c-repairs", confidence: "high" } }] };
        },
      },
    };
    const r = await extractReceipt(Buffer.from("img"), "image/jpeg", categories, fake);
    expect(r.amountPence).toBe(1250);
    expect(r.vendorName).toBe("Tesco");
    expect(captured.tool_choice).toEqual({ type: "tool", name: "record_receipt" });
    expect(captured.messages[0].content[0].type).toBe("image");
  });
  it("throws if no tool_use block is returned", async () => {
    const fake: AnthropicLike = { messages: { create: async () => ({ content: [{ type: "text", text: "no" }] }) } };
    await expect(extractReceipt(Buffer.from("x"), "image/jpeg", categories, fake)).rejects.toThrow();
  });
  it("sends a document block for a PDF", async () => {
    let captured: any = null;
    const fake: AnthropicLike = { messages: { create: async (p: any) => { captured = p; return { content: [{ type: "tool_use", name: "record_receipt", input: { vendorName: "Z", amount: 9.99, direction: "out", confidence: "low" } }] }; } } };
    await extractReceipt(Buffer.from("pdf"), "application/pdf", categories, fake);
    expect(captured.messages[0].content[0].type).toBe("document");
  });
});
