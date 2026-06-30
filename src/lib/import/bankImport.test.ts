import { describe, expect, it } from "vitest";
import { mapImportRow, isDuplicate } from "./bankImport";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("mapImportRow", () => {
  const mapping = { dateCol: 0, amountCol: 1, descriptionCol: 2 };
  it("maps a positive amount as income (DD/MM/YYYY)", () => {
    const r = mapImportRow(["01/06/2025", "950.00", "Rent"], mapping);
    expect(iso(r.date)).toBe("2025-06-01");
    expect(r.amountPence).toBe(95000);
    expect(r.direction).toBe("in");
    expect(r.description).toBe("Rent");
  });
  it("maps a negative amount as expense and accepts ISO dates and £/commas", () => {
    const r = mapImportRow(["2025-06-02", "-£1,250.50", "Mortgage"], mapping);
    expect(iso(r.date)).toBe("2025-06-02");
    expect(r.amountPence).toBe(125050);
    expect(r.direction).toBe("out");
  });
  it("throws on an unparseable date or amount", () => {
    expect(() => mapImportRow(["nope", "5", "x"], mapping)).toThrow();
    expect(() => mapImportRow(["01/06/2025", "abc", "x"], mapping)).toThrow();
  });
});

describe("isDuplicate", () => {
  const existing = [{ date: new Date("2025-06-01"), amountPence: 95000, description: "Rent" }];
  it("flags an exact same-day/amount/description match", () => {
    expect(isDuplicate({ date: new Date("2025-06-01"), amountPence: 95000, description: "Rent" }, existing)).toBe(true);
  });
  it("does not flag a different amount or description", () => {
    expect(isDuplicate({ date: new Date("2025-06-01"), amountPence: 95001, description: "Rent" }, existing)).toBe(false);
    expect(isDuplicate({ date: new Date("2025-06-01"), amountPence: 95000, description: "Other" }, existing)).toBe(false);
  });
});
