import { notFound } from "next/navigation";
import { getCompanyAccounts } from "../../../../../lib/data/companyAccounts";
import { formatGBP } from "../../../../../lib/tax/money";

export default async function CompanyAccountsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string }> }) {
  const { id } = await params;
  const { year } = await searchParams;
  const periodYear = year && !Number.isNaN(Number(year)) ? Number(year) : new Date().getUTCFullYear();
  const accounts = await getCompanyAccounts(id, periodYear);
  if (!accounts) notFound();

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const Row = ({ label, pence, bold }: { label: string; pence: number; bold?: boolean }) => (
    <tr className={`border-b ${bold ? "font-semibold" : ""}`}>
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 text-right">{formatGBP(pence)}</td>
    </tr>
  );

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">{accounts.company.name} — accounts</h1>
      <p className="text-sm text-gray-600">
        Accounting period {iso(accounts.period.start)} to {iso(accounts.period.end)}.{" "}
        <span className="inline-flex gap-2">
          <a href={`/companies/${id}/accounts?year=${periodYear - 1}`} className="text-blue-600 hover:underline">← {periodYear - 1}</a>
          <a href={`/companies/${id}/accounts?year=${periodYear + 1}`} className="text-blue-600 hover:underline">{periodYear + 1} →</a>
        </span>
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

      <p className="text-xs text-gray-400">
        Estimate only — not filed accounts or a CT600. Assumes a standalone company, a full 12-month
        period, and a single corporation-tax year. Have your accountant prepare and file the company
        accounts and CT return.
      </p>
    </div>
  );
}
