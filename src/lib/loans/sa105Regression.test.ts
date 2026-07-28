import { describe, expect, it } from "vitest";
import { daysBetween, derivePayment } from "./schedule";
import { computeProfit } from "../tax/profit";
import { buildTaxYearSummary } from "../tax/summary";
import type { TaxTxn } from "../tax/types";

/** A year of £750/month payments on a £71k interest-only loan at 2.7%, as the
 *  tax engine would see them once the loan engine has split each one.
 *  Dates run 1 May 2026 → 1 Apr 2027, all inside tax year 2026-27 (which ends 5 Apr 2027).
 *  Interest accrues from 1 Apr 2026, so the 12 periods span exactly 365 days. */
function yearOfSplitPayments(): TaxTxn[] {
  const txns: TaxTxn[] = [];
  let balance = 7_100_000;
  let prev = new Date("2026-04-01T00:00:00Z");
  for (let m = 0; m < 12; m++) {
    const date = new Date(Date.UTC(2026, 4 + m, 1));
    const d = derivePayment({
      terms: { kind: "interestOnly", annualRateBps: 270, scheduledPaymentPence: 75_000 },
      openingBalancePence: balance,
      daysInPeriod: daysBetween(prev, date),
      paidPence: 75_000,
    });
    txns.push({ date, amountPence: d.interestPence, direction: "out", categoryKind: "finance", allowable: true, sa105Box: "44" });
    txns.push({ date, amountPence: d.capitalPence, direction: "out", categoryKind: "capital", allowable: false, sa105Box: null });
    balance = d.closingBalancePence;
    prev = date;
  }
  return txns;
}

describe("SA105 treatment of a split mortgage payment", () => {
  const RENT: TaxTxn = {
    date: new Date("2026-06-01T00:00:00Z"), amountPence: 1_200_000,
    direction: "in", categoryKind: "income", allowable: true, sa105Box: "20",
  };

  it("puts only the interest in box 44 — never the whole payment", () => {
    const txns = yearOfSplitPayments();
    const summary = buildTaxYearSummary([RENT, ...txns], {
      taxYear: "2026-27", otherIncomePence: 7_347_000,
      region: "englandWalesNI", usePropertyAllowance: false,
    });

    // A full year of payments is £9,000. Only £1,829.00 of it is deductible.
    // Asserted exactly, not as a range: everything here is deterministic integer pence
    // with no floating point, so a range would let a real rate drift pass unnoticed —
    // which would defeat the purpose of the one test named for pinning box 44.
    expect(summary.financeCostsPence).toBe(182_900);
    expect(summary.sa105["44"]).toBe(182_900);
  });

  it("excludes capital repayment from profit entirely", () => {
    const txns = yearOfSplitPayments();
    const capitalPence = txns.filter((t) => t.categoryKind === "capital")
      .reduce((sum, t) => sum + t.amountPence, 0);
    const interestPence = txns.filter((t) => t.categoryKind === "finance")
      .reduce((sum, t) => sum + t.amountPence, 0);

    // Guard against this test going vacuous: the capital rows must actually be present
    // and material, and together with interest must account for every penny debited.
    expect(capitalPence).toBeGreaterThan(700_000);
    expect(capitalPence + interestPence).toBe(12 * 75_000);

    const { profitPence, expensesPence } = computeProfit([RENT, ...txns]);
    // Capital is neither an expense nor a finance cost — profit is rent, untouched.
    expect(expensesPence).toBe(0);
    expect(profitPence).toBe(1_200_000);
  });

  // The assertion above would pass even if the capital rows were simply absent, because
  // computeProfit ignores them for two independent reasons (allowable: false, and no
  // "capital" arm in its categoryKind switch). This mutation test is what actually proves
  // the categorisation is load-bearing: recategorise capital as a deductible expense and
  // the profit must move by exactly that amount.
  it("would wrongly reduce profit if capital were miscategorised as an expense", () => {
    const txns = yearOfSplitPayments();
    const miscategorised = txns.map((t) =>
      t.categoryKind === "capital"
        ? { ...t, categoryKind: "expense" as const, allowable: true, sa105Box: "29" }
        : t,
    );

    const right = computeProfit([RENT, ...txns]);
    const wrong = computeProfit([RENT, ...miscategorised]);

    expect(right.expensesPence).toBe(0);
    expect(wrong.expensesPence).toBeGreaterThan(700_000);
    // The whole difference is the capital that must never have been deducted.
    expect(right.profitPence - wrong.profitPence).toBe(wrong.expensesPence);
  });

  it("would have overclaimed by over £7,000 if the payment were filed unsplit", () => {
    const unsplit: TaxTxn[] = Array.from({ length: 12 }, (_, m) => ({
      date: new Date(Date.UTC(2026, 4 + m, 1)), amountPence: 75_000,
      direction: "out", categoryKind: "finance", allowable: true, sa105Box: "44",
    }));
    const wrong = buildTaxYearSummary([RENT, ...unsplit], {
      taxYear: "2026-27", otherIncomePence: 7_347_000,
      region: "englandWalesNI", usePropertyAllowance: false,
    });
    const right = buildTaxYearSummary([RENT, ...yearOfSplitPayments()], {
      taxYear: "2026-27", otherIncomePence: 7_347_000,
      region: "englandWalesNI", usePropertyAllowance: false,
    });
    // £9,000 filed vs £1,829 actually deductible: a £7,171.00 overclaim, asserted exactly.
    expect(wrong.financeCostsPence).toBe(900_000);
    expect(wrong.financeCostsPence - right.financeCostsPence).toBe(717_100);
  });
});
