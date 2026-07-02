/** HMRC simplified motoring rate for landlords: 45p/mile for the first 10,000 business
 *  miles in a tax year, 25p thereafter. Per-year config — VERIFY against HMRC each April. */
export interface MileageRates {
  firstRatePence: number; // pence per mile up to the threshold
  afterRatePence: number; // pence per mile beyond the threshold
  thresholdMiles: number;
}

const MILEAGE_2025_26: MileageRates = { firstRatePence: 45, afterRatePence: 25, thresholdMiles: 10_000 };
const MILEAGE_2026_27: MileageRates = { firstRatePence: 45, afterRatePence: 25, thresholdMiles: 10_000 };
const MILEAGE_2027_28: MileageRates = { firstRatePence: 45, afterRatePence: 25, thresholdMiles: 10_000 };

const MILEAGE_RATES: Record<string, MileageRates> = {
  "2025-26": MILEAGE_2025_26,
  "2026-27": MILEAGE_2026_27,
  "2027-28": MILEAGE_2027_28,
};
const LATEST_MILEAGE: MileageRates = MILEAGE_2027_28;

export function mileageRatesFor(taxYear: string): MileageRates {
  return MILEAGE_RATES[taxYear] ?? LATEST_MILEAGE;
}

/**
 * Claimable pence for a trip of `milesThisTrip`, given `cumulativeMilesBefore` business
 * miles already claimed this tax year (applies the 10,000-mile band split). Integer pence,
 * no floating point (miles and pence-per-mile are integers).
 */
export function mileageClaimPence(milesThisTrip: number, cumulativeMilesBefore: number, taxYear: string): number {
  const r = mileageRatesFor(taxYear);
  const miles = Math.max(0, Math.round(milesThisTrip));
  const before = Math.max(0, Math.round(cumulativeMilesBefore));
  const firstRemaining = Math.max(0, r.thresholdMiles - before);
  const atFirst = Math.min(miles, firstRemaining);
  const atAfter = miles - atFirst;
  return atFirst * r.firstRatePence + atAfter * r.afterRatePence;
}

export interface MileageSummary {
  totalMiles: number;
  totalPence: number;
  remainingAt45p: number;
}

/** Totals for the mileage log's summary line. remainingAt45p clamps at 0 past the threshold. */
export function mileageSummary(trips: { miles: number; amountPence: number }[], taxYear: string): MileageSummary {
  const totalMiles = trips.reduce((sum, t) => sum + (t.miles ?? 0), 0);
  const totalPence = trips.reduce((sum, t) => sum + (t.amountPence ?? 0), 0);
  const remainingAt45p = Math.max(0, mileageRatesFor(taxYear).thresholdMiles - totalMiles);
  return { totalMiles, totalPence, remainingAt45p };
}
