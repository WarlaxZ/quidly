import { describe, expect, it } from "vitest";
import { getBands } from "./bands";

describe("getBands", () => {
  it("returns 2025-26 England/Wales/NI bands in pence", () => {
    const b = getBands("2025-26", "englandWalesNI");
    expect(b.personalAllowancePence).toBe(12_570_00);
    expect(b.basicRateLimitPence).toBe(37_700_00);
    expect(b.higherRateLimitPence).toBe(125_140_00);
    expect(b.basicRate).toBeCloseTo(0.2);
    expect(b.higherRate).toBeCloseTo(0.4);
    expect(b.additionalRate).toBeCloseTo(0.45);
  });
  it("falls back to the latest known year for an unknown future year", () => {
    expect(() => getBands("2099-00", "englandWalesNI")).not.toThrow();
  });
});
