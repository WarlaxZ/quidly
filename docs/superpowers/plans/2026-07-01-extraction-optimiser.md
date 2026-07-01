# Salary-vs-Dividend Optimiser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/extraction` page ("Salary vs dividends") that finds the salary/dividend split maximising a director's take-home after corporation tax, employer & employee NIC, income tax and dividend tax.

**Architecture:** A new pure Class-1 NIC engine (`nic.ts`) + a pure optimiser (`extraction.ts`) that composes it with the existing `corporationTax`/`incomeTaxOn`/`dividendTax`, sweeping candidate salaries to find the optimum. A design-system page renders the recommendation, a breakdown, named strategies, and an inline SVG curve.

**Tech Stack:** TypeScript, Vitest, Next.js 16 (server component + GET form). Money is integer pence; rates are integer basis points; single-round `Math.round(x * bps / 10000)`.

---

## Reference

- Existing engines to compose: `corporationTax(profitPence, year)` (`./corporationTax`), `incomeTaxOn(totalIncomePence, taxYear, region)` (`./incomeTax`), `dividendTax(dividendPence, otherIncomePence, taxYear)` (`./dividendTax`). Types: `Region` from `./types`.
- Page pattern to mirror: `src/app/(app)/planner/page.tsx` (GET form, `overridePence`, `ty` guard, region whitelist, design-system classes). Primitives in `src/app/(app)/_ui/` (`PageHeader`, `Banner`, `MoneyInput`). Design classes in `src/app/globals.css`.
- Money via `formatGBP`/`penceToPounds`/`poundsToPence` from `../../../lib/tax/money`.

---

## Task 1: NIC engine (`src/lib/tax/nic.ts`)

**Files:** Create `src/lib/tax/nic.ts`, `src/lib/tax/nic.test.ts`.

- [ ] **Step 1: Write the failing test `src/lib/tax/nic.test.ts`**
```ts
import { describe, expect, it } from "vitest";
import { employerNIC, employeeNIC } from "./nic";

describe("employerNIC (2025-26, 15% above £5,000)", () => {
  it("is zero at/below the secondary threshold", () => {
    expect(employerNIC(5_000_00, "2025-26")).toBe(0);
    expect(employerNIC(4_000_00, "2025-26")).toBe(0);
  });
  it("is 15% of pay above £5,000", () => {
    // (12,570 − 5,000) × 15% = 1,135.50
    expect(employerNIC(12_570_00, "2025-26")).toBe(1_135_50);
  });
  it("is reduced by an Employment Allowance budget (to zero when covered)", () => {
    expect(employerNIC(12_570_00, "2025-26", 10_500_00)).toBe(0);
  });
  it("falls back to the latest year for an unknown year", () => {
    expect(employerNIC(12_570_00, "2099-00")).toBe(1_135_50);
  });
});

describe("employeeNIC (2025-26, 8% PT→UEL, 2% above)", () => {
  it("is zero at/below the £12,570 primary threshold", () => {
    expect(employeeNIC(12_570_00, "2025-26")).toBe(0);
    expect(employeeNIC(9_000_00, "2025-26")).toBe(0);
  });
  it("is 8% between the primary threshold and the UEL", () => {
    // (20,000 − 12,570) × 8% = 594.40
    expect(employeeNIC(20_000_00, "2025-26")).toBe(594_40);
  });
  it("adds 2% above the £50,270 UEL", () => {
    // (50,270 − 12,570) × 8% = 3,016.00 ; (60,000 − 50,270) × 2% = 194.60 ; total 3,210.60
    expect(employeeNIC(60_000_00, "2025-26")).toBe(3_210_60);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`cd /home/ash/projects/akaunting-ng && npx vitest run src/lib/tax/nic.test.ts` → "Failed to resolve import './nic'").

- [ ] **Step 3: Implement `src/lib/tax/nic.ts`**
```ts
/** UK Class 1 National Insurance — employer (secondary) and employee (primary).
 *  v1 rates are per-year basis-point config; VERIFY against HMRC each April. */

export interface NICRates {
  secondaryThresholdPence: number;   // employer NIC starts above this
  secondaryBps: number;              // employer rate (1500 = 15%)
  primaryThresholdPence: number;     // employee NIC starts above this
  uelPence: number;                  // upper earnings limit
  mainBps: number;                   // employee rate PT→UEL (800 = 8%)
  upperBps: number;                  // employee rate above UEL (200 = 2%)
  employmentAllowancePence: number;  // max employer-NIC waiver (if eligible)
}

