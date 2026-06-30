import type { Region } from "./types";

export interface TaxBands {
  personalAllowancePence: number;
  basicRateLimitPence: number;
  higherRateLimitPence: number;
  paTaperStartPence: number;
  basicRate: number;
  higherRate: number;
  additionalRate: number;
}

const ENGLAND_WALES_NI_2025_26: TaxBands = {
  personalAllowancePence: 12_570_00,
  basicRateLimitPence: 37_700_00,
  higherRateLimitPence: 125_140_00,
  paTaperStartPence: 100_000_00,
  basicRate: 0.2,
  higherRate: 0.4,
  additionalRate: 0.45,
};

const BANDS: Record<string, Partial<Record<Region, TaxBands>>> = {
  "2025-26": { englandWalesNI: ENGLAND_WALES_NI_2025_26 },
};

const LATEST_YEAR = "2025-26";

export function getBands(taxYear: string, region: Region): TaxBands {
  const year = BANDS[taxYear] ?? BANDS[LATEST_YEAR];
  // Scotland is intentionally not yet configured — it deliberately falls back to
  // England/Wales/NI bands until Scottish bands are added. Do not "fix" this.
  const bands = year[region] ?? year.englandWalesNI;
  if (!bands) throw new Error(`No tax bands configured for ${taxYear}/${region}`);
  return bands;
}
