import { beforeEach, describe, expect, it } from "vitest";
import { createLoan, listLoans, deleteLoan, generateLoanPayments, type LoanInput } from "./loans";
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
