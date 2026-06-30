import "server-only";
import { prisma } from "../db";
import { getCompany } from "./company";
import { getCompanyAccounts } from "./companyAccounts";
import { getOrCreateProfile } from "./taxProfile";
import { companyAccountingPeriod, companyPeriodYearOf } from "../tax/companyPeriod";
import { getTaxYear } from "../tax/taxYear";
import { dividendTaxForYears, type DividendYearInput } from "../tax/dividendTaxByYear";

export interface CompanyReserves {
  periodProfitAfterTaxPence: number;
  periodDividendsPence: number;
  cumulativeProfitAfterTaxPence: number;
  cumulativeDividendsPence: number;
  retainedEarningsPence: number;
  unlawful: boolean;
}

export async function getCompanyReserves(companyId: string, periodYear: number): Promise<CompanyReserves | null> {
  const company = await getCompany(companyId);
  if (!company) return null;
  const { start, end } = companyAccountingPeriod(company.accountingYearEndDay, company.accountingYearEndMonth, periodYear);

  const [firstTxn, firstDiv, dividendsToEnd, periodDividendAgg] = await Promise.all([
    prisma.transaction.findFirst({ where: { property: { companyId } }, orderBy: { date: "asc" }, select: { date: true } }),
    prisma.companyLedgerEntry.findFirst({ where: { companyId, kind: "dividend" }, orderBy: { date: "asc" }, select: { date: true } }),
    // Cumulative dividends are summed up to the selected period end (not all-time).
    prisma.companyLedgerEntry.aggregate({ where: { companyId, kind: "dividend", date: { lte: end } }, _sum: { amountPence: true } }),
    prisma.companyLedgerEntry.aggregate({ where: { companyId, kind: "dividend", date: { gte: start, lte: end } }, _sum: { amountPence: true } }),
  ]);

  const cumulativeDividendsPence = dividendsToEnd._sum.amountPence ?? 0;
  const periodDividendsPence = periodDividendAgg._sum.amountPence ?? 0;

  const earliestTimes = [firstTxn?.date.getTime(), firstDiv?.date.getTime()].filter((t): t is number => t !== undefined);
  // No transactions and no dividends → no reserves. (If firstDiv is null there are no dividend rows, so cumulativeDividendsPence is 0 here.)
  if (earliestTimes.length === 0) {
    return {
      periodProfitAfterTaxPence: 0, periodDividendsPence, cumulativeProfitAfterTaxPence: 0,
      cumulativeDividendsPence, retainedEarningsPence: -(cumulativeDividendsPence) || 0, unlawful: cumulativeDividendsPence > 0,
    };
  }

  const earliest = new Date(Math.min(...earliestTimes));
  const firstYear = companyPeriodYearOf(earliest, company.accountingYearEndDay, company.accountingYearEndMonth);

  let cumulativeProfitAfterTaxPence = 0;
  let periodProfitAfterTaxPence = 0;
  // O(periods) sequential getCompanyAccounts calls — fine for the 1–5 periods of a single-property company.
  // CT is per-period, so each year's after-tax profit must be computed independently (not on aggregate profit).
  for (let y = firstYear; y <= periodYear; y++) {
    const acc = await getCompanyAccounts(companyId, y);
    const afterTax = acc?.profitAfterTaxPence ?? 0;
    cumulativeProfitAfterTaxPence += afterTax;
    if (y === periodYear) periodProfitAfterTaxPence = afterTax;
  }

  return {
    periodProfitAfterTaxPence,
    periodDividendsPence,
    cumulativeProfitAfterTaxPence,
    cumulativeDividendsPence,
    retainedEarningsPence: cumulativeProfitAfterTaxPence - cumulativeDividendsPence,
    unlawful: cumulativeDividendsPence > cumulativeProfitAfterTaxPence,
  };
}

export interface CompanyDividendTaxRow { taxYear: string; dividendPence: number; taxPence: number; }

export async function getCompanyDividendTax(companyId: string): Promise<CompanyDividendTaxRow[]> {
  const dividends = await prisma.companyLedgerEntry.findMany({
    where: { companyId, kind: "dividend" },
    orderBy: { date: "asc" },
    select: { date: true, amountPence: true },
  });
  const byYear = new Map<string, number>();
  for (const d of dividends) {
    const ty = getTaxYear(d.date);
    byYear.set(ty, (byYear.get(ty) ?? 0) + d.amountPence);
  }
  const inputs: DividendYearInput[] = [];
  for (const [taxYear, dividendPence] of byYear) {
    const profile = await getOrCreateProfile(taxYear);
    inputs.push({ taxYear, dividendPence, otherIncomePence: profile.otherIncomePence });
  }
  return dividendTaxForYears(inputs);
}
