# Recurring Payments Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/recurring` page show what/who each payment is, support weekly/day-of-week/fortnightly/daily/custom schedules, allow editing and pause/resume, show next-due dates, and teach the Akaunting importer the new schedule model.

**Architecture:** Replace `RecurringRule`'s fixed `frequency` enum with a general interval model (`intervalUnit` × `intervalCount` + `dayOfWeek`/`dayOfMonth`/`monthOfYear`). Pure date modules (`occurrences.ts`, new `describe.ts`) drive both server-side generation and the client form's live preview. UI gains a redesigned rich table, an adaptive `RecurringForm` client component reused by an add form and a new edit route, and new server actions for update / pause-resume. The importer maps Akaunting's previously-dropped frequencies onto the new model.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 + better-sqlite3, React 19, Vitest, TypeScript, Tailwind v4.

**⚠️ Build-green ordering note:** Tasks 1–2 change/add pure modules and run only their own Vitest files (esbuild transpiles per-file, so a full `tsc` will be red until Task 3 reconciles the DB consumers). The first task that leaves `npm run typecheck` fully green is **Task 3**. Don't run `npm run typecheck` expecting green before then.

**Day-of-week encoding (used everywhere):** `0 = Monday … 6 = Sunday`. JS `Date.getUTCDay()` is `0 = Sunday`, so convert with `(getUTCDay() + 6) % 7`.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/lib/recurring/occurrences.ts` | Modify | Pure date math: `OccurrenceRule` interval model, `recurringOccurrences`, `upcomingOccurrences`. |
| `src/lib/recurring/occurrences.test.ts` | Modify | Tests for all units. |
| `src/lib/recurring/describe.ts` | Create | Pure: `describeSchedule` (human text) + `nextDueDate`. |
| `src/lib/recurring/describe.test.ts` | Create | Tests for describe/next-due. |
| `prisma/schema.prisma` | Modify | Replace `RecurFrequency` with `IntervalUnit`; new `RecurringRule` fields. |
| `prisma/migrations/20260702140000_recurring_interval_model/migration.sql` | Create | Table rebuild + data backfill. |
| `src/lib/data/recurring.ts` | Modify | `RecurringInput`, create/update/setActive/get, `materialiseDue`. |
| `src/lib/data/recurring.test.ts` | Modify | Data-layer tests incl. pause/resume. |
| `src/app/(app)/recurring/actions.ts` | Modify | add/update/setActive actions + validation. |
| `src/app/(app)/recurring/RecurringForm.tsx` | Create | Client: adaptive schedule builder + live preview. |
| `src/app/(app)/recurring/page.tsx` | Modify | Rich table (layout A) + add-form host. |
| `src/app/(app)/recurring/[id]/edit/page.tsx` | Create | Edit route. |
| `scripts/migrate-akaunting/types.ts` | Modify | `RecurringRulePayload` new fields. |
| `scripts/migrate-akaunting/transform.ts` | Modify | `mapSchedule` replaces `mapFrequency`. |
| `scripts/migrate-akaunting/apply.ts` | Modify | Create with new fields. |
| `scripts/migrate-akaunting/report.ts` | Modify | Human schedule string via `describeSchedule`. |
| `scripts/migrate-akaunting/transform.test.ts` | Modify | Weekly/daily now import. |
| `scripts/migrate-akaunting/apply.test.ts` | Modify | Assert new fields. |

`src/lib/data/property.ts` uses only `recurringRule.count(...)` — **no change needed**. `prisma/seed.ts` does not touch recurring rules — **no change needed**.

---

## Task 1: Interval-model occurrence engine (pure)

**Files:**
- Modify: `src/lib/recurring/occurrences.ts`
- Test: `src/lib/recurring/occurrences.test.ts`

- [ ] **Step 1: Replace the test file with interval-model cases**

Overwrite `src/lib/recurring/occurrences.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { recurringOccurrences, upcomingOccurrences, type OccurrenceRule } from "./occurrences";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const base: Omit<OccurrenceRule, "intervalUnit" | "intervalCount"> = {
  dayOfWeek: null, dayOfMonth: null, monthOfYear: null,
  startDate: new Date("2025-01-01"), endDate: null, lastGeneratedDate: null,
};

describe("recurringOccurrences — month/year", () => {
  it("lists monthly occurrences up to asOf", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1, startDate: new Date("2025-01-01") },
        new Date("2025-03-15"),
      ).map(iso),
    ).toEqual(["2025-01-01", "2025-02-01", "2025-03-01"]);
  });

  it("skips occurrences on or before lastGeneratedDate", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1, startDate: new Date("2025-01-01"), lastGeneratedDate: new Date("2025-02-01") },
        new Date("2025-04-15"),
      ).map(iso),
    ).toEqual(["2025-03-01", "2025-04-01"]);
  });

  it("clamps dayOfMonth 31 to each month's real last day", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 31, startDate: new Date("2025-01-31") },
        new Date("2025-02-28"),
      ).map(iso),
    ).toEqual(["2025-01-31", "2025-02-28"]);
  });

  it("respects endDate and quarterly (MONTH x3) steps", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "MONTH", intervalCount: 3, dayOfMonth: 15, startDate: new Date("2025-01-15"), endDate: new Date("2025-08-01") },
        new Date("2025-12-31"),
      ).map(iso),
    ).toEqual(["2025-01-15", "2025-04-15", "2025-07-15"]);
  });

  it("annual (YEAR) falls back to startDate month when monthOfYear is null", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "YEAR", intervalCount: 1, dayOfMonth: 10, startDate: new Date("2025-05-10") },
        new Date("2027-01-01"),
      ).map(iso),
    ).toEqual(["2025-05-10", "2026-05-10"]);
  });

  it("annual uses monthOfYear when provided", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "YEAR", intervalCount: 1, dayOfMonth: 6, monthOfYear: 4, startDate: new Date("2025-01-01") },
        new Date("2027-01-01"),
      ).map(iso),
    ).toEqual(["2025-04-06", "2026-04-06"]);
  });
});

describe("recurringOccurrences — week/day", () => {
  it("weekly anchors to dayOfWeek (Mon=0) on/after startDate", () => {
    // 2025-01-01 is a Wednesday. First Monday on/after is 2025-01-06.
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "WEEK", intervalCount: 1, dayOfWeek: 0, startDate: new Date("2025-01-01") },
        new Date("2025-01-27"),
      ).map(iso),
    ).toEqual(["2025-01-06", "2025-01-13", "2025-01-20", "2025-01-27"]);
  });

  it("fortnightly (WEEK x2) steps 14 days", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "WEEK", intervalCount: 2, dayOfWeek: 0, startDate: new Date("2025-01-01") },
        new Date("2025-02-03"),
      ).map(iso),
    ).toEqual(["2025-01-06", "2025-01-20", "2025-02-03"]);
  });

  it("daily steps one day", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "DAY", intervalCount: 1, startDate: new Date("2025-01-01") },
        new Date("2025-01-04"),
      ).map(iso),
    ).toEqual(["2025-01-01", "2025-01-02", "2025-01-03", "2025-01-04"]);
  });

  it("every-3-days honours interval count", () => {
    expect(
      recurringOccurrences(
        { ...base, intervalUnit: "DAY", intervalCount: 3, startDate: new Date("2025-01-01") },
        new Date("2025-01-10"),
      ).map(iso),
    ).toEqual(["2025-01-01", "2025-01-04", "2025-01-07", "2025-01-10"]);
  });
});

