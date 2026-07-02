import { describe, expect, it } from "vitest";
import { useOfHomeAnnualPence } from "./useOfHome";

describe("useOfHomeAnnualPence", () => {
  it("multiplies a monthly amount by 12", () => {
    expect(useOfHomeAnnualPence(2_600, "monthly")).toBe(31_200); // £26/mo → £312/yr
  });
  it("multiplies a weekly amount by 52", () => {
    expect(useOfHomeAnnualPence(500, "weekly")).toBe(26_000); // £5/wk → £260/yr
  });
  it("returns 0 for a zero amount", () => {
    expect(useOfHomeAnnualPence(0, "monthly")).toBe(0);
  });
});
