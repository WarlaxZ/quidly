import "server-only";
import { prisma } from "../db";
import { recurringOccurrences, type IntervalUnit, type OccurrenceRule } from "../recurring/occurrences";
import type { Direction } from "../tax/types";

export interface RecurringInput {
  propertyId: string;
  categoryId: string;
  vendorId?: string | null;
  description?: string | null;
  amountPence: number;
  direction: Direction;
  intervalUnit: IntervalUnit;
  intervalCount: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  monthOfYear?: number | null;
  startDate: Date;
  endDate?: Date | null;
}

export function listRecurringRules(propertyId: string | null) {
  return prisma.recurringRule.findMany({
    where: propertyId ? { propertyId } : {},
    orderBy: [{ active: "desc" }, { startDate: "asc" }],
    include: { category: true, vendor: true, property: true },
  });
}

export function getRecurringRule(id: string) {
  return prisma.recurringRule.findUnique({
    where: { id },
    include: { category: true, vendor: true, property: true },
  });
}

export function createRecurringRule(input: RecurringInput) {
  return prisma.recurringRule.create({ data: input });
}

export function updateRecurringRule(id: string, input: RecurringInput) {
  return prisma.recurringRule.update({ where: { id }, data: input });
}

export function setRecurringActive(id: string, active: boolean) {
  return prisma.recurringRule.update({ where: { id }, data: { active } });
}

export function deleteRecurringRule(id: string) {
  return prisma.recurringRule.delete({ where: { id } });
}

function toOccurrenceRule(rule: {
  intervalUnit: string;
  intervalCount: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  startDate: Date;
  endDate: Date | null;
  lastGeneratedDate: Date | null;
}): OccurrenceRule {
  return {
    intervalUnit: rule.intervalUnit as IntervalUnit,
    intervalCount: rule.intervalCount,
    dayOfWeek: rule.dayOfWeek,
    dayOfMonth: rule.dayOfMonth,
    monthOfYear: rule.monthOfYear,
    startDate: rule.startDate,
    endDate: rule.endDate,
    lastGeneratedDate: rule.lastGeneratedDate,
  };
}

export async function materialiseDue(asOf: Date, propertyId?: string): Promise<number> {
  const rules = await prisma.recurringRule.findMany({
    where: { active: true, ...(propertyId ? { propertyId } : {}) },
  });
  let created = 0;
  for (const rule of rules) {
    const dates = recurringOccurrences(toOccurrenceRule(rule), asOf);
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
          description: rule.description ?? "Recurring",
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
