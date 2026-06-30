import { beforeEach, describe, expect, it } from "vitest";
import { getCompanyReserves, getCompanyDividendTax } from "./companyReserves";
import { createCompany } from "./company";
import { createProperty } from "./property";
import { createTransaction } from "./transactions";
import { createLedgerEntry } from "./companyLedger";
import { updateProfile } from "./taxProfile";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function rentCat() { return (await prisma.category.findFirstOrThrow({ where: { name: "Rent received" } })).id; }
beforeEach(async () => { await resetDb(); });

// Company year-end 31 Dec. £10,000 rent in 2025 and in 2026 → £10,000 profit each → £1,900 CT → £8,100 after tax each.
async function setup() {
  const co = await createCompany({ name: "Bristol", accountingYearEndDay: 31, accountingYearEndMonth: 12 });
  const prop = await createProperty({ name: "Flat", ownershipType: "company", companyId: co.id });
  const rent = await rentCat();
  await createTransaction({ propertyId: prop.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 10_000_00, direction: "in" });
  await createTransaction({ propertyId: prop.id, categoryId: rent, date: new Date("2026-06-01"), amountPence: 10_000_00, direction: "in" });
  return co;
}

describe("getCompanyReserves", () => {
  it("accumulates after-tax profit across periods and subtracts dividends", async () => {
    const co = await setup();
    await createLedgerEntry({ companyId: co.id, date: new Date("2025-09-01"), kind: "dividend", amountPence: 5_000_00 });
    await createLedgerEntry({ companyId: co.id, date: new Date("2026-09-01"), kind: "dividend", amountPence: 3_000_00 });

    const r = await getCompanyReserves(co.id, 2026);
    expect(r).not.toBeNull();
    expect(r!.periodProfitAfterTaxPence).toBe(8_100_00);
    expect(r!.periodDividendsPence).toBe(3_000_00);
    expect(r!.cumulativeProfitAfterTaxPence).toBe(16_200_00);
    expect(r!.cumulativeDividendsPence).toBe(8_000_00);
    expect(r!.retainedEarningsPence).toBe(8_200_00);
    expect(r!.unlawful).toBe(false);
  });

  it("flags an unlawful dividend that exceeds distributable reserves", async () => {
    const co = await setup();
    await createLedgerEntry({ companyId: co.id, date: new Date("2026-09-01"), kind: "dividend", amountPence: 20_000_00 });
    const r = await getCompanyReserves(co.id, 2026);
    expect(r!.cumulativeDividendsPence).toBe(20_000_00);
    expect(r!.unlawful).toBe(true); // 20,000 > 16,200 cumulative after-tax profit
  });

  it("returns zeros (not null) for a company with no activity", async () => {
    const co = await createCompany({ name: "Empty", accountingYearEndDay: 31, accountingYearEndMonth: 12 });
    const r = await getCompanyReserves(co.id, 2026);
    expect(r).toEqual({
      periodProfitAfterTaxPence: 0, periodDividendsPence: 0,
      cumulativeProfitAfterTaxPence: 0, cumulativeDividendsPence: 0,
      retainedEarningsPence: 0, unlawful: false,
    });
  });
});

describe("getCompanyDividendTax", () => {
  it("estimates dividend tax per tax year using the year's other income", async () => {
    const co = await setup();
    await updateProfile("2025-26", { otherIncomePence: 20_000_00 });
    await createLedgerEntry({ companyId: co.id, date: new Date("2025-09-01"), kind: "dividend", amountPence: 10_000_00 });
    const rows = await getCompanyDividendTax(co.id);
    expect(rows).toEqual([{ taxYear: "2025-26", dividendPence: 10_000_00, taxPence: 831_25 }]);
  });
});
