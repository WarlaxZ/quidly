import { describe, expect, it } from "vitest";
import { matchLoanPayment, type LoanCandidate } from "./loanMatch";

const LOAN: LoanCandidate = {
  loanId: "loan1",
  name: "Santander BTL",
  scheduledPaymentPence: 75_000,
  scheduledDates: [new Date("2026-05-01T00:00:00Z"), new Date("2026-06-01T00:00:00Z")],
};

describe("matchLoanPayment", () => {
  it("matches an exact payment on the scheduled date", () => {
    const m = matchLoanPayment({ date: new Date("2026-05-01T00:00:00Z"), amountPence: 75_000, direction: "out" }, [LOAN]);
    expect(m?.loanId).toBe("loan1");
  });

  it("matches within 5 days of the scheduled date", () => {
    const m = matchLoanPayment({ date: new Date("2026-05-05T00:00:00Z"), amountPence: 75_000, direction: "out" }, [LOAN]);
    expect(m?.loanId).toBe("loan1");
  });

  it("does not match 6 days out", () => {
    const m = matchLoanPayment({ date: new Date("2026-05-07T00:00:00Z"), amountPence: 75_000, direction: "out" }, [LOAN]);
    expect(m).toBeNull();
  });

  // Voluntary overpayments vary, so the amount band is deliberately generous.
  it("matches a slightly different amount within tolerance", () => {
    const m = matchLoanPayment({ date: new Date("2026-05-01T00:00:00Z"), amountPence: 76_400, direction: "out" }, [LOAN]);
    expect(m?.loanId).toBe("loan1");
  });

  it("does not match an amount well outside tolerance", () => {
    const m = matchLoanPayment({ date: new Date("2026-05-01T00:00:00Z"), amountPence: 40_000, direction: "out" }, [LOAN]);
    expect(m).toBeNull();
  });

  it("ignores money coming in", () => {
    const m = matchLoanPayment({ date: new Date("2026-05-01T00:00:00Z"), amountPence: 75_000, direction: "in" }, [LOAN]);
    expect(m).toBeNull();
  });

  it("returns the row's actual amount, not the scheduled figure", () => {
    const m = matchLoanPayment({ date: new Date("2026-05-01T00:00:00Z"), amountPence: 76_400, direction: "out" }, [LOAN]);
    expect(m?.paidPence).toBe(76_400);
  });

  it("returns null when there are no candidate loans", () => {
    expect(matchLoanPayment({ date: new Date("2026-05-01T00:00:00Z"), amountPence: 75_000, direction: "out" }, [])).toBeNull();
  });
});
