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
