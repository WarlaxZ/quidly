import { corporationTax } from "./corporationTax";
import { incomeTaxOn } from "./incomeTax";
import { dividendTax } from "./dividendTax";
import { employerNIC, employeeNIC, nicRates } from "./nic";
import type { Region } from "./types";

const SWEEP_CAP_PENCE = 12_570_00; // optimum lies within [0, personal allowance]
const SWEEP_STEP_PENCE = 10_00;    // £10 grid
const CURVE_POINTS = 20;

export interface ExtractionInput {
  profitBeforeSalaryPence: number;
  otherIncomePence: number;
  taxYear: string;
  region: Region;
  employmentAllowance: boolean;
}
export interface ExtractionOutcome {
  salaryPence: number;
  dividendPence: number;
  employerNicPence: number;
  corporationTaxPence: number;
  employeeNicPence: number;
  incomeTaxPence: number;
  dividendTaxPence: number;
  totalTaxPence: number;
  takeHomePence: number;
}
export type StrategyKey = "none" | "secondary" | "allowance" | "optimum";
export interface StrategyRow { key: StrategyKey; label: string; outcome: ExtractionOutcome; }
export interface ExtractionResult {
  recommended: ExtractionOutcome;
  strategies: StrategyRow[];
  curve: { salaryPence: number; takeHomePence: number }[];
}

/** One salary scenario, running the full model. */
export function extractionOutcome(salaryPence: number, input: ExtractionInput): ExtractionOutcome {
  const { profitBeforeSalaryPence, otherIncomePence, taxYear, region, employmentAllowance } = input;
  const salary = Math.max(0, salaryPence);
  const eaBudget = employmentAllowance ? nicRates(taxYear).employmentAllowancePence : 0;

  const employerNicPence = employerNIC(salary, taxYear, eaBudget);
  const companyTaxableProfit = Math.max(0, profitBeforeSalaryPence - salary - employerNicPence);
  const corporationTaxPence = corporationTax(companyTaxableProfit, taxYear).taxPence;
  const dividendPence = Math.max(0, companyTaxableProfit - corporationTaxPence);

  const employeeNicPence = employeeNIC(salary, taxYear);
  const incomeTaxPence = Math.max(0, incomeTaxOn(otherIncomePence + salary, taxYear, region) - incomeTaxOn(otherIncomePence, taxYear, region));
  const dividendTaxPence = dividendTax(dividendPence, otherIncomePence + salary, taxYear);

  const totalTaxPence = employerNicPence + corporationTaxPence + employeeNicPence + incomeTaxPence + dividendTaxPence;
  const takeHomePence = salary + dividendPence - employeeNicPence - incomeTaxPence - dividendTaxPence;

  return { salaryPence: salary, dividendPence, employerNicPence, corporationTaxPence, employeeNicPence, incomeTaxPence, dividendTaxPence, totalTaxPence, takeHomePence };
}

export function optimiseExtraction(input: ExtractionInput): ExtractionResult {
  const profit = input.profitBeforeSalaryPence;
  if (profit <= 0) {
    const zero = extractionOutcome(0, input);
    return { recommended: zero, strategies: [{ key: "none", label: "No salary", outcome: zero }], curve: [{ salaryPence: 0, takeHomePence: zero.takeHomePence }] };
  }

  const eaBudget = input.employmentAllowance ? nicRates(input.taxYear).employmentAllowancePence : 0;
  // A salary is only affordable if the company can also fund its employer NIC out of profit.
  const affordable = (s: number) => s + employerNIC(s, input.taxYear, eaBudget) <= profit;

  // Largest affordable salary within [0, personal-allowance cap]. 0 is always affordable (profit > 0).
  const cap = Math.min(profit, SWEEP_CAP_PENCE);
  let maxAffordable = 0;
  for (let s = 0; s <= cap; s += SWEEP_STEP_PENCE) if (affordable(s)) maxAffordable = s;
  if (affordable(cap) && cap > maxAffordable) maxAffordable = cap;

  const namedSalaries = [0, Math.min(5_000_00, maxAffordable), Math.min(12_570_00, maxAffordable)];
  const curveSalaries = Array.from({ length: CURVE_POINTS + 1 }, (_, i) => Math.round((maxAffordable * i) / CURVE_POINTS));

  const candidates = new Set<number>(curveSalaries);
  for (let s = 0; s <= maxAffordable; s += SWEEP_STEP_PENCE) candidates.add(s);
  candidates.add(maxAffordable);
  for (const s of namedSalaries) candidates.add(s);
  const sorted = [...candidates].sort((a, b) => a - b);

  let recommended = extractionOutcome(sorted[0], input);
  for (const s of sorted) {
    const o = extractionOutcome(s, input);
    if (o.takeHomePence > recommended.takeHomePence) recommended = o; // strict > → ties keep the lower salary
  }

  const strategies: StrategyRow[] = [
    { key: "none", label: "No salary", outcome: extractionOutcome(namedSalaries[0], input) },
    { key: "secondary", label: "Salary to £5,000", outcome: extractionOutcome(namedSalaries[1], input) },
    { key: "allowance", label: "Salary to £12,570", outcome: extractionOutcome(namedSalaries[2], input) },
    { key: "optimum", label: "Optimum", outcome: recommended },
  ];
  const curve = curveSalaries.map((s) => ({ salaryPence: s, takeHomePence: extractionOutcome(s, input).takeHomePence }));

  return { recommended, strategies, curve };
}
