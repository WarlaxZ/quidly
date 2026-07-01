import { getPersonalTaxYearSummary } from "../../../lib/data/personalSummary";
import { latestConfiguredTaxYear, taxYearOptions, isConfiguredTaxYear } from "../../../lib/tax/taxYear";
import { formatGBP } from "../../../lib/tax/money";
import { SA105_BOX_LABELS } from "../../../lib/tax/sa105Labels";
import { PageHeader } from "../_ui/PageHeader";
import { EmptyState } from "../_ui/EmptyState";
import { Banner } from "../_ui/Banner";

export default async function Sa105Page({ searchParams }: { searchParams: Promise<{ ty?: string }> }) {
  const { ty } = await searchParams;
  const taxYear = ty ?? latestConfiguredTaxYear();
  const opts = taxYearOptions();
  const idx = opts.indexOf(taxYear);
  const olderYear = idx >= 0 && idx < opts.length - 1 ? opts[idx + 1] : null;
  const newerYear = idx > 0 ? opts[idx - 1] : null;
  const { summary } = await getPersonalTaxYearSummary(taxYear);
  const boxes = Object.keys(summary.sa105).sort((a, b) => Number(a) - Number(b));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="SA105 summary" subtitle="Aggregated across your personally-owned properties">
          <div className="flex items-center gap-1.5">
            {olderYear && <a href={`/sa105?ty=${olderYear}`} className="grid h-8 w-8 place-items-center rounded-lg border border-line-strong text-muted transition-colors hover:border-forest hover:text-forest" aria-label={`Previous tax year ${olderYear}`}>‹</a>}
            <span className="pill">Tax year {taxYear}</span>
            {newerYear && <a href={`/sa105?ty=${newerYear}`} className="grid h-8 w-8 place-items-center rounded-lg border border-line-strong text-muted transition-colors hover:border-forest hover:text-forest" aria-label={`Next tax year ${newerYear}`}>›</a>}
          </div>
          <a className="btn btn-ghost" href={`/export/sa105.pdf?ty=${taxYear}`}>Download PDF</a>
        </PageHeader>
      </div>

      {!isConfiguredTaxYear(taxYear) && (
        <Banner variant="info">Tax estimate uses {latestConfiguredTaxYear()} rates — {taxYear} isn&apos;t configured yet.</Banner>
      )}

      <p className="reveal text-sm text-muted" style={{ animationDelay: "60ms" }}>
        Figures to enter on the UK property pages (SA105) of your Self Assessment. Box 44 (finance costs) is a
        20% basic-rate tax reducer, not a deduction.
      </p>

      <div className="reveal" style={{ animationDelay: "120ms" }}>
        {boxes.length === 0 ? (
          <EmptyState
            title="No data for this tax year"
            hint="Record some transactions for this year to populate the SA105."
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="ledger">
              <thead>
                <tr>
                  <th className="w-16">Box</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {boxes.map((box) => (
                  <tr key={box}>
                    <td className="money">{box}</td>
                    <td>{SA105_BOX_LABELS[box] ?? "—"}</td>
                    <td className="money text-right">{formatGBP(summary.sa105[box])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="reveal text-xs text-faint" style={{ animationDelay: "180ms" }}>
        Box numbers reflect the {taxYear} SA105 — verify against the current year&apos;s form notes before filing.
      </p>
    </div>
  );
}
