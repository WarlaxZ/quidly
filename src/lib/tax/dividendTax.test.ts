import { describe, expect, it } from "vitest";
import { dividendTax } from "./dividendTax";

describe("dividendTax (2025-26)", () => {
  it("is zero within the £500 dividend allowance", () => {
    expect(dividendTax(400_00, 20_000_00, "2025-26")).toBe(0);
  });

  it("taxes an ordinary-band dividend at 8.75% after the allowance", () => {
    // other 20,000 leaves the dividend entirely in the basic band.
    // (10,000 - 500 allowance) * 8.75% = 831.25
    expect(dividendTax(10_000_00, 20_000_00, "2025-26")).toBe(831_25);
  });

  it("splits a dividend straddling the basic→higher threshold", () => {
    // other 45,000; PA 12,570; basic top = 50,270.
    // dividend 10,000 sits 45,000→55,000. First 500 at 0%.
    // 45,000→50,270 = 5,270; minus 500 allowance = 4,770 @ 8.75% = 417.375
    // 50,270→55,000 = 4,730 @ 33.75% = 1,596.375
    // total = 2,013.75
    expect(dividendTax(10_000_00, 45_000_00, "2025-26")).toBe(2_013_75);
  });

  it("taxes an additional-rate dividend at 39.35% (personal allowance fully tapered)", () => {
    // other 200,000 → PA 0; dividend all in additional band.
    // (10,000 - 500) * 39.35% = 3,738.25
    expect(dividendTax(10_000_00, 200_000_00, "2025-26")).toBe(3_738_25);
  });

  it("returns 0 for a non-positive dividend", () => {
    expect(dividendTax(0, 20_000_00, "2025-26")).toBe(0);
    expect(dividendTax(-5_00, 20_000_00, "2025-26")).toBe(0);
  });

  it("falls back to the latest year's config for an unknown year", () => {
    expect(dividendTax(10_000_00, 20_000_00, "2099-00")).toBe(831_25);
  });
});
