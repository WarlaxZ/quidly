import "server-only";
import { prisma } from "../db";
import { taxYearRange } from "../tax/taxYear";
import { getOrCreateProfile } from "./taxProfile";
import { toTaxTxn } from "../tax/fromPrisma";
import { buildTaxYearSummary, type TaxYearSummary } from "../tax/summary";
import { computeProfit } from "../tax/profit";
import type { Region } from "../tax/types";

export async function getPersonalTaxYearSummary(
  taxYear: string,
): Promise<{ summary: TaxYearSummary; otherIncomePence: number; region: Region; usePropertyAllowance: boolean }> {
  const { start, end } = taxYearRange(taxYear);
  const [rows, profile] = await Promise.all([
    prisma.transaction.findMany({
      where: { date: { gte: start, lt: end }, property: { ownershipType: "personal" } },
      include: { category: true },
    }),
    getOrCreateProfile(taxYear),
  ]);
  const summary = buildTaxYearSummary(rows.map((r) => toTaxTxn(r)), {
    taxYear,
    otherIncomePence: profile.otherIncomePence,
    region: profile.region as Region,
    usePropertyAllowance: profile.usePropertyAllowance,
  });
  return { summary, otherIncomePence: profile.otherIncomePence, region: profile.region as Region, usePropertyAllowance: profile.usePropertyAllowance };
}

/** Per-property gross figures for a management breakdown. `profitPence` is GROSS profit
 *  (income − expenses, BEFORE the £1,000 property allowance and finance-cost relief, which
 *  apply once at the person level — see getPersonalTaxYearSummary.taxableProfitPence). */
export interface PropertyBreakdownRow {
  propertyId: string;
  propertyName: string;
  incomePence: number;
  expensesPence: number;
  profitPence: number;
}

export async function getPerPropertyBreakdown(taxYear: string): Promise<PropertyBreakdownRow[]> {
  const { start, end } = taxYearRange(taxYear);
  const properties = await prisma.property.findMany({ where: { ownershipType: "personal" }, orderBy: { createdAt: "asc" } });
  const out: PropertyBreakdownRow[] = [];
  // N+1 query is acceptable here: a landlord has O(1-10) properties.
  for (const p of properties) {
    const rows = await prisma.transaction.findMany({ where: { propertyId: p.id, date: { gte: start, lt: end } }, include: { category: true } });
    const { incomePence, expensesPence, profitPence } = computeProfit(rows.map((r) => toTaxTxn(r)));
    out.push({ propertyId: p.id, propertyName: p.name, incomePence, expensesPence, profitPence });
  }
  return out;
}
