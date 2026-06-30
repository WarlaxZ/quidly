import { beforeEach, describe, expect, it } from "vitest";
import { getDirectorLoanSummary } from "./directorLoan";
import { createCompany } from "./company";
import { createLedgerEntry } from "./companyLedger";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => { await resetDb(); });

describe("getDirectorLoanSummary", () => {
  it("computes the period-end balance, s455, and the beneficial-loan BIK for the tax year", async () => {
    // Year-end 31 Dec; periodYear 2025. Two loans out → £20,000 overdrawn at 2025-12-31.
    const co = await createCompany({ name: "Co", accountingYearEndDay: 31, accountingYearEndMonth: 12 });
    await createLedgerEntry({ companyId: co.id, date: new Date("2025-02-01"), kind: "director_loan_out", amountPence: 12_000_00 });
    await createLedgerEntry({ companyId: co.id, date: new Date("2025-08-01"), kind: "director_loan_out", amountPence: 8_000_00 });

    const s = await getDirectorLoanSummary(co.id, 2025);
    expect(s).not.toBeNull();
    expect(s!.balancePence).toBe(20_000_00);     // overdrawn
    expect(s!.s455Pence).toBe(6_750_00);         // 20,000 × 33.75%
    expect(s!.taxYear).toBe("2025-26");          // tax year containing 2025-12-31
    // TY-start balance (6 Apr 2025) = 12,000; TY-end balance (5 Apr 2026) = 20,000; avg 16,000 × 3.75% = 600 BIK
    expect(s!.bik).toEqual({ applies: true, bikPence: 600_00, class1aNicPence: 90_00 });
  });

  it("returns null for a missing company", async () => {
    expect(await getDirectorLoanSummary("nope", 2025)).toBeNull();
  });
});
