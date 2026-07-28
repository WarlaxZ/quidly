import { beforeEach, describe, expect, it } from "vitest";
import {
  createLoan, listLoans, deleteLoan, generateLoanPayments,
  setActualInterest, reconcileYear, applyYearVariance, capitalNoReliefPence,
  type LoanInput,
} from "./loans";
import { getOrCreateDefaultProperty } from "./property";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";
import { INTEREST_CATEGORY_NAME, CAPITAL_CATEGORY_NAME } from "../loans/categories";

/** £71k interest-only at 2.7%, £750/month on the 1st, accruing from 1 Apr 2026. */
function interestOnly(overrides: Partial<LoanInput>): LoanInput {
  return {
    propertyId: "", name: "Test BTL", kind: "interestOnly",
    openingBalancePence: 7_100_000, annualRateBps: 270, scheduledPaymentPence: 75_000,
    intervalUnit: "MONTH", intervalCount: 1, dayOfWeek: null, dayOfMonth: 1, monthOfYear: null,
    startDate: new Date("2026-04-01"), termEndDate: null, ...overrides,
  };
}

async function ledgerFor(loanId: string) {
  return prisma.transaction.findMany({
    where: { loanPayment: { loanId } },
    include: { category: true },
    orderBy: [{ date: "asc" }, { amountPence: "asc" }],
  });
}

beforeEach(async () => { await resetDb(); });

