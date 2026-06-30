import { describe, expect, it } from "vitest";
import { runScenario, type ScenarioInput } from "./scenario";

const base: ScenarioInput = {
  incomePence: 12_000_00,
  expensesPence: 2_000_00,
  financeCostsPence: 5_000_00,
  otherIncomePence: 40_000_00,
  taxYear: "2025-26",
  region: "englandWalesNI",
};

function byKey(input: ScenarioInput) {
  const { outcomes } = runScenario(input);
  return Object.fromEntries(outcomes.map((o) => [o.key, o]));
}

describe("runScenario (worked landlord case)", () => {
  it("personal — actual costs: 20% on £10k profit, less £1k finance reducer", () => {
    const o = byKey(base)["personal-actual"];
    expect(o.taxPence).toBe(1_000_00);   // £2,000 income tax − £1,000 reducer
    expect(o.pocketPence).toBe(4_000_00); // 12,000 − 2,000 − 5,000 − 1,000
  });

  it("personal — £1,000 allowance: no finance reducer, taxed on income−£1,000", () => {
    const o = byKey(base)["personal-allowance"];
    expect(o.taxPence).toBe(2_346_00);   // tax on (40k+11k) − tax on 40k, no reducer
    expect(o.pocketPence).toBe(2_654_00); // 12,000 − 2,000 − 5,000 − 2,346
  });

  it("company — profits retained: corporation tax only, nothing in pocket", () => {
    const o = byKey(base)["company-retained"];
    expect(o.taxPence).toBe(950_00);     // £5,000 profit × 19%
    expect(o.pocketPence).toBe(0);       // money stays in the company
    expect(o.note).toContain("4,050");   // £4,050 retained (5,000 − 950)
  });

  it("company — taken as dividends: corporation tax + dividend tax", () => {
    const o = byKey(base)["company-dividends"];
    // CT £950; distributable £4,050; taxable £3,550 → 355,000p × 875bps / 10,000 = 31,062.5p → 31,063p (£310.63)
    expect(o.taxPence).toBe(1_260_63);   // 950.00 + 310.63
    expect(o.pocketPence).toBe(3_739_37); // 5,000 − 950 − 310.63
  });

  it("returns exactly the four outcomes in order", () => {
    const { outcomes } = runScenario(base);
    expect(outcomes.map((o) => o.key)).toEqual([
      "personal-actual", "personal-allowance", "company-retained", "company-dividends",
    ]);
  });
});

describe("runScenario (loss case)", () => {
  it("never produces negative tax and keeps pockets sensible", () => {
    const o = byKey({ ...base, incomePence: 3_000_00, expensesPence: 2_000_00, financeCostsPence: 5_000_00 });
    expect(o["personal-actual"].taxPence).toBe(0);
    expect(o["company-retained"].taxPence).toBe(0);
    expect(o["company-dividends"].taxPence).toBe(0);
    // profit = 3,000 − 2,000 − 5,000 = −4,000; nothing to distribute
    expect(o["company-dividends"].pocketPence).toBe(-4_000_00);
    expect(o["company-retained"].note).toContain("loss");
  });
});

describe("runScenario (region affects only personal income tax, not dividends)", () => {
  it("uses UK dividend thresholds even for a Scottish taxpayer", () => {
    const eng = byKey({ ...base, region: "englandWalesNI" })["company-dividends"];
    const sco = byKey({ ...base, region: "scotland" })["company-dividends"];
    // company-dividends tax = CT + dividend tax; both are region-independent.
    expect(sco.taxPence).toBe(eng.taxPence);
  });
});
