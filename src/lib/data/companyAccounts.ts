import "server-only";
import { prisma } from "../db";
import { getCompany } from "./company";
import { companyAccountingPeriod } from "../tax/companyPeriod";
import { toTaxTxn } from "../tax/fromPrisma";
import { companyTaxableProfit, corporationTax } from "../tax/corporationTax";
import { getTaxYear, isConfiguredTaxYear } from "../tax/taxYear";

export interface CompanyAccounts {
  company: { id: string; name: string };
  period: { start: Date; end: Date };
  incomePence: number;
  expensesPence: number;
  profitBeforeTaxPence: number;
  corporationTaxPence: number;
  profitAfterTaxPence: number;
  band: "small" | "marginal" | "main";
  effectiveRate: number;
  ctYear: string;
  ctYearConfigured: boolean;
}

export async function getCompanyAccounts(companyId: string, periodYear: number): Promise<CompanyAccounts | null> {
  const company = await getCompany(companyId);
  if (!company) return null;
  const period = companyAccountingPeriod(company.accountingYearEndDay, company.accountingYearEndMonth, periodYear);
  const rows = await prisma.transaction.findMany({
    where: { property: { companyId }, date: { gte: period.start, lte: period.end } },
    include: { category: true },
  });
  const { incomePence, expensesPence, profitPence } = companyTaxableProfit(rows.map((r) => toTaxTxn(r)));
  // The CT financial year for this period (6-Apr vs 1-Apr boundary is immaterial for rate selection).
  const ctYear = getTaxYear(period.end);
  const ct = corporationTax(profitPence, ctYear);
  return {
    company: { id: company.id, name: company.name },
    period,
    incomePence,
    expensesPence,
    profitBeforeTaxPence: profitPence,
    corporationTaxPence: ct.taxPence,
    profitAfterTaxPence: profitPence - ct.taxPence,
    band: ct.band,
    effectiveRate: ct.effectiveRate,
    ctYear,
    ctYearConfigured: isConfiguredTaxYear(ctYear),
  };
}
