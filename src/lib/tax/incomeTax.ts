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
  const bands = getBands(taxYear, region);
  // Base: ordinary-rate marginal tax on the property slice (unchanged behaviour).
  const base =
    incomeTaxOn(otherIncomePence + taxableProfitPence, taxYear, region) -
    incomeTaxOn(otherIncomePence, taxYear, region);
  // Property surcharge (2027-28+ E/W/NI): uniform +Xbps across every property band including the top
  // rate, so it is a flat surcharge on the taxable portion of the property income (the part above PA).
  const surchargeBps = bands.propertyRateSurchargeBps ?? 0;
  const pa = effectivePersonalAllowance(otherIncomePence + taxableProfitPence, bands);
  const totalTaxable = Math.max(0, otherIncomePence + taxableProfitPence - pa);
  const otherTaxable = Math.max(0, otherIncomePence - pa);
  const taxableProperty = Math.max(0, totalTaxable - otherTaxable);
  const surchargeTax = Math.round((taxableProperty * surchargeBps) / 10000);
  const gross = base + surchargeTax;
  const taxOnPropertyPence = Math.max(0, gross - financeReducerPence);
  const marginalRate = taxableProfitPence > 0 ? gross / taxableProfitPence : 0;
  return { taxOnPropertyPence, marginalRate };
}
