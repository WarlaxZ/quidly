export type RecurFrequency = "monthly" | "quarterly" | "annual";

export interface OccurrenceRule {
  frequency: RecurFrequency;
  dayOfMonth: number;
  startDate: Date;
  endDate: Date | null;
  lastGeneratedDate: Date | null;
}

const STEP_MONTHS: Record<RecurFrequency, number> = { monthly: 1, quarterly: 3, annual: 12 };

function dateOn(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

export function recurringOccurrences(rule: OccurrenceRule, asOf: Date): Date[] {
  const step = STEP_MONTHS[rule.frequency];
  const out: Date[] = [];
  let year = rule.startDate.getUTCFullYear();
  let month = rule.startDate.getUTCMonth();

  for (let i = 0; i < 1200; i++) {
    const occ = dateOn(year, month, rule.dayOfMonth);
    if (occ > asOf) break;
    if (rule.endDate && occ > rule.endDate) break;
    const afterStart = occ >= rule.startDate;
    const afterLast = !rule.lastGeneratedDate || occ > rule.lastGeneratedDate;
    if (afterStart && afterLast) out.push(occ);
    month += step;
    year += Math.floor(month / 12);
    month = month % 12;
  }
  return out;
}
