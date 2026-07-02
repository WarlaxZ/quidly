import { describe, expect, it } from "vitest";
import { describeSchedule, nextDueDate } from "./describe";
import type { OccurrenceRule } from "./occurrences";

const base: Omit<OccurrenceRule, "intervalUnit" | "intervalCount"> = {
  dayOfWeek: null, dayOfMonth: null, monthOfYear: null,
  startDate: new Date("2025-01-01"), endDate: null, lastGeneratedDate: null,
};

describe("describeSchedule", () => {
  it("daily / every-n-days", () => {
    expect(describeSchedule({ ...base, intervalUnit: "DAY", intervalCount: 1 })).toBe("Daily");
    expect(describeSchedule({ ...base, intervalUnit: "DAY", intervalCount: 3 })).toBe("Every 3 days");
  });
  it("weekly / fortnightly with weekday", () => {
    expect(describeSchedule({ ...base, intervalUnit: "WEEK", intervalCount: 1, dayOfWeek: 0 })).toBe("Weekly on Monday");
    expect(describeSchedule({ ...base, intervalUnit: "WEEK", intervalCount: 2, dayOfWeek: 0 })).toBe("Fortnightly on Mondays");
    expect(describeSchedule({ ...base, intervalUnit: "WEEK", intervalCount: 3, dayOfWeek: 4 })).toBe("Every 3 weeks on Friday");
  });
  it("monthly / quarterly with day + last-day", () => {
    expect(describeSchedule({ ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1 })).toBe("Monthly on the 1st");
    expect(describeSchedule({ ...base, intervalUnit: "MONTH", intervalCount: 3, dayOfMonth: 5 })).toBe("Quarterly on the 5th");
    expect(describeSchedule({ ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 31 })).toBe("Monthly on the last day");
  });
  it("yearly with month + day", () => {
    expect(describeSchedule({ ...base, intervalUnit: "YEAR", intervalCount: 1, dayOfMonth: 6, monthOfYear: 4 })).toBe("Yearly on 6 April");
  });
});

describe("nextDueDate", () => {
  it("returns the next occurrence after asOf", () => {
    const rule: OccurrenceRule = { ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1, startDate: new Date("2025-01-01") };
    expect(nextDueDate(rule, new Date("2025-03-10"))?.toISOString().slice(0, 10)).toBe("2025-04-01");
  });
  it("returns null when paused", () => {
    const rule: OccurrenceRule & { active?: boolean } = { ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1, active: false };
    expect(nextDueDate(rule, new Date("2025-03-10"))).toBeNull();
  });
  it("returns null when past endDate", () => {
    const rule: OccurrenceRule = { ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1, startDate: new Date("2025-01-01"), endDate: new Date("2025-02-15") };
    expect(nextDueDate(rule, new Date("2025-03-10"))).toBeNull();
  });
});
