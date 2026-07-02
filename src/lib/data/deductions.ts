import "server-only";
import { prisma } from "../db";
import { taxYearRange } from "../tax/taxYear";
import { DEDUCTION_CATALOG, type DeductionTxn } from "../deductions/catalog";
import { assessDeductions, type DeductionStatus } from "../deductions/assess";

/** Detection over personally-owned properties' transactions for the tax year. */
export async function getDeductionStatuses(taxYear: string): Promise<DeductionStatus[]> {
  const { start, end } = taxYearRange(taxYear);
  const [rows, dismissals] = await Promise.all([
    prisma.transaction.findMany({
      where: { date: { gte: start, lt: end }, property: { ownershipType: "personal" } },
      include: { category: true },
    }),
    prisma.deductionDismissal.findMany({ where: { taxYear } }),
  ]);
  const txns: DeductionTxn[] = rows.map((r) => ({ categoryName: r.category.name, description: r.description }));
  const dismissedKeys = new Set(dismissals.map((d) => d.itemKey));
  return assessDeductions(DEDUCTION_CATALOG, txns, dismissedKeys);
}

export async function addDismissal(taxYear: string, itemKey: string): Promise<void> {
  await prisma.deductionDismissal.upsert({
    where: { taxYear_itemKey: { taxYear, itemKey } },
    update: {},
    create: { taxYear, itemKey },
  });
}

export async function removeDismissal(taxYear: string, itemKey: string): Promise<void> {
  await prisma.deductionDismissal.deleteMany({ where: { taxYear, itemKey } });
}

/** Personal properties for the quick-add property picker. */
export function listPersonalProperties() {
  return prisma.property.findMany({
    where: { ownershipType: "personal" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, roundTripMiles: true },
  });
}
