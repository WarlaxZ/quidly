import { describe, expect, it } from "vitest";
import { computeInterestPence, daysBetween, derivePayment, type LoanTerms } from "./schedule";

const INTEREST_ONLY: LoanTerms = { kind: "interestOnly", annualRateBps: 270, scheduledPaymentPence: 75_000 };

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween(new Date("2026-01-01T00:00:00Z"), new Date("2026-02-01T00:00:00Z"))).toBe(31);
  });
  it("is zero for the same day", () => {
    expect(daysBetween(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"))).toBe(0);
  });
});

describe("computeInterestPence", () => {
  // £71,000 at 2.7% => £1,917/yr. Over 31 days: 1917 * 31/365 = £162.81
  it("accrues daily over a 31-day period", () => {
    expect(computeInterestPence(7_100_000, 270, 31)).toBe(16_281);
  });

  // February is genuinely cheaper — this is why we don't use rate/12.
  it("accrues less over a 28-day period", () => {
    expect(computeInterestPence(7_100_000, 270, 28)).toBe(14_706);
  });

  it("returns zero for a zero balance", () => {
    expect(computeInterestPence(0, 270, 31)).toBe(0);
  });

  it("returns zero for a zero-day period", () => {
    expect(computeInterestPence(7_100_000, 270, 0)).toBe(0);
  });

  it("returns zero for a zero rate", () => {
    expect(computeInterestPence(7_100_000, 0, 31)).toBe(0);
  });

  it("returns zero for a negative balance, rate, or days", () => {
    expect(computeInterestPence(-7_100_000, 270, 31)).toBe(0);
    expect(computeInterestPence(7_100_000, -270, 31)).toBe(0);
    expect(computeInterestPence(7_100_000, 270, -31)).toBe(0);
  });
});

describe("derivePayment", () => {
  // The bug this whole feature exists to prevent: £750 paid, only ~£163 is deductible.
  it("splits a £750 payment on a £71k interest-only loan at 2.7%", () => {
    const d = derivePayment({ terms: INTEREST_ONLY, openingBalancePence: 7_100_000, daysInPeriod: 31, paidPence: 75_000 });
    expect(d.computedInterestPence).toBe(16_281);
    expect(d.interestPence).toBe(16_281);
    expect(d.capitalPence).toBe(58_719);      // £587.19 — no tax relief whatsoever
    expect(d.closingBalancePence).toBe(7_041_281);
    expect(d.fullyRedeemed).toBe(false);
  });

  it("keeps interest + capital equal to the amount paid", () => {
    const d = derivePayment({ terms: INTEREST_ONLY, openingBalancePence: 7_100_000, daysInPeriod: 31, paidPence: 75_000 });
    expect(d.interestPence + d.capitalPence).toBe(75_000);
  });

  it("uses the actual interest override in place of the computed figure", () => {
    const d = derivePayment({
      terms: INTEREST_ONLY,
      openingBalancePence: 7_100_000,
      daysInPeriod: 31,
      paidPence: 75_000,
      actualInterestPence: 16_000,
    });
    expect(d.computedInterestPence).toBe(16_281);  // snapshot preserved
    expect(d.interestPence).toBe(16_000);
    expect(d.capitalPence).toBe(59_000);
  });

  it("treats a payment equal to the interest as pure interest, no capital", () => {
    const d = derivePayment({ terms: INTEREST_ONLY, openingBalancePence: 7_100_000, daysInPeriod: 31, paidPence: 16_281 });
    expect(d.capitalPence).toBe(0);
    expect(d.closingBalancePence).toBe(7_100_000);
  });

  it("clamps capital at the outstanding balance and flags full redemption", () => {
    const d = derivePayment({ terms: INTEREST_ONLY, openingBalancePence: 50_000, daysInPeriod: 31, paidPence: 75_000 });
    expect(d.capitalPence).toBe(50_000);
    expect(d.closingBalancePence).toBe(0);
    expect(d.fullyRedeemed).toBe(true);
  });

  it("flags full redemption when capital exactly clears the balance", () => {
    const interest = computeInterestPence(58_719, 270, 31);
    const d = derivePayment({
      terms: INTEREST_ONLY,
      openingBalancePence: 58_719,
      daysInPeriod: 31,
      paidPence: 58_719 + interest,
    });
    expect(d.closingBalancePence).toBe(0);
    expect(d.fullyRedeemed).toBe(true);
  });

  it("clamps to full redemption when an actualInterestPence override leaves capital covering the balance", () => {
    const d = derivePayment({
      terms: INTEREST_ONLY,
      openingBalancePence: 50_000,
      daysInPeriod: 31,
      paidPence: 75_000,
      actualInterestPence: 10_000,
    });
    expect(d.fullyRedeemed).toBe(true);
    expect(d.closingBalancePence).toBe(0);
  });

  // Silently absorbing this would understate the capital line and overstate relief. Refuse instead.
  it("throws when interest exceeds the payment", () => {
    expect(() => derivePayment({ terms: INTEREST_ONLY, openingBalancePence: 7_100_000, daysInPeriod: 31, paidPence: 10_000 })).toThrow(/exceeds the payment/);
  });

  it("throws on a negative interest override", () => {
    expect(() =>
      derivePayment({
        terms: INTEREST_ONLY,
        openingBalancePence: 7_100_000,
        daysInPeriod: 31,
        paidPence: 75_000,
        actualInterestPence: -1,
      }),
    ).toThrow(/cannot be negative/);
  });

  it("throws on a negative opening balance", () => {
    expect(() =>
      derivePayment({ terms: INTEREST_ONLY, openingBalancePence: -1, daysInPeriod: 31, paidPence: 75_000 }),
    ).toThrow(/balance cannot be negative/);
  });

  it("accrues no interest over a zero-day first period", () => {
    const d = derivePayment({ terms: INTEREST_ONLY, openingBalancePence: 7_100_000, daysInPeriod: 0, paidPence: 75_000 });
    expect(d.interestPence).toBe(0);
    expect(d.capitalPence).toBe(75_000);
  });

  it("applies the same formula to a repayment loan", () => {
    const terms: LoanTerms = { kind: "repayment", annualRateBps: 500, scheduledPaymentPence: 100_000 };
    const d = derivePayment({ terms, openingBalancePence: 10_000_000, daysInPeriod: 30, paidPence: 100_000 });
    expect(d.computedInterestPence).toBe(41_096);
    expect(d.capitalPence).toBe(58_904);
  });

  it("applies the override to a repayment loan without touching the computed snapshot", () => {
    const terms: LoanTerms = { kind: "repayment", annualRateBps: 500, scheduledPaymentPence: 100_000 };
    const d = derivePayment({
      terms,
      openingBalancePence: 10_000_000,
      daysInPeriod: 30,
      paidPence: 100_000,
      actualInterestPence: 40_000,
    });
    expect(d.computedInterestPence).toBe(41_096);
    expect(d.interestPence).toBe(40_000);
  });
});
