import { beforeEach, describe, expect, it } from "vitest";
import { getPersonalTaxYearSummary, getPerPropertyBreakdown } from "./personalSummary";
import { createProperty } from "./property";
import { createTransaction } from "./transactions";
import { updateProfile } from "./taxProfile";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function cat(name: string) {
  return (await prisma.category.findFirstOrThrow({ where: { name } })).id;
}
beforeEach(async () => { await resetDb(); });

describe("personal tax-year summary", () => {
  it("sums personal properties, applies the £1,000 allowance once, excludes company", async () => {
    const a = await createProperty({ name: "A", ownershipType: "personal" });
    const b = await createProperty({ name: "B", ownershipType: "personal" });
    const co = await createProperty({ name: "Co", ownershipType: "company" });
    await updateProfile("2025-26", { usePropertyAllowance: true });
    const rent = await cat("Rent received");
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 700_00, direction: "in" });
    await createTransaction({ propertyId: b.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 700_00, direction: "in" });
    await createTransaction({ propertyId: co.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 900_00, direction: "in" });

    const { summary } = await getPersonalTaxYearSummary("2025-26");
    expect(summary.incomePence).toBe(1_400_00);
    expect(summary.taxableProfitPence).toBe(400_00);
  });

  it("breaks down per personal property", async () => {
    const a = await createProperty({ name: "A", ownershipType: "personal" });
    const rent = await cat("Rent received");
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 500_00, direction: "in" });
    const rows = await getPerPropertyBreakdown("2025-26");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ propertyName: "A", incomePence: 500_00, profitPence: 500_00 });
  });

  it("breakdown is gross (pre-allowance) and excludes company properties", async () => {
    const a = await createProperty({ name: "A", ownershipType: "personal" });
    const co = await createProperty({ name: "Co", ownershipType: "company" });
    await updateProfile("2025-26", { usePropertyAllowance: true });
    const rent = await cat("Rent received");
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 1_500_00, direction: "in" });
    await createTransaction({ propertyId: co.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 900_00, direction: "in" });
    const rows = await getPerPropertyBreakdown("2025-26");
    expect(rows).toHaveLength(1); // company excluded
    expect(rows[0].profitPence).toBe(1_500_00); // GROSS, not 1500-1000 allowance
    const { summary } = await getPersonalTaxYearSummary("2025-26");
    expect(summary.taxableProfitPence).toBe(500_00); // person-level allowance applied (1500-1000)
  });
});
