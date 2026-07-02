import { upcomingOccurrences, type OccurrenceRule } from "./occurrences";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function dayOfMonthLabel(day: number): string {
  return day >= 31 ? "the last day" : `the ${ordinal(day)}`;
}

export function describeSchedule(rule: OccurrenceRule): string {
  const n = Math.max(1, rule.intervalCount);
  switch (rule.intervalUnit) {
    case "DAY":
      return n === 1 ? "Daily" : `Every ${n} days`;
    case "WEEK": {
      const name = rule.dayOfWeek == null ? null : WEEKDAYS[rule.dayOfWeek];
      if (n === 1) return name ? `Weekly on ${name}` : "Weekly";
      if (n === 2) return name ? `Fortnightly on ${name}s` : "Fortnightly";
      return name ? `Every ${n} weeks on ${name}` : `Every ${n} weeks`;
    }
    case "MONTH": {
      const on = rule.dayOfMonth != null ? ` on ${dayOfMonthLabel(rule.dayOfMonth)}` : "";
      if (n === 1) return `Monthly${on}`;
      if (n === 3) return `Quarterly${on}`;
      return `Every ${n} months${on}`;
    }
    case "YEAR": {
      const day = rule.dayOfMonth ?? rule.startDate.getUTCDate();
      const monthIdx = (rule.monthOfYear ?? rule.startDate.getUTCMonth() + 1) - 1;
      const label = `${day} ${MONTHS[monthIdx]}`;
      return n === 1 ? `Yearly on ${label}` : `Every ${n} years on ${label}`;
    }
  }
}

export function nextDueDate(
  rule: OccurrenceRule & { active?: boolean },
  asOf: Date,
): Date | null {
  if (rule.active === false) return null;
  return upcomingOccurrences(rule, asOf, 1)[0] ?? null;
}
