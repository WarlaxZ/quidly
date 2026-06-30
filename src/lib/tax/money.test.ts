import { describe, expect, it } from "vitest";
import { poundsToPence, penceToPounds, formatGBP } from "./money";

describe("money", () => {
  it("converts pounds to integer pence without float error", () => {
    expect(poundsToPence(19.99)).toBe(1999);
    expect(poundsToPence(0.1 + 0.2)).toBe(30);
  });

  it("converts pence back to pounds", () => {
    expect(penceToPounds(1999)).toBe(19.99);
  });

  it("formats pence as GBP", () => {
    expect(formatGBP(123456)).toBe("£1,234.56");
  });
});
