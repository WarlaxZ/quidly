import "server-only";
import { prisma } from "../db";
import { recurringOccurrences, type IntervalUnit, type OccurrenceRule } from "../recurring/occurrences";
import { derivePayment, daysBetween, type LoanTerms } from "../loans/schedule";
import type { LoanKind } from "../tax/types";
import { INTEREST_CATEGORY_NAME, CAPITAL_CATEGORY_NAME } from "../loans/categories";
import { taxYearRange } from "../tax/taxYear";

export interface LoanInput {
  propertyId: string;
  name: string;
  kind: LoanKind;
  openingBalancePence: number;
  annualRateBps: number;
  scheduledPaymentPence: number;
  intervalUnit: IntervalUnit;
  intervalCount: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  monthOfYear?: number | null;
  startDate: Date;
  termEndDate?: Date | null;
}

export function listLoans(propertyId: string | null) {
  return prisma.loan.findMany({
    where: propertyId ? { propertyId } : {},
    orderBy: [{ active: "desc" }, { startDate: "asc" }],
    include: { property: true },
  });
}

export function getLoan(id: string) {
  return prisma.loan.findUnique({
    where: { id },
    include: {
      property: true,
      payments: { orderBy: { date: "asc" } },
    },
  });
}

export function createLoan(input: LoanInput) {
  return prisma.loan.create({ data: input });
}

export function updateLoan(id: string, input: LoanInput) {
  return prisma.loan.update({ where: { id }, data: input });
}

export function setLoanActive(id: string, active: boolean) {
  return prisma.loan.update({ where: { id }, data: { active } });
}

/** Refuses while payments exist, so generated transactions are never orphaned. */
export async function deleteLoan(id: string): Promise<void> {
  const count = await prisma.loanPayment.count({ where: { loanId: id } });
  if (count > 0) {
    throw new Error(
      `This loan has ${count} recorded payment(s). Delete those first, or pause the loan instead.`,
    );
  }
  await prisma.loan.delete({ where: { id } });
}

function toLoanOccurrenceRule(loan: {
  intervalUnit: string; intervalCount: number;
  dayOfWeek: number | null; dayOfMonth: number | null; monthOfYear: number | null;
  startDate: Date; termEndDate: Date | null; lastGeneratedDate: Date | null;
}): OccurrenceRule {
  return {
    intervalUnit: loan.intervalUnit as IntervalUnit,
    intervalCount: loan.intervalCount,
    dayOfWeek: loan.dayOfWeek,
    dayOfMonth: loan.dayOfMonth,
    monthOfYear: loan.monthOfYear,
    startDate: loan.startDate,
    endDate: loan.termEndDate,
    // A loan's startDate is the accrual ORIGIN, not a payment date: openingBalancePence is
    // defined as the balance *as at* that date. recurringOccurrences() emits startDate itself
    // when the schedule's day matches it (correct for a RecurringRule, where a rent rule
    // starting on the 1st should pay on the 1st) — but for a loan that yields a phantom
    // payment with zero elapsed days, zero interest and the whole amount as capital.
    // Seeding lastGeneratedDate with startDate reuses that function's existing
    // "skip anything on or before" rule to mean "first payment strictly after the origin".
    lastGeneratedDate: loan.lastGeneratedDate ?? loan.startDate,
  };
}

function termsOf(loan: { kind: string; annualRateBps: number; scheduledPaymentPence: number }): LoanTerms {
  return {
    kind: loan.kind as LoanKind,
    annualRateBps: loan.annualRateBps,
    scheduledPaymentPence: loan.scheduledPaymentPence,
  };
}

async function loanCategoryIds(): Promise<{ interestId: string; capitalId: string }> {
  const [interest, capital] = await Promise.all([
    prisma.category.findUnique({ where: { name: INTEREST_CATEGORY_NAME } }),
    prisma.category.findUnique({ where: { name: CAPITAL_CATEGORY_NAME } }),
  ]);
  if (!interest || !capital) {
    throw new Error("Loan categories are missing. Run `npx prisma db seed`.");
  }
  return { interestId: interest.id, capitalId: capital.id };
}

/**
 * Generate LoanPayments and their transaction pairs up to `asOf`.
 *
 * Idempotent: `lastGeneratedDate` advances past each emitted date and
 * `@@unique([loanId, date])` is the backstop, exactly as recurring rules work.
 *
 * Interest accrues from the previous payment date, or from `startDate` for the first
 * payment. The first payment is the first scheduled date strictly *after* `startDate`, so
 * it always has a non-zero accrual period — see `toLoanOccurrenceRule` for why.
 */
export async function generateLoanPayments(loanId: string, asOf: Date): Promise<number> {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });
  if (!loan || !loan.active) return 0;

  const dates = recurringOccurrences(toLoanOccurrenceRule(loan), asOf);
  if (dates.length === 0) return 0;

  const { interestId, capitalId } = await loanCategoryIds();
  const last = await prisma.loanPayment.findFirst({
    where: { loanId },
    orderBy: { date: "desc" },
  });

  let balance = last?.closingBalancePence ?? loan.openingBalancePence;
  let boundary = last?.date ?? loan.startDate;
  let created = 0;

  for (const date of dates) {
    if (balance <= 0) break;
    const d = derivePayment({
      terms: termsOf(loan),
      openingBalancePence: balance,
      daysInPeriod: daysBetween(boundary, date),
      paidPence: loan.scheduledPaymentPence,
    });

    await prisma.$transaction(async (tx) => {
      const payment = await tx.loanPayment.create({
        data: {
          loanId,
          date,
          openingBalancePence: d.openingBalancePence,
          computedInterestPence: d.computedInterestPence,
          paidPence: loan.scheduledPaymentPence,
          closingBalancePence: d.closingBalancePence,
        },
      });
      await tx.transaction.createMany({
        data: buildPaymentTransactions(loan, payment.id, date, d.interestPence, d.capitalPence, interestId, capitalId),
      });
      await tx.loan.update({
        where: { id: loanId },
        data: { lastGeneratedDate: date, ...(d.fullyRedeemed ? { active: false } : {}) },
      });
    });

    balance = d.closingBalancePence;
    boundary = date;
    created++;
    if (d.fullyRedeemed) break;
  }

  return created;
}