describe("upcomingOccurrences", () => {
  it("returns the next N occurrences on/after a point", () => {
    const rule: OccurrenceRule = { ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1, startDate: new Date("2025-01-01") };
    // strictly after 2024-12-31 → first three from Jan
    expect(upcomingOccurrences(rule, new Date("2024-12-31"), 3).map(iso)).toEqual(["2025-01-01", "2025-02-01", "2025-03-01"]);
  });

  it("ignores lastGeneratedDate (forward preview)", () => {
    const rule: OccurrenceRule = { ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1, startDate: new Date("2025-01-01"), lastGeneratedDate: new Date("2025-06-01") };
    expect(upcomingOccurrences(rule, new Date("2024-12-31"), 2).map(iso)).toEqual(["2025-01-01", "2025-02-01"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/recurring/occurrences.test.ts`
Expected: FAIL — `upcomingOccurrences` not exported / `OccurrenceRule` shape mismatch.

- [ ] **Step 3: Rewrite `occurrences.ts` to the interval model**

Overwrite `src/lib/recurring/occurrences.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/recurring/occurrences.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurring/occurrences.ts src/lib/recurring/occurrences.test.ts
git commit -m "feat(recurring): interval-model occurrence engine (day/week/month/year)"
```

---

## Task 2: Human-readable schedule + next-due (pure)

**Files:**
- Create: `src/lib/recurring/describe.ts`
- Test: `src/lib/recurring/describe.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/recurring/describe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeSchedule, nextDueDate } from "./describe";
import type { OccurrenceRule } from "./occurrences";

const base: Omit<OccurrenceRule, "intervalUnit" | "intervalCount"> = {
  dayOfWeek: null, dayOfMonth: null, monthOfYear: null,
  startDate: new Date("2025-01-01"), endDate: null, lastGeneratedDate: null,
};

describe("describeSchedule", () => {
  it("daily / every-n-days", () => {
    expect(describeSchedule({ ...base, intervalUnit: "DAY", intervalCount: 1 })).toBe("Daily");
    expect(describeSchedule({ ...base, intervalUnit: "DAY", intervalCount: 3 })).toBe("Every 3 days");
  });
  it("weekly / fortnightly with weekday", () => {
    expect(describeSchedule({ ...base, intervalUnit: "WEEK", intervalCount: 1, dayOfWeek: 0 })).toBe("Weekly on Monday");
    expect(describeSchedule({ ...base, intervalUnit: "WEEK", intervalCount: 2, dayOfWeek: 0 })).toBe("Fortnightly on Mondays");
    expect(describeSchedule({ ...base, intervalUnit: "WEEK", intervalCount: 3, dayOfWeek: 4 })).toBe("Every 3 weeks on Friday");
  });
  it("monthly / quarterly with day + last-day", () => {
    expect(describeSchedule({ ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1 })).toBe("Monthly on the 1st");
    expect(describeSchedule({ ...base, intervalUnit: "MONTH", intervalCount: 3, dayOfMonth: 5 })).toBe("Quarterly on the 5th");
    expect(describeSchedule({ ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 31 })).toBe("Monthly on the last day");
  });
  it("yearly with month + day", () => {
    expect(describeSchedule({ ...base, intervalUnit: "YEAR", intervalCount: 1, dayOfMonth: 6, monthOfYear: 4 })).toBe("Yearly on 6 April");
  });
});

describe("nextDueDate", () => {
  it("returns the next occurrence after asOf", () => {
    const rule: OccurrenceRule = { ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1, startDate: new Date("2025-01-01") };
    expect(nextDueDate(rule, new Date("2025-03-10"))?.toISOString().slice(0, 10)).toBe("2025-04-01");
  });
  it("returns null when paused", () => {
    const rule: OccurrenceRule & { active?: boolean } = { ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1, active: false };
    expect(nextDueDate(rule, new Date("2025-03-10"))).toBeNull();
  });
  it("returns null when past endDate", () => {
    const rule: OccurrenceRule = { ...base, intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1, startDate: new Date("2025-01-01"), endDate: new Date("2025-02-15") };
    expect(nextDueDate(rule, new Date("2025-03-10"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/recurring/describe.test.ts`
Expected: FAIL — cannot find module `./describe`.

- [ ] **Step 3: Implement `describe.ts`**

Create `src/lib/recurring/describe.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/recurring/describe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurring/describe.ts src/lib/recurring/describe.test.ts
git commit -m "feat(recurring): human-readable schedule + next-due helpers"
```

---

## Task 3: Schema migration + data layer

This is the reconciling task: after it, `npm run typecheck` is green again.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260702140000_recurring_interval_model/migration.sql`
- Modify: `src/lib/data/recurring.ts`
- Test: `src/lib/data/recurring.test.ts`

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Remove the `RecurFrequency` enum (lines 26–30) and add an `IntervalUnit` enum in its place:

```prisma
enum IntervalUnit {
  DAY
  WEEK
  MONTH
  YEAR
}
```

Replace the `RecurringRule` model (lines 110–127) with:

```prisma
model RecurringRule {
  id                String        @id @default(cuid())
  propertyId        String
  property          Property      @relation(fields: [propertyId], references: [id])
  categoryId        String
  category          Category      @relation(fields: [categoryId], references: [id])
  vendorId          String?
  vendor            Vendor?       @relation(fields: [vendorId], references: [id])
  description       String?
  amountPence       Int
  direction         Direction
  intervalUnit      IntervalUnit
  intervalCount     Int           @default(1)
  dayOfWeek         Int?
  dayOfMonth        Int?
  monthOfYear       Int?
  active            Boolean       @default(true)
  startDate         DateTime
  endDate           DateTime?
  lastGeneratedDate DateTime?
  externalRef       String?       @unique
  transactions      Transaction[]
}
```

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260702140000_recurring_interval_model/migration.sql`:

```sql
-- Rebuild RecurringRule for the interval schedule model; backfill from the old `frequency` column.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_RecurringRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "vendorId" TEXT,
    "description" TEXT,
    "amountPence" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "intervalUnit" TEXT NOT NULL,
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "monthOfYear" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "lastGeneratedDate" DATETIME,
    "externalRef" TEXT,
    CONSTRAINT "RecurringRule_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecurringRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecurringRule_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_RecurringRule" (
    "id", "propertyId", "categoryId", "vendorId", "description", "amountPence", "direction",
    "intervalUnit", "intervalCount", "dayOfWeek", "dayOfMonth", "monthOfYear", "active",
    "startDate", "endDate", "lastGeneratedDate", "externalRef"
)
SELECT
    "id", "propertyId", "categoryId", "vendorId", NULL, "amountPence", "direction",
    CASE "frequency" WHEN 'annual' THEN 'YEAR' ELSE 'MONTH' END,
    CASE "frequency" WHEN 'quarterly' THEN 3 ELSE 1 END,
    NULL,
    "dayOfMonth",
    NULL,
    true,
    "startDate", "endDate", "lastGeneratedDate", "externalRef"
FROM "RecurringRule";

DROP TABLE "RecurringRule";
ALTER TABLE "new_RecurringRule" RENAME TO "RecurringRule";
CREATE UNIQUE INDEX "RecurringRule_externalRef_key" ON "RecurringRule"("externalRef");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
```

Note: annual rules keep `monthOfYear = NULL`; the occurrence engine falls back to `startDate`'s month, preserving their existing dates.

- [ ] **Step 3: Apply the migration and regenerate the client**

Run:
```bash
npx prisma migrate deploy && npx prisma generate
```
Expected: migration `20260702140000_recurring_interval_model` applied; client regenerated with the new `RecurringRule` fields and `IntervalUnit` enum.

- [ ] **Step 4: Rewrite `src/lib/data/recurring.ts`**

Overwrite it:

```ts
import "server-only";
import { prisma } from "../db";
import { recurringOccurrences, type IntervalUnit, type OccurrenceRule } from "../recurring/occurrences";
import type { Direction } from "../tax/types";

export interface RecurringInput {
  propertyId: string;
  categoryId: string;
  vendorId?: string | null;
  description?: string | null;
  amountPence: number;
  direction: Direction;
  intervalUnit: IntervalUnit;
  intervalCount: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  monthOfYear?: number | null;
  startDate: Date;
  endDate?: Date | null;
}

export function listRecurringRules(propertyId: string | null) {
  return prisma.recurringRule.findMany({
    where: propertyId ? { propertyId } : {},
    orderBy: [{ active: "desc" }, { startDate: "asc" }],
    include: { category: true, vendor: true, property: true },
  });
}

export function getRecurringRule(id: string) {
  return prisma.recurringRule.findUnique({
    where: { id },
    include: { category: true, vendor: true, property: true },
  });
}

export function createRecurringRule(input: RecurringInput) {
  return prisma.recurringRule.create({ data: input });
}

export function updateRecurringRule(id: string, input: RecurringInput) {
  return prisma.recurringRule.update({ where: { id }, data: input });
}

export function setRecurringActive(id: string, active: boolean) {
  return prisma.recurringRule.update({ where: { id }, data: { active } });
}

export function deleteRecurringRule(id: string) {
  return prisma.recurringRule.delete({ where: { id } });
}

function toOccurrenceRule(rule: {
  intervalUnit: string;
  intervalCount: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  startDate: Date;
  endDate: Date | null;
  lastGeneratedDate: Date | null;
}): OccurrenceRule {
  return {
    intervalUnit: rule.intervalUnit as IntervalUnit,
    intervalCount: rule.intervalCount,
    dayOfWeek: rule.dayOfWeek,
    dayOfMonth: rule.dayOfMonth,
    monthOfYear: rule.monthOfYear,
    startDate: rule.startDate,
    endDate: rule.endDate,
    lastGeneratedDate: rule.lastGeneratedDate,
  };
}

export async function materialiseDue(asOf: Date, propertyId?: string): Promise<number> {
  const rules = await prisma.recurringRule.findMany({
    where: { active: true, ...(propertyId ? { propertyId } : {}) },
  });
  let created = 0;
  for (const rule of rules) {
    const dates = recurringOccurrences(toOccurrenceRule(rule), asOf);
    if (dates.length === 0) continue;
    const insertResult = await prisma.$transaction(async (tx) => {
      const r = await tx.transaction.createMany({
        data: dates.map((date) => ({
          propertyId: rule.propertyId,
          categoryId: rule.categoryId,
          vendorId: rule.vendorId,
          date,
          amountPence: rule.amountPence,
          direction: rule.direction,
          source: "recurring" as const,
          recurringId: rule.id,
          description: rule.description ?? "Recurring",
        })),
      });
      await tx.recurringRule.update({
        where: { id: rule.id },
        data: { lastGeneratedDate: dates[dates.length - 1] },
      });
      return r;
    });
    created += insertResult.count;
  }
  return created;
}
```

- [ ] **Step 5: Update `src/lib/data/recurring.test.ts`**

Overwrite it (updates the `createRecurringRule` calls to the new shape and adds pause/resume + weekly coverage):

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  createRecurringRule, listRecurringRules, deleteRecurringRule,
  updateRecurringRule, setRecurringActive, materialiseDue, type RecurringInput,
} from "./recurring";
import { getOrCreateDefaultProperty } from "./property";
import { listTransactions } from "./transactions";
import { resetDb } from "../../../test/setup/resetDb";
import { prisma } from "../db";

async function rentCategoryId() {
  const c = await prisma.category.findFirstOrThrow({ where: { name: "Rent received" } });
  return c.id;
}

function monthly(overrides: Partial<RecurringInput>): RecurringInput {
  return {
    propertyId: "", categoryId: "", amountPence: 95000, direction: "in",
    intervalUnit: "MONTH", intervalCount: 1, dayOfMonth: 1,
    startDate: new Date("2025-01-01"), endDate: null, ...overrides,
  };
}

beforeEach(async () => { await resetDb(); });

describe("recurring data layer", () => {
  it("creates and lists rules", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    await createRecurringRule(monthly({ propertyId: property.id, categoryId }));
    expect(await listRecurringRules(property.id)).toHaveLength(1);
  });

  it("materialises due occurrences as transactions, idempotently, using the rule description", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const rule = await createRecurringRule(monthly({ propertyId: property.id, categoryId, description: "Rent — Flat 2" }));
    expect(await materialiseDue(new Date("2025-03-15"))).toBe(3);
    const txns = await listTransactions(property.id);
    expect(txns).toHaveLength(3);
    expect(txns[0].description).toBe("Rent — Flat 2");
    expect(await materialiseDue(new Date("2025-03-15"))).toBe(0);
    expect(await materialiseDue(new Date("2025-04-02"))).toBe(1);
    const refreshed = await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(refreshed.lastGeneratedDate?.toISOString().slice(0, 10)).toBe("2025-04-01");
  });

  it("materialises weekly rules on the chosen weekday", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    // 2025-01-01 is Wednesday; weekly on Monday → 6th, 13th, 20th
    await createRecurringRule(monthly({
      propertyId: property.id, categoryId, direction: "out",
      intervalUnit: "WEEK", intervalCount: 1, dayOfMonth: null, dayOfWeek: 0,
    }));
    expect(await materialiseDue(new Date("2025-01-21"))).toBe(3);
  });

  it("skips paused rules and catches up on resume", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const rule = await createRecurringRule(monthly({ propertyId: property.id, categoryId }));
    await setRecurringActive(rule.id, false);
    expect(await materialiseDue(new Date("2025-03-15"))).toBe(0);
    expect(await listTransactions(property.id)).toHaveLength(0);
    await setRecurringActive(rule.id, true);
    expect(await materialiseDue(new Date("2025-03-15"))).toBe(3);
  });

  it("updates a rule's schedule", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const rule = await createRecurringRule(monthly({ propertyId: property.id, categoryId }));
    await updateRecurringRule(rule.id, monthly({ propertyId: property.id, categoryId, intervalUnit: "MONTH", intervalCount: 3, dayOfMonth: 5 }));
    const refreshed = await prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(refreshed.intervalCount).toBe(3);
    expect(refreshed.dayOfMonth).toBe(5);
  });

  it("only materialises rules for the given property when propertyId is passed", async () => {
    const p1 = await getOrCreateDefaultProperty();
    const p2 = await prisma.property.create({ data: { name: "Second" } });
    const categoryId = await rentCategoryId();
    await createRecurringRule(monthly({ propertyId: p1.id, categoryId, amountPence: 1000 }));
    await createRecurringRule(monthly({ propertyId: p2.id, categoryId, amountPence: 2000 }));
    expect(await materialiseDue(new Date("2025-02-15"), p1.id)).toBe(2);
    expect(await listTransactions(p2.id)).toHaveLength(0);
  });

  it("deletes a rule", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const r = await createRecurringRule(monthly({ propertyId: property.id, categoryId, direction: "out", intervalUnit: "YEAR", intervalCount: 1, dayOfMonth: 10, startDate: new Date("2025-05-10") }));
    await deleteRecurringRule(r.id);
    expect(await listRecurringRules(property.id)).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run the data-layer + pure tests and typecheck**

Run:
```bash
npx vitest run src/lib/recurring src/lib/data/recurring.test.ts && npm run typecheck
```
Expected: all tests PASS. `npm run typecheck` will still report errors in `src/app/(app)/recurring/*` and `scripts/migrate-akaunting/*` (fixed in Tasks 4–7) but **none** in `src/lib/**`. If `typecheck` isn't a script, use `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260702140000_recurring_interval_model src/lib/data/recurring.ts src/lib/data/recurring.test.ts
git commit -m "feat(recurring): interval-model schema, migration, and data layer (edit + pause/resume)"
```

---

## Task 4: RecurringForm client component

**Files:**
- Create: `src/app/(app)/recurring/RecurringForm.tsx`

No unit test (it's a client UI component; verified via typecheck in Task 5 and the manual check in Task 8).

- [ ] **Step 1: Create the component**

Create `src/app/(app)/recurring/RecurringForm.tsx`:

```tsx
"use client";
import { useMemo, useState } from "react";
import { upcomingOccurrences, type IntervalUnit, type OccurrenceRule } from "../../../lib/recurring/occurrences";
import { MoneyInput } from "../_ui/MoneyInput";

export interface RecurringFormInitial {
  id?: string;
  description?: string | null;
  amountText?: string;
  direction?: "in" | "out";
  categoryId?: string;
  vendorId?: string | null;
  intervalUnit?: IntervalUnit;
  intervalCount?: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  monthOfYear?: number | null;
  startDate?: string; // yyyy-mm-dd
  endDate?: string; // yyyy-mm-dd
}

interface Option { id: string; name: string }

const PRESETS = [
  { key: "WEEKLY", label: "Weekly", unit: "WEEK" as const, count: 1 },
  { key: "FORTNIGHTLY", label: "Fortnightly", unit: "WEEK" as const, count: 2 },
  { key: "MONTHLY", label: "Monthly", unit: "MONTH" as const, count: 1 },
  { key: "QUARTERLY", label: "Quarterly", unit: "MONTH" as const, count: 3 },
  { key: "YEARLY", label: "Yearly", unit: "YEAR" as const, count: 1 },
  { key: "DAILY", label: "Daily", unit: "DAY" as const, count: 1 },
  { key: "CUSTOM", label: "Custom", unit: "MONTH" as const, count: 1 },
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function presetKeyFor(unit: IntervalUnit, count: number): string {
  const match = PRESETS.find((p) => p.key !== "CUSTOM" && p.unit === unit && p.count === count);
  return match?.key ?? "CUSTOM";
}

export function RecurringForm({
  action, initial, categories, vendors, properties, activePropertyId, isAll, submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initial?: RecurringFormInitial;
  categories: Option[];
  vendors: Option[];
  properties: Option[];
  activePropertyId: string | null;
  isAll: boolean;
  submitLabel: string;
}) {
  const init = initial ?? {};
  const [unit, setUnit] = useState<IntervalUnit>(init.intervalUnit ?? "MONTH");
  const [count, setCount] = useState<number>(init.intervalCount ?? 1);
  const [presetKey, setPresetKey] = useState<string>(presetKeyFor(init.intervalUnit ?? "MONTH", init.intervalCount ?? 1));
  const [dayOfWeek, setDayOfWeek] = useState<number>(init.dayOfWeek ?? 0);
  const [dayOfMonth, setDayOfMonth] = useState<number>(init.dayOfMonth ?? 1);
  const [monthOfYear, setMonthOfYear] = useState<number>(init.monthOfYear ?? 1);
  const [startDate, setStartDate] = useState<string>(init.startDate ?? "");

  function choosePreset(key: string) {
    setPresetKey(key);
    const p = PRESETS.find((x) => x.key === key)!;
    if (key !== "CUSTOM") {
      setUnit(p.unit);
      setCount(p.count);
    }
  }

  const preview = useMemo(() => {
    if (!startDate) return [];
    if (unit === "WEEK" && dayOfWeek == null) return [];
    const rule: OccurrenceRule = {
      intervalUnit: unit,
      intervalCount: Math.max(1, count),
      dayOfWeek: unit === "WEEK" ? dayOfWeek : null,
      dayOfMonth: unit === "MONTH" || unit === "YEAR" ? dayOfMonth : null,
      monthOfYear: unit === "YEAR" ? monthOfYear : null,
      startDate: new Date(`${startDate}T00:00:00Z`),
      endDate: null,
      lastGeneratedDate: null,
    };
    const dayBeforeStart = new Date(new Date(`${startDate}T00:00:00Z`).getTime() - 86_400_000);
    return upcomingOccurrences(rule, dayBeforeStart, 3);
  }, [unit, count, dayOfWeek, dayOfMonth, monthOfYear, startDate]);

  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <form action={action} className="card space-y-4 p-5">
      {init.id && <input type="hidden" name="id" value={init.id} />}
      {/* schedule fields serialised for the server action */}
      <input type="hidden" name="intervalUnit" value={unit} />
      <input type="hidden" name="intervalCount" value={Math.max(1, count)} />
      {unit === "WEEK" && <input type="hidden" name="dayOfWeek" value={dayOfWeek} />}
      {(unit === "MONTH" || unit === "YEAR") && <input type="hidden" name="dayOfMonth" value={dayOfMonth} />}
      {unit === "YEAR" && <input type="hidden" name="monthOfYear" value={monthOfYear} />}

      {isAll ? (
        <label className="block">
          <span className="label">Property</span>
          <select name="propertyId" required className="field" defaultValue={activePropertyId ?? ""}>
            {properties.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="propertyId" value={activePropertyId ?? ""} />
      )}

      <label className="block">
        <span className="label">Name / description</span>
        <input name="description" className="field" placeholder="e.g. Rent — Flat 2" defaultValue={init.description ?? ""} />
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[7rem]">
          <span className="label">Money</span>
          <select name="direction" className="field" defaultValue={init.direction ?? "out"}>
            <option value="out">Out</option>
            <option value="in">In</option>
          </select>
        </label>
        <label className="flex-1 min-w-[9rem]">
          <span className="label">Amount</span>
          <MoneyInput name="amount" required defaultValue={init.amountText ?? ""} />
        </label>
        <label className="flex-1 min-w-[10rem]">
          <span className="label">Payee</span>
          <select name="vendorId" className="field" defaultValue={init.vendorId ?? ""}>
            <option value="">— none —</option>
            {vendors.map((v) => (<option key={v.id} value={v.id}>{v.name}</option>))}
          </select>
        </label>
        <label className="flex-1 min-w-[10rem]">
          <span className="label">Category</span>
          <select name="categoryId" required className="field" defaultValue={init.categoryId ?? ""}>
            {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </label>
      </div>

      <div>
        <span className="label">Frequency</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              type="button"
              key={p.key}
              onClick={() => choosePreset(p.key)}
              className={`rounded-md px-3 py-1.5 text-sm ${presetKey === p.key ? "bg-ink text-white" : "bg-subtle text-muted"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {presetKey === "CUSTOM" && (
        <div className="flex items-end gap-2">
          <label>
            <span className="label">Every</span>
            <input type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value))} className="field w-20" />
          </label>
          <label className="min-w-[8rem]">
            <span className="label">Unit</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value as IntervalUnit)} className="field">
              <option value="DAY">days</option>
              <option value="WEEK">weeks</option>
              <option value="MONTH">months</option>
              <option value="YEAR">years</option>
            </select>
          </label>
        </div>
      )}

      {/* Conditional anchor */}
      {unit === "WEEK" && (
        <div className="rounded-lg border border-line bg-subtle/40 p-3">
          <span className="label">On which day?</span>
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((d, i) => (
              <button type="button" key={d} onClick={() => setDayOfWeek(i)} className={`rounded-md px-3 py-1.5 text-sm ${dayOfWeek === i ? "bg-blue-600 text-white" : "bg-white text-muted"}`}>{d}</button>
            ))}
          </div>
        </div>
      )}
      {(unit === "MONTH" || unit === "YEAR") && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-subtle/40 p-3">
          {unit === "YEAR" && (
            <label className="min-w-[8rem]">
              <span className="label">Month</span>
              <select value={monthOfYear} onChange={(e) => setMonthOfYear(Number(e.target.value))} className="field">
                {MONTHS.map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
              </select>
            </label>
          )}
          <label>
            <span className="label">Day of month</span>
            <input type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} className="field w-24" />
          </label>
          <button type="button" onClick={() => setDayOfMonth(31)} className="btn btn-ghost">Last day</button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[9rem]">
          <span className="label">Starts</span>
          <input name="startDate" type="date" required className="field" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="flex-1 min-w-[9rem]">
          <span className="label">Ends (optional)</span>
          <input name="endDate" type="date" className="field" defaultValue={init.endDate ?? ""} />
        </label>
      </div>

      {preview.length > 0 && (
        <div className="rounded-lg bg-subtle/60 px-3 py-2 text-sm text-muted">
          <span className="font-medium text-ink">Next dates:</span> {preview.map(fmt).join(" · ")} …
        </div>
      )}

      <button type="submit" className="btn btn-primary">{submitLabel}</button>
    </form>
  );
}
```

Note: `MoneyInput` and Tailwind utility class names (`card`, `field`, `label`, `btn`, `btn-primary`, `btn-ghost`, `bg-ink`, `text-muted`, `bg-subtle`, `border-line`) already exist in the codebase (used by the current page and `_ui` components). If `bg-subtle`/`border-line` don't resolve, substitute the nearest existing tokens seen in `src/app/(app)/_ui/*` (verified in Task 8).

- [ ] **Step 2: Commit**

```bash
git add "src/app/(app)/recurring/RecurringForm.tsx"
git commit -m "feat(recurring): adaptive schedule form with live next-dates preview"
```

---

## Task 5: Server actions + page redesign

**Files:**
- Modify: `src/app/(app)/recurring/actions.ts`
- Modify: `src/app/(app)/recurring/page.tsx`

- [ ] **Step 1: Rewrite `actions.ts`**

Overwrite `src/app/(app)/recurring/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createRecurringRule, updateRecurringRule, deleteRecurringRule,
  setRecurringActive, materialiseDue, type RecurringInput,
} from "../../../lib/data/recurring";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import type { Direction } from "../../../lib/tax/types";
import type { IntervalUnit } from "../../../lib/recurring/occurrences";
import { requireSession } from "../../../lib/auth/session";

const UNITS: IntervalUnit[] = ["DAY", "WEEK", "MONTH", "YEAR"];

function parseNullableInt(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Parse + validate the schedule fields. Throws a user-facing message string when invalid. */
function parseRuleInput(formData: FormData): Omit<RecurringInput, "propertyId"> {
  const intervalUnit = String(formData.get("intervalUnit")) as IntervalUnit;
  if (!UNITS.includes(intervalUnit)) throw "Choose a valid frequency.";
  const intervalCount = Math.max(1, Number(formData.get("intervalCount") ?? 1));
  const dayOfWeek = parseNullableInt(formData.get("dayOfWeek"));
  const dayOfMonth = parseNullableInt(formData.get("dayOfMonth"));
  const monthOfYear = parseNullableInt(formData.get("monthOfYear"));
  const amountPence = parseAmountToPence(String(formData.get("amount") ?? ""));
  if (!(amountPence > 0)) throw "Enter an amount greater than zero.";
  if (intervalUnit === "WEEK" && (dayOfWeek == null || dayOfWeek < 0 || dayOfWeek > 6)) throw "Choose a day of the week.";
  if ((intervalUnit === "MONTH" || intervalUnit === "YEAR") && (dayOfMonth == null || dayOfMonth < 1 || dayOfMonth > 31)) throw "Choose a day of the month (1–31).";
  if (intervalUnit === "YEAR" && (monthOfYear == null || monthOfYear < 1 || monthOfYear > 12)) throw "Choose a month.";
  const startRaw = String(formData.get("startDate") ?? "");
  if (!startRaw) throw "Choose a start date.";
  return {
    categoryId: String(formData.get("categoryId")),
    vendorId: String(formData.get("vendorId") ?? "") || null,
    description: String(formData.get("description") ?? "").trim() || null,
    amountPence,
    direction: String(formData.get("direction")) as Direction,
    intervalUnit,
    intervalCount,
    dayOfWeek: intervalUnit === "WEEK" ? dayOfWeek : null,
    dayOfMonth: intervalUnit === "MONTH" || intervalUnit === "YEAR" ? dayOfMonth : null,
    monthOfYear: intervalUnit === "YEAR" ? monthOfYear : null,
    startDate: new Date(startRaw),
    endDate: String(formData.get("endDate") ?? "") ? new Date(String(formData.get("endDate"))) : null,
  };
}

export async function addRecurringAction(formData: FormData) {
  await requireSession();
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) redirect(`/recurring?error=${encodeURIComponent("Choose a property.")}`);
  try {
    const input = parseRuleInput(formData);
    await createRecurringRule({ propertyId, ...input });
  } catch (e) {
    redirect(`/recurring?error=${encodeURIComponent(String(e))}`);
  }
  revalidatePath("/recurring");
  redirect(`/recurring?ok=${encodeURIComponent("Rule added")}`);
}

export async function updateRecurringAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!id || !propertyId) redirect(`/recurring?error=${encodeURIComponent("Missing rule.")}`);
  try {
    const input = parseRuleInput(formData);
    await updateRecurringRule(id, { propertyId, ...input });
  } catch (e) {
    redirect(`/recurring/${id}/edit?error=${encodeURIComponent(String(e))}`);
  }
  revalidatePath("/recurring");
  redirect(`/recurring?ok=${encodeURIComponent("Rule updated")}`);
}

export async function setActiveAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (id) await setRecurringActive(id, active);
  revalidatePath("/recurring");
  redirect(`/recurring?ok=${encodeURIComponent(active ? "Rule resumed" : "Rule paused")}`);
}

export async function deleteRecurringAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteRecurringRule(id);
  revalidatePath("/recurring");
  redirect(`/recurring?ok=${encodeURIComponent("Rule deleted")}`);
}

export async function generateNowAction(formData: FormData) {
  await requireSession();
  const propertyId = String(formData.get("propertyId") ?? "") || undefined;
  const count = await materialiseDue(new Date(), propertyId);
  revalidatePath("/transactions");
  redirect(`/recurring?ok=${encodeURIComponent(`Generated ${count} transaction(s)`)}`);
}
```

- [ ] **Step 2: Rewrite `page.tsx` to layout A + RecurringForm**

Overwrite `src/app/(app)/recurring/page.tsx`:

```tsx
import Link from "next/link";
import { listRecurringRules } from "../../../lib/data/recurring";
import { getActiveProperty, listProperties } from "../../../lib/data/activeProperty";
import { listCategories } from "../../../lib/data/categories";
import { listVendors } from "../../../lib/data/vendors";
import { formatGBP } from "../../../lib/tax/money";
import { describeSchedule, nextDueDate } from "../../../lib/recurring/describe";
import type { IntervalUnit } from "../../../lib/recurring/occurrences";
import { addRecurringAction, deleteRecurringAction, generateNowAction, setActiveAction } from "./actions";
import { RecurringForm } from "./RecurringForm";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";
import { ConfirmSubmit } from "../_ui/ConfirmSubmit";

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const active = await getActiveProperty();
  const properties = await listProperties();
  const [rules, categories, vendors] = await Promise.all([
    listRecurringRules(active.propertyId),
    listCategories(),
    listVendors(),
  ]);
  const headingProperty = active.isAll
    ? "All properties"
    : (properties.find((p) => p.id === active.propertyId)?.name ?? "—");
  const now = new Date();
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Recurring payments" subtitle={headingProperty} />
      </div>

      {error && <Banner variant="error">{error}</Banner>}
      {ok && <Banner variant="success">{ok}</Banner>}

      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <div className="mb-4 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Add rule</div>
        <RecurringForm
          action={addRecurringAction}
          categories={categories}
          vendors={vendors}
          properties={properties}
          activePropertyId={active.propertyId}
          isAll={active.isAll}
          submitLabel="Add rule"
        />
      </section>

      <section className="reveal" style={{ animationDelay: "120ms" }}>
        <form action={generateNowAction}>
          <input type="hidden" name="propertyId" value={active.propertyId ?? ""} />
          <button type="submit" className="btn btn-ghost">Generate due transactions now</button>
        </form>
      </section>

      <section className="reveal" style={{ animationDelay: "180ms" }}>
        {rules.length === 0 ? (
          <EmptyState title="No recurring rules" hint="Add a monthly rent or a standing cost above." />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ledger">
                <thead>
                  <tr>
                    {active.isAll && <th>Property</th>}
                    <th>Payment</th>
                    <th>Schedule</th>
                    <th>Next due</th>
                    <th className="text-right">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => {
                    const occRule = {
                      intervalUnit: r.intervalUnit as IntervalUnit,
                      intervalCount: r.intervalCount,
                      dayOfWeek: r.dayOfWeek,
                      dayOfMonth: r.dayOfMonth,
                      monthOfYear: r.monthOfYear,
                      startDate: r.startDate,
                      endDate: r.endDate,
                      lastGeneratedDate: r.lastGeneratedDate,
                    };
                    const due = nextDueDate({ ...occRule, active: r.active }, now);
                    return (
                      <tr key={r.id} className={r.active ? "" : "opacity-55"}>
                        {active.isAll && <td className="text-muted">{r.property?.name}</td>}
                        <td>
                          <div className="font-medium text-ink">
                            {r.description ?? r.category.name}
                            {!r.active && <span className="ml-2 rounded-md bg-subtle px-2 py-0.5 text-xs text-muted">Paused</span>}
                          </div>
                          <div className="text-sm text-muted">
                            {r.vendor?.name ? `${r.vendor.name} · ` : ""}{r.category.name}
                          </div>
                        </td>
                        <td className="text-muted">{describeSchedule(occRule)}</td>
                        <td className="text-muted">{due ? fmt(due) : "—"}</td>
                        <td className="money text-right">
                          {r.direction === "out" ? "−" : ""}{formatGBP(r.amountPence)}
                        </td>
                        <td className="text-right">
                          <div className="flex justify-end gap-3">
                            <Link href={`/recurring/${r.id}/edit`} className="link">Edit</Link>
                            <form action={setActiveAction}>
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="active" value={r.active ? "false" : "true"} />
                              <button type="submit" className="link">{r.active ? "Pause" : "Resume"}</button>
                            </form>
                            <form action={deleteRecurringAction}>
                              <input type="hidden" name="id" value={r.id} />
                              <ConfirmSubmit confirm="Delete this recurring rule? This can't be undone.">Delete</ConfirmSubmit>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
```

Note: `link` class is used by other pages for text-button links; if it doesn't exist, use `text-muted underline` (verified in Task 8).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors in `src/app/(app)/recurring/**` (importer files still red until Task 7). If `link`/`bg-subtle`/`text-faint` classes are unknown to your linter, that's runtime CSS, not a TS error — ignore here.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/recurring/actions.ts" "src/app/(app)/recurring/page.tsx"
git commit -m "feat(recurring): rich rules table + add form, update & pause/resume actions"
```

---

## Task 6: Edit route

**Files:**
- Create: `src/app/(app)/recurring/[id]/edit/page.tsx`

- [ ] **Step 1: Create the edit page**

Create `src/app/(app)/recurring/[id]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getRecurringRule } from "../../../../../lib/data/recurring";
import { listProperties } from "../../../../../lib/data/activeProperty";
import { listCategories } from "../../../../../lib/data/categories";
import { listVendors } from "../../../../../lib/data/vendors";
import type { IntervalUnit } from "../../../../../lib/recurring/occurrences";
import { updateRecurringAction } from "../../actions";
import { RecurringForm, type RecurringFormInitial } from "../../RecurringForm";
import { PageHeader } from "../../../_ui/PageHeader";
import { Banner } from "../../../_ui/Banner";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function EditRecurringPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [rule, properties, categories, vendors] = await Promise.all([
    getRecurringRule(id),
    listProperties(),
    listCategories(),
    listVendors(),
  ]);
  if (!rule) notFound();

  const initial: RecurringFormInitial = {
    id: rule.id,
    description: rule.description,
    amountText: (rule.amountPence / 100).toFixed(2),
    direction: rule.direction as "in" | "out",
    categoryId: rule.categoryId,
    vendorId: rule.vendorId,
    intervalUnit: rule.intervalUnit as IntervalUnit,
    intervalCount: rule.intervalCount,
    dayOfWeek: rule.dayOfWeek,
    dayOfMonth: rule.dayOfMonth,
    monthOfYear: rule.monthOfYear,
    startDate: iso(rule.startDate),
    endDate: iso(rule.endDate),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader title="Edit recurring payment" subtitle={rule.property?.name ?? undefined} />
      {error && <Banner variant="error">{error}</Banner>}
      <RecurringForm
        action={updateRecurringAction}
        initial={initial}
        categories={categories}
        vendors={vendors}
        properties={properties}
        activePropertyId={rule.propertyId}
        isAll={false}
        submitLabel="Save changes"
      />
    </div>
  );
}
```

Note: `MoneyInput` uses `defaultValue` for the amount; `amountText` is the plain decimal (e.g. `"950.00"`) which `parseAmountToPence` accepts. The edit form fixes the property to the rule's own (`isAll={false}`) so a hidden `propertyId` is submitted.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors in `src/app/**` (importer still red until Task 7).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/recurring/[id]"
git commit -m "feat(recurring): edit route reusing the schedule form"
```

---

## Task 7: Akaunting importer

**Files:**
- Modify: `scripts/migrate-akaunting/types.ts`
- Modify: `scripts/migrate-akaunting/transform.ts`
- Modify: `scripts/migrate-akaunting/apply.ts`
- Modify: `scripts/migrate-akaunting/report.ts`
- Test: `scripts/migrate-akaunting/transform.test.ts`, `scripts/migrate-akaunting/apply.test.ts`

- [ ] **Step 1: Update the failing tests first**

In `scripts/migrate-akaunting/transform.test.ts`, the `buildRecurringPlan` block currently asserts id 4 (weekly) is skipped and rent maps to `frequency: "monthly"`. Replace the rent assertion and the weekly assertion. Change the assertions around lines 208–217 to:

```ts
    expect(rent!.intervalUnit).toBe("MONTH");
    expect(rent!.intervalCount).toBe(1);
    expect(rent!.dayOfMonth).toBe(18);
    expect(rent!.description).toBe("Rent");

    // weekly (id 4) now imports instead of being skipped
    const weekly = plan.recurring.find((r) => r.externalRef === "akaunting:recurring:4");
    expect(weekly).toBeDefined();
    expect(weekly!.intervalUnit).toBe("WEEK");
    expect(weekly!.intervalCount).toBe(1);
    // 2026-01-01 is a Thursday → dayOfWeek 3 (Mon=0)
    expect(weekly!.dayOfWeek).toBe(3);

    // only the discontinued record (id 3) is skipped now
    expect(plan.skipped.some((s) => /discontinued/.test(s.reason))).toBe(true);
    expect(plan.skipped.some((s) => s.id === 4)).toBe(false);
```

(Keep the rest of the block — the setup fixtures at lines 191–197 stay as-is. If the block asserted an exact `skipped` length, relax it to the two `some(...)` checks above.)

In `scripts/migrate-akaunting/apply.test.ts`, change the recurring assertion (line ~101) from `expect(rule?.frequency).toBe("monthly")` to:

```ts
    expect(rule?.intervalUnit).toBe("MONTH");
    expect(rule?.intervalCount).toBe(1);
    expect(rule?.dayOfMonth).toBe(18); // 2025-12-18
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/migrate-akaunting/transform.test.ts scripts/migrate-akaunting/apply.test.ts`
Expected: FAIL — payload has no `intervalUnit`; still uses `frequency`.

- [ ] **Step 3: Update `types.ts`**

Replace the `RecurringRulePayload` interface (lines 135–146) with:

```ts
export interface RecurringRulePayload {
  externalRef: string;         // "akaunting:recurring:<id>"
  akauntingCompanyId: number;  // resolved to propertyId at apply time
  amountPence: number;
  direction: "in" | "out";
  categoryName: QuidlyCategoryName;
  vendorExternalRef: string | null;
  description: string | null;
  intervalUnit: "DAY" | "WEEK" | "MONTH" | "YEAR";
  intervalCount: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  startDate: string;           // ISO
  lastGeneratedDate: string;   // ISO — newest imported txn date (no backfill)
}
```

- [ ] **Step 4: Update `transform.ts`**

Replace `mapFrequency` (lines 156–162) with `mapSchedule`:

```ts
interface ScheduleFields {
  intervalUnit: RecurringRulePayload["intervalUnit"];
  intervalCount: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
}

/** JS getUTCDay is 0=Sun..6=Sat; convert to 0=Mon..6=Sun. */
function weekdayMon0(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

function clampDom(day: number): number {
  return Math.min(Math.max(day, 1), 31);
}

function mapSchedule(freq: string, interval: number, startedAt: string): ScheduleFields | null {
  const f = freq.toLowerCase();
  const count = Math.max(1, interval || 1);
  const d = new Date(startedAt);
  if (f === "daily") return { intervalUnit: "DAY", intervalCount: count, dayOfWeek: null, dayOfMonth: null, monthOfYear: null };
  if (f === "weekly") return { intervalUnit: "WEEK", intervalCount: count, dayOfWeek: weekdayMon0(d), dayOfMonth: null, monthOfYear: null };
  if (f === "monthly") return { intervalUnit: "MONTH", intervalCount: count, dayOfWeek: null, dayOfMonth: clampDom(d.getUTCDate()), monthOfYear: null };
  if (f === "yearly" || f === "annual") return { intervalUnit: "YEAR", intervalCount: count, dayOfWeek: null, dayOfMonth: clampDom(d.getUTCDate()), monthOfYear: d.getUTCMonth() + 1 };
  return null; // unknown frequency string
}
```

Update the `Candidate` interface (line 202) and the two places that reference `freq`:

```ts
  interface Candidate { r: SourceRecurring; sched: ScheduleFields; target: QuidlyCategoryName }
```

Replace the mapping check (lines 212–216) with:

```ts
    const sched = mapSchedule(r.frequency, r.interval, r.startedAt);
    if (!sched) {
      if (!invalidByKey.has(key)) invalidByKey.set(key, { id: r.id, reason: `unsupported frequency ${r.frequency}` });
      continue;
    }
```

Replace `importable.push({ r, freq, target });` (line 222) with:

```ts
    importable.push({ r, sched, target });
```

Replace the payload builder (lines 235–255) with:

```ts
  for (const c of latest.values()) {
    const { r, sched, target } = c;
    if (new Date(r.startedAt) < cutoff) {
      skipped.push({ id: r.id, reason: `discontinued (last started ${r.startedAt.slice(0, 10)}, older than ${RECURRING_ACTIVE_MONTHS} months)` });
      continue;
    }
    const hasContact = r.contactId != null && contactIds.has(r.contactId);
    recurring.push({
      externalRef: `akaunting:recurring:${r.id}`,
      akauntingCompanyId: snapshot.companies[0]?.id ?? 1,
      amountPence: decimalStringToPence(r.amount),
      direction: r.type === "income" ? "in" : "out",
      categoryName: target,
      vendorExternalRef: hasContact ? `akaunting:contact:${r.contactId}` : null,
      description: r.description ?? null,
      intervalUnit: sched.intervalUnit,
      intervalCount: sched.intervalCount,
      dayOfWeek: sched.dayOfWeek,
      dayOfMonth: sched.dayOfMonth,
      monthOfYear: sched.monthOfYear,
      startDate: r.startedAt,
      lastGeneratedDate: asOf.toISOString(),
    });
  }
```

- [ ] **Step 5: Update `apply.ts`**

Replace the `recurringRule.create` data block (lines 131–144) with:

```ts
    await prisma.recurringRule.create({
      data: {
        propertyId: propertyIdByCompany.get(r.akauntingCompanyId)!,
        categoryId,
        vendorId: r.vendorExternalRef ? vendorIdByRef.get(r.vendorExternalRef) ?? null : null,
        description: r.description,
        amountPence: r.amountPence,
        direction: r.direction,
        intervalUnit: r.intervalUnit,
        intervalCount: r.intervalCount,
        dayOfWeek: r.dayOfWeek,
        dayOfMonth: r.dayOfMonth,
        monthOfYear: r.monthOfYear,
        startDate: new Date(r.startDate),
        lastGeneratedDate: new Date(r.lastGeneratedDate),
        externalRef: r.externalRef,
      },
    });
```

- [ ] **Step 6: Update `report.ts`**

Add an import at the top of `scripts/migrate-akaunting/report.ts`:

```ts
import { describeSchedule } from "../../src/lib/recurring/describe";
```

Replace the recurring line (line 66) with:

```ts
      const sched = describeSchedule({
        intervalUnit: r.intervalUnit,
        intervalCount: r.intervalCount,
        dayOfWeek: r.dayOfWeek,
        dayOfMonth: r.dayOfMonth,
        monthOfYear: r.monthOfYear,
        startDate: new Date(r.startDate),
        endDate: null,
        lastGeneratedDate: null,
      });
      lines.push(`- ${r.direction === "in" ? "Income" : "Expense"} £${(r.amountPence / 100).toFixed(2)} — ${sched} → ${r.categoryName}`);
```

- [ ] **Step 7: Run importer tests to verify they pass**

Run: `npx vitest run scripts/migrate-akaunting/transform.test.ts scripts/migrate-akaunting/apply.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/migrate-akaunting
git commit -m "feat(migrate-akaunting): map weekly/daily/custom recurrences onto interval model"
```

---

## Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Confirm no stale references remain**

Run:
```bash
grep -rn "RecurFrequency\|\.frequency\|frequency:" src scripts | grep -v node_modules | grep -v "migrate-akaunting/read.ts" | grep -v "migrate-akaunting/types.ts:.*SourceRecurring" | grep -v "\.test\."
```
Expected: no matches referencing the removed `RecurringRule.frequency` field. (`read.ts` still reads Akaunting's own `r.frequency` source column — that's expected and correct; `SourceRecurring.frequency` in `types.ts` is Akaunting's field, also expected.)

- [ ] **Step 2: Full typecheck**

Run: `npm run typecheck` (or `npx tsc --noEmit`)
Expected: PASS, zero errors.

- [ ] **Step 3: Full test suite**

Run: `npm run test`
Expected: PASS. The Vitest global setup runs `prisma migrate deploy` against `test.db`, so the new migration applies automatically.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds; `/recurring` and `/recurring/[id]/edit` compile.

- [ ] **Step 5: Manual smoke test (verify skill)**

Start the app (`npm run dev`) and, on `/recurring`:
- Add a **Weekly on Monday** rule with a payee + description; confirm the live "Next dates" preview shows consecutive Mondays and the list row shows the name, payee, "Weekly on Monday", and a next-due date.
- Add a **Monthly** rule, click **Last day**, confirm preview shows month-end dates.
- **Edit** a rule, change Monthly→Quarterly, save; confirm the schedule column updates.
- **Pause** a rule; confirm it dims, shows "Paused", next-due shows "—", and **Generate due transactions now** creates nothing for it. **Resume** and confirm generation resumes.
- Confirm any Tailwind class fallbacks noted in Tasks 4–5 (`bg-subtle`, `border-line`, `link`, `text-faint`) actually render; substitute existing tokens if not.

- [ ] **Step 6: Final commit (if smoke test required tweaks)**

```bash
git add -A
git commit -m "fix(recurring): smoke-test polish"
```

---

## Self-Review

**Spec coverage:**
- Show what/who → `description` field + payee column in table (Tasks 3, 5). ✓
- Weekly + day-of-week, fortnightly, daily, custom every-N → interval model (Tasks 1, 3) + adaptive form (Task 4). ✓
- Full editing → `updateRecurringRule` + edit route (Tasks 3, 5, 6). ✓
- Next-due, pause/resume, human-readable schedule → `describe.ts`, `active`, `setActiveAction`, table (Tasks 2, 3, 5). ✓
- Description flows into generated transactions → `materialiseDue` uses `rule.description ?? "Recurring"` (Task 3). ✓
- Importer works + maps previously-dropped frequencies → Task 7. ✓
- Migration backfills existing rows → Task 3 Step 2. ✓
- Tests for each pure module + data layer + importer → Tasks 1, 2, 3, 7. ✓

**Type consistency:** `IntervalUnit` (`DAY|WEEK|MONTH|YEAR`) is used identically in `occurrences.ts`, `recurring.ts`, `actions.ts`, `RecurringForm.tsx`, `page.tsx`, edit route, and importer `types.ts`/`transform.ts`. `OccurrenceRule` field names (`intervalUnit`, `intervalCount`, `dayOfWeek`, `dayOfMonth`, `monthOfYear`) match everywhere. `RecurringInput` matches the Prisma `create`/`update` data shape. Day-of-week encoding (Mon=0) is stated once and reused by the engine, `describe`, the form, and the importer's `weekdayMon0`.

**Placeholder scan:** No TBD/TODO; every code step shows complete content. Tailwind-class fallbacks are called out explicitly rather than left vague, with a verification step.
