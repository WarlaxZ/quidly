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
  it("reports the CT year used and whether it is configured", async () => {
    const co = await createCompany({ name: "CT", accountingYearEndDay: 31, accountingYearEndMonth: 12 });
    const prop = await createProperty({ name: "P", ownershipType: "company", companyId: co.id });
    const rent = (await prisma.category.findFirstOrThrow({ where: { name: "Rent received" } })).id;
    await createTransaction({ propertyId: prop.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 10_000_00, direction: "in" });
    await createTransaction({ propertyId: prop.id, categoryId: rent, date: new Date("2026-06-01"), amountPence: 10_000_00, direction: "in" });

    const in2025 = await getCompanyAccounts(co.id, 2025);
    expect(in2025!.ctYear).toBe("2025-26");
    expect(in2025!.ctYearConfigured).toBe(true);

    const in2026 = await getCompanyAccounts(co.id, 2026);
    expect(in2026!.ctYear).toBe("2026-27");
    expect(in2026!.ctYearConfigured).toBe(false);
    expect(in2026!.corporationTaxPence).toBe(1_900_00); // unchanged: £10,000 × 19% (falls back to 2025-26)
  });
  it("excludes other companies' properties", async () => {
    const c1 = await createCompany({ name: "C1", accountingYearEndDay: 31, accountingYearEndMonth: 3 });
    const c2 = await createCompany({ name: "C2", accountingYearEndDay: 31, accountingYearEndMonth: 3 });
    const p1 = await createProperty({ name: "P1", ownershipType: "company", companyId: c1.id });
    const p2 = await createProperty({ name: "P2", ownershipType: "company", companyId: c2.id });
    const rent = await cat("Rent received");
    await createTransaction({ propertyId: p1.id, categoryId: rent, date: new Date("2025-09-01"), amountPence: 10_000_00, direction: "in" });
    await createTransaction({ propertyId: p2.id, categoryId: rent, date: new Date("2025-09-01"), amountPence: 99_000_00, direction: "in" });
    const acc = await getCompanyAccounts(c1.id, 2026);
    expect(acc!.incomePence).toBe(10_000_00); // only C1, not C2's £99k
  });
});
