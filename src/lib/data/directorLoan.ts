import "server-only";
import { prisma } from "../db";
import { getCompany } from "./company";
import { companyAccountingPeriod } from "../tax/companyPeriod";
import { taxYearRange, getTaxYear } from "../tax/taxYear";
import { directorLoanBalance, s455Charge, beneficialLoanBenefit, type LedgerEntryLike, type BeneficialLoanResult } from "../tax/directorLoan";

export interface DirectorLoanSummary {
  balancePence: number;   // signed; positive = director owes the company (overdrawn)
  s455Pence: number;
  taxYear: string;        // the UK tax year containing the period end (the BIK basis)
  bik: BeneficialLoanResult;
}

export async function getDirectorLoanSummary(
  companyId: string,
  periodYear: number,
  interestPaidPence = 0,
): Promise<DirectorLoanSummary | null> {
  const company = await getCompany(companyId);
  if (!company) return null;
  const { end } = companyAccountingPeriod(company.accountingYearEndDay, company.accountingYearEndMonth, periodYear);

  const rows = await prisma.companyLedgerEntry.findMany({
    where: { companyId, kind: { in: ["director_loan_in", "director_loan_out"] } },
    select: { date: true, kind: true, amountPence: true },
  });
  const entries: LedgerEntryLike[] = rows.map((r) => ({ date: r.date, kind: r.kind, amountPence: r.amountPence }));

  const balancePence = directorLoanBalance(entries, end);
  const taxYear = getTaxYear(end);
  const s455Pence = s455Charge(balancePence, taxYear);

  const ty = taxYearRange(taxYear);
  // 1ms before the exclusive 6 April end → includes any entry dated 5 April regardless of time-of-day.
  const tyEnd = new Date(ty.end.getTime() - 1);
  const startBalancePence = directorLoanBalance(entries, ty.start);
  const endBalancePence = directorLoanBalance(entries, tyEnd);
  const interestPaid = Math.max(0, interestPaidPence);
  const bik = beneficialLoanBenefit({ startBalancePence, endBalancePence, interestPaidPence: interestPaid, year: taxYear });

  return { balancePence, s455Pence, taxYear, bik };
}
