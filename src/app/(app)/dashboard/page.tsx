import { getPersonalTaxYearSummary, getPerPropertyBreakdown } from "../../../lib/data/personalSummary";
import { getTaxYear } from "../../../lib/tax/taxYear";
import { formatGBP, penceToPounds } from "../../../lib/tax/money";
import { saveOtherIncomeAction } from "./actions";

function shiftTaxYear(taxYear: string, delta: number): string {
  const start = Number(taxYear.slice(0, 4)) + delta;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ ty?: string; error?: string }> }) {
  const { ty, error } = await searchParams;
  const taxYear = ty ?? getTaxYear(new Date());
  const { summary, otherIncomePence, usePropertyAllowance, region } = await getPersonalTaxYearSummary(taxYear);
  const breakdown = await getPerPropertyBreakdown(taxYear);

  const prev = shiftTaxYear(taxYear, -1);
  const next = shiftTaxYear(taxYear, 1);

  const LedgerRow = ({ label, pence, sign, sub, strong }: { label: string; pence: number; sign?: "plus" | "minus"; sub?: string; strong?: boolean }) => (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${strong ? "border-t border-line-strong pt-3" : ""}`}>
      <div>
        <span className={strong ? "font-display text-base text-ink" : "text-sm text-muted"}>{label}</span>
        {sub && <span className="ml-2 text-xs text-faint">{sub}</span>}
      </div>
      <span className={`money ${strong ? "text-lg font-medium text-ink" : "text-sm text-ink"}`}>
        {sign === "minus" ? "−" : sign === "plus" ? "+" : ""}{formatGBP(pence).replace("£", "£")}
      </span>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <header className="reveal flex flex-wrap items-end justify-between gap-4" style={{ animationDelay: "0ms" }}>
        <div>
          <h1 className="text-[2rem] leading-none text-ink">Dashboard</h1>
          <p className="mt-1.5 text-sm text-muted">Your personal property position, ready for the SA105.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <a href={`/dashboard?ty=${prev}`} className="grid h-8 w-8 place-items-center rounded-lg border border-line-strong text-muted transition-colors hover:border-forest hover:text-forest" aria-label={`Previous tax year ${prev}`}>‹</a>
          <span className="pill">Tax year {taxYear}</span>
          <a href={`/dashboard?ty=${next}`} className="grid h-8 w-8 place-items-center rounded-lg border border-line-strong text-muted transition-colors hover:border-forest hover:text-forest" aria-label={`Next tax year ${next}`}>›</a>
        </div>
      </header>

      {error && <p className="reveal rounded-lg border border-negative/30 bg-negative-soft px-4 py-3 text-sm text-negative">{error}</p>}

      {/* Hero: the ledger + the tax */}
      <section className="reveal grid gap-4 md:grid-cols-5" style={{ animationDelay: "60ms" }}>
        {/* Taxable profit ledger */}
        <div className="card p-6 md:col-span-3">
          <div className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">This year&apos;s position</div>
          <LedgerRow label="Rental income" pence={summary.incomePence} sign="plus" />
          <LedgerRow label="Allowable expenses" pence={summary.expensesPence} sign="minus" />
          {usePropertyAllowance
            ? <LedgerRow label="£1,000 property allowance" pence={100000} sign="minus" sub="in lieu of expenses" />
            : summary.financeCostsPence > 0 && <LedgerRow label="Mortgage interest" pence={summary.financeCostsPence} sub="relieved separately at 20%" />}
          <LedgerRow label="Taxable profit" pence={summary.taxableProfitPence} strong />
        </div>

        {/* Estimated tax — the focal panel */}
        <div className="md:col-span-2 flex flex-col justify-between rounded-[14px] bg-forest p-6 text-forest-ink shadow-[var(--shadow-raise)]">
          <div>
            <div className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-forest-ink/70">Estimated tax on property</div>
            <div className="money mt-2 text-[2.4rem] leading-none font-medium">{formatGBP(summary.estimatedTaxPence)}</div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8rem] text-forest-ink/80">
            <span>Marginal rate <b className="text-forest-ink">{(summary.marginalRate * 100).toFixed(0)}%</b></span>
            {summary.financeReducerPence > 0 && (
              <span>Mortgage relief <b className="money text-forest-ink">{formatGBP(summary.financeReducerPence)}</b></span>
            )}
          </div>
        </div>
      </section>

      {/* Allowance insight */}
      <section className="reveal" style={{ animationDelay: "120ms" }}>
        <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${summary.allowanceRecommended ? "border-ochre/40 bg-ochre-soft/50 text-ink" : "border-line bg-surface text-muted"}`}>
          <span className="mt-0.5 text-ochre" aria-hidden>◆</span>
          <p>
            {summary.allowanceRecommended
              ? <>The <b>£1,000 property allowance</b> would reduce your taxable profit more than your actual expenses this year — consider enabling it in the assumptions below.</>
              : <>You&apos;re better off claiming your actual expenses than the £1,000 property allowance this year.</>}
          </p>
        </div>
      </section>

      {/* Per-property breakdown */}
      {breakdown.length > 1 && (
        <section className="reveal space-y-3" style={{ animationDelay: "180ms" }}>
          <h2 className="text-lg text-ink">Per-property breakdown</h2>
          <div className="card overflow-hidden">
            <table className="ledger">
              <thead>
                <tr><th>Property</th><th className="text-right">Income</th><th className="text-right">Expenses</th><th className="text-right">Profit (gross)</th></tr>
              </thead>
              <tbody>
                {breakdown.map((r) => (
                  <tr key={r.propertyId}>
                    <td className="font-medium text-ink">{r.propertyName}</td>
                    <td className="money text-right">{formatGBP(r.incomePence)}</td>
                    <td className="money text-right">{formatGBP(r.expensesPence)}</td>
                    <td className="money text-right text-ink">{formatGBP(r.profitPence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Assumptions */}
      <section className="reveal space-y-3" style={{ animationDelay: "240ms" }}>
        <h2 className="text-lg text-ink">Assumptions</h2>
        <form action={saveOtherIncomeAction} className="card flex flex-wrap items-end gap-4 p-5">
          <input type="hidden" name="taxYear" value={taxYear} />
          <label className="min-w-[16rem] flex-1">
            <span className="label">Your other (non-property) income this year</span>
            <input name="otherIncome" defaultValue={penceToPounds(otherIncomePence)} className="field" inputMode="decimal" />
          </label>
          <label>
            <span className="label">Tax region</span>
            <select name="region" defaultValue={region} className="field">
              <option value="englandWalesNI">England / Wales / NI</option>
              <option value="scotland">Scotland</option>
            </select>
          </label>
          <label className="flex items-center gap-2.5 rounded-lg border border-line-strong bg-surface px-3 py-2.5">
            <input type="checkbox" name="usePropertyAllowance" defaultChecked={usePropertyAllowance} className="h-4 w-4 accent-forest" />
            <span className="text-sm text-ink">Use £1,000 allowance</span>
          </label>
          <button type="submit" className="btn btn-primary">Update estimate</button>
        </form>
      </section>

      <p className="reveal text-xs text-faint" style={{ animationDelay: "300ms" }}>
        Estimates only — not tax advice. Verify against the current SA105 notes before filing.
      </p>
    </div>
  );
}