/** The one or two ledger rows for a payment. Zero-value lines are omitted. */
function buildPaymentTransactions(
  loan: { propertyId: string; name: string },
  loanPaymentId: string,
  date: Date,
  interestPence: number,
  capitalPence: number,
  interestId: string,
  capitalId: string,
) {
  const rows: {
    propertyId: string; categoryId: string; date: Date; amountPence: number;
    direction: "out"; source: "recurring"; loanPaymentId: string; description: string;
  }[] = [];
  if (interestPence > 0) {
    rows.push({
      propertyId: loan.propertyId, categoryId: interestId, date, amountPence: interestPence,
      direction: "out", source: "recurring", loanPaymentId, description: `${loan.name} — interest`,
    });
  }
  if (capitalPence > 0) {
    rows.push({
      propertyId: loan.propertyId, categoryId: capitalId, date, amountPence: capitalPence,
      direction: "out", source: "recurring", loanPaymentId, description: `${loan.name} — capital repayment`,
    });
  }
  return rows;
}

/**
 * Replace one payment's interest with the lender's actual figure, rewriting both ledger
 * rows to match.
 *
 * Known limitation: later payments' opening balances are NOT recalculated, so overriding a
 * mid-year payment leaves subsequent balances slightly stale. `applyYearVariance` targets
 * the final payment of the year precisely to keep that contained.
 */
export async function setActualInterest(paymentId: string, actualInterestPence: number): Promise<void> {
  const payment = await prisma.loanPayment.findUnique({
    where: { id: paymentId },
    include: { loan: true },
  });
  if (!payment) throw new Error("That payment could not be found.");

  const d = derivePayment({
    terms: termsOf(payment.loan),
    openingBalancePence: payment.openingBalancePence,
    daysInPeriod: 0, // irrelevant: the override supplies the interest
    paidPence: payment.paidPence,
    actualInterestPence,
  });

  const { interestId, capitalId } = await loanCategoryIds();

  await prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { loanPaymentId: paymentId } });
    await tx.transaction.createMany({
      data: buildPaymentTransactions(
        payment.loan, paymentId, payment.date,
        d.interestPence, d.capitalPence, interestId, capitalId,
      ),
    });
    await tx.loanPayment.update({
      where: { id: paymentId },
      data: { actualInterestPence, closingBalancePence: d.closingBalancePence },
    });
  });
}

export interface YearReconcile {
  recordedInterestPence: number;
  paymentCount: number;
  lastPaymentId: string | null;
}

/** Total interest recorded for a tax year — the figure that reaches SA105 box 44. */
export async function reconcileYear(loanId: string, taxYear: string): Promise<YearReconcile> {
  const { start, end } = taxYearRange(taxYear);
  const payments = await prisma.loanPayment.findMany({
    where: { loanId, date: { gte: start, lt: end } },
    orderBy: { date: "asc" },
  });
  return {
    recordedInterestPence: payments.reduce(
      (sum, p) => sum + (p.actualInterestPence ?? p.computedInterestPence),
      0,
    ),
    paymentCount: payments.length,
    lastPaymentId: payments.at(-1)?.id ?? null,
  };
}

/**
 * Make the year's recorded interest match the lender's annual statement exactly, by
 * adjusting the final payment of the year. Box 44 then sits on the lender's number —
 * the figure HMRC would check against.
 */
export async function applyYearVariance(
  loanId: string,
  taxYear: string,
  statementInterestPence: number,
): Promise<void> {
  const { recordedInterestPence, lastPaymentId } = await reconcileYear(loanId, taxYear);
  if (!lastPaymentId) throw new Error("No payments are recorded for that tax year.");
  const delta = statementInterestPence - recordedInterestPence;
  if (delta === 0) return;

  const last = await prisma.loanPayment.findUnique({ where: { id: lastPaymentId } });
  if (!last) throw new Error("That payment could not be found.");
  const current = last.actualInterestPence ?? last.computedInterestPence;
  // derivePayment throws if this pushes interest above the payment — surfaced to the user.
  await setActualInterest(lastPaymentId, current + delta);
}

/** This tax year's capital repayments for a loan — money that attracted no relief. */
export async function capitalNoReliefPence(loanId: string, taxYear: string): Promise<number> {
  const { start, end } = taxYearRange(taxYear);
  const rows = await prisma.transaction.findMany({
    where: {
      loanPayment: { loanId },
      date: { gte: start, lt: end },
      category: { name: CAPITAL_CATEGORY_NAME },
    },
    select: { amountPence: true },
  });
  return rows.reduce((sum, r) => sum + r.amountPence, 0);
}
