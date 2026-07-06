# Recurring Payments Improvements — Design

**Date:** 2026-07-02
**Status:** Approved (design), pending implementation plan

## Problem

The `/recurring` page has real usability gaps:

1. **You can't tell what a payment is or who it's to.** The list shows category, frequency, amount, and day-of-month — but no name/description and no payee (vendor).
2. **Only month-based schedules are supported.** Frequency is a fixed enum (`monthly | quarterly | annual`); there is no weekly, fortnightly, daily, day-of-week, or arbitrary interval.
3. **No editing.** Rules can only be added and deleted.
4. **Low glanceability.** No next-due date, no pause/resume, no human-readable schedule.
5. **The Akaunting importer silently drops** weekly/daily/bi-monthly recurrences because Quidly has no equivalent (`mapFrequency` returns `null`).

## Goals

- Show the "what" (name/description) and "who" (payee) in the list.
- Support weekly (with day-of-week), fortnightly, monthly, quarterly, yearly, daily, and a "custom every N" escape hatch.
- Add full editing of existing rules.
- Quality-of-life: next-due date, pause/resume, human-readable schedule strings.
- Extend the Akaunting importer to map the previously-dropped frequencies onto the new model.

Non-goals: automatic scheduler/cron (generation stays manual via "Generate due now"), a separate Payee/Contact entity (Vendor remains the payee), unrelated refactoring.

## Data Model

Replace the fixed `frequency` enum with a general interval model on `RecurringRule`.

### New / changed fields

| Field | Type | Purpose |
|---|---|---|
| `description` | `String?` | The "what" — e.g. "Rent — Flat 2". Flows into generated transactions, replacing the hardcoded `"Recurring"`. |
| `intervalUnit` | enum `DAY \| WEEK \| MONTH \| YEAR` | Unit we step by. |
| `intervalCount` | `Int @default(1)` | "Every N" units. |
| `dayOfWeek` | `Int?` (0=Mon … 6=Sun) | Anchor for week-based rules. |
| `dayOfMonth` | `Int?` | Anchor for month/year rules. "Last day" is stored as `31` — the existing `dateOn()` clamp already resolves that to each month's real last day, so no separate flag is needed. Now nullable (null for day/week units). |
| `monthOfYear` | `Int?` (1–12) | Anchor for yearly rules. |
| `active` | `Boolean @default(true)` | Pause/resume. |

Unchanged: `vendorId`, `categoryId`, `amountPence`, `direction`, `startDate`, `endDate`, `lastGeneratedDate`, `externalRef`.

The `RecurFrequency` enum is removed from the schema after migration.

### Preset → (unit, count) mapping

| Preset | `intervalUnit` | `intervalCount` | Anchor asked for |
|---|---|---|---|
| Weekly | WEEK | 1 | day-of-week |
| Fortnightly | WEEK | 2 | day-of-week |
| Monthly | MONTH | 1 | day-of-month (+ "Last day") |
| Quarterly | MONTH | 3 | day-of-month |
| Yearly | YEAR | 1 | month + day-of-month |
| Daily | DAY | 1 | — |
| Custom | user | user | unit-appropriate anchor |

### Migration

A Prisma migration adds the new columns, backfills existing rows from the old `frequency`, then drops the `frequency` column (SQLite table rebuild):

- `monthly` → `intervalUnit=MONTH, intervalCount=1` (keep `dayOfMonth`)
- `quarterly` → `intervalUnit=MONTH, intervalCount=3` (keep `dayOfMonth`)
- `annual` → `intervalUnit=YEAR, intervalCount=1` (keep `dayOfMonth`, derive `monthOfYear` from `startDate` month)
- `active` defaults to `true`; `description` defaults to `null`.

## Schedule Logic (pure, reused)

### `src/lib/recurring/occurrences.ts` (extended)

`recurringOccurrences(rule, asOf)` gains unit-aware stepping:

- **DAY**: from `startDate`, step `intervalCount` days.
- **WEEK**: find the first date on/after `startDate` whose weekday === `dayOfWeek`, then step `intervalCount × 7` days.
- **MONTH**: step `intervalCount` months anchored on `dayOfMonth`, clamped to month length (existing behaviour).
- **YEAR**: step `intervalCount` years on `monthOfYear` / `dayOfMonth`, clamped.

Existing constraints preserved: occurrences are `>= startDate`, `<= asOf`, `<= endDate` (if set), strictly after `lastGeneratedDate`, capped iteration count.

### `src/lib/recurring/describe.ts` (new, pure)

- `describeSchedule(rule): string` — human-readable ("Every Monday", "Fortnightly on Mondays", "Monthly on the 1st", "Monthly on the last day", "Quarterly on the 5th", "Yearly on 1 Apr", "Every 3 weeks on Tuesday", "Daily").
- `nextDueDate(rule, asOf): Date | null` — the next occurrence strictly after `max(lastGeneratedDate ?? startDate, asOf)`; `null` for paused or ended rules.

Both are pure and shared by the list (server) and the form's live preview (client).

## Generation

`materialiseDue(asOf, propertyId?)` in `src/lib/data/recurring.ts`:

