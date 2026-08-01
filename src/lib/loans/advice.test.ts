import { describe, expect, it } from "vitest";
import { loanAdvice, type LoanAdviceInput } from "./advice";

const BASE: LoanAdviceInput = {
  annualRateBps: 270,
  ownershipType: "personal",
  taxYear: "2026-27",
  region: "englandWalesNI",
  kind: "interestOnly",
  capitalNoReliefPence: 708_000,
  termEndDate: null,
  currentBalancePence: 7_100_000,
};

describe("loanAdvice", () => {
  it("gives the effective cost of debt after the 20% reducer", () => {
    const a = loanAdvice(BASE);
    expect(a.reducerBps).toBe(2000);
    expect(a.effectiveRateBps).toBe(216); // 2.7% -> 2.16%
    expect(a.reliefBasis).toBe("section24Reducer");
  });

  it("tracks the reducer up to 22% for 2027-28 in England", () => {
    const a = loanAdvice({ ...BASE, taxYear: "2027-28" });
    expect(a.reducerBps).toBe(2200);
    expect(a.effectiveRateBps).toBe(211); // 2.7% -> 2.11%
  });

  it("keeps the 20% reducer for Scotland in 2027-28 (no Holyrood surcharge)", () => {
    const a = loanAdvice({ ...BASE, taxYear: "2027-28", region: "scotland" });
    expect(a.reducerBps).toBe(2000);
    expect(a.effectiveRateBps).toBe(216);
  });

  it("reports full deduction for a company-owned property", () => {
    const a = loanAdvice({ ...BASE, ownershipType: "company" });
    expect(a.reliefBasis).toBe("fullDeduction");
    expect(a.reducerBps).toBeNull();
    // No single "effective rate" exists: the real post-relief cost depends on the
    // company's corporation tax rate, which loanAdvice does not know.
    expect(a.effectiveRateBps).toBeNull();
  });

  it("passes through the capital that attracted no relief", () => {
    expect(loanAdvice(BASE).capitalNoReliefPence).toBe(708_000);
  });

  it("warns about the balance due at term end for an interest-only loan", () => {
    const a = loanAdvice({ ...BASE, termEndDate: new Date("2031-06-30T00:00:00Z") });
    expect(a.termEnd).toEqual({
      date: new Date("2031-06-30T00:00:00Z"),
      balanceDuePence: 7_100_000,
    });
  });

  it("does not warn when there is no term end date", () => {
    expect(loanAdvice(BASE).termEnd).toBeNull();
  });

  it("does not warn for a repayment loan", () => {
    const a = loanAdvice({ ...BASE, kind: "repayment", termEndDate: new Date("2031-06-30T00:00:00Z") });
    expect(a.termEnd).toBeNull();
  });
});
