import { describe, expect, it } from "vitest";
import { computeInterestPence, daysBetween } from "./schedule";

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween(new Date("2026-01-01T00:00:00Z"), new Date("2026-02-01T00:00:00Z"))).toBe(31);
  });
  it("is zero for the same day", () => {
    expect(daysBetween(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"))).toBe(0);
  });
});

describe("computeInterestPence", () => {
  // £71,000 at 2.7% => £1,917/yr. Over 31 days: 1917 * 31/365 = £162.81
  it("accrues daily over a 31-day period", () => {
    expect(computeInterestPence(7_100_000, 270, 31)).toBe(16_281);
  });

  // February is genuinely cheaper — this is why we don't use rate/12.
  it("accrues less over a 28-day period", () => {
    expect(computeInterestPence(7_100_000, 270, 28)).toBe(14_706);
  });

  it("returns zero for a zero balance", () => {
    expect(computeInterestPence(0, 270, 31)).toBe(0);
  });

  it("returns zero for a zero-day period", () => {
    expect(computeInterestPence(7_100_000, 270, 0)).toBe(0);
  });

  it("returns zero for a zero rate", () => {
    expect(computeInterestPence(7_100_000, 0, 31)).toBe(0);
  });
});