const NIC_2025_26: NICRates = {
  secondaryThresholdPence: 5_000_00,
  secondaryBps: 1500,
  primaryThresholdPence: 12_570_00,
  uelPence: 50_270_00,
  mainBps: 800,
  upperBps: 200,
  employmentAllowancePence: 10_500_00,
};

const NIC_RATES: Record<string, NICRates> = { "2025-26": NIC_2025_26 };
const LATEST_YEAR = "2025-26";

export function nicRates(year: string): NICRates {
  return NIC_RATES[year] ?? NIC_RATES[LATEST_YEAR];
}

/** Employer (secondary) Class 1 NIC on an annual salary. `employmentAllowancePence` (default 0)
 *  is waived off the result — a sole-director company is NOT eligible, so callers pass 0 by default. */
export function employerNIC(salaryPence: number, year: string, employmentAllowancePence = 0): number {
  const r = nicRates(year);
  const raw = Math.round((Math.max(0, salaryPence - r.secondaryThresholdPence) * r.secondaryBps) / 10000);
  return Math.max(0, raw - employmentAllowancePence);
}

/** Employee (primary) Class 1 NIC on an annual salary. */
export function employeeNIC(salaryPence: number, year: string): number {
  const r = nicRates(year);
  const mainBand = Math.max(0, Math.min(salaryPence, r.uelPence) - r.primaryThresholdPence);
  const upperBand = Math.max(0, salaryPence - r.uelPence);
  return Math.round((mainBand * r.mainBps) / 10000) + Math.round((upperBand * r.upperBps) / 10000);
}
```

- [ ] **Step 4: Run it — expect PASS** (`npx vitest run src/lib/tax/nic.test.ts` → all pass). Then `npx tsc --noEmit 2>&1 | grep -c "error TS"` → 0.

- [ ] **Step 5: Commit**
```bash
git add src/lib/tax/nic.ts src/lib/tax/nic.test.ts
git commit -m "feat: pure Class-1 NIC engine (employer + employee)"
```

---

## Task 2: Optimiser engine (`src/lib/tax/extraction.ts`)

**Files:** Create `src/lib/tax/extraction.ts`, `src/lib/tax/extraction.test.ts`.

- [ ] **Step 1: Write the failing test `src/lib/tax/extraction.test.ts`**
```ts
import { describe, expect, it } from "vitest";
import { extractionOutcome, optimiseExtraction, type ExtractionInput } from "./extraction";

const base: ExtractionInput = {
  profitBeforeSalaryPence: 60_000_00,
  otherIncomePence: 0,
  taxYear: "2025-26",
  region: "englandWalesNI",
  employmentAllowance: false,
};

describe("extractionOutcome", () => {
  it("computes NIC/CT/dividend components for a £12,570 salary", () => {
    const o = extractionOutcome(12_570_00, base);
    expect(o.employerNicPence).toBe(1_135_50);           // 15% of (12,570 − 5,000)
    expect(o.employeeNicPence).toBe(0);                  // at the primary threshold
    expect(o.incomeTaxPence).toBe(0);                    // salary within the personal allowance
    // dividend = (profit − salary − employerNIC) − CT
    expect(o.dividendPence).toBe(60_000_00 - 12_570_00 - o.employerNicPence - o.corporationTaxPence);
    // total tax is the sum of the five components
    expect(o.totalTaxPence).toBe(o.employerNicPence + o.corporationTaxPence + o.employeeNicPence + o.incomeTaxPence + o.dividendTaxPence);
  });

  it("satisfies the conservation identity (profit = take-home + total tax) for affordable salaries", () => {
    for (const s of [0, 5_000_00, 12_570_00]) {
      const o = extractionOutcome(s, base);
      expect(o.takeHomePence + o.totalTaxPence).toBe(60_000_00);
    }
  });

  it("never produces negative dividends or tax for a tiny profit", () => {
    const o = extractionOutcome(0, { ...base, profitBeforeSalaryPence: 0 });
    expect(o.dividendPence).toBe(0);
    expect(o.totalTaxPence).toBe(0);
    expect(o.takeHomePence).toBe(0);
  });
});

