import { describe, expect, it } from "vitest";
import { extractionOutcome, optimiseExtraction, type ExtractionInput } from "./extraction";

const base: ExtractionInput = {
  profitBeforeSalaryPence: 60_000_00,
  otherIncomePence: 0,
  taxYear: "2025-26",
  region: "englandWalesNI",
  employmentAllowance: false,
};

describe("extractionOutcome", () => {
  it("computes NIC/CT/dividend components for a £12,570 salary", () => {
    const o = extractionOutcome(12_570_00, base);
    expect(o.employerNicPence).toBe(1_135_50);
    expect(o.employeeNicPence).toBe(0);
    expect(o.incomeTaxPence).toBe(0);
    expect(o.dividendPence).toBe(60_000_00 - 12_570_00 - o.employerNicPence - o.corporationTaxPence);
    expect(o.totalTaxPence).toBe(o.employerNicPence + o.corporationTaxPence + o.employeeNicPence + o.incomeTaxPence + o.dividendTaxPence);
  });

  it("satisfies the conservation identity (profit = take-home + total tax) for affordable salaries", () => {
    for (const s of [0, 5_000_00, 12_570_00]) {
      const o = extractionOutcome(s, base);
      expect(o.takeHomePence + o.totalTaxPence).toBe(60_000_00);
    }
  });

  it("never produces negative dividends or tax for a tiny profit", () => {
    const o = extractionOutcome(0, { ...base, profitBeforeSalaryPence: 0 });
    expect(o.dividendPence).toBe(0);
    expect(o.totalTaxPence).toBe(0);
    expect(o.takeHomePence).toBe(0);
  });
});

describe("optimiseExtraction", () => {
  it("recommends the take-home maximum over every strategy and curve point", () => {
    const r = optimiseExtraction(base);
    for (const s of r.strategies) expect(r.recommended.takeHomePence).toBeGreaterThanOrEqual(s.outcome.takeHomePence);
    for (const p of r.curve) expect(r.recommended.takeHomePence).toBeGreaterThanOrEqual(p.takeHomePence);
  });
  it("includes the four named strategies", () => {
    const keys = optimiseExtraction(base).strategies.map((s) => s.key).sort();
    expect(keys).toEqual(["allowance", "none", "optimum", "secondary"]);
  });
  it("degrades to an all-zero result for non-positive profit", () => {
    const r = optimiseExtraction({ ...base, profitBeforeSalaryPence: 0 });
    expect(r.recommended).toMatchObject({ salaryPence: 0, dividendPence: 0, totalTaxPence: 0, takeHomePence: 0 });
  });
});
