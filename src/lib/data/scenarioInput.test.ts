import { beforeEach, describe, expect, it } from "vitest";
import { getScenarioInput } from "./scenarioInput";
import { createProperty } from "./property";
import { createTransaction } from "./transactions";
import { updateProfile } from "./taxProfile";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function cat(name: string) {
  return (await prisma.category.findFirstOrThrow({ where: { name } })).id;
}
beforeEach(async () => { await resetDb(); });

describe("getScenarioInput", () => {
  it("sums income, expenses and finance for one personal property; reads profile", async () => {
    const a = await createProperty({ name: "A", ownershipType: "personal" });
    await updateProfile("2025-26", { otherIncomePence: 40_000_00, region: "scotland" });
    const rent = await cat("Rent received");
    const repairs = await cat("Property repairs and maintenance");
    const mortgage = await cat("Mortgage / loan interest");
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 12_000_00, direction: "in" });
    await createTransaction({ propertyId: a.id, categoryId: repairs, date: new Date("2025-06-02"), amountPence: 2_000_00, direction: "out" });
    await createTransaction({ propertyId: a.id, categoryId: mortgage, date: new Date("2025-06-03"), amountPence: 5_000_00, direction: "out" });

    const input = await getScenarioInput({ taxYear: "2025-26", basis: a.id });
    expect(input).toEqual({
      incomePence: 12_000_00,
      expensesPence: 2_000_00,
      financeCostsPence: 5_000_00,
      otherIncomePence: 40_000_00,
      taxYear: "2025-26",
      region: "scotland",
    });
  });

  it("'all' basis combines personal properties and excludes company ones", async () => {
    const a = await createProperty({ name: "A", ownershipType: "personal" });
    const b = await createProperty({ name: "B", ownershipType: "personal" });
    const co = await createProperty({ name: "Co", ownershipType: "company" });
    const rent = await cat("Rent received");
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 7_000_00, direction: "in" });
    await createTransaction({ propertyId: b.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 3_000_00, direction: "in" });
    await createTransaction({ propertyId: co.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 9_000_00, direction: "in" });

    const input = await getScenarioInput({ taxYear: "2025-26", basis: "all" });
    expect(input.incomePence).toBe(10_000_00); // company's 9,000 excluded
  });

  it("'all' basis also excludes transactions outside the tax year", async () => {
    const a = await createProperty({ name: "A", ownershipType: "personal" });
    const rent = await cat("Rent received");
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 4_000_00, direction: "in" });
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2024-06-01"), amountPence: 9_999_00, direction: "in" });
    const input = await getScenarioInput({ taxYear: "2025-26", basis: "all" });
    expect(input.incomePence).toBe(4_000_00);
  });

  it("a single-property basis ignores transactions outside the tax year", async () => {
    const a = await createProperty({ name: "A", ownershipType: "personal" });
    const rent = await cat("Rent received");
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2025-06-01"), amountPence: 1_000_00, direction: "in" });
    await createTransaction({ propertyId: a.id, categoryId: rent, date: new Date("2024-06-01"), amountPence: 9_999_00, direction: "in" });
    const input = await getScenarioInput({ taxYear: "2025-26", basis: a.id });
    expect(input.incomePence).toBe(1_000_00);
  });
});