- Understands the new interval fields.
- **Skips rules where `active === false`.** When a paused rule is later resumed, it catches up occurrences missed while paused (consistent with the existing retroactive "generate due now" model — `lastGeneratedDate` is not advanced while paused).
- Generated transactions use the rule's `description` (falling back to `"Recurring"` when null).

## UI

### List — `src/app/(app)/recurring/page.tsx` (layout A: rich table)

Columns: **Payment** (name/description + payee + category badge), **Schedule** (from `describeSchedule`), **Next due** (from `nextDueDate`), **Amount** (signed, red/green), and row actions. Paused rules render dimmed with a "Paused" chip. Row actions: **Edit · Pause/Resume · Delete**.

### Form — `src/app/(app)/recurring/RecurringForm.tsx` (new client component)

Adaptive schedule builder:
- Frequency chips: Weekly / Fortnightly / Monthly / Quarterly / Yearly / Custom (+ Daily).
- Conditional anchor panel: day-of-week picker (week-based), day-of-month input with "Last day" shortcut (month-based), month + day (yearly), or "every [N] [unit]" (custom).
- Fields: name/description, Out/In toggle, amount, payee, category, start date, end date (optional).
- Live **"Next dates"** preview computed client-side by importing the pure `occurrences` module.

Reused by:
- **Add** — inline on `/recurring`.
- **Edit** — new route `src/app/(app)/recurring/[id]/edit/page.tsx`, pre-filled.

### Server actions — `src/app/(app)/recurring/actions.ts`

- `addRecurringAction` (updated for new fields)
- `updateRecurringAction` (new)
- `setActiveAction` (new — pause/resume)
- `deleteRecurringAction`, `generateNowAction` (unchanged)

Validation (surfaced via existing error `Banner`): amount > 0; `dayOfWeek` required for week units; `dayOfMonth` 1–31 for month/year units; `monthOfYear` 1–12 for year units; `intervalCount >= 1`.

### Data layer — `src/lib/data/recurring.ts`

- `RecurringInput` extended with the new fields.
- `createRecurringRule` updated.
- `updateRecurringRule` (new).
- `setRecurringActive(id, active)` (new).

## Akaunting Importer

The importer must work with the new model, and gains the ability to import previously-dropped frequencies.

### `scripts/migrate-akaunting/transform.ts`

Replace `mapFrequency(freq, interval)` (returns `monthly|quarterly|annual|null`) with `mapSchedule(freq, interval, startedAt)` returning the new shape:

- `daily` → `{ intervalUnit: "DAY", intervalCount: interval }`
- `weekly` → `{ intervalUnit: "WEEK", intervalCount: interval, dayOfWeek: weekday(startedAt) }`
- `monthly` → `{ intervalUnit: "MONTH", intervalCount: interval, dayOfMonth: day(startedAt) }`
- `yearly`/`annual` → `{ intervalUnit: "YEAR", intervalCount: interval, monthOfYear: month(startedAt), dayOfMonth: day(startedAt) }`
- unknown frequency string → `null` (still dropped + reported as skipped)

`buildRecurringPlan` no longer drops weekly/daily/bi-monthly; only genuinely unknown frequency strings are skipped. `description` is set from the Akaunting template transaction's description when available (else null) — pulled by `read.ts` if not already; otherwise left null to avoid expanding the reader.

### `scripts/migrate-akaunting/types.ts`

`RecurringRulePayload` gains `intervalUnit`, `intervalCount`, `dayOfWeek?`, `monthOfYear?`, `description?`; drops `frequency`.

### `scripts/migrate-akaunting/apply.ts`

`prisma.recurringRule.create` data uses the new fields instead of `frequency`. Dedup via `externalRef` unchanged.

## Testing (TDD, pure modules first)

- `src/lib/recurring/occurrences.test.ts` — weekly, fortnightly, daily, monthly, quarterly, yearly, last-day (day 31 clamp), interval-count > 1, endDate/lastGeneratedDate bounds.
- `src/lib/recurring/describe.test.ts` — schedule strings for each preset + custom; `nextDueDate` incl. paused/ended → null.
- `src/lib/data/recurring.test.ts` — create/update, pause skips generation, resume catch-up, materialisation for each unit, description flows into transactions.
- `scripts/migrate-akaunting/transform.test.ts` — weekly/daily now import (were skipped); monthly/quarterly/yearly map correctly; unknown frequency still skipped.
- `scripts/migrate-akaunting/apply.test.ts` — recurring create uses new fields; idempotent dedup unchanged.

## Components Summary

| Unit | Responsibility |
|---|---|
| `occurrences.ts` | Pure date math: occurrence dates for any interval. |
| `describe.ts` | Pure: human-readable schedule + next-due. |
| `data/recurring.ts` | DB access: list/create/update/setActive/materialise. |
| `recurring/actions.ts` | Server actions + validation. |
| `recurring/page.tsx` | List (layout A) + add form host. |
| `RecurringForm.tsx` | Client: adaptive builder + live preview. |
| `recurring/[id]/edit/page.tsx` | Edit route. |
| `prisma/schema.prisma` + migration | New model + backfill. |
| `migrate-akaunting/{transform,apply,types,read}.ts` | Importer mapped to new model. |
