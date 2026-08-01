import "server-only";
import { prisma } from "../db";
import type { IntervalUnit } from "../recurring/occurrences";
import type { LoanKind } from "../tax/types";

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
