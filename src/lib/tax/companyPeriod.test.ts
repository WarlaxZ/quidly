import { describe, expect, it } from "vitest";
import { companyAccountingPeriod } from "./companyPeriod";

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
});