describe("loans data layer", () => {
  it("creates and lists loans for a property", async () => {
    const property = await getOrCreateDefaultProperty();
    await createLoan(interestOnly({ propertyId: property.id }));
    expect(await listLoans(property.id)).toHaveLength(1);
  });

  it("writes one interest line and one capital line per payment", async () => {
    const property = await getOrCreateDefaultProperty();
    const loan = await createLoan(interestOnly({ propertyId: property.id }));
    expect(await generateLoanPayments(loan.id, new Date("2026-06-15"))).toBe(2); // 1 May, 1 Jun

    const txns = await ledgerFor(loan.id);
    expect(txns).toHaveLength(4);
    expect(txns.filter((t) => t.category.name === INTEREST_CATEGORY_NAME)).toHaveLength(2);
    expect(txns.filter((t) => t.category.name === CAPITAL_CATEGORY_NAME)).toHaveLength(2);
    expect(txns.every((t) => t.direction === "out")).toBe(true);

    // The whole point: interest is a fraction of the payment, capital is the rest.
    const first = txns.filter((t) => t.date.toISOString().startsWith("2026-05-01"));
    const interest = first.find((t) => t.category.kind === "finance")!;
    const capital = first.find((t) => t.category.kind === "capital")!;
    expect(interest.amountPence + capital.amountPence).toBe(75_000);
    expect(interest.amountPence).toBeLessThan(20_000);
    expect(capital.category.allowable).toBe(false);
  });

  it("is idempotent — re-running records nothing further", async () => {
    const property = await getOrCreateDefaultProperty();
    const loan = await createLoan(interestOnly({ propertyId: property.id }));
    expect(await generateLoanPayments(loan.id, new Date("2026-06-15"))).toBe(2);
    expect(await generateLoanPayments(loan.id, new Date("2026-06-15"))).toBe(0);
    expect(await ledgerFor(loan.id)).toHaveLength(4);
    expect(await generateLoanPayments(loan.id, new Date("2026-07-02"))).toBe(1);
  });

  it("carries the closing balance forward, unbroken, so the balance always falls", async () => {
    const property = await getOrCreateDefaultProperty();
    const loan = await createLoan(interestOnly({ propertyId: property.id }));
    await generateLoanPayments(loan.id, new Date("2026-07-15"));
    const payments = await prisma.loanPayment.findMany({ where: { loanId: loan.id }, orderBy: { date: "asc" } });
    expect(payments).toHaveLength(3); // 1 May, 1 Jun, 1 Jul

    // Chain integrity: each period opens exactly where the last one closed.
    expect(payments[1].openingBalancePence).toBe(payments[0].closingBalancePence);
    expect(payments[2].openingBalancePence).toBe(payments[1].closingBalancePence);

    // The balance falls every period. This holds unconditionally.
    expect(payments[1].closingBalancePence).toBeLessThan(payments[0].closingBalancePence);
    expect(payments[2].closingBalancePence).toBeLessThan(payments[1].closingBalancePence);

    // Interest is deliberately NOT asserted to fall month-over-month, because under daily
    // accrual it does not: a 31-day period adds ~3.3% of accrual, which outweighs the ~0.8%
    // the balance dropped, so 1 Jun (31 days) costs MORE than 1 May (30 days) —
    // £161.46 vs £157.56 on this loan. Interest only falls between periods of equal length.
    // 1 May and 1 Jul are both 30-day periods, so the falling balance shows through there.
    const may = payments[0], jul = payments[2];
    expect(jul.computedInterestPence).toBeLessThan(may.computedInterestPence);
    expect(may.computedInterestPence).toBe(15_756);   // 30 days on £71,000.00
    expect(payments[1].computedInterestPence).toBe(16_146); // 31 days on £70,407.56 — higher
    expect(jul.computedInterestPence).toBe(15_494);   // 30 days on £69,819.02
  });

  it("omits a zero-value capital line when the payment is pure interest", async () => {
    const property = await getOrCreateDefaultProperty();
    // First period is 1 Apr -> 1 May (30 days) on £71k at 2.7% = 15,756p. Pay exactly that.
    const loan = await createLoan(interestOnly({
      propertyId: property.id, scheduledPaymentPence: 15_756,
    }));
    expect(await generateLoanPayments(loan.id, new Date("2026-05-15"))).toBe(1);
    const txns = await ledgerFor(loan.id);
    expect(txns).toHaveLength(1);
    expect(txns[0].category.name).toBe(INTEREST_CATEGORY_NAME);
    const payment = await prisma.loanPayment.findFirstOrThrow({ where: { loanId: loan.id } });
    expect(payment.closingBalancePence).toBe(7_100_000);
  });

  it("stops and deactivates the loan on full redemption", async () => {
    const property = await getOrCreateDefaultProperty();
    const loan = await createLoan(interestOnly({
      propertyId: property.id, openingBalancePence: 50_000,
    }));
    expect(await generateLoanPayments(loan.id, new Date("2026-08-15"))).toBe(1);
    const refreshed = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(refreshed.active).toBe(false);
    const payment = await prisma.loanPayment.findFirstOrThrow({ where: { loanId: loan.id } });
    expect(payment.closingBalancePence).toBe(0);
  });

  it("does not generate for a paused loan", async () => {
    const property = await getOrCreateDefaultProperty();
    const loan = await createLoan(interestOnly({ propertyId: property.id }));
    await prisma.loan.update({ where: { id: loan.id }, data: { active: false } });
    expect(await generateLoanPayments(loan.id, new Date("2026-06-15"))).toBe(0);
  });

  it("refuses to delete a loan that has recorded payments", async () => {
    const property = await getOrCreateDefaultProperty();
    const loan = await createLoan(interestOnly({ propertyId: property.id }));
    await generateLoanPayments(loan.id, new Date("2026-06-15"));
    await expect(deleteLoan(loan.id)).rejects.toThrow(/recorded payment/);
    expect(await listLoans(property.id)).toHaveLength(1);
  });

  it("deletes a loan that has no payments", async () => {
    const property = await getOrCreateDefaultProperty();
    const loan = await createLoan(interestOnly({ propertyId: property.id }));
    await deleteLoan(loan.id);
    expect(await listLoans(property.id)).toHaveLength(0);
  });

  // Cross-check against the hand-rolled `yearOfSplitPayments()` helper in
  // sa105Regression.test.ts. That helper reimplements this balance-carry-forward loop in
  // memory, so without this test the two could drift — the regression suite would keep
  // passing against its own private copy of the sequencing while the real generator broke.
  it("produces the same annual interest as the in-memory regression model", async () => {
    const property = await getOrCreateDefaultProperty();
    const loan = await createLoan(interestOnly({
      propertyId: property.id, startDate: new Date("2026-04-01"),
    }));
    await generateLoanPayments(loan.id, new Date("2027-04-02"));

    const payments = await prisma.loanPayment.findMany({ where: { loanId: loan.id }, orderBy: { date: "asc" } });
    expect(payments).toHaveLength(12);
    const totalInterest = payments.reduce(
      (sum, p) => sum + (p.actualInterestPence ?? p.computedInterestPence), 0,
    );
    // £1,829.00 — the same figure the in-memory model produces for 365 days of accrual.
    expect(totalInterest).toBe(182_900);
  });
});

/** The standard fixture generated to three payments. Returns them date-ascending. */
async function threePayments() {
  const property = await getOrCreateDefaultProperty();
  const loan = await createLoan(interestOnly({ propertyId: property.id }));
  await generateLoanPayments(loan.id, new Date("2026-07-15"));
  const payments = await prisma.loanPayment.findMany({
    where: { loanId: loan.id }, orderBy: { date: "asc" },
  });
  return { loan, payments };
}

describe("reconcileYear", () => {
  it("totals the year's interest — the figure that reaches SA105 box 44", async () => {
    const { loan, payments } = await threePayments();
    const r = await reconcileYear(loan.id, "2026-27");
    expect(r.paymentCount).toBe(3);
    expect(r.recordedInterestPence).toBe(47_396);
    expect(r.lastPaymentId).toBe(payments[2].id);
  });

  it("prefers the actual figure over the computed one once overridden", async () => {
    const { loan, payments } = await threePayments();
    await setActualInterest(payments[2].id, 16_000);
    const r = await reconcileYear(loan.id, "2026-27");
    expect(r.recordedInterestPence).toBe(47_902); // 15,756 + 16,146 + 16,000
  });

  it("reports an empty year without throwing", async () => {
    const { loan } = await threePayments();
    const r = await reconcileYear(loan.id, "2025-26");
    expect(r).toEqual({ recordedInterestPence: 0, paymentCount: 0, lastPaymentId: null });
  });
});

