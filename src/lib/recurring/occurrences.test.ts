import { describe, expect, it } from "vitest";
import { recurringOccurrences, upcomingOccurrences, type OccurrenceRule } from "./occurrences";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const base: Omit<OccurrenceRule, "intervalUnit" | "intervalCount"> = {
  dayOfWeek: null, dayOfMonth: null, monthOfYear: null,
  startDate: new Date("2025-01-01"), endDate: null, lastGeneratedDate: null,
};

describe("recurringOccurrences — month/year", () => {
  it("lists monthly occurrences up to asOf", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1, startDate: new Date("2025-01-01") },
        new Date("2025-03-15"),
      ).map(iso),
    ).toEqual(["2025-01-01", "2025-02-01", "2025-03-01"]);
  });

  it("skips occurrences on or before lastGeneratedDate", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1, startDate: new Date("2025-01-01"), lastGeneratedDate: new Date("2025-02-01") },
        new Date("2025-04-15"),
      ).map(iso),
    ).toEqual(["2025-03-01", "2025-04-01"]);
  });

  it("clamps dayOfMonth 31 to each month's real last day", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 31, startDate: new Date("2025-01-31") },
        new Date("2025-02-28"),
      ).map(iso),
    ).toEqual(["2025-01-31", "2025-02-28"]);
  });

  it("respects endDate and quarterly (MONTH x3) steps", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "MONTH", intervalCount: 3, dayOfMonth: 15, startDate: new Date("2025-01-15"), endDate: new Date("2025-08-01") },
        new Date("2025-12-31"),
      ).map(iso),
    ).toEqual(["2025-01-15", "2025-04-15", "2025-07-15"]);
  });

  it("annual (YEAR) falls back to startDate month when monthOfYear is null", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "YEAR", intervalCount: 1, dayOfMonth: 10, startDate: new Date("2025-05-10") },
        new Date("2027-01-01"),
      ).map(iso),
    ).toEqual(["2025-05-10", "2026-05-10"]);
  });

  it("annual uses monthOfYear when provided", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "YEAR", intervalCount: 1, dayOfMonth: 6, monthOfYear: 4, startDate: new Date("2025-01-01") },
        new Date("2027-01-01"),
      ).map(iso),
    ).toEqual(["2025-04-06", "2026-04-06"]);
  });
});

describe("recurringOccurrences — week/day", () => {
  it("weekly anchors to dayOfWeek (Mon=0) on/after startDate", () => {
    // 2025-01-01 is a Wednesday. First Monday on/after is 2025-01-06.
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "WEEK", intervalCount: 1, dayOfWeek: 0, startDate: new Date("2025-01-01") },
        new Date("2025-01-27"),
      ).map(iso),
    ).toEqual(["2025-01-06", "2025-01-13", "2025-01-20", "2025-01-27"]);
  });

  it("fortnightly (WEEK x2) steps 14 days", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "WEEK", intervalCount: 2, dayOfWeek: 0, startDate: new Date("2025-01-01") },
        new Date("2025-02-03"),
      ).map(iso),
    ).toEqual(["2025-01-06", "2025-01-20", "2025-02-03"]);
  });

  it("daily steps one day", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "DAY", intervalCount: 1, startDate: new Date("2025-01-01") },
        new Date("2025-01-04"),
      ).map(iso),
    ).toEqual(["2025-01-01", "2025-01-02", "2025-01-03", "2025-01-04"]);
  });

  it("every-3-days honours interval count", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "DAY", intervalCount: 3, startDate: new Date("2025-01-01") },
        new Date("2025-01-10"),
      ).map(iso),
    ).toEqual(["2025-01-01", "2025-01-04", "2025-01-07", "2025-01-10"]);
  });

  it("daily rules reach asOf across multi-year spans (no silent truncation)", () => {
    const dates = recurringOccurrences(
      { ...base, intervalUnit: "DAY", intervalCount: 1, startDate: new Date("2021-01-01") },
      new Date("2026-07-02"),
    );
    expect(iso(dates[dates.length - 1])).toBe("2026-07-02");
  });
});

describe("upcomingOccurrences", () => {
  it("returns the next N occurrences on/after a point", () => {
    const rule: OccurrenceRule = { ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1, startDate: new Date("2025-01-01") };
    expect(upcomingOccurrences(rule, new Date("2024-12-31"), 3).map(iso)).toEqual(["2025-01-01", "2025-02-01", "2025-03-01"]);
  });

  it("ignores lastGeneratedDate (forward preview)", () => {
    const rule: OccurrenceRule = { ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1, startDate: new Date("2025-01-01"), lastGeneratedDate: new Date("2025-06-01") };
    expect(upcomingOccurrences(rule, new Date("2024-12-31"), 2).map(iso)).toEqual(["2025-01-01", "2025-02-01"]);
  });

  it("returns the requested count even for coarse (yearly) schedules", () => {
    const rule: OccurrenceRule = { ...base, intervalUnit: "YEAR", intervalCount: 1, dayOfMonth: 1, monthOfYear: 1, startDate: new Date("2025-01-01") };
    expect(upcomingOccurrences(rule, new Date("2024-12-31"), 10)).toHaveLength(10);
  });
});
