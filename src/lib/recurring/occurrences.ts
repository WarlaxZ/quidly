export type IntervalUnit = "DAY" | "WEEK" | "MONTH" | "YEAR";

export interface OccurrenceRule {
  intervalUnit: IntervalUnit;
  intervalCount: number;
  dayOfWeek: number | null; // 0=Mon .. 6=Sun (WEEK units)
  dayOfMonth: number | null; // 1..31; 31 acts as "last day" (MONTH/YEAR units)
  monthOfYear: number | null; // 1..12 (YEAR units); falls back to startDate month when null
  startDate: Date;
  endDate: Date | null;
  lastGeneratedDate: Date | null;
}

const MAX_ITER = 1200;

function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** JS getUTCDay is 0=Sun..6=Sat; convert to 0=Mon..6=Sun. */
function weekdayMon0(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

/** Clamp a Y/M/day to the month's real last day (handles day 31 in short months). */
function dateOn(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

/**
 * Occurrence dates from startDate up to and including asOf, honouring endDate
 * and skipping anything on/before lastGeneratedDate.
 */
export function recurringOccurrences(rule: OccurrenceRule, asOf: Date, maxIter = MAX_ITER): Date[] {
  const out: Date[] = [];
  const start = dateOnly(rule.startDate);
  const emit = (occ: Date): "stop" | "cont" => {
    if (occ > asOf) return "stop";
    if (rule.endDate && occ > rule.endDate) return "stop";
    const afterStart = occ >= start;
    const afterLast = !rule.lastGeneratedDate || occ > rule.lastGeneratedDate;
    if (afterStart && afterLast) out.push(occ);
    return "cont";
  };

  const count = Math.max(1, rule.intervalCount);

  if (rule.intervalUnit === "DAY" || rule.intervalUnit === "WEEK") {
    const stepDays = rule.intervalUnit === "WEEK" ? count * 7 : count;
    let occ = new Date(start);
    if (rule.intervalUnit === "WEEK") {
      const target = rule.dayOfWeek ?? weekdayMon0(occ);
      const delta = (target - weekdayMon0(occ) + 7) % 7;
      occ.setUTCDate(occ.getUTCDate() + delta);
    }
    for (let i = 0; i < maxIter; i++) {
      if (emit(occ) === "stop") break;
      const next = new Date(occ);
      next.setUTCDate(next.getUTCDate() + stepDays);
      occ = next;
    }
    return out;
  }

  // MONTH / YEAR
  const stepMonths = rule.intervalUnit === "YEAR" ? 12 * count : count;
  const day = rule.dayOfMonth ?? rule.startDate.getUTCDate();
  let year = rule.startDate.getUTCFullYear();
  let month =
    rule.intervalUnit === "YEAR" && rule.monthOfYear != null
      ? rule.monthOfYear - 1
      : rule.startDate.getUTCMonth();
  for (let i = 0; i < maxIter; i++) {
    const occ = dateOn(year, month, day);
    if (emit(occ) === "stop") break;
    month += stepMonths;
    year += Math.floor(month / 12);
    month = ((month % 12) + 12) % 12;
  }
  return out;
}

/**
 * The next `count` occurrences strictly after `after` (ignores lastGeneratedDate,
 * honours endDate). Used for "next due" and the form's live preview.
 */
export function upcomingOccurrences(rule: OccurrenceRule, after: Date, count: number): Date[] {
  const horizon = new Date(after);
  horizon.setUTCFullYear(horizon.getUTCFullYear() + 5);
  const all = recurringOccurrences({ ...rule, lastGeneratedDate: null }, horizon, 5000);
  const res: Date[] = [];
  for (const d of all) {
    if (d > after) {
      res.push(d);
      if (res.length >= count) break;
    }
  }
  return res;
}
