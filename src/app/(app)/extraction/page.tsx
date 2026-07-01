import { PageHeader } from "../_ui/PageHeader";
import { MoneyInput } from "../_ui/MoneyInput";
import { optimiseExtraction, type ExtractionInput } from "../../../lib/tax/extraction";
import { latestConfiguredTaxYear, taxYearOptions, isConfiguredTaxYear } from "../../../lib/tax/taxYear";
import { formatGBP, penceToPounds, poundsToPence } from "../../../lib/tax/money";
import type { Region } from "../../../lib/tax/types";
import { Banner } from "../_ui/Banner";

type Search = { ty?: string; profit?: string; other?: string; region?: string; ea?: string };

function overridePence(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return poundsToPence(n);
}

export default async function ExtractionPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const taxYear = sp.ty && /^\d{4}-\d{2}$/.test(sp.ty) ? sp.ty : latestConfiguredTaxYear();
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

  const yearOptions = taxYearOptions();

  const BreakdownRow = ({ label, pence, bold }: { label: string; pence: number; bold?: boolean }) => (
    <div className={`flex items-baseline justify-between py-2 ${bold ? "border-t border-line-strong pt-3" : ""}`}>
      <span className={bold ? "font-display text-base text-ink" : "text-sm text-muted"}>{label}</span>
      <span className={`money text-sm ${bold ? "font-medium text-ink" : "text-ink"}`}>{formatGBP(pence)}</span>
    </div>
  );

  const curveSvg = (() => {
    if (!result || result.curve.length < 2) return null;
    const xs = result.curve.map((p) => p.salaryPence);
    const ys = result.curve.map((p) => p.takeHomePence);
    const maxX = Math.max(...xs, 1);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanY = maxY - minY || 1;
    const pt = (x: number, y: number) => `${(x / maxX) * 100},${(38 - ((y - minY) / spanY) * 34).toFixed(2)}`;
    const points = result.curve.map((p) => pt(p.salaryPence, p.takeHomePence)).join(" ");
    const [ox, oy] = pt(result.recommended.salaryPence, result.recommended.takeHomePence).split(",");
    return (
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-24 w-full" aria-hidden>
        <polyline points={points} fill="none" stroke="var(--color-forest)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <circle cx={ox} cy={oy} r="1.4" fill="var(--color-ochre)" />
      </svg>
    );
  })();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader title="Salary vs dividends" subtitle="Find the most tax-efficient way to pay yourself from your company.">
        <span className="pill">Tax year {taxYear}</span>
      </PageHeader>

      {!isConfiguredTaxYear(taxYear) && (
        <Banner variant="info">Tax estimate uses {latestConfiguredTaxYear()} rates — {taxYear} isn&apos;t configured yet.</Banner>
      )}

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
                <span className="money">{formatGBP(result.recommended.salaryPence)}</span> salary{" + "}
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
