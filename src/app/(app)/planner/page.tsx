import { listProperties } from "../../../lib/data/activeProperty";
import { getScenarioInput } from "../../../lib/data/scenarioInput";
import { runScenario, type ScenarioInput } from "../../../lib/tax/scenario";
import { getTaxYear } from "../../../lib/tax/taxYear";
import { formatGBP, penceToPounds, poundsToPence } from "../../../lib/tax/money";
import type { Region } from "../../../lib/tax/types";

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
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">What-if planner</h1>
        <span className="text-gray-500">Tax year {taxYear}</span>
      </div>
      <p className="text-sm text-gray-600">
        Compare the tax and the cash you keep under each way of holding your property. Figures are
        pre-filled from your records — change any of them to test a different scenario.
      </p>

      <form method="get" className="grid grid-cols-2 gap-3 rounded border p-4 md:grid-cols-3">
        <label className="block">
          <span className="block text-sm">Tax year</span>
          <select name="ty" defaultValue={taxYear} className="w-full border px-2 py-1">
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-sm">Based on</span>
          <select name="basis" defaultValue={basis} className="w-full border px-2 py-1">
            <option value="all">All personal properties</option>
            {personalProperties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-sm">Tax region</span>
          <select name="region" defaultValue={region} className="w-full border px-2 py-1">
            <option value="englandWalesNI">England / Wales / NI</option>
            <option value="scotland">Scotland</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-sm">Rental income (£/yr)</span>
          <input name="income" defaultValue={penceToPounds(input.incomePence)} className="w-full border px-2 py-1" />
        </label>
        <label className="block">
          <span className="block text-sm">Expenses (£/yr)</span>
          <input name="expenses" defaultValue={penceToPounds(input.expensesPence)} className="w-full border px-2 py-1" />
        </label>
        <label className="block">
          <span className="block text-sm">Mortgage interest (£/yr)</span>
          <input name="finance" defaultValue={penceToPounds(input.financeCostsPence)} className="w-full border px-2 py-1" />
        </label>
        <label className="block">
          <span className="block text-sm">Your other income (£/yr)</span>
          <input name="other" defaultValue={penceToPounds(input.otherIncomePence)} className="w-full border px-2 py-1" />
        </label>
        <div className="col-span-2 flex items-end gap-3 md:col-span-3">
          <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Compare</button>
          <a href={`/planner?ty=${taxYear}&basis=${basis}`} className="text-sm text-blue-600 hover:underline">Reset to my real figures</a>
        </div>
      </form>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {outcomes.map((o) => (
          <div key={o.key} className={`rounded border p-4 ${o.key === best.key ? "border-green-600 ring-1 ring-green-600" : ""}`}>
            <div className="text-sm font-medium">{o.label}</div>
            <div className="mt-2 text-xs text-gray-500">Tax</div>
            <div className="text-lg font-semibold">{formatGBP(o.taxPence)}</div>
            <div className="mt-2 text-xs text-gray-500">In your pocket</div>
            <div className={`text-2xl font-semibold ${o.key === best.key ? "text-green-700" : ""}`}>{formatGBP(o.pocketPence)}</div>
            <p className="mt-2 text-xs text-gray-500">{o.note}</p>
          </div>
        ))}
      </div>

      <p className="text-sm text-gray-700">
        On these figures, <strong>{best.label}</strong> keeps the most in your pocket: {formatGBP(best.pocketPence)}.
      </p>

      <p className="text-xs text-gray-400">
        Estimate only — not tax advice. It compares tax alone and ignores incorporation costs, capital
        gains tax and stamp duty on transferring a property into a company, typically higher company
        mortgage rates, and accountancy fees. Talk to an accountant before deciding.
      </p>
    </div>
  );
}
