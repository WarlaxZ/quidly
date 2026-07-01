import { notFound } from "next/navigation";
import { getCompanyAccounts } from "../../../../../lib/data/companyAccounts";
import { getCompanyReserves, getCompanyDividendTax } from "../../../../../lib/data/companyReserves";
import { getDirectorLoanSummary } from "../../../../../lib/data/directorLoan";
import { formatGBP, poundsToPence } from "../../../../../lib/tax/money";
import { PageHeader } from "../../../_ui/PageHeader";
import { Banner } from "../../../_ui/Banner";
import { YearNav } from "../../../_ui/YearNav";
import { MoneyInput } from "../../../_ui/MoneyInput";

export default async function CompanyAccountsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string; interestPaid?: string }> }) {
  const { id } = await params;
  const { year, interestPaid } = await searchParams;
  // Clamp to a sane window: periodYear drives a per-period loop in getCompanyReserves,
  // so an unbounded ?year (e.g. 9999999) must not trigger millions of queries.
  const currentYear = new Date().getUTCFullYear();
  const rawYear = year && !Number.isNaN(Number(year)) ? Number(year) : currentYear;
  const periodYear = Math.min(Math.max(rawYear, 2000), currentYear + 1);
  const interestPaidPence = interestPaid && Number.isFinite(Number(interestPaid)) && Number(interestPaid) >= 0 ? poundsToPence(Number(interestPaid)) : 0;

  const accounts = await getCompanyAccounts(id, periodYear);
  if (!accounts) notFound();
  const [reserves, dividendTax, loan] = await Promise.all([
    getCompanyReserves(id, periodYear),
    getCompanyDividendTax(id),
    getDirectorLoanSummary(id, periodYear, interestPaidPence),
  ]);

  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const LedgerRow = ({ label, pence, bold }: { label: string; pence: number; bold?: boolean }) => (
    <tr>
      <td className={bold ? "font-semibold text-ink" : ""}>{label}</td>
      <td className={`money text-right${bold ? " font-semibold text-ink" : ""}`}>{formatGBP(pence)}</td>
    </tr>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader
          title={`${accounts.company.name} — accounts`}
          subtitle={`Accounting period ${iso(accounts.period.start)} to ${iso(accounts.period.end)}`}
        >
          <YearNav
            basePath={`/companies/${id}/accounts`}
            paramKey="year"
            current={periodYear}
            label="Period"
          />
          <a href={`/companies/${id}/ledger`} className="btn btn-ghost">
            Manage dividends &amp; director&apos;s loan →
          </a>
        </PageHeader>
      </div>

      {/* P&L */}
      <section className="reveal space-y-3" style={{ animationDelay: "60ms" }}>
        <h2 className="text-lg text-ink">Profit &amp; loss</h2>
        <div className="card overflow-hidden">
          <table className="ledger">
            <tbody>
              <LedgerRow label="Rental income" pence={accounts.incomePence} />
              <LedgerRow label="Allowable expenses (incl. mortgage interest)" pence={accounts.expensesPence} />
              <LedgerRow label="Profit before tax" pence={accounts.profitBeforeTaxPence} bold />
              <LedgerRow label={`Corporation tax (${(accounts.effectiveRate * 100).toFixed(1)}%, ${accounts.band} rate)`} pence={accounts.corporationTaxPence} />
              <LedgerRow label="Profit after tax" pence={accounts.profitAfterTaxPence} bold />
            </tbody>
          </table>
        </div>
      </section>

      {/* Reserves */}
      {reserves && (
        <section className="reveal space-y-3" style={{ animationDelay: "120ms" }}>
          <h2 className="text-lg text-ink">Reserves</h2>
          <div className="card overflow-hidden">
            <table className="ledger">
              <tbody>
                <LedgerRow label="Profit after tax (this period)" pence={reserves.periodProfitAfterTaxPence} />
                <LedgerRow label="Dividends paid (this period)" pence={reserves.periodDividendsPence} />
                <LedgerRow label="Retained earnings carried forward" pence={reserves.retainedEarningsPence} bold />
              </tbody>
            </table>
          </div>
          {reserves.unlawful && (
            <Banner variant="error">
              Dividends paid exceed the company&apos;s distributable profits — this may be an unlawful distribution.
              Dividends can only be paid out of retained, after-tax profits.
            </Banner>
          )}
        </section>
      )}

      {/* Dividend tax */}
      {dividendTax.length > 0 && (
        <section className="reveal space-y-3" style={{ animationDelay: "180ms" }}>
          <h2 className="text-lg text-ink">Dividend tax (personal, by tax year)</h2>
          <div className="card overflow-hidden">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Tax year</th>
                  <th className="text-right">Dividends</th>
                  <th className="text-right">Estimated dividend tax</th>
                </tr>
              </thead>
              <tbody>
                {dividendTax.map((d) => (
                  <tr key={d.taxYear}>
                    <td>{d.taxYear}</td>
                    <td className="money text-right">{formatGBP(d.dividendPence)}</td>
                    <td className="money text-right">{formatGBP(d.taxPence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-faint">
            Dividend tax is a personal Self-Assessment matter (your other income affects the rate), separate from the company&apos;s accounting period.
          </p>
        </section>
      )}

      {/* Director's loan */}
      {loan && (loan.balancePence !== 0 || loan.bik.applies) && (
        <section className="reveal space-y-3" style={{ animationDelay: "240ms" }}>
          <h2 className="text-lg text-ink">Director&apos;s loan account</h2>
          <div className="card overflow-hidden">
            <table className="ledger">
              <tbody>
                <LedgerRow
                  label={loan.balancePence >= 0 ? "Balance owed to the company (overdrawn)" : "Balance owed to the director (in credit)"}
                  pence={Math.abs(loan.balancePence)}
                  bold
                />
                {loan.balancePence > 0 && <LedgerRow label="Potential s455 charge (33.75%)" pence={loan.s455Pence} />}
                {loan.bik.applies && <LedgerRow label={`Beneficial-loan benefit-in-kind (${loan.taxYear})`} pence={loan.bik.bikPence} />}
                {loan.bik.applies && <LedgerRow label="Employer Class 1A NIC on the benefit" pence={loan.bik.class1aNicPence} />}
              </tbody>
            </table>
          </div>
          {loan.balancePence > 0 && (
            <p className="text-xs text-faint">
              The s455 charge applies only if the loan isn&apos;t repaid within 9 months and 1 day of the period end, and is refundable once repaid.
              The benefit-in-kind uses the averaging method and the official rate of interest.
            </p>
          )}
          <form method="get" className="card p-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="year" value={periodYear} />
            <label className="flex-1 min-w-[14rem]">
              <span className="label">Interest the director paid this year (£)</span>
              <MoneyInput name="interestPaid" defaultValue={interestPaid ?? ""} placeholder="0.00" />
            </label>
            <button type="submit" className="btn btn-primary">Recalculate</button>
          </form>
        </section>
      )}

      <p className="reveal text-xs text-faint" style={{ animationDelay: "300ms" }}>
        Estimate only — not filed accounts, a CT600, or a P11D. Corporation tax assumes a standalone company and a full 12-month period.
        s455, the official rate of interest, and Class 1A NIC rates change and have timing rules — verify the figures with your accountant.
      </p>
    </div>
  );
}
