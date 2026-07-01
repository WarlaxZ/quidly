const DAY_MS = 24 * 60 * 60 * 1000;

export function companyAccountingPeriod(yearEndDay: number, yearEndMonth: number, periodYear: number): { start: Date; end: Date } {
  const end = new Date(Date.UTC(periodYear, yearEndMonth - 1, yearEndDay));
  const previousYearEnd = new Date(Date.UTC(periodYear - 1, yearEndMonth - 1, yearEndDay));
  const start = new Date(previousYearEnd.getTime() + DAY_MS);
  return { start, end };
}

/** The accounting-period year that a given date falls in, for a company with this year-end.
 *  e.g. year-end 31 Dec: 2025-06-01 → 2025. Year-end 31 Mar: 2025-06-01 → 2026. */
export function companyPeriodYearOf(date: Date, yearEndDay: number, yearEndMonth: number): number {
  const y = date.getUTCFullYear();
  // Compare date-only (UTC midnight) so a non-midnight timestamp on the year-end day
  // is not pushed into the next period.
  const dateUTCMidnight = Date.UTC(y, date.getUTCMonth(), date.getUTCDate());
  const endThisCalendarYear = Date.UTC(y, yearEndMonth - 1, yearEndDay);
  return dateUTCMidnight <= endThisCalendarYear ? y : y + 1;
}
