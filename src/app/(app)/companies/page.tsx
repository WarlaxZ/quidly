import { listCompanies, getCompanyPropertyCount } from "../../../lib/data/company";
import { addCompanyAction, deleteCompanyAction } from "./actions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const companies = await listCompanies();
  const counts = await Promise.all(companies.map((c) => getCompanyPropertyCount(c.id)));

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Companies</h1>
      {error && <p className="rounded bg-red-100 px-3 py-2 text-red-700">{error}</p>}

      <form action={addCompanyAction} className="flex flex-wrap items-end gap-2">
        <input name="name" placeholder="Company name (e.g. Acme SPV Ltd)" required className="border px-2 py-1" />
        <label className="text-sm">Year end
          <input name="accountingYearEndDay" type="number" min="1" max="31" defaultValue="31" required className="ml-1 w-16 border px-2 py-1" />
        </label>
        <select name="accountingYearEndMonth" defaultValue="3" className="border px-2 py-1">
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Add company</button>
      </form>

      {companies.length === 0 && <p className="text-gray-500">Add a company to manage limited-company properties.</p>}

      <ul className="divide-y border">
        {companies.map((c, i) => (
          <li key={c.id} className="flex items-center justify-between px-3 py-2">
            <span>
              {c.name} · <span className="text-gray-500">year end {c.accountingYearEndDay} {MONTHS[c.accountingYearEndMonth - 1]}</span>
              <span className="ml-2 text-xs text-gray-400">{counts[i]} propert{counts[i] === 1 ? "y" : "ies"}</span>
            </span>
            <span className="flex items-center gap-2">
              <a href={`/companies/${c.id}/accounts`} className="text-blue-600 hover:underline">Accounts</a>
              <a href={`/companies/${c.id}/edit`} className="text-blue-600 hover:underline">Edit</a>
              <form action={deleteCompanyAction}>
                <input type="hidden" name="id" value={c.id} />
                <button type="submit" className="text-red-600">Delete</button>
              </form>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