describe("optimiseExtraction", () => {
  it("recommends the take-home maximum over every strategy and curve point", () => {
    const r = optimiseExtraction(base);
    for (const s of r.strategies) expect(r.recommended.takeHomePence).toBeGreaterThanOrEqual(s.outcome.takeHomePence);
    for (const p of r.curve) expect(r.recommended.takeHomePence).toBeGreaterThanOrEqual(p.takeHomePence);
  });
  it("includes the four named strategies", () => {
    const keys = optimiseExtraction(base).strategies.map((s) => s.key).sort();
    expect(keys).toEqual(["allowance", "none", "optimum", "secondary"]);
  });
  it("degrades to an all-zero result for non-positive profit", () => {
    const r = optimiseExtraction({ ...base, profitBeforeSalaryPence: 0 });
    expect(r.recommended).toMatchObject({ salaryPence: 0, dividendPence: 0, totalTaxPence: 0, takeHomePence: 0 });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npx vitest run src/lib/tax/extraction.test.ts` → import error).

- [ ] **Step 3: Implement `src/lib/tax/extraction.ts`**
```ts
import { corporationTax } from "./corporationTax";
import { incomeTaxOn } from "./incomeTax";
import { dividendTax } from "./dividendTax";
import { employerNIC, employeeNIC, nicRates } from "./nic";
import type { Region } from "./types";

const SWEEP_CAP_PENCE = 12_570_00; // optimum lies within [0, personal allowance]
const SWEEP_STEP_PENCE = 10_00;    // £10 grid
const CURVE_POINTS = 20;

export interface ExtractionInput {
  profitBeforeSalaryPence: number;
  otherIncomePence: number;
  taxYear: string;
  region: Region;
  employmentAllowance: boolean;
}
export interface ExtractionOutcome {
  salaryPence: number;
  dividendPence: number;
  employerNicPence: number;
  corporationTaxPence: number;
  employeeNicPence: number;
  incomeTaxPence: number;
  dividendTaxPence: number;
  totalTaxPence: number;
  takeHomePence: number;
}
export type StrategyKey = "none" | "secondary" | "allowance" | "optimum";
export interface StrategyRow { key: StrategyKey; label: string; outcome: ExtractionOutcome; }
export interface ExtractionResult {
  recommended: ExtractionOutcome;
  strategies: StrategyRow[];
  curve: { salaryPence: number; takeHomePence: number }[];
}

/** One salary scenario, running the full model (Section 1 of the spec). */
export function extractionOutcome(salaryPence: number, input: ExtractionInput): ExtractionOutcome {
  const { profitBeforeSalaryPence, otherIncomePence, taxYear, region, employmentAllowance } = input;
  const salary = Math.max(0, salaryPence);
  const eaBudget = employmentAllowance ? nicRates(taxYear).employmentAllowancePence : 0;

  const employerNicPence = employerNIC(salary, taxYear, eaBudget);
  const companyTaxableProfit = Math.max(0, profitBeforeSalaryPence - salary - employerNicPence);
  const corporationTaxPence = corporationTax(companyTaxableProfit, taxYear).taxPence;
  const dividendPence = Math.max(0, companyTaxableProfit - corporationTaxPence);

  const employeeNicPence = employeeNIC(salary, taxYear);
  const incomeTaxPence = Math.max(0, incomeTaxOn(otherIncomePence + salary, taxYear, region) - incomeTaxOn(otherIncomePence, taxYear, region));
  const dividendTaxPence = dividendTax(dividendPence, otherIncomePence + salary, taxYear);

  const totalTaxPence = employerNicPence + corporationTaxPence + employeeNicPence + incomeTaxPence + dividendTaxPence;
  const takeHomePence = salary + dividendPence - employeeNicPence - incomeTaxPence - dividendTaxPence;

  return { salaryPence: salary, dividendPence, employerNicPence, corporationTaxPence, employeeNicPence, incomeTaxPence, dividendTaxPence, totalTaxPence, takeHomePence };
}

export function optimiseExtraction(input: ExtractionInput): ExtractionResult {
  const profit = input.profitBeforeSalaryPence;
  if (profit <= 0) {
    const zero = extractionOutcome(0, input);
    return { recommended: zero, strategies: [{ key: "none", label: "No salary", outcome: zero }], curve: [{ salaryPence: 0, takeHomePence: zero.takeHomePence }] };
  }

  const cap = Math.min(profit, SWEEP_CAP_PENCE);
  const namedSalaries = [0, Math.min(5_000_00, profit), Math.min(12_570_00, profit)];
  const curveSalaries = Array.from({ length: CURVE_POINTS + 1 }, (_, i) => Math.round((cap * i) / CURVE_POINTS));

  // Candidate salaries: the £10 grid + the curve points + the named-strategy points, all affordable.
  const candidates = new Set<number>(curveSalaries);
  for (let s = 0; s <= cap; s += SWEEP_STEP_PENCE) candidates.add(s);
  candidates.add(cap);
  for (const s of namedSalaries) candidates.add(s);
  const sorted = [...candidates].sort((a, b) => a - b);

  let recommended = extractionOutcome(sorted[0], input);
  for (const s of sorted) {
    const o = extractionOutcome(s, input);
    if (o.takeHomePence > recommended.takeHomePence) recommended = o; // strict > → ties keep the lower salary
  }

  const strategies: StrategyRow[] = [
    { key: "none", label: "No salary", outcome: extractionOutcome(namedSalaries[0], input) },
    { key: "secondary", label: "Salary to £5,000", outcome: extractionOutcome(namedSalaries[1], input) },
    { key: "allowance", label: "Salary to £12,570", outcome: extractionOutcome(namedSalaries[2], input) },
    { key: "optimum", label: "Optimum", outcome: recommended },
  ];
  const curve = curveSalaries.map((s) => ({ salaryPence: s, takeHomePence: extractionOutcome(s, input).takeHomePence }));

  return { recommended, strategies, curve };
}
```

- [ ] **Step 4: Run it — expect PASS** (`npx vitest run src/lib/tax/extraction.test.ts` → all pass). If any assertion fails, STOP and report the actual values. Then `npx tsc --noEmit 2>&1 | grep -c "error TS"` → 0.

- [ ] **Step 5: Commit**
```bash
git add src/lib/tax/extraction.ts src/lib/tax/extraction.test.ts
git commit -m "feat: pure salary-vs-dividend extraction optimiser"
```

---

## Task 3: `/extraction` page + nav

**Files:** Create `src/app/(app)/extraction/page.tsx`; modify `src/app/(app)/layout.tsx` (add the nav item).

- [ ] **Step 1: Add the nav item in `src/app/(app)/layout.tsx`**
In the `groups` array, the "Tax" group currently is:
```ts
    {
      heading: "Tax",
      items: [
        { href: "/sa105", label: "SA105" },
        { href: "/planner", label: "What-if planner" },
      ],
    },
```
Add a third item so it becomes:
```ts
    {
      heading: "Tax",
      items: [
        { href: "/sa105", label: "SA105" },
        { href: "/planner", label: "What-if planner" },
        { href: "/extraction", label: "Salary vs dividends" },
      ],
    },
```

- [ ] **Step 2: Create `src/app/(app)/extraction/page.tsx`**
```tsx
import { PageHeader } from "../_ui/PageHeader";
import { MoneyInput } from "../_ui/MoneyInput";
import { optimiseExtraction, type ExtractionInput, type ExtractionOutcome } from "../../../lib/tax/extraction";
import { getTaxYear } from "../../../lib/tax/taxYear";
import { formatGBP, penceToPounds, poundsToPence } from "../../../lib/tax/money";
import type { Region } from "../../../lib/tax/types";

type Search = { ty?: string; profit?: string; other?: string; region?: string; ea?: string };

function overridePence(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return poundsToPence(n);
}

export default async function ExtractionPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const taxYear = sp.ty && /^\d{4}-\d{2}$/.test(sp.ty) ? sp.ty : getTaxYear(new Date());
  const region: Region = sp.region === "scotland" || sp.region === "englandWalesNI" ? sp.region : "englandWalesNI";
  const employmentAllowance = sp.ea === "1";

  const input: ExtractionInput = {
    profitBeforeSalaryPence: overridePence(sp.profit),
    otherIncomePence: overridePence(sp.other),
    taxYear,
    region,
    employmentAllowance,
  };

  const result = input.profitBeforeSalaryPence > 0 ? optimiseExtraction(input) : null;

  const startYear = Number(taxYear.slice(0, 4));
  const yearOptions = [startYear - 1, startYear, startYear + 1].map((y) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`);

  const BreakdownRow = ({ label, pence, bold }: { label: string; pence: number; bold?: boolean }) => (
    <div className={`flex items-baseline justify-between py-2 ${bold ? "border-t border-line-strong pt-3" : ""}`}>
      <span className={bold ? "font-display text-base text-ink" : "text-sm text-muted"}>{label}</span>
      <span className={`money text-sm ${bold ? "font-medium text-ink" : "text-ink"}`}>{formatGBP(pence)}</span>
    </div>
  );

  // Inline SVG take-home curve
  const curveSvg = (() => {
    if (!result || result.curve.length < 2) return null;
    const xs = result.curve.map((p) => p.salaryPence);
    const ys = result.curve.map((p) => p.takeHomePence);
    const maxX = Math.max(...xs, 1), minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanY = maxY - minY || 1;
    const pt = (x: number, y: number) => `${(x / maxX) * 100},${38 - ((y - minY) / spanY) * 34}`;
    const points = result.curve.map((p) => pt(p.salaryPence, p.takeHomePence)).join(" ");
    const opt = pt(result.recommended.salaryPence, result.recommended.takeHomePence).split(",");
    return (
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-24 w-full" aria-hidden>
        <polyline points={points} fill="none" stroke="var(--color-forest)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <circle cx={opt[0]} cy={opt[1]} r="1.4" fill="var(--color-ochre)" />
      </svg>
    );
  })();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader title="Salary vs dividends" subtitle="Find the most tax-efficient way to pay yourself from your company.">
        <span className="pill">Tax year {taxYear}</span>
      </PageHeader>

      <form method="get" className="reveal card grid grid-cols-2 gap-4 p-5 md:grid-cols-4" style={{ animationDelay: "40ms" }}>
        <label className="col-span-2 block md:col-span-1">
          <span className="label">Company profit (before your salary)</span>
          <MoneyInput name="profit" defaultValue={input.profitBeforeSalaryPence ? penceToPounds(input.profitBeforeSalaryPence) : ""} />
        </label>
        <label className="col-span-2 block md:col-span-1">
          <span className="label">Your other income</span>
          <MoneyInput name="other" defaultValue={input.otherIncomePence ? penceToPounds(input.otherIncomePence) : ""} />
        </label>
        <label className="block">
          <span className="label">Tax year</span>
          <select name="ty" defaultValue={taxYear} className="field">
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Tax region</span>
          <select name="region" defaultValue={region} className="field">
            <option value="englandWalesNI">England / Wales / NI</option>
            <option value="scotland">Scotland</option>
          </select>
        </label>
        <label className="col-span-2 flex items-center gap-2.5 md:col-span-3">
          <input type="checkbox" name="ea" value="1" defaultChecked={employmentAllowance} className="h-4 w-4 accent-forest" />
          <span className="text-sm text-ink">Claim Employment Allowance <span className="text-faint">— only if the company has another employee; a sole director usually can&apos;t.</span></span>
        </label>
        <div className="flex items-end">
          <button type="submit" className="btn btn-primary w-full">Optimise</button>
        </div>
      </form>

      {!result ? (
        <p className="reveal text-sm text-muted" style={{ animationDelay: "80ms" }}>Enter your company&apos;s profit above to see the optimal salary/dividend split.</p>
      ) : (
        <>
          <section className="reveal grid gap-4 md:grid-cols-5" style={{ animationDelay: "80ms" }}>
            <div className="md:col-span-3 flex flex-col justify-center rounded-[14px] bg-forest p-6 text-forest-ink shadow-[var(--shadow-raise)]">
              <div className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-forest-ink/70">Pay yourself</div>
              <div className="mt-2 font-display text-2xl">
                <span className="money">{formatGBP(result.recommended.salaryPence)}</span> salary
                {" + "}
                <span className="money">{formatGBP(result.recommended.dividendPence)}</span> dividends
              </div>
              <div className="mt-4 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-forest-ink/70">You keep</div>
              <div className="money text-[2.2rem] leading-none font-medium">{formatGBP(result.recommended.takeHomePence)}</div>
              <div className="mt-2 text-[0.8rem] text-forest-ink/80">All-in tax <b className="money text-forest-ink">{formatGBP(result.recommended.totalTaxPence)}</b></div>
            </div>
            <div className="card md:col-span-2 p-5">
              <div className="mb-1 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Where it goes</div>
              <BreakdownRow label="Employer NIC" pence={result.recommended.employerNicPence} />
              <BreakdownRow label="Corporation tax" pence={result.recommended.corporationTaxPence} />
              <BreakdownRow label="Employee NIC" pence={result.recommended.employeeNicPence} />
              <BreakdownRow label="Income tax on salary" pence={result.recommended.incomeTaxPence} />
              <BreakdownRow label="Dividend tax" pence={result.recommended.dividendTaxPence} />
              <BreakdownRow label="Total tax" pence={result.recommended.totalTaxPence} bold />
            </div>
          </section>

          <section className="reveal space-y-3" style={{ animationDelay: "140ms" }}>
            <h2 className="text-lg text-ink">Strategies compared</h2>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="ledger">
                  <thead><tr><th>Strategy</th><th className="text-right">Salary</th><th className="text-right">Dividends</th><th className="text-right">Total tax</th><th className="text-right">Take-home</th></tr></thead>
                  <tbody>
                    {result.strategies.map((s) => (
                      <tr key={s.key} className={s.key === "optimum" ? "bg-surface-sunk font-medium" : ""}>
                        <td className={s.key === "optimum" ? "text-forest" : "text-ink"}>{s.label}</td>
                        <td className="money text-right">{formatGBP(s.outcome.salaryPence)}</td>
                        <td className="money text-right">{formatGBP(s.outcome.dividendPence)}</td>
                        <td className="money text-right">{formatGBP(s.outcome.totalTaxPence)}</td>
                        <td className={`money text-right ${s.key === "optimum" ? "text-forest" : "text-ink"}`}>{formatGBP(s.outcome.takeHomePence)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {curveSvg && (
            <section className="reveal space-y-2" style={{ animationDelay: "200ms" }}>
              <h2 className="text-lg text-ink">Take-home as salary rises</h2>
              <div className="card p-5">
                {curveSvg}
                <p className="mt-2 text-xs text-faint">Optimum salary <span className="money">{formatGBP(result.recommended.salaryPence)}</span> (marked). Take-home peaks then falls as salary attracts NIC and income tax.</p>
              </div>
            </section>
          )}
        </>
      )}

      <p className="reveal text-xs text-faint" style={{ animationDelay: "260ms" }}>
        Estimate only — not payroll or tax advice. Assumes a single-director company (Employment Allowance off unless ticked) and ignores pension contributions, student-loan deductions, and other benefits. NIC, corporation-tax and dividend rates change — verify with your accountant.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Verify**
Run `cd /home/ash/projects/akaunting-ng && npx tsc --noEmit 2>&1 | grep -c "error TS"` → 0. Then `npm test` → full suite passes (report totals).

- [ ] **Step 4: Commit**
```bash
git add "src/app/(app)/extraction/page.tsx" "src/app/(app)/layout.tsx"
git commit -m "feat: /extraction salary-vs-dividend optimiser page"
```

---

## Self-review notes (already reconciled)

- **Spec coverage:** NIC engine (Task 1) ↔ spec §2; optimiser engine with sweep/strategies/curve/degenerate (Task 2) ↔ §3; page + nav + SVG curve + caveat (Task 3) ↔ §4; testing ↔ §5 (NIC exacts, conservation identity, recommended ≥ all strategies/curve, degenerate). The flow live-run runs after Task 3.
- **Type consistency:** `ExtractionInput`/`ExtractionOutcome`/`StrategyRow`/`ExtractionResult` defined in Task 2 and consumed unchanged in Task 3; `nicRates`/`employerNIC`/`employeeNIC` from Task 1 used in Task 2; `MoneyInput`/`PageHeader` primitives already exist.
- **Verified NIC numbers:** employer £12,570 → £1,135.50; employee £20,000 → £594.40, £60,000 → £3,210.60. **Conservation identity** confirmed by construction (`takeHome + totalTax = salary + dividend + employerNIC + CT = profitBeforeSalary` for affordable salaries).
- **Rates to VERIFY each April** live in `NICRates` (employer 15%/£5,000, employee 8%/2% at £12,570/£50,270, EA £10,500), flagged in the file + on-screen caveat.
