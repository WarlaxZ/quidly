import { getOrCreateDefaultProperty } from "../../../lib/data/property";
import { getTaxYearSummary } from "../../../lib/data/summary";
import { getTaxYear } from "../../../lib/tax/taxYear";
import { formatGBP, penceToPounds } from "../../../lib/tax/money";
import { saveOtherIncomeAction } from "./actions";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ ty?: string; error?: string }> }) {
  const { ty, error } = await searchParams;
  const taxYear = ty ?? getTaxYear(new Date());
  const property = await getOrCreateDefaultProperty();
  const { summary, otherIncomePence, usePropertyAllowance } = await getTaxYearSummary(property.id, taxYear);

  const Card = ({ label, pence, accent }: { label: string; pence: number; accent?: boolean }) => (
    <div className="rounded border p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold ${accent ? "text-green-700" : ""}`}>{formatGBP(pence)}</div>
    </div>
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <span className="text-gray-500">Tax year {taxYear}</span>
      </div>
      {error && <p className="rounded bg-red-100 px-3 py-2 text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card label="Rental income" pence={summary.incomePence} />
        <Card label="Allowable expenses" pence={summary.expensesPence} />
        <Card label="Profit" pence={summary.profitPence} />
        <Card label="Mortgage interest" pence={summary.financeCostsPence} />
        <Card label="Finance-cost relief (20%)" pence={summary.financeReducerPence} />
        <Card label="Estimated tax on property" pence={summary.estimatedTaxPence} accent />
      </div>
      <p className="text-sm text-gray-600">
        Taxable profit {formatGBP(summary.taxableProfitPence)} · marginal rate {(summary.marginalRate * 100).toFixed(0)}%.
        {summary.allowanceRecommended
          ? " Tip: the £1,000 property allowance would reduce your taxable profit more than your actual expenses — consider enabling it."
          : " You're better off claiming actual expenses than the £1,000 property allowance."}
      </p>
      <form action={saveOtherIncomeAction} className="flex items-end gap-2">
        <input type="hidden" name="taxYear" value={taxYear} />
        <label className="block">
          <span className="block text-sm">Your other (non-property) income this year</span>
          <input name="otherIncome" defaultValue={penceToPounds(otherIncomePence)} className="border px-2 py-1" />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="usePropertyAllowance" defaultChecked={usePropertyAllowance} />
          <span className="text-sm">Use £1,000 property allowance instead of expenses</span>
        </label>
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Update estimate</button>
      </form>
      <p className="text-xs text-gray-400">Estimates only — not tax advice. Verify against the current SA105 notes before filing.</p>
    </div>
  );
}
