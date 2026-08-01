import { beforeEach, describe, expect, it } from "vitest";
import { createTransaction, listTransactions, listTransactionsFiltered, listTransactionsForTaxYear, updateTransaction, deleteTransaction, getTransaction, loanDeleteBlockMessage } from "./transactions";
import { getOrCreateDefaultProperty } from "./property";
import { createLoan } from "./loans";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function rentCategoryId() {
  const c = await prisma.category.findFirstOrThrow({ where: { name: "Rent received" } });
  return c.id;
}
beforeEach(async () => { await resetDb(); });

describe("transactions data layer", () => {
  it("fetches a single transaction by id", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const t = await createTransaction({ propertyId: property.id, categoryId, date: new Date("2025-06-01"), amountPence: 5000, direction: "in" });
    const { getTransaction } = await import("./transactions");
    const fetched = await getTransaction(t.id);
    expect(fetched?.amountPence).toBe(5000);
    expect(await getTransaction("nonexistent")).toBeNull();
  });
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
  it("lists across all properties with the property included when propertyId is null", async () => {
    const { createProperty } = await import("./property");
    const a = await createProperty({ name: "A" });
    const b = await createProperty({ name: "B" });
    const rent = await rentCategoryId();
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 100, direction: "in" });
    await createTransaction({ propertyId: b.id, categoryId: rent, date: new Date("2025-06-02"), amountPence: 200, direction: "in" });
    const all = await listTransactionsFiltered(null, {});
    expect(all).toHaveLength(2);
    expect(all[0].property?.name).toBeDefined();
  });
  it("bulk-creates imported transactions tagged as imported", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const { bulkCreateTransactions } = await import("./transactions");
    const count = await bulkCreateTransactions([
      { propertyId: property.id, categoryId, date: new Date("2025-06-01"), amountPence: 100, direction: "in", description: "a" },
      { propertyId: property.id, categoryId, date: new Date("2025-06-02"), amountPence: 200, direction: "out", description: "b" },
    ]);
    expect(count).toBe(2);
    const all = await listTransactions(property.id);
    expect(all.every((t) => t.source === "imported")).toBe(true);
  });

  it("includes the linked attachment on getTransaction", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const { createAttachment } = await import("./attachments");
    const attachment = await createAttachment({
      filePath: "/tmp/receipt.pdf",
      originalName: "receipt.pdf",
      extractedData: null,
    });
    const t = await createTransaction({
      propertyId: property.id,
      categoryId,
      date: new Date("2025-06-01"),
      amountPence: 5000,
      direction: "out",
      attachmentId: attachment.id,
    });
    const { getTransaction } = await import("./transactions");
    const fetched = await getTransaction(t.id);
    expect(fetched?.attachment?.originalName).toBe("receipt.pdf");
  });

  it("clears an attachment when updated with attachmentId null but leaves it when the key is omitted", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const { createAttachment } = await import("./attachments");
    const attachment = await createAttachment({
      filePath: "/tmp/receipt2.pdf",
      originalName: "receipt2.pdf",
      extractedData: null,
    });
    const t = await createTransaction({
      propertyId: property.id,
      categoryId,
      date: new Date("2025-06-01"),
      amountPence: 5000,
      direction: "out",
      attachmentId: attachment.id,
    });
    const { getTransaction } = await import("./transactions");

    // Omitting attachmentId leaves it unchanged
    await updateTransaction(t.id, { amountPence: 6000 });
    expect((await getTransaction(t.id))?.attachmentId).toBe(attachment.id);

    // Passing null clears it
    await updateTransaction(t.id, { attachmentId: null });
    expect((await getTransaction(t.id))?.attachmentId).toBeNull();
  });

  describe("loanDeleteBlockMessage", () => {
    it("returns null for a transaction with no loan payment", async () => {
      const property = await getOrCreateDefaultProperty();
      const categoryId = await rentCategoryId();
      const t = await createTransaction({ propertyId: property.id, categoryId, date: new Date("2025-06-01"), amountPence: 5000, direction: "in" });
      const fetched = await getTransaction(t.id);
      expect(fetched).not.toBeNull();
      expect(loanDeleteBlockMessage(fetched!)).toBeNull();
    });

    it("names the loan when the transaction was generated from a loan payment", async () => {
      const property = await getOrCreateDefaultProperty();
      const categoryId = await rentCategoryId();
      const loan = await createLoan({
        propertyId: property.id,
        name: "Buy-to-let mortgage",
        kind: "interestOnly",
        openingBalancePence: 7_100_000,
        annualRateBps: 270,
        scheduledPaymentPence: 75_000,
        intervalUnit: "MONTH",
        intervalCount: 1,
        startDate: new Date("2025-01-01"),
      });
      const loanPayment = await prisma.loanPayment.create({
        data: {
          loanId: loan.id,
          date: new Date("2025-06-01"),
          openingBalancePence: 7_100_000,
          computedInterestPence: 15_975,
          paidPence: 75_000,
          closingBalancePence: 7_040_975,
        },
      });
      const t = await createTransaction({ propertyId: property.id, categoryId, date: new Date("2025-06-01"), amountPence: 75_000, direction: "out" });
      await prisma.transaction.update({ where: { id: t.id }, data: { loanPaymentId: loanPayment.id } });
      const fetched = await getTransaction(t.id);
      expect(fetched).not.toBeNull();
      const message = loanDeleteBlockMessage(fetched!);
      expect(message).toContain("Buy-to-let mortgage");
      expect(message).toContain("Remove it from the loan instead");
    });
  });
});
