import { describe, expect, it } from "vitest";
import { decimalStringToPence } from "./transform";

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
  it("tolerates surrounding whitespace and leading +", () => {
    expect(decimalStringToPence(" +9.99 ")).toBe(999);
  });
});
