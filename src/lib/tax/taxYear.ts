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
