import { beforeEach, describe, expect, it } from "vitest";
import { createTransaction, listTransactions, listTransactionsForTaxYear, updateTransaction, deleteTransaction } from "./transactions";
import { getOrCreateDefaultProperty } from "./property";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function rentCategoryId() {
  const c = await prisma.category.findFirstOrThrow({ where: { name: "Rent received" } });
  return c.id;
}
beforeEach(async () => { await resetDb(); });

describe("transactions data layer", () => {
  it("creates, lists, updates and deletes a transaction", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const t = await createTransaction({
      propertyId: property.id, categoryId, date: new Date("2025-06-01"),
      amountPence: 95000, direction: "in", description: "June rent",
    });
    let all = await listTransactions(property.id);
    expect(all).toHaveLength(1);
    expect(all[0].amountPence).toBe(95000);
    await updateTransaction(t.id, { amountPence: 96000 });
    all = await listTransactions(property.id);
    expect(all[0].amountPence).toBe(96000);
    await deleteTransaction(t.id);
    expect(await listTransactions(property.id)).toHaveLength(0);
  });
  it("filters by UK tax year and includes the category for tax mapping", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    await createTransaction({ propertyId: property.id, categoryId, date: new Date("2025-04-05"), amountPence: 100, direction: "in" });
    await createTransaction({ propertyId: property.id, categoryId, date: new Date("2025-04-06"), amountPence: 200, direction: "in" });
    const rows = await listTransactionsForTaxYear(property.id, "2025-26");
    expect(rows).toHaveLength(1);
    expect(rows[0].amountPence).toBe(200);
    expect(rows[0].category.sa105Box).toBe("20");
  });
});
