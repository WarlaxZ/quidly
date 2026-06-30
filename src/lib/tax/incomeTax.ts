import { getBands } from "./bands";
import type { Region } from "./types";

function effectivePersonalAllowance(totalIncomePence: number, bands: ReturnType<typeof getBands>): number {
  if (totalIncomePence <= bands.paTaperStartPence) return bands.personalAllowancePence;
  const excess = totalIncomePence - bands.paTaperStartPence;
  const reduced = bands.personalAllowancePence - Math.floor(excess / 2);
  return Math.max(0, reduced);
}

export function incomeTaxOn(totalIncomePence: number, taxYear: string, region: Region): number {
  const bands = getBands(taxYear, region);
  const pa = effectivePersonalAllowance(totalIncomePence, bands);
  const taxable = Math.max(0, totalIncomePence - pa);

  const cap = Math.max(0, bands.topThresholdPence - pa);
  let remaining = Math.min(taxable, cap);
  let taxNumerator = 0; // sum of (taxable pence × basis points); divided by 10,000 once at the end

  for (const band of bands.bands) {
    if (remaining <= 0) break;
    const width = band.widthPence ?? remaining;
    const slice = Math.min(remaining, width);
    taxNumerator += slice * band.rateBps;
    remaining -= slice;
  }

  const aboveCap = Math.max(0, taxable - cap);
  taxNumerator += aboveCap * bands.topRateBps;

  return Math.round(taxNumerator / 10000);
}

export interface PropertyTaxInput {
  otherIncomePence: number;
  taxableProfitPence: number;
  financeReducerPence: number;
  taxYear: string;
  region: Region;
}

export interface PropertyTaxResult {
  taxOnPropertyPence: number;
  marginalRate: number;
}

export function estimatePropertyTax(input: PropertyTaxInput): PropertyTaxResult {
  const { otherIncomePence, taxableProfitPence, financeReducerPence, taxYear, region } = input;
  const taxWith = incomeTaxOn(otherIncomePence + taxableProfitPence, taxYear, region);
  const taxWithout = incomeTaxOn(otherIncomePence, taxYear, region);
  const gross = taxWith - taxWithout;
  const taxOnPropertyPence = Math.max(0, gross - financeReducerPence);
  const marginalRate = taxableProfitPence > 0 ? gross / taxableProfitPence : 0;
  return { taxOnPropertyPence, marginalRate };
}
