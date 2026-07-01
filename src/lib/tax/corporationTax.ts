import type { TaxTxn } from "./types";

export interface CompanyProfit {
  incomePence: number;
  expensesPence: number;
  profitPence: number;
}

export function companyTaxableProfit(txns: TaxTxn[]): CompanyProfit {
  let incomePence = 0;
  let expensesPence = 0;
  for (const tx of txns) {
    if (!tx.allowable) continue;
    if (tx.categoryKind === "income") incomePence += tx.amountPence;
    else if (tx.categoryKind === "expense" || tx.categoryKind === "finance") expensesPence += tx.amountPence;
  }
  return { incomePence, expensesPence, profitPence: incomePence - expensesPence };
}

export interface CTRates {
  lowerLimitPence: number;
  upperLimitPence: number;
  smallBps: number;             // basis points (1900 = 19%)
  mainBps: number;              // basis points (2500 = 25%)
  marginalFractionBps: number;  // basis points: 150 = 1.5% (the 3/200 marginal-relief fraction)
}

const CT_2025_26: CTRates = {
  lowerLimitPence: 50_000_00,
  upperLimitPence: 250_000_00,
  smallBps: 1900,
  mainBps: 2500,
  marginalFractionBps: 150,
};

const CT_2026_27: CTRates = {
  // Unchanged from 2025-26.
  lowerLimitPence: 50_000_00,
  upperLimitPence: 250_000_00,
  smallBps: 1900,
  mainBps: 2500,
  marginalFractionBps: 150,
};

const CT_RATES: Record<string, CTRates> = { "2025-26": CT_2025_26, "2026-27": CT_2026_27 };
const LATEST_CT_YEAR = "2026-27";

export interface CorporationTaxResult {
  taxPence: number;
  effectiveRate: number;
  band: "small" | "marginal" | "main";
}

/**
 * Corporation tax on a company's profit. v1 assumes a single standalone company, a full
 * 12-month accounting period, and a single CT financial year's rates (no associated-company
 * threshold division, no period pro-rating, no FY-straddle apportionment).
 */
export function corporationTax(profitPence: number, year: string = LATEST_CT_YEAR): CorporationTaxResult {
  const r = CT_RATES[year] ?? CT_RATES[LATEST_CT_YEAR];
  if (profitPence <= 0) return { taxPence: 0, effectiveRate: 0, band: "small" };
  let taxPence: number;
  let band: "small" | "marginal" | "main";
  if (profitPence <= r.lowerLimitPence) {
    taxPence = Math.round(profitPence * r.smallBps / 10000);
    band = "small";
  } else if (profitPence >= r.upperLimitPence) {
    taxPence = Math.round(profitPence * r.mainBps / 10000);
    band = "main";
  } else {
    taxPence = Math.round((profitPence * r.mainBps - (r.upperLimitPence - profitPence) * r.marginalFractionBps) / 10000);
    band = "marginal";
  }
  return { taxPence, effectiveRate: taxPence / profitPence, band };
}
