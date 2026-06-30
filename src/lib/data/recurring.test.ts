import { beforeEach, describe, expect, it } from "vitest";
import { createRecurringRule, listRecurringRules, deleteRecurringRule, materialiseDue } from "./recurring";
import { getOrCreateDefaultProperty } from "./property";
import { listTransactions } from "./transactions";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function rentCategoryId() {
  const c = await prisma.category.findFirstOrThrow({ where: { name: "Rent received" } });
  return c.id;
}
beforeEach(async () => { await resetDb(); });

describe("recurring data layer", () => {
  it("creates and lists rules", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    await createRecurringRule({
      propertyId: property.id, categoryId, amountPence: 95000, direction: "in",
      frequency: "monthly", dayOfMonth: 1, startDate: new Date("2025-01-01"), endDate: null,
    });
    expect(await listRecurringRules(property.id)).toHaveLength(1);
  });
  it("materialises due occurrences as transactions, idempotently", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const rule = await createRecurringRule({
      propertyId: property.id, categoryId, amountPence: 95000, direction: "in",
      frequency: "monthly", dayOfMonth: 1, startDate: new Date("2025-01-01"), endDate: null,
    });
    const created = await materialiseDue(new Date("2025-03-15"));
    expect(created).toBe(3);
    expect(await listTransactions(property.id)).toHaveLength(3);
    const again = await materialiseDue(new Date("2025-03-15"));
    expect(again).toBe(0);
    expect(await listTransactions(property.id)).toHaveLength(3);
    const more = await materialiseDue(new Date("2025-04-02"));
    expect(more).toBe(1);
    expect(await listTransactions(property.id)).toHaveLength(4);
    const refreshed = await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(refreshed.lastGeneratedDate?.toISOString().slice(0, 10)).toBe("2025-04-01");
  });
  it("only materialises rules for the given property when propertyId is passed", async () => {
    const p1 = await getOrCreateDefaultProperty();
    const p2 = await prisma.property.create({ data: { name: "Second" } });
    const categoryId = await rentCategoryId();
    await createRecurringRule({
      propertyId: p1.id, categoryId, amountPence: 1000, direction: "in",
      frequency: "monthly", dayOfMonth: 1, startDate: new Date("2025-01-01"), endDate: null,
    });
    await createRecurringRule({
      propertyId: p2.id, categoryId, amountPence: 2000, direction: "in",
      frequency: "monthly", dayOfMonth: 1, startDate: new Date("2025-01-01"), endDate: null,
    });
    const created = await materialiseDue(new Date("2025-02-15"), p1.id);
    expect(created).toBe(2); // only p1's two occurrences, NOT p2's
    expect(await listTransactions(p2.id)).toHaveLength(0); // p2 untouched
  });
  it("deletes a rule", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const r = await createRecurringRule({
      propertyId: property.id, categoryId, amountPence: 100, direction: "out",
      frequency: "annual", dayOfMonth: 10, startDate: new Date("2025-05-10"), endDate: null,
    });
    await deleteRecurringRule(r.id);
    expect(await listRecurringRules(property.id)).toHaveLength(0);
  });
});
