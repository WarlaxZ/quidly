import "server-only";
import { prisma } from "../db";
import { recurringOccurrences, type RecurFrequency } from "../recurring/occurrences";
import type { Direction } from "../tax/types";

export interface RecurringInput {
  propertyId: string;
  categoryId: string;
  vendorId?: string | null;
  amountPence: number;
  direction: Direction;
  frequency: RecurFrequency;
  dayOfMonth: number;
  startDate: Date;
  endDate?: Date | null;
}
export function listRecurringRules(propertyId: string) {
  return prisma.recurringRule.findMany({
    where: { propertyId }, orderBy: { startDate: "asc" },
    include: { category: true, vendor: true },
  });
}
export function createRecurringRule(input: RecurringInput) {
  return prisma.recurringRule.create({ data: input });
}
export function deleteRecurringRule(id: string) {
  return prisma.recurringRule.delete({ where: { id } });
}
export async function materialiseDue(asOf: Date, propertyId?: string): Promise<number> {
  const rules = await prisma.recurringRule.findMany({
    where: propertyId ? { propertyId } : undefined,
  });
  let created = 0;
  for (const rule of rules) {
    const dates = recurringOccurrences(
      {
        frequency: rule.frequency as RecurFrequency,
        dayOfMonth: rule.dayOfMonth,
        startDate: rule.startDate,
        endDate: rule.endDate,
        lastGeneratedDate: rule.lastGeneratedDate,
      },
      asOf,
    );
    if (dates.length === 0) continue;
    const insertResult = await prisma.$transaction(async (tx) => {
      const r = await tx.transaction.createMany({
        data: dates.map((date) => ({
          propertyId: rule.propertyId,
          categoryId: rule.categoryId,
          vendorId: rule.vendorId,
          date,
          amountPence: rule.amountPence,
          direction: rule.direction,
          source: "recurring" as const,
          recurringId: rule.id,
          description: "Recurring",
        })),
      });
      await tx.recurringRule.update({
        where: { id: rule.id },
        data: { lastGeneratedDate: dates[dates.length - 1] },
      });
      return r;
    });
    created += insertResult.count;
  }
  return created;
}
