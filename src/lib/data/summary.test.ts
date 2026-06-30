import { beforeEach, describe, expect, it } from "vitest";
import { getTaxYearSummary } from "./summary";
import { getOrCreateDefaultProperty } from "./property";
import { createTransaction } from "./transactions";
import { updateProfile } from "./taxProfile";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function cat(name: string) {
  const c = await prisma.category.findFirstOrThrow({ where: { name } });
  return c.id;
}
beforeEach(async () => { await resetDb(); });

describe("getTaxYearSummary", () => {
  it("aggregates a tax year's transactions through the engine", async () => {
    const property = await getOrCreateDefaultProperty();
    await updateProfile("2025-26", { otherIncomePence: 40_000_00 });
    await createTransaction({ propertyId: property.id, categoryId: await cat("Rent received"), date: new Date("2025-06-01"), amountPence: 12_000_00, direction: "in" });
    await createTransaction({ propertyId: property.id, categoryId: await cat("Property repairs and maintenance"), date: new Date("2025-07-01"), amountPence: 2_000_00, direction: "out" });
    const { summary } = await getTaxYearSummary(property.id, "2025-26");
    expect(summary.incomePence).toBe(12_000_00);
    expect(summary.expensesPence).toBe(2_000_00);
    expect(summary.profitPence).toBe(10_000_00);
    expect(summary.sa105["20"]).toBe(12_000_00);
  });
});
