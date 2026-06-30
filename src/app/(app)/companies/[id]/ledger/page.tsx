import { notFound } from "next/navigation";
import { getCompany } from "../../../../../lib/data/company";
import { listLedgerEntries } from "../../../../../lib/data/companyLedger";
import { addLedgerEntryAction, deleteLedgerEntryAction } from "../../actions";
import { formatGBP } from "../../../../../lib/tax/money";

const KIND_LABEL: Record<string, string> = {
  dividend: "Dividend",
  director_loan_in: "Director loan in (you → company)",
  director_loan_out: "Director loan out (company → you)",
};

export default async function CompanyLedgerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const company = await getCompany(id);
  if (!company) notFound();
  const entries = await listLedgerEntries(id);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{company.name} — dividends & director&apos;s loan</h1>
      <a href={`/companies/${id}/accounts`} className="text-sm text-blue-600 hover:underline">← Back to accounts</a>
      {error && <p className="rounded bg-red-100 px-3 py-2 text-red-700">{error}</p>}

      <form action={addLedgerEntryAction} className="grid grid-cols-2 gap-3 rounded border p-4">
        <input type="hidden" name="companyId" value={id} />
        <label className="block">
          <span className="block text-sm">Type</span>
          <select name="kind" className="w-full border px-2 py-1">
            <option value="dividend">Dividend (company → you)</option>
            <option value="director_loan_out">Director loan out (company → you)</option>
            <option value="director_loan_in">Director loan in (you → company)</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-sm">Date</span>
          <input type="date" name="date" className="w-full border px-2 py-1" />
        </label>
        <label className="block">
          <span className="block text-sm">Amount (£)</span>
          <input name="amount" className="w-full border px-2 py-1" />
        </label>
        <label className="block">
          <span className="block text-sm">Note (optional)</span>
          <input name="note" className="w-full border px-2 py-1" />
        </label>
        <div className="col-span-2">
          <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Add entry</button>
        </div>
      </form>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">No entries yet.</p>
      ) : (
        <table className="w-full border text-sm">
          <thead><tr className="border-b bg-gray-50 text-left"><th className="px-2 py-1">Date</th><th className="px-2 py-1">Type</th><th className="px-2 py-1 text-right">Amount</th><th className="px-2 py-1">Note</th><th className="px-2 py-1"></th></tr></thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b">
                <td className="px-2 py-1">{iso(entry.date)}</td>
                <td className="px-2 py-1">{KIND_LABEL[entry.kind] ?? entry.kind}</td>
                <td className="px-2 py-1 text-right">{formatGBP(entry.amountPence)}</td>
                <td className="px-2 py-1">{entry.note}</td>
                <td className="px-2 py-1 text-right">
                  <form action={deleteLedgerEntryAction}>
                    <input type="hidden" name="companyId" value={id} />
                    <input type="hidden" name="id" value={entry.id} />
                    <button type="submit" className="text-red-600 hover:underline">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
