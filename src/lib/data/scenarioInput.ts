import "server-only";
import { prisma } from "../db";
import { taxYearRange } from "../tax/taxYear";
import { getOrCreateProfile } from "./taxProfile";
import { toTaxTxn } from "../tax/fromPrisma";
import type { ScenarioInput } from "../tax/scenario";
import type { Region } from "../tax/types";

/**
 * Pre-fills the what-if planner's ScenarioInput from real transactions.
 * `basis` is "all" (all personal properties) or a single propertyId. Results are ALWAYS
 * restricted to personal-ownership properties, so passing a company-owned property id (or an
 * id with no personal transactions in the year) returns zeroed income/expense/finance —
 * company property data belongs to the company accounts, not the personal planner.
 */
export async function getScenarioInput(opts: { taxYear: string; basis: "all" | string }): Promise<ScenarioInput> {
  const { taxYear, basis } = opts;
  const { start, end } = taxYearRange(taxYear);

  // Always restrict to personal properties; a company-owned property passed as the basis
  // therefore contributes nothing (its data belongs to the company accounts).
  const where =
    basis === "all"
      ? { date: { gte: start, lt: end }, property: { ownershipType: "personal" as const } }
      : { date: { gte: start, lt: end }, propertyId: basis, property: { ownershipType: "personal" as const } };

  const [rows, profile] = await Promise.all([
    prisma.transaction.findMany({ where, include: { category: true } }),
    getOrCreateProfile(taxYear),
  ]);

  let incomePence = 0;
  let expensesPence = 0;
  let financeCostsPence = 0;
  for (const r of rows) {
    const t = toTaxTxn(r);
    if (!t.allowable) continue;
    if (t.categoryKind === "income") incomePence += t.amountPence;
    else if (t.categoryKind === "expense") expensesPence += t.amountPence;
    else if (t.categoryKind === "finance") financeCostsPence += t.amountPence;
  }

  return {
    incomePence,
    expensesPence,
    financeCostsPence,
    otherIncomePence: profile.otherIncomePence,
    taxYear,
    region: profile.region as Region,
  };
}
