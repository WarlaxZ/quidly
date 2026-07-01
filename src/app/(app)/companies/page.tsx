import { listCompanies, getCompanyPropertyCount } from "../../../lib/data/company";
import { addCompanyAction, deleteCompanyAction } from "./actions";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";
import { ConfirmSubmit } from "../_ui/ConfirmSubmit";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const companies = await listCompanies();
  const counts = await Promise.all(companies.map((c) => getCompanyPropertyCount(c.id)));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Companies" />
      </div>

      {error && <Banner variant="error">{error}</Banner>}
      {ok && <Banner variant="success">{ok}</Banner>}

      {/* Add-company form */}
      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <form action={addCompanyAction} className="card p-5">
          <div className="mb-4 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Add company</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[14rem]">
              <span className="label">Company name</span>
              <input name="name" placeholder="e.g. Acme SPV Ltd" required className="field" />
            </label>
            <label className="min-w-[6rem]">
              <span className="label">Year-end day</span>
              <input name="accountingYearEndDay" type="number" min="1" max="31" defaultValue="31" required className="field" />
            </label>
            <label className="min-w-[8rem]">
              <span className="label">Year-end month</span>
              <select name="accountingYearEndMonth" defaultValue="3" className="field">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
            <button type="submit" className="btn btn-primary">Add company</button>
          </div>
        </form>
      </section>

      {/* Companies list */}
      <section className="reveal" style={{ animationDelay: "120ms" }}>
        {companies.length === 0 ? (
          <EmptyState
            title="No companies yet"
            hint="Add a limited company (SPV) to track its properties, corporation tax, dividends and director's loan."
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Year end</th>
                  <th>Properties</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {companies.map((c, i) => (
                  <tr key={c.id}>
                    <td className="font-medium text-ink">{c.name}</td>
                    <td>
                      <span className="pill">
                        {String(c.accountingYearEndDay).padStart(2, "0")} {MONTHS[c.accountingYearEndMonth - 1]}
                      </span>
                    </td>
                    <td className="text-faint text-xs">
                      {counts[i]} propert{counts[i] === 1 ? "y" : "ies"}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a href={`/companies/${c.id}/accounts`} className="btn btn-ghost !px-3 !py-1.5 text-xs">
                          Accounts
                        </a>
                        <a href={`/companies/${c.id}/edit`} className="btn btn-ghost !px-3 !py-1.5 text-xs">
                          Edit
                        </a>
                        <form action={deleteCompanyAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <ConfirmSubmit confirm="Delete this company? This can't be undone.">
                            Delete
                          </ConfirmSubmit>
                        </form>
                      </div>
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
