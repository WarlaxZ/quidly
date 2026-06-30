import { notFound } from "next/navigation";
import { getCompanyAccounts } from "../../../../../lib/data/companyAccounts";
import { getCompanyReserves, getCompanyDividendTax } from "../../../../../lib/data/companyReserves";
import { getDirectorLoanSummary } from "../../../../../lib/data/directorLoan";
import { formatGBP, poundsToPence } from "../../../../../lib/tax/money";

export default async function CompanyAccountsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string; interestPaid?: string }> }) {
  const { id } = await params;
  const { year, interestPaid } = await searchParams;
  const periodYear = year && !Number.isNaN(Number(year)) ? Number(year) : new Date().getUTCFullYear();
  const interestPaidPence = interestPaid && Number.isFinite(Number(interestPaid)) && Number(interestPaid) >= 0 ? poundsToPence(Number(interestPaid)) : 0;

  const accounts = await getCompanyAccounts(id, periodYear);
  if (!accounts) notFound();
  const reserves = await getCompanyReserves(id, periodYear);
  const dividendTax = await getCompanyDividendTax(id);
  const loan = await getDirectorLoanSummary(id, periodYear, interestPaidPence);

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const Row = ({ label, pence, bold }: { label: string; pence: number; bold?: boolean }) => (
    <tr className={`border-b ${bold ? "font-semibold" : ""}`}>
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 text-right">{formatGBP(pence)}</td>
    </tr>
  );

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{accounts.company.name} — accounts</h1>
      <p className="text-sm text-gray-600">
        Accounting period {iso(accounts.period.start)} to {iso(accounts.period.end)}.{" "}
        <span className="inline-flex gap-2">
          <a href={`/companies/${id}/accounts?year=${periodYear - 1}`} className="text-blue-600 hover:underline">← {periodYear - 1}</a>
          <a href={`/companies/${id}/accounts?year=${periodYear + 1}`} className="text-blue-600 hover:underline">{periodYear + 1} →</a>
        </span>
        {" · "}
        <a href={`/companies/${id}/ledger`} className="text-blue-600 hover:underline">Manage dividends &amp; director&apos;s loan →</a>
      </p>

      <table className="w-full border">
        <tbody>
          <Row label="Rental income" pence={accounts.incomePence} />
          <Row label="Allowable expenses (incl. mortgage interest)" pence={accounts.expensesPence} />
          <Row label="Profit before tax" pence={accounts.profitBeforeTaxPence} bold />
          <Row label={`Corporation tax (${(accounts.effectiveRate * 100).toFixed(1)}%, ${accounts.band} rate)`} pence={accounts.corporationTaxPence} />
          <Row label="Profit after tax" pence={accounts.profitAfterTaxPence} bold />
        </tbody>
      </table>

      {reserves && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Reserves</h2>
          <table className="w-full border">
            <tbody>
              <Row label="Profit after tax (this period)" pence={reserves.periodProfitAfterTaxPence} />
              <Row label="Dividends paid (this period)" pence={reserves.periodDividendsPence} />
              <Row label="Retained earnings carried forward" pence={reserves.retainedEarningsPence} bold />
            </tbody>
          </table>
          {reserves.unlawful && (
            <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-700">
              Dividends paid exceed the company&apos;s distributable profits — this may be an unlawful distribution.
              Dividends can only be paid out of retained, after-tax profits.
            </p>
          )}
        </section>
      )}

      {dividendTax.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Dividend tax (personal, by tax year)</h2>
          <table className="w-full border">
            <thead><tr className="border-b bg-gray-50 text-left"><th className="px-3 py-2">Tax year</th><th className="px-3 py-2 text-right">Dividends</th><th className="px-3 py-2 text-right">Estimated dividend tax</th></tr></thead>
            <tbody>
              {dividendTax.map((d) => (
                <tr key={d.taxYear} className="border-b">
                  <td className="px-3 py-2">{d.taxYear}</td>
                  <td className="px-3 py-2 text-right">{formatGBP(d.dividendPence)}</td>
                  <td className="px-3 py-2 text-right">{formatGBP(d.taxPence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400">Dividend tax is a personal Self-Assessment matter (your other income affects the rate), separate from the company&apos;s accounting period.</p>
        </section>
      )}

      {loan && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Director&apos;s loan account</h2>
          <table className="w-full border">
            <tbody>
              <Row label={loan.balancePence >= 0 ? "Balance owed to the company (overdrawn)" : "Balance owed to the director (in credit)"} pence={Math.abs(loan.balancePence)} bold />
              {loan.balancePence > 0 && <Row label="Potential s455 charge (33.75%)" pence={loan.s455Pence} />}
              {loan.bik.applies && <Row label={`Beneficial-loan benefit-in-kind (${loan.taxYear})`} pence={loan.bik.bikPence} />}
              {loan.bik.applies && <Row label="Employer Class 1A NIC on the benefit" pence={loan.bik.class1aNicPence} />}
            </tbody>
          </table>
          {loan.balancePence > 0 && (
            <p className="text-xs text-gray-500">
              The s455 charge applies only if the loan isn&apos;t repaid within 9 months and 1 day of the period end, and is refundable once repaid.
              The benefit-in-kind uses the averaging method and the official rate of interest.
            </p>
          )}
          <form method="get" className="flex items-end gap-2 text-sm">
            <input type="hidden" name="year" value={periodYear} />
            <label>
              <span className="block">Interest the director paid this year (£)</span>
              <input name="interestPaid" defaultValue={interestPaidPence ? interestPaidPence / 100 : ""} className="border px-2 py-1" />
            </label>
            <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Recalculate</button>
          </form>
        </section>
      )}

      <p className="text-xs text-gray-400">
        Estimate only — not filed accounts, a CT600, or a P11D. Corporation tax assumes a standalone company and a full 12-month period.
        s455, the official rate of interest, and Class 1A NIC rates change and have timing rules — verify the figures with your accountant.
      </p>
    </div>
  );
}