describe("setActualInterest", () => {
  it("preserves the computed snapshot while changing the actual figure", async () => {
    const { payments } = await threePayments();
    await setActualInterest(payments[2].id, 16_000);
    const after = await prisma.loanPayment.findUniqueOrThrow({ where: { id: payments[2].id } });
    // The rate-derived snapshot is the audit trail and must survive the override.
    expect(after.computedInterestPence).toBe(15_494);
    expect(after.actualInterestPence).toBe(16_000);
    expect(after.closingBalancePence).toBe(6_922_902); // 6,981,902 − (75,000 − 16,000)
  });

  it("rewrites both ledger rows to match the new split", async () => {
    const { loan, payments } = await threePayments();
    await setActualInterest(payments[2].id, 16_000);
    const rows = await prisma.transaction.findMany({
      where: { loanPaymentId: payments[2].id }, include: { category: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.category.kind === "finance")!.amountPence).toBe(16_000);
    expect(rows.find((r) => r.category.kind === "capital")!.amountPence).toBe(59_000);
    // The other payments' rows are untouched — the delete must scope to one payment.
    const all = await prisma.transaction.findMany({ where: { loanPayment: { loanId: loan.id } } });
    expect(all).toHaveLength(6);
  });

  it("refuses an override larger than the payment", async () => {
    const { payments } = await threePayments();
    await expect(setActualInterest(payments[0].id, 80_000)).rejects.toThrow(/exceeds the payment/);
  });

  it("leaves later payments' opening balances stale — the documented limitation", async () => {
    const { payments } = await threePayments();
    await setActualInterest(payments[0].id, 10_000); // less interest ⇒ more capital repaid
    const jun = await prisma.loanPayment.findUniqueOrThrow({ where: { id: payments[1].id } });
    // Deliberately NOT recalculated. applyYearVariance targets the year's final payment
    // precisely so this staleness stays contained. Pinned so the limitation is explicit.
    expect(jun.openingBalancePence).toBe(7_040_756);
  });
});

describe("applyYearVariance", () => {
  it("makes the year's total match the lender's statement exactly", async () => {
    const { loan, payments } = await threePayments();
    await applyYearVariance(loan.id, "2026-27", 50_000);
    expect((await reconcileYear(loan.id, "2026-27")).recordedInterestPence).toBe(50_000);
    // The whole £26.04 delta landed on the final payment, not spread around.
    const jul = await prisma.loanPayment.findUniqueOrThrow({ where: { id: payments[2].id } });
    expect(jul.actualInterestPence).toBe(18_098); // 15,494 + 2,604
    const may = await prisma.loanPayment.findUniqueOrThrow({ where: { id: payments[0].id } });
    expect(may.actualInterestPence).toBeNull();
  });

  it("does nothing when the statement already agrees", async () => {
    const { loan, payments } = await threePayments();
    await applyYearVariance(loan.id, "2026-27", 47_396);
    const jul = await prisma.loanPayment.findUniqueOrThrow({ where: { id: payments[2].id } });
    expect(jul.actualInterestPence).toBeNull(); // no write at all
  });

  it("errors helpfully when the year has no payments", async () => {
    const { loan } = await threePayments();
    await expect(applyYearVariance(loan.id, "2025-26", 50_000)).rejects.toThrow(/no payments/i);
  });

  it("surfaces the guard when the variance exceeds a single payment", async () => {
    const { loan } = await threePayments();
    await expect(applyYearVariance(loan.id, "2026-27", 200_000)).rejects.toThrow(/exceeds the payment/);
  });
});

describe("capitalNoReliefPence", () => {
  it("sums the year's capital repayments — the money that got no relief", async () => {
    const { loan } = await threePayments();
    expect(await capitalNoReliefPence(loan.id, "2026-27")).toBe(177_604);
  });

  it("counts a 6 April payment in the new tax year only, never both", async () => {
    const property = await getOrCreateDefaultProperty();
    // First payment strictly after the 2027-03-06 origin is 2027-04-06 — the exact boundary.
    // The 2026-27 year ends 2027-04-06 exclusive, so this belongs to 2027-28 alone.
    const loan = await createLoan(interestOnly({
      propertyId: property.id, startDate: new Date("2027-03-06"), dayOfMonth: 6,
    }));
    await generateLoanPayments(loan.id, new Date("2027-04-10"));
    const payments = await prisma.loanPayment.findMany({ where: { loanId: loan.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].date.toISOString().slice(0, 10)).toBe("2027-04-06");

    expect(await capitalNoReliefPence(loan.id, "2026-27")).toBe(0);
    expect(await capitalNoReliefPence(loan.id, "2027-28")).toBeGreaterThan(0);
  });
});
