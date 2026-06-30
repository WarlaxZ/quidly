import { describe, expect, it } from "vitest";
import { parseAmountToPence } from "./parseAmount";

describe("parseAmountToPence", () => {
  it("parses plain pounds and pence", () => {
    expect(parseAmountToPence("19.99")).toBe(1999);
    expect(parseAmountToPence("1000")).toBe(100000);
    expect(parseAmountToPence("0.01")).toBe(1);
  });
  it("tolerates currency symbols, commas and whitespace", () => {
    expect(parseAmountToPence(" £1,234.56 ")).toBe(123456);
  });
  it("rejects negative, empty, and non-numeric input", () => {
    expect(() => parseAmountToPence("-5")).toThrow();
    expect(() => parseAmountToPence("")).toThrow();
    expect(() => parseAmountToPence("abc")).toThrow();
  });
  it("rejects more than two decimal places", () => {
    expect(() => parseAmountToPence("1.234")).toThrow();
  });
});
