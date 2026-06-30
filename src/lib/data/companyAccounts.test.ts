import { beforeEach, describe, expect, it } from "vitest";
import { getCompanyAccounts } from "./companyAccounts";
import { createCompany } from "./company";
import { createProperty } from "./property";
import { createTransaction } from "./transactions";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function cat(name: string) {
  return (await prisma.category.findFirstOrThrow({ where: { name } })).id;
}
beforeEach(async () => { await resetDb(); });

describe("getCompanyAccounts", () => {
  it("aggregates the company's properties over its period; mortgage reduces profit", async () => {
    const c = await createCompany({ name: "SPV", accountingYearEndDay: 31, accountingYearEndMonth: 3 });
    const p = await createProperty({ name: "SPV flat", ownershipType: "company", companyId: c.id });
    const other = await createProperty({ name: "Personal", ownershipType: "personal" });
    const rent = await cat("Rent received");
    const mortgage = await cat("Mortgage / loan interest");
    await createTransaction({ propertyId: p.id, categoryId: rent, date: new Date("2025-09-01"), amountPence: 30_000_00, direction: "in" });
    await createTransaction({ propertyId: p.id, categoryId: mortgage, date: new Date("2025-09-01"), amountPence: 8_000_00, direction: "out" });
    await createTransaction({ propertyId: other.id, categoryId: rent, date: new Date("2025-09-01"), amountPence: 5_000_00, direction: "in" });
    await createTransaction({ propertyId: p.id, categoryId: rent, date: new Date("2026-06-01"), amountPence: 9_999_00, direction: "in" });

    const acc = await getCompanyAccounts(c.id, 2026);
    expect(acc).not.toBeNull();
    expect(acc!.incomePence).toBe(30_000_00);
    expect(acc!.expensesPence).toBe(8_000_00);
    expect(acc!.profitBeforeTaxPence).toBe(22_000_00);
    expect(acc!.corporationTaxPence).toBe(4_180_00);
    expect(acc!.profitAfterTaxPence).toBe(17_820_00);
    expect(acc!.band).toBe("small");
  });
  it("returns null for an unknown company", async () => {
    expect(await getCompanyAccounts("nope", 2026)).toBeNull();
  });
});
