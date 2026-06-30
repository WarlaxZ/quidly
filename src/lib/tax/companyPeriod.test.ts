import { describe, expect, it } from "vitest";
import { companyAccountingPeriod, companyPeriodYearOf } from "./companyPeriod";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("companyAccountingPeriod", () => {
  it("computes the 12-month period ending on the year-end in the given year", () => {
    const { start, end } = companyAccountingPeriod(31, 3, 2026);
    expect(iso(end)).toBe("2026-03-31");
    expect(iso(start)).toBe("2025-04-01");
  });
  it("handles a 31 December year-end", () => {
    const { start, end } = companyAccountingPeriod(31, 12, 2025);
    expect(iso(end)).toBe("2025-12-31");
    expect(iso(start)).toBe("2025-01-01");
  });

  it("maps a date to its accounting-period year", () => {
    expect(companyPeriodYearOf(new Date("2025-06-01"), 31, 12)).toBe(2025);
    expect(companyPeriodYearOf(new Date("2025-06-01"), 31, 3)).toBe(2026);
    expect(companyPeriodYearOf(new Date("2025-03-31"), 31, 3)).toBe(2025);
    expect(companyPeriodYearOf(new Date("2025-12-31T14:00:00Z"), 31, 12)).toBe(2025); // time-of-day on year-end day stays in-period
  });
});
