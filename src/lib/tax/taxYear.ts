/** UK tax year runs 6 April → 5 April. Labelled like "2025-26". */

export function getTaxYear(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0 = Jan, 3 = Apr
  const day = date.getUTCDate();
  const afterApril6 = month > 3 || (month === 3 && day >= 6);
  const startYear = afterApril6 ? year : year - 1;
  const endShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endShort}`;
}

export function taxYearRange(taxYear: string): { start: Date; end: Date } {
  const startYear = Number(taxYear.slice(0, 4));
  const start = new Date(Date.UTC(startYear, 3, 6)); // 6 April
  const end = new Date(Date.UTC(startYear + 1, 3, 6)); // exclusive
  return { start, end };
}

/** Tax years for which every rate engine (bands, corporation tax, dividend, NIC) has real config.
 *  Update this list — and each engine's per-year config — when a new year's figures are confirmed. */
export const CONFIGURED_TAX_YEARS = ["2025-26", "2026-27", "2027-28"] as const;

export function latestConfiguredTaxYear(): string {
  return CONFIGURED_TAX_YEARS[CONFIGURED_TAX_YEARS.length - 1];
}

export function isConfiguredTaxYear(taxYear: string): boolean {
  return (CONFIGURED_TAX_YEARS as readonly string[]).includes(taxYear);
}

/** Year values for pickers, newest first. */
export function taxYearOptions(): string[] {
  return [...CONFIGURED_TAX_YEARS].reverse();
}
