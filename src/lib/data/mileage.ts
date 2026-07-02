import "server-only";
import { prisma } from "../db";
import { taxYearRange } from "../tax/taxYear";

const TRAVEL_CATEGORY = "Travel & mileage";

/** Business miles already logged (Travel & mileage transactions) across personally-owned
 *  properties in the tax year — drives the 10,000-mile rate band. */
export async function cumulativeMilesForTaxYear(taxYear: string): Promise<number> {
  const { start, end } = taxYearRange(taxYear);
  const rows = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lt: end },
      property: { ownershipType: "personal" },
      category: { name: TRAVEL_CATEGORY },
      miles: { not: null },
    },
    select: { miles: true },
  });
  return rows.reduce((sum, r) => sum + (r.miles ?? 0), 0);
}

export interface MileageTripRow {
  id: string;
  date: Date;
  description: string | null;
  miles: number;
  amountPence: number;
}

/** This tax year's Travel & mileage trips across personally-owned properties, newest first. */
export async function listMileageTrips(taxYear: string): Promise<MileageTripRow[]> {
  const { start, end } = taxYearRange(taxYear);
  const rows = await prisma.transaction.findMany({
    where: { date: { gte: start, lt: end }, property: { ownershipType: "personal" }, category: { name: TRAVEL_CATEGORY } },
    orderBy: { date: "desc" },
    select: { id: true, date: true, description: true, miles: true, amountPence: true },
  });
  return rows.map((r) => ({ id: r.id, date: r.date, description: r.description, miles: r.miles ?? 0, amountPence: r.amountPence }));
}
