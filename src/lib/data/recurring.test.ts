import { beforeEach, describe, expect, it } from "vitest";
import {
  createRecurringRule, listRecurringRules, deleteRecurringRule,
  updateRecurringRule, setRecurringActive, materialiseDue, type RecurringInput,
} from "./recurring";
import { getOrCreateDefaultProperty } from "./property";
import { listTransactions } from "./transactions";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function rentCategoryId() {
  const c = await prisma.category.findFirstOrThrow({ where: { name: "Rent received" } });
  return c.id;
}

function monthly(overrides: Partial<RecurringInput>): RecurringInput {
  return {
    propertyId: "", categoryId: "", amountPence: 95000, direction: "in",
    intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1,
    startDate: new Date("2025-01-01"), endDate: null, ...overrides,
  };
}

beforeEach(async () => { await resetDb(); });

describe("recurring data layer", () => {
  it("creates and lists rules", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    await createRecurringRule(monthly({ propertyId: property.id, categoryId }));
    expect(await listRecurringRules(property.id)).toHaveLength(1);
  });

  it("materialises due occurrences as transactions, idempotently, using the rule description", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const rule = await createRecurringRule(monthly({ propertyId: property.id, categoryId, description: "Rent — Flat 2" }));
    expect(await materialiseDue(new Date("2025-03-15"))).toBe(3);
    const txns = await listTransactions(property.id);
    expect(txns).toHaveLength(3);
    expect(txns[0].description).toBe("Rent — Flat 2");
    expect(await materialiseDue(new Date("2025-03-15"))).toBe(0);
    expect(await materialiseDue(new Date("2025-04-02"))).toBe(1);
    const refreshed = await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(refreshed.lastGeneratedDate?.toISOString().slice(0, 10)).toBe("2025-04-01");
  });

  it("materialises weekly rules on the chosen weekday", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    // 2025-01-01 is Wednesday; weekly on Monday → 6th, 13th, 20th
    await createRecurringRule(monthly({
      propertyId: property.id, categoryId, direction: "out",
      intervalUnit: "WEEK", intervalCount: 1, dayOfMonth: null, dayOfWeek: 0,
    }));
    expect(await materialiseDue(new Date("2025-01-21"))).toBe(3);
  });

  it("skips paused rules and catches up on resume", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const rule = await createRecurringRule(monthly({ propertyId: property.id, categoryId }));
    await setRecurringActive(rule.id, false);
    expect(await materialiseDue(new Date("2025-03-15"))).toBe(0);
    expect(await listTransactions(property.id)).toHaveLength(0);
    await setRecurringActive(rule.id, true);
    expect(await materialiseDue(new Date("2025-03-15"))).toBe(3);
  });

  it("updates a rule's schedule", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const rule = await createRecurringRule(monthly({ propertyId: property.id, categoryId }));
    await updateRecurringRule(rule.id, monthly({ propertyId: property.id, categoryId, intervalUnit: "MONTH", intervalCount: 3, dayOfMonth: 5 }));
    const refreshed = await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(refreshed.intervalCount).toBe(3);
    expect(refreshed.dayOfMonth).toBe(5);
  });

  it("only materialises rules for the given property when propertyId is passed", async () => {
    const p1 = await getOrCreateDefaultProperty();
    const p2 = await prisma.property.create({ data: { name: "Second" } });
    const categoryId = await rentCategoryId();
    await createRecurringRule(monthly({ propertyId: p1.id, categoryId, amountPence: 1000 }));
    await createRecurringRule(monthly({ propertyId: p2.id, categoryId, amountPence: 2000 }));
    expect(await materialiseDue(new Date("2025-02-15"), p1.id)).toBe(2);
    expect(await listTransactions(p2.id)).toHaveLength(0);
  });

  it("deletes a rule", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const r = await createRecurringRule(monthly({ propertyId: property.id, categoryId, direction: "out", intervalUnit: "YEAR", intervalCount: 1, dayOfMonth: 10, startDate: new Date("2025-05-10") }));
    await deleteRecurringRule(r.id);
    expect(await listRecurringRules(property.id)).toHaveLength(0);
  });
});
