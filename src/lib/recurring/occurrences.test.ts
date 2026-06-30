import { describe, expect, it } from "vitest";
import { recurringOccurrences } from "./occurrences";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("recurringOccurrences", () => {
  it("lists monthly occurrences from startDate up to asOf", () => {
    const dates = recurringOccurrences(
      { frequency: "monthly", dayOfMonth: 1, startDate: new Date("2025-01-01"), endDate: null, lastGeneratedDate: null },
      new Date("2025-03-15"),
    );
    expect(dates.map(iso)).toEqual(["2025-01-01", "2025-02-01", "2025-03-01"]);
  });

  it("skips occurrences on or before lastGeneratedDate", () => {
    const dates = recurringOccurrences(
      { frequency: "monthly", dayOfMonth: 1, startDate: new Date("2025-01-01"), endDate: null, lastGeneratedDate: new Date("2025-02-01") },
      new Date("2025-04-15"),
    );
    expect(dates.map(iso)).toEqual(["2025-03-01", "2025-04-01"]);
  });

  it("clamps dayOfMonth to the last day of short months", () => {
    const dates = recurringOccurrences(
      { frequency: "monthly", dayOfMonth: 31, startDate: new Date("2025-01-31"), endDate: null, lastGeneratedDate: null },
      new Date("2025-02-28"),
    );
    expect(dates.map(iso)).toEqual(["2025-01-31", "2025-02-28"]);
  });

  it("respects endDate and quarterly/annual steps", () => {
    const q = recurringOccurrences(
      { frequency: "quarterly", dayOfMonth: 15, startDate: new Date("2025-01-15"), endDate: new Date("2025-08-01"), lastGeneratedDate: null },
      new Date("2025-12-31"),
    );
    expect(q.map(iso)).toEqual(["2025-01-15", "2025-04-15", "2025-07-15"]);
  });

  it("starts emitting only from the first occurrence on/after startDate when day differs", () => {
    const dates = recurringOccurrences(
      { frequency: "monthly", dayOfMonth: 1, startDate: new Date("2025-01-15"), endDate: null, lastGeneratedDate: null },
      new Date("2025-03-10"),
    );
    expect(dates.map(iso)).toEqual(["2025-02-01", "2025-03-01"]);
  });
  it("returns nothing when lastGeneratedDate is at or after asOf", () => {
    const dates = recurringOccurrences(
      { frequency: "monthly", dayOfMonth: 1, startDate: new Date("2025-01-01"), endDate: null, lastGeneratedDate: new Date("2025-05-01") },
      new Date("2025-03-15"),
    );
    expect(dates).toEqual([]);
  });
});
