import type { MappedRow } from "./bankImport";
import { isDuplicate } from "./bankImport";
import { matchLoanPayment, type LoanCandidate } from "./loanMatch";

/**
 * Decide which mapped CSV rows should actually be created as transactions.
 *
 * Always skips duplicates of existing transactions. Rows that look like a payment on
 * one of the property's loans are skipped by default — importing them as a single line
 * would silently treat the whole payment as deductible (the exact mistake this feature
 * exists to prevent) — unless the caller explicitly opts in via `includeLoanMatches`.
 */
export function selectRowsToImport(
  rows: MappedRow[],
  existing: { date: Date; amountPence: number; description: string | null }[],
  candidates: LoanCandidate[],
  includeLoanMatches: boolean,
): MappedRow[] {
  return rows.filter((row) => {
    if (isDuplicate(row, existing)) return false;
    if (!includeLoanMatches && matchLoanPayment(row, candidates)) return false;
    return true;
  });
}
