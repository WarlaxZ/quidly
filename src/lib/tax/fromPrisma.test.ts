import { describe, expect, it } from "vitest";
import { toTaxTxn } from "./fromPrisma";

describe("toTaxTxn", () => {
  it("maps a Prisma transaction + category to a TaxTxn", () => {
    const row = {
      date: new Date("2025-06-01"),
      amountPence: 120000,
      direction: "in" as const,
      category: { kind: "income" as const, allowable: true, sa105Box: "20" },
    };
    expect(toTaxTxn(row)).toEqual({
      date: new Date("2025-06-01"),
      amountPence: 120000,
      direction: "in",
      categoryKind: "income",
      allowable: true,
      sa105Box: "20",
    });
  });

  it("passes through a null sa105Box and expense direction", () => {
    const row = {
      date: new Date("2025-06-01"),
      amountPence: 5000,
      direction: "out" as const,
      category: { kind: "capital" as const, allowable: false, sa105Box: null },
    };
    expect(toTaxTxn(row)).toEqual({
      date: new Date("2025-06-01"),
      amountPence: 5000,
      direction: "out",
      categoryKind: "capital",
      allowable: false,
      sa105Box: null,
    });
  });
});
