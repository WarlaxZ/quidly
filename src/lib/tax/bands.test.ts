import { describe, expect, it } from "vitest";
import { getBands } from "./bands";

describe("getBands", () => {
  it("returns 2025-26 England/Wales/NI bands", () => {
    const b = getBands("2025-26", "englandWalesNI");
    expect(b.personalAllowancePence).toBe(12_570_00);
    expect(b.topThresholdPence).toBe(125_140_00);
    expect(b.topRateBps).toBe(4500);
    expect(b.bands).toEqual([
      { widthPence: 37_700_00, rateBps: 2000 },
      { widthPence: null, rateBps: 4000 },
    ]);
  });
  it("returns 2025-26 Scotland bands (5 bands + topRateBps)", () => {
    const b = getBands("2025-26", "scotland");
    expect(b.bands).toHaveLength(5);
    expect(b.topRateBps).toBe(4800);
    expect(b.bands[0]).toEqual({ widthPence: 2_827_00, rateBps: 1900 }); // starter 19% → £15,397
  });
  it("returns 2026-27 England/Wales/NI bands (frozen, same as 2025-26)", () => {
    const b = getBands("2026-27", "englandWalesNI");
    expect(b.personalAllowancePence).toBe(12_570_00);
    expect(b.topRateBps).toBe(4500);
    expect(b.bands).toEqual([
      { widthPence: 37_700_00, rateBps: 2000 },
      { widthPence: null, rateBps: 4000 },
    ]);
  });
  it("returns 2026-27 Scotland bands with widened starter/basic bands", () => {
    const b = getBands("2026-27", "scotland");
    expect(b.bands).toHaveLength(5);
    expect(b.topRateBps).toBe(4800);
    expect(b.bands[0]).toEqual({ widthPence: 3_967_00, rateBps: 1900 }); // starter 19% → £16,537
    expect(b.bands[1]).toEqual({ widthPence: 12_989_00, rateBps: 2000 }); // basic 20% → £29,526
  });
  it("falls back to the latest year and EWNI", () => {
    expect(() => getBands("2099-00", "englandWalesNI")).not.toThrow();
  });
  it("both configured regions end with a null-width fill band (invariant)", () => {
    for (const region of ["englandWalesNI", "scotland"] as const) {
      const b = getBands("2025-26", region);
      expect(b.bands[b.bands.length - 1].widthPence).toBeNull();
    }
  });
});
