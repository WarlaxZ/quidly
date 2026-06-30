import { estimatePropertyTax } from "./incomeTax";
import { financeCostReducer, PROPERTY_ALLOWANCE_PENCE } from "./profit";
import { corporationTax } from "./corporationTax";
import { dividendTax } from "./dividendTax";
import { formatGBP } from "./money";
import type { Region } from "./types";

export interface ScenarioInput {
  incomePence: number;
  expensesPence: number;       // allowable expenses excluding finance
  financeCostsPence: number;   // mortgage / loan interest
  otherIncomePence: number;    // the person's non-property income
  taxYear: string;             // e.g. "2025-26"
  region: Region;              // affects personal income tax only
}

export type OutcomeKey = "personal-actual" | "personal-allowance" | "company-retained" | "company-dividends";

export interface Outcome {
  key: OutcomeKey;
  label: string;
  taxPence: number;     // total tax in this world
  pocketPence: number;  // cash in the person's pocket after all tax
  note: string;
}

export interface ScenarioResult {
  outcomes: Outcome[];
}

export function runScenario(input: ScenarioInput): ScenarioResult {
  const { incomePence, expensesPence, financeCostsPence, otherIncomePence, taxYear, region } = input;

  // Expenses and the mortgage are really paid in every world; subtract them everywhere
  // so pocketPence is directly comparable across outcomes.
  const realCostsPence = expensesPence + financeCostsPence;

  // --- Personal: actual costs ---
  const actualTaxable = Math.max(0, incomePence - expensesPence);
  const actualReducer = financeCostReducer(financeCostsPence, actualTaxable);
  const actualTax = estimatePropertyTax({
    otherIncomePence, taxableProfitPence: actualTaxable, financeReducerPence: actualReducer, taxYear, region,
  }).taxOnPropertyPence;
  const personalActual: Outcome = {
    key: "personal-actual",
    label: "Personal — actual costs",
    taxPence: actualTax,
    pocketPence: incomePence - realCostsPence - actualTax,
    note: "Income tax on your profit, with 20% Section-24 relief on the mortgage interest.",
  };

  // --- Personal: £1,000 property allowance (no finance reducer) ---
  const allowanceTaxable = Math.max(0, incomePence - PROPERTY_ALLOWANCE_PENCE);
  const allowanceTax = estimatePropertyTax({
    otherIncomePence, taxableProfitPence: allowanceTaxable, financeReducerPence: 0, taxYear, region,
  }).taxOnPropertyPence;
  const personalAllowance: Outcome = {
    key: "personal-allowance",
    label: "Personal — £1,000 allowance",
    taxPence: allowanceTax,
    pocketPence: incomePence - realCostsPence - allowanceTax,
    note: "The £1,000 allowance replaces all actual costs — no separate mortgage relief.",
  };

  // --- Company: mortgage fully deductible ---
  const companyProfit = incomePence - realCostsPence;
  const ct = corporationTax(companyProfit, taxYear).taxPence;
  const retainedPence = companyProfit - ct;
  const companyRetained: Outcome = {
    key: "company-retained",
    label: "Company — profits retained",
    taxPence: ct,
    pocketPence: 0, // owner extracts nothing; profit (or loss) stays in the company
    note: companyProfit > 0
      ? `${formatGBP(retainedPence)} kept in the company (not in your pocket until you extract it).`
      : companyProfit === 0
        ? "Company broke even — nothing to retain."
        : "Company made a loss this period — nothing to retain.",
  };

  // --- Company: profits taken as dividends ---
  const distributablePence = Math.max(0, retainedPence);
  const divTax = dividendTax(distributablePence, otherIncomePence, taxYear);
  const companyDividends: Outcome = {
    key: "company-dividends",
    label: "Company — taken as dividends",
    taxPence: ct + divTax,
    pocketPence: companyProfit - ct - divTax,
    note: "Corporation tax, then dividend tax to take the profit out to yourself.",
  };

  return { outcomes: [personalActual, personalAllowance, companyRetained, companyDividends] };
}
