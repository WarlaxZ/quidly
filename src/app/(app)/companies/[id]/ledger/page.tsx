import { notFound } from "next/navigation";
import { getCompany } from "../../../../../lib/data/company";
import { listLedgerEntries } from "../../../../../lib/data/companyLedger";
import { addLedgerEntryAction, deleteLedgerEntryAction } from "../../actions";
import { formatGBP } from "../../../../../lib/tax/money";
import { PageHeader } from "../../../_ui/PageHeader";
import { Banner } from "../../../_ui/Banner";
import { EmptyState } from "../../../_ui/EmptyState";
import { MoneyInput } from "../../../_ui/MoneyInput";
import { ConfirmSubmit } from "../../../_ui/ConfirmSubmit";

const KIND_LABEL: Record<string, string> = {
  dividend: "Dividend",
  director_loan_in: "Director loan in (you → company)",
  director_loan_out: "Director loan out (company → you)",
};

export default async function CompanyLedgerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const company = await getCompany(id);
  if (!company) notFound();
  const entries = await listLedgerEntries(id);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title={`${company.name} — dividends & director's loan`}>
          <a href={`/companies/${id}/accounts`} className="btn btn-ghost">← Back to accounts</a>
        </PageHeader>
      </div>

      {error && <Banner variant="error">{error}</Banner>}
      {ok && <Banner variant="success">{ok}</Banner>}

      {/* Add-entry form */}
      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <form action={addLedgerEntryAction} className="card p-5">
          <div className="mb-4 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Add entry</div>
          <input type="hidden" name="companyId" value={id} />
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[14rem]">
              <span className="label">Type</span>
              <select name="kind" className="field">
                <option value="dividend">Dividend (company → you)</option>
                <option value="director_loan_out">Director loan out (company → you)</option>
                <option value="director_loan_in">Director loan in (you → company)</option>
              </select>
            </label>
            <label className="min-w-[10rem]">
              <span className="label">Date</span>
              <input type="date" name="date" required className="field" />
            </label>
            <label className="min-w-[9rem]">
              <span className="label">Amount (£)</span>
              <MoneyInput name="amount" placeholder="0.00" required />
            </label>
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Note (optional)</span>
              <input name="note" className="field" />
            </label>
            <button type="submit" className="btn btn-primary">Add entry</button>
          </div>
        </form>
      </section>

      {/* Entries list */}
      <section className="reveal" style={{ animationDelay: "120ms" }}>
        {entries.length === 0 ? (
          <EmptyState
            title="No entries yet"
            hint="Record a dividend or a director's-loan movement above."
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th className="text-right">Amount</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="text-muted">{iso(entry.date)}</td>
                    <td className="text-ink">{KIND_LABEL[entry.kind] ?? entry.kind}</td>
                    <td className="money text-right">{formatGBP(entry.amountPence)}</td>
                    <td className="text-muted">{entry.note || "—"}</td>
                    <td className="text-right">
                      <form action={deleteLedgerEntryAction}>
                        <input type="hidden" name="companyId" value={id} />
                        <input type="hidden" name="id" value={entry.id} />
                        <ConfirmSubmit confirm="Delete this entry? This can't be undone.">
                          Delete
                        </ConfirmSubmit>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
