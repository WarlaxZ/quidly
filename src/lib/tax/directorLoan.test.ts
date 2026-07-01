import { describe, expect, it } from "vitest";
import { directorLoanBalance, s455Charge, beneficialLoanBenefit, type LedgerEntryLike } from "./directorLoan";

const e = (kind: string, amountPence: number, date: string): LedgerEntryLike => ({ kind, amountPence, date: new Date(date) });

describe("directorLoanBalance", () => {
  it("nets loan_out minus loan_in up to the as-of date; ignores dividends", () => {
    const entries = [
      e("director_loan_out", 5_000_00, "2025-06-01"),
      e("director_loan_in", 2_000_00, "2025-07-01"),
      e("dividend", 9_999_00, "2025-07-15"),
    ];
    expect(directorLoanBalance(entries, new Date("2025-12-31"))).toBe(3_000_00); // overdrawn
    expect(directorLoanBalance(entries, new Date("2025-06-15"))).toBe(5_000_00); // before the loan_in
  });
  it("is negative (in credit) when the director has lent the company money", () => {
    expect(directorLoanBalance([e("director_loan_in", 1_000_00, "2025-06-01")], new Date("2025-12-31"))).toBe(-1_000_00);
  });
});

describe("s455Charge (2025-26)", () => {
  it("is 33.75% of an overdrawn balance", () => {
    expect(s455Charge(3_000_00, "2025-26")).toBe(1_012_50); // 3,000 × 33.75%
  });
  it("is zero when the loan is in credit or nil", () => {
    expect(s455Charge(-500_00, "2025-26")).toBe(0);
    expect(s455Charge(0, "2025-26")).toBe(0);
  });
});

describe("beneficialLoanBenefit (2025-26)", () => {
  it("does not apply below the £10,000 threshold", () => {
    expect(beneficialLoanBenefit({ startBalancePence: 5_000_00, endBalancePence: 8_000_00, interestPaidPence: 0, year: "2025-26" }))
      .toEqual({ applies: false, bikPence: 0, class1aNicPence: 0 });
  });
  it("uses the averaging method and 2.25% official rate above the threshold", () => {
    // avg(12,000, 20,000) = 16,000; × 2.25% = 360 BIK; Class 1A = 15% × 360 = 54
    expect(beneficialLoanBenefit({ startBalancePence: 12_000_00, endBalancePence: 20_000_00, interestPaidPence: 0, year: "2025-26" }))
      .toEqual({ applies: true, bikPence: 360_00, class1aNicPence: 54_00 });
  });
  it("subtracts interest the director actually paid, flooring the BIK at zero", () => {
    // gross BIK 360 − 100 paid = 260; Class 1A = 15% × 260 = 39
    expect(beneficialLoanBenefit({ startBalancePence: 12_000_00, endBalancePence: 20_000_00, interestPaidPence: 100_00, year: "2025-26" }))
      .toEqual({ applies: true, bikPence: 260_00, class1aNicPence: 39_00 });
    const r = beneficialLoanBenefit({ startBalancePence: 12_000_00, endBalancePence: 12_000_00, interestPaidPence: 500_00, year: "2025-26" });
    expect(r.bikPence).toBe(0); // 270 gross − 500 paid → floored
    expect(r.class1aNicPence).toBe(0);
    expect(r.applies).toBe(true);
  });
});
