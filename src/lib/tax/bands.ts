import type { Region } from "./types";

export interface TaxBand {
  /** Width of this band in taxable income (pence), above the personal allowance. null = fills to the top threshold. */
  widthPence: number | null;
  rate: number;
}

export interface TaxBands {
  personalAllowancePence: number;
  paTaperStartPence: number;
  /** Gross income at which the personal allowance reaches zero and the top rate begins. */
  topThresholdPence: number;
  topRate: number;
  /** Ordered bands below the top rate; the final band must have widthPence: null. */
  bands: TaxBand[];
}

const ENGLAND_WALES_NI_2025_26: TaxBands = {
  personalAllowancePence: 12_570_00,
  paTaperStartPence: 100_000_00,
  topThresholdPence: 125_140_00,
  topRate: 0.45,
  bands: [
    { widthPence: 37_700_00, rate: 0.2 },
    { widthPence: null, rate: 0.4 },
  ],
};

const SCOTLAND_2025_26: TaxBands = {
  personalAllowancePence: 12_570_00,
  paTaperStartPence: 100_000_00,
  topThresholdPence: 125_140_00,
  topRate: 0.48,
  bands: [
    { widthPence: 2_306_00, rate: 0.19 },
    { widthPence: 11_685_00, rate: 0.2 },
    { widthPence: 17_101_00, rate: 0.21 },
    { widthPence: 31_338_00, rate: 0.42 },
    { widthPence: null, rate: 0.45 },
  ],
};

const BANDS: Record<string, Partial<Record<Region, TaxBands>>> = {
  "2025-26": { englandWalesNI: ENGLAND_WALES_NI_2025_26, scotland: SCOTLAND_2025_26 },
};

const LATEST_YEAR = "2025-26";

export function getBands(taxYear: string, region: Region): TaxBands {
  const year = BANDS[taxYear] ?? BANDS[LATEST_YEAR];
  const bands = year[region] ?? year.englandWalesNI;
  if (!bands) throw new Error(`No tax bands configured for ${taxYear}/${region}`);
  return bands;
}
