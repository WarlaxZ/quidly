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

  const basicBand = bands.basicRateLimitPence;
  const higherBand = bands.higherRateLimitPence - pa - basicBand;

  let tax = 0;
  const basic = Math.min(taxable, basicBand);
  tax += basic * bands.basicRate;
  const higher = Math.min(Math.max(0, taxable - basicBand), Math.max(0, higherBand));
  tax += higher * bands.higherRate;
  const additional = Math.max(0, taxable - basicBand - Math.max(0, higherBand));
  tax += additional * bands.additionalRate;

  return Math.round(tax);
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
