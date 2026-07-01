import { listProperties } from "../../../lib/data/activeProperty";
import { getScenarioInput } from "../../../lib/data/scenarioInput";
import { runScenario, type ScenarioInput } from "../../../lib/tax/scenario";
import { getTaxYear } from "../../../lib/tax/taxYear";
import { formatGBP, penceToPounds, poundsToPence } from "../../../lib/tax/money";
import type { Region } from "../../../lib/tax/types";
import { PageHeader } from "../_ui/PageHeader";
import { YearNav } from "../_ui/YearNav";
import { MoneyInput } from "../_ui/MoneyInput";

type Search = {
  ty?: string; basis?: string;
  income?: string; expenses?: string; finance?: string; other?: string; region?: string;
};

// A pounds override wins over the loaded figure only when it is a valid non-negative number.
function overridePence(raw: string | undefined, fallbackPence: number): number {
  if (raw === undefined || raw === "") return fallbackPence;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallbackPence;
  return poundsToPence(n);
}

export default async function PlannerPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  // Guard the URL param: a non-"YYYY-YY" value would make taxYearRange() build an Invalid Date
  // and 500 at the Prisma layer. Fall back to the current tax year instead.
  const taxYear = sp.ty && /^\d{4}-\d{2}$/.test(sp.ty) ? sp.ty : getTaxYear(new Date());
  const basis = sp.basis ?? "all";

  const properties = await listProperties();
  const personalProperties = properties.filter((p) => p.ownershipType === "personal");

  const loaded = await getScenarioInput({ taxYear, basis });
  const region: Region = sp.region === "scotland" || sp.region === "englandWalesNI" ? sp.region : loaded.region;

  const input: ScenarioInput = {
    incomePence: overridePence(sp.income, loaded.incomePence),
    expensesPence: overridePence(sp.expenses, loaded.expensesPence),
    financeCostsPence: overridePence(sp.finance, loaded.financeCostsPence),
    otherIncomePence: overridePence(sp.other, loaded.otherIncomePence),
    taxYear,
    region,
  };

  const { outcomes } = runScenario(input);
  const best = outcomes.reduce((a, b) => (b.pocketPence > a.pocketPence ? b : a));

  const startYear = Number(taxYear.slice(0, 4));
  const yearOptions = [startYear - 2, startYear - 1, startYear, startYear + 1].map((y) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="What-if planner" subtitle="Compare how you hold your property">
          <YearNav basePath="/planner" paramKey="ty" current={taxYear} label="Tax year" extraQuery={{ basis }} />
        </PageHeader>
      </div>

      {personalProperties.length === 0 && (
        <div className="reveal" style={{ animationDelay: "30ms" }}>
          <p className="rounded-lg border border-ochre/40 bg-ochre-soft/50 px-4 py-3 text-sm text-ink">
            No properties yet — add one and record some transactions to pre-fill these figures from your
            records, or just type numbers below to explore scenarios.
          </p>
        </div>
      )}

      <form method="get" className="reveal card p-5" style={{ animationDelay: "60ms" }}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <label className="block">
            <span className="label">Tax year</span>
            <select name="ty" defaultValue={taxYear} className="field">
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Based on</span>
            <select name="basis" defaultValue={basis} className="field">
              <option value="all">All personal properties</option>
              {personalProperties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Tax region</span>
            <select name="region" defaultValue={region} className="field">
              <option value="englandWalesNI">England / Wales / NI</option>
              <option value="scotland">Scotland</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Rental income (£/yr)</span>
            <MoneyInput name="income" defaultValue={penceToPounds(input.incomePence)} />
          </label>
          <label className="block">
            <span className="label">Expenses (£/yr)</span>
            <MoneyInput name="expenses" defaultValue={penceToPounds(input.expensesPence)} />
          </label>
          <label className="block">
            <span className="label">Mortgage interest (£/yr)</span>
            <MoneyInput name="finance" defaultValue={penceToPounds(input.financeCostsPence)} />
          </label>
          <label className="block">
            <span className="label">Your other income (£/yr)</span>
            <MoneyInput name="other" defaultValue={penceToPounds(input.otherIncomePence)} />
          </label>
          <div className="col-span-2 flex items-end gap-3 md:col-span-3">
            <button type="submit" className="btn btn-primary">Compare</button>
            <a href={`/planner?ty=${taxYear}&basis=${basis}`} className="btn btn-ghost">Reset to my real figures</a>
          </div>
        </div>
      </form>

      <div className="reveal grid gap-4 md:grid-cols-4" style={{ animationDelay: "120ms" }}>
        {outcomes.map((o) => (
          <div key={o.key} className={`card p-4 ${o.key === best.key ? "ring-1 ring-forest border-forest" : ""}`}>
            <div className="text-sm font-medium text-ink">{o.label}</div>
            <div className="mt-2 text-xs text-muted">Tax</div>
            <div className="money text-lg font-semibold text-ink">{formatGBP(o.taxPence)}</div>
            <div className="mt-2 text-xs text-muted">In your pocket</div>
            <div className={`money text-2xl font-semibold ${o.key === best.key ? "text-forest" : "text-ink"}`}>{formatGBP(o.pocketPence)}</div>
            <p className="mt-2 text-xs text-muted">{o.note}</p>
          </div>
        ))}
      </div>

      <p className="reveal text-sm text-ink" style={{ animationDelay: "180ms" }}>
        On these figures, <strong>{best.label}</strong> keeps the most in your pocket: {formatGBP(best.pocketPence)}.
      </p>

      <p className="reveal text-xs text-faint" style={{ animationDelay: "240ms" }}>
        Estimate only — not tax advice. It compares tax alone and ignores incorporation costs, capital
        gains tax and stamp duty on transferring a property into a company, typically higher company
        mortgage rates, and accountancy fees. Tax rates are the latest year configured in the app
        (currently 2025/26); other tax years are estimated using those rates. Talk to an accountant
        before deciding.
      </p>
    </div>
  );
}
