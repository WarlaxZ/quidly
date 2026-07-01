import { dividendTax } from "./dividendTax";

export interface DividendYearInput {
  taxYear: string;
  dividendPence: number;
  otherIncomePence: number;
}
export interface DividendYearTax {
  taxYear: string;
  dividendPence: number;
  taxPence: number;
}

/** Estimate dividend tax for each tax year's dividend total (top-slice of other income). */
export function dividendTaxForYears(rows: DividendYearInput[]): DividendYearTax[] {
  return rows.map((r) => ({
    taxYear: r.taxYear,
    dividendPence: r.dividendPence,
    taxPence: dividendTax(r.dividendPence, r.otherIncomePence, r.taxYear),
  }));
}
