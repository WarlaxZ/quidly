import type { Direction } from "../tax/types";

const DAY_TOLERANCE = 5;
const MIN_AMOUNT_TOLERANCE_PENCE = 500;
const AMOUNT_TOLERANCE_FRACTION = 0.02;

export interface LoanCandidate {
  loanId: string;
  name: string;
  scheduledPaymentPence: number;
  /** Scheduled dates with no LoanPayment recorded yet. */
  scheduledDates: Date[];
}

export interface LoanMatch {
  loanId: string;
  name: string;
  /** The date on the imported row, not the scheduled date. */
  date: Date;
  /** The imported row's actual amount — voluntary overpayments must carry through. */
  paidPence: number;
}

function amountTolerance(scheduledPaymentPence: number): number {
  return Math.max(MIN_AMOUNT_TOLERANCE_PENCE, scheduledPaymentPence * AMOUNT_TOLERANCE_FRACTION);
}

function withinDays(a: Date, b: Date, days: number): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= days * 86_400_000;
}

/**
 * Suggest a loan for an imported bank debit. Never applies the split automatically —
 * a mis-split lands silently in SA105 box 44, which is the error this whole feature exists
 * to prevent.
 */
export function matchLoanPayment(
  row: { date: Date; amountPence: number; direction: Direction },
  candidates: LoanCandidate[],
): LoanMatch | null {
  if (row.direction !== "out") return null;

  for (const loan of candidates) {
    const closeEnough =
      Math.abs(row.amountPence - loan.scheduledPaymentPence) <= amountTolerance(loan.scheduledPaymentPence);
    if (!closeEnough) continue;
    if (!loan.scheduledDates.some((d) => withinDays(row.date, d, DAY_TOLERANCE))) continue;
    return { loanId: loan.loanId, name: loan.name, date: row.date, paidPence: row.amountPence };
  }
  return null;
}
