import type { Region } from "./types";

export interface TaxBand {
  /** Width of this band in taxable income (pence), above the personal allowance. null = fills to the top threshold. */
  widthPence: number | null;
  /** Marginal rate in basis points (2000 = 20%). */
  rateBps: number;
}

export interface TaxBands {
  personalAllowancePence: number;
  paTaperStartPence: number;
  /** Gross income at which the personal allowance reaches zero and the top rate begins. */
  topThresholdPence: number;
  /** Top rate in basis points (4500 = 45%). */
  topRateBps: number;
  /** Ordered bands below the top rate; the final band must have widthPence: null. */
  bands: TaxBand[];
}

const ENGLAND_WALES_NI_2025_26: TaxBands = {
  personalAllowancePence: 12_570_00,
  paTaperStartPence: 100_000_00,
  topThresholdPence: 125_140_00,
  topRateBps: 4500,
  bands: [
    { widthPence: 37_700_00, rateBps: 2000 },
    { widthPence: null, rateBps: 4000 },
  ],
};

const SCOTLAND_2025_26: TaxBands = {
  personalAllowancePence: 12_570_00,
  paTaperStartPence: 100_000_00,
  topThresholdPence: 125_140_00,
  topRateBps: 4800,
  bands: [
    { widthPence: 2_827_00, rateBps: 1900 },  // starter 19% → £15,397
    { widthPence: 12_094_00, rateBps: 2000 }, // basic 20% → £27,491
    { widthPence: 16_171_00, rateBps: 2100 }, // intermediate 21% → £43,662
    { widthPence: 31_338_00, rateBps: 4200 }, // higher 42% → £75,000
    { widthPence: null, rateBps: 4500 }, // advanced 45% (fills to topThresholdPence; 48% top rate applies above it)
  ],
};

const ENGLAND_WALES_NI_2026_27: TaxBands = {
  // Frozen — identical to 2025-26 (PA/basic-band freeze extended at Budget 2025).
  personalAllowancePence: 12_570_00,
  paTaperStartPence: 100_000_00,
  topThresholdPence: 125_140_00,
  topRateBps: 4500,
  bands: [
    { widthPence: 37_700_00, rateBps: 2000 },
    { widthPence: null, rateBps: 4000 },
  ],
};

const SCOTLAND_2026_27: TaxBands = {
  personalAllowancePence: 12_570_00,
  paTaperStartPence: 100_000_00,
  topThresholdPence: 125_140_00,
  topRateBps: 4800,
  bands: [
    { widthPence: 3_967_00, rateBps: 1900 },  // starter 19% → £16,537
    { widthPence: 12_989_00, rateBps: 2000 }, // basic 20% → £29,526
    { widthPence: 14_136_00, rateBps: 2100 }, // intermediate 21% → £43,662
    { widthPence: 31_338_00, rateBps: 4200 }, // higher 42% → £75,000
    { widthPence: null, rateBps: 4500 }, // advanced 45% (48% top rate applies above £125,140)
  ],
};

const BANDS: Record<string, Partial<Record<Region, TaxBands>>> = {
  "2025-26": { englandWalesNI: ENGLAND_WALES_NI_2025_26, scotland: SCOTLAND_2025_26 },
  "2026-27": { englandWalesNI: ENGLAND_WALES_NI_2026_27, scotland: SCOTLAND_2026_27 },
};

const LATEST_YEAR = "2026-27";

export function getBands(taxYear: string, region: Region): TaxBands {
  const year = BANDS[taxYear] ?? BANDS[LATEST_YEAR];
  const bands = year[region] ?? year.englandWalesNI;
  if (!bands) throw new Error(`No tax bands configured for ${taxYear}/${region}`);
  if (bands.bands.length === 0 || bands.bands[bands.bands.length - 1].widthPence !== null) {
    throw new Error(`Tax bands for ${taxYear}/${region}: the final band must have widthPence: null (fills to the top threshold)`);
  }
  return bands;
}
