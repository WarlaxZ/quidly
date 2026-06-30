const DAY_MS = 24 * 60 * 60 * 1000;

export function companyAccountingPeriod(yearEndDay: number, yearEndMonth: number, periodYear: number): { start: Date; end: Date } {
  const end = new Date(Date.UTC(periodYear, yearEndMonth - 1, yearEndDay));
  const previousYearEnd = new Date(Date.UTC(periodYear - 1, yearEndMonth - 1, yearEndDay));
  const start = new Date(previousYearEnd.getTime() + DAY_MS);
  return { start, end };
}
