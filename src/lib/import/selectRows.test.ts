import { describe, expect, it } from "vitest";
import { selectRowsToImport } from "./selectRows";
import type { LoanCandidate } from "./loanMatch";

const LOAN: LoanCandidate = {
  loanId: "loan-1",
  name: "Buy-to-let mortgage",
  scheduledPaymentPence: 75_000,
  scheduledDates: [new Date("2026-05-01T00:00:00Z")],
};

const loanRow = { date: new Date("2026-05-01T00:00:00Z"), amountPence: 75_000, direction: "out" as const, description: "MORTGAGE CO" };
const ordinaryRow = { date: new Date("2026-05-02T00:00:00Z"), amountPence: 5_000, direction: "out" as const, description: "Letting agent" };

describe("selectRowsToImport", () => {
  it("skips a row that matches a loan payment by default", () => {
    const result = selectRowsToImport([loanRow, ordinaryRow], [], [LOAN], false);
    expect(result).toEqual([ordinaryRow]);
  });

  it("imports the loan-matching row when includeLoanMatches is true", () => {
    const result = selectRowsToImport([loanRow, ordinaryRow], [], [LOAN], true);
    expect(result).toEqual([loanRow, ordinaryRow]);
  });

  it("still skips duplicates regardless of includeLoanMatches", () => {
    const existing = [{ date: ordinaryRow.date, amountPence: ordinaryRow.amountPence, description: ordinaryRow.description }];
    const result = selectRowsToImport([loanRow, ordinaryRow], existing, [LOAN], true);
    expect(result).toEqual([loanRow]);
  });

  it("imports everything when there are no loan candidates", () => {
    const result = selectRowsToImport([loanRow, ordinaryRow], [], [], false);
    expect(result).toEqual([loanRow, ordinaryRow]);
  });
});
