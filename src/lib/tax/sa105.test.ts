import { describe, expect, it } from "vitest";
import { sa105Boxes } from "./sa105";
import type { TaxTxn } from "./types";

const t = (over: Partial<TaxTxn>): TaxTxn => ({
  date: new Date("2025-06-01"),
  amountPence: 0,
  direction: "in",
  categoryKind: "income",
  allowable: true,
  sa105Box: null,
  ...over,
});

describe("sa105Boxes", () => {
  it("totals transactions by their SA105 box", () => {
    const txns: TaxTxn[] = [
      t({ amountPence: 1_200_00, sa105Box: "20", categoryKind: "income" }),
      t({ amountPence: 300_00, sa105Box: "20", categoryKind: "income" }),
      t({ amountPence: 150_00, sa105Box: "25", categoryKind: "expense", direction: "out" }),
      t({ amountPence: 500_00, sa105Box: "44", categoryKind: "finance", direction: "out" }),
    ];
    const boxes = sa105Boxes(txns);
    expect(boxes["20"]).toBe(1_500_00);
    expect(boxes["25"]).toBe(150_00);
    expect(boxes["44"]).toBe(500_00);
  });

  it("ignores transactions with no box (e.g. capital)", () => {
    const boxes = sa105Boxes([t({ amountPence: 999_00, sa105Box: null, categoryKind: "capital", allowable: false })]);
    expect(Object.keys(boxes)).toHaveLength(0);
  });
});
