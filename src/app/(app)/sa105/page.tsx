import { getOrCreateDefaultProperty } from "../../../lib/data/property";
import { getTaxYearSummary } from "../../../lib/data/summary";
import { getTaxYear } from "../../../lib/tax/taxYear";
import { formatGBP } from "../../../lib/tax/money";
import { SA105_BOX_LABELS } from "../../../lib/tax/sa105Labels";

export default async function Sa105Page({ searchParams }: { searchParams: Promise<{ ty?: string }> }) {
  const { ty } = await searchParams;
  const taxYear = ty ?? getTaxYear(new Date());
  const property = await getOrCreateDefaultProperty();
  const { summary } = await getTaxYearSummary(property.id, taxYear);
  const boxes = Object.keys(summary.sa105).sort((a, b) => Number(a) - Number(b));

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">SA105 summary — {taxYear}</h1>
      <p className="text-sm text-gray-600">
        Figures to enter on the UK property pages (SA105) of your Self Assessment. Box 44 (finance costs) is a
        20% basic-rate tax reducer, not a deduction.
      </p>
      <table className="w-full border">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="px-3 py-2 w-16">Box</th><th className="px-3 py-2">Description</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {boxes.map((box) => (
            <tr key={box} className="border-b">
              <td className="px-3 py-2 font-mono">{box}</td>
              <td className="px-3 py-2">{SA105_BOX_LABELS[box] ?? "—"}</td>
              <td className="px-3 py-2 text-right">{formatGBP(summary.sa105[box])}</td>
            </tr>
          ))}
          {boxes.length === 0 && <tr><td colSpan={3} className="px-3 py-2 text-gray-500">No data for this tax year.</td></tr>}
        </tbody>
      </table>
      <p className="text-xs text-gray-400">Box numbers reflect the 2025/26 SA105 — verify against the current year's form notes before filing.</p>
    </div>
  );
}
