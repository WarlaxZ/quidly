import { describe, expect, it } from "vitest";
import { mileageClaimPence, mileageRatesFor } from "./mileage";
import { mileageSummary } from "./mileage";

describe("mileageClaimPence", () => {
  it("charges 45p/mile below the 10,000-mile threshold", () => {
    expect(mileageClaimPence(30, 0, "2025-26")).toBe(1350); // 30 * 45p = £13.50
  });
  it("splits a trip that straddles the threshold", () => {
    expect(mileageClaimPence(20, 9_990, "2025-26")).toBe(700); // 10@45p + 10@25p
  });
  it("charges 25p/mile once the threshold is reached", () => {
    expect(mileageClaimPence(10, 10_000, "2025-26")).toBe(250);
    expect(mileageClaimPence(5, 12_000, "2025-26")).toBe(125);
  });
  it("returns 0 for a zero/negative trip", () => {
    expect(mileageClaimPence(0, 0, "2025-26")).toBe(0);
    expect(mileageClaimPence(-5, 0, "2025-26")).toBe(0);
  });
  it("falls back to the latest rates for an unconfigured year", () => {
    expect(mileageRatesFor("2099-00")).toEqual(mileageRatesFor("2027-28"));
    expect(mileageClaimPence(10, 0, "2099-00")).toBe(450);
  });
});

describe("mileageSummary", () => {
  it("totals miles and pence and reports the 45p band remaining", () => {
    const s = mileageSummary([{ miles: 24, amountPence: 1080 }, { miles: 48, amountPence: 2160 }], "2025-26");
    expect(s).toEqual({ totalMiles: 72, totalPence: 3240, remainingAt45p: 9928 });
  });
  it("is zero-safe for an empty log", () => {
    expect(mileageSummary([], "2025-26")).toEqual({ totalMiles: 0, totalPence: 0, remainingAt45p: 10000 });
  });
  it("clamps remaining at 0 once past the threshold", () => {
    expect(mileageSummary([{ miles: 10_500, amountPence: 472_500 }], "2025-26").remainingAt45p).toBe(0);
  });
});
