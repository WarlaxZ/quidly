import { describe, expect, it } from "vitest";
import { getBands } from "./bands";

describe("getBands", () => {
  it("returns 2025-26 England/Wales/NI bands", () => {
    const b = getBands("2025-26", "englandWalesNI");
    expect(b.personalAllowancePence).toBe(12_570_00);
    expect(b.topThresholdPence).toBe(125_140_00);
    expect(b.topRate).toBeCloseTo(0.45);
    expect(b.bands).toEqual([
      { widthPence: 37_700_00, rate: 0.2 },
      { widthPence: null, rate: 0.4 },
    ]);
  });
  it("returns 2025-26 Scotland bands with 6 rates total", () => {
    const b = getBands("2025-26", "scotland");
    expect(b.bands).toHaveLength(5);
    expect(b.topRate).toBeCloseTo(0.48);
    expect(b.bands[0]).toEqual({ widthPence: 2_306_00, rate: 0.19 });
  });
  it("falls back to the latest year and EWNI", () => {
    expect(() => getBands("2099-00", "englandWalesNI")).not.toThrow();
  });
});
