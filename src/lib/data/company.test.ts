import { beforeEach, describe, expect, it } from "vitest";
import { createCompany, getCompany, listCompanies, updateCompany, getCompanyPropertyCount, deleteCompanyIfEmpty } from "./company";
import { createProperty } from "./property";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => { await resetDb(); });

describe("company data layer", () => {
  it("creates, lists, fetches and updates", async () => {
    const c = await createCompany({ name: "Acme SPV Ltd", accountingYearEndDay: 31, accountingYearEndMonth: 3 });
    expect((await getCompany(c.id))?.name).toBe("Acme SPV Ltd");
    expect(await listCompanies()).toHaveLength(1);
    await updateCompany(c.id, { name: "Renamed Ltd" });
    expect((await getCompany(c.id))?.name).toBe("Renamed Ltd");
  });
  it("deletes only when it owns no properties", async () => {
    const c = await createCompany({ name: "Has property", accountingYearEndDay: 5, accountingYearEndMonth: 4 });
    await createProperty({ name: "SPV flat", ownershipType: "company", companyId: c.id });
    expect(await getCompanyPropertyCount(c.id)).toBe(1);
    await expect(deleteCompanyIfEmpty(c.id)).rejects.toThrow();
    const empty = await createCompany({ name: "Empty", accountingYearEndDay: 31, accountingYearEndMonth: 12 });
    await deleteCompanyIfEmpty(empty.id);
    expect(await getCompany(empty.id)).toBeNull();
  });
});
