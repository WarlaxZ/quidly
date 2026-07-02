import "server-only";
import { prisma } from "../db";
import { taxYearRange } from "../tax/taxYear";

const USE_OF_HOME_CATEGORY = "Use of home";

/** The existing use-of-home claim for a (tax year, property), if any — for prefill + upsert. */
export async function getUseOfHomeClaim(taxYear: string, propertyId: string): Promise<{ id: string; amountPence: number } | null> {
  const { start, end } = taxYearRange(taxYear);
  return prisma.transaction.findFirst({
    where: { propertyId, date: { gte: start, lt: end }, category: { name: USE_OF_HOME_CATEGORY } },
    orderBy: { date: "desc" }, // deterministic if more than one somehow exists
    select: { id: true, amountPence: true },
  });
}
