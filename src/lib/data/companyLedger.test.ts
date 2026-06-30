import { beforeEach, describe, expect, it } from "vitest";
import { listLedgerEntries, createLedgerEntry, deleteLedgerEntry } from "./companyLedger";
import { createCompany, deleteCompanyIfEmpty } from "./company";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => { await resetDb(); });

async function aCompany() {
  return createCompany({ name: "Co", accountingYearEndDay: 31, accountingYearEndMonth: 12 });
}

describe("companyLedger CRUD", () => {
  it("creates, lists (newest first) and deletes entries scoped to the company", async () => {
    const co = await aCompany();
    await createLedgerEntry({ companyId: co.id, date: new Date("2025-09-01"), kind: "dividend", amountPence: 5_000_00, note: "interim" });
    await createLedgerEntry({ companyId: co.id, date: new Date("2025-02-01"), kind: "director_loan_out", amountPence: 12_000_00 });
    const rows = await listLedgerEntries(co.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe("dividend"); // 2025-09-01 is newer than 2025-02-01
    expect(rows[0].amountPence).toBe(5_000_00);
    await deleteLedgerEntry(rows[1].id);
    expect(await listLedgerEntries(co.id)).toHaveLength(1);
  });

  it("blocks deleting a company that still has ledger entries", async () => {
    const co = await aCompany();
    await createLedgerEntry({ companyId: co.id, date: new Date("2025-09-01"), kind: "dividend", amountPence: 1_00 });
    await expect(deleteCompanyIfEmpty(co.id)).rejects.toThrow(/ledger|dividend|loan/i);
  });
});
