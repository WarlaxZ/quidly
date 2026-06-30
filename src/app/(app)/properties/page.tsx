import { listProperties } from "../../../lib/data/activeProperty";
import { getPropertyCounts } from "../../../lib/data/property";
import { listCompanies } from "../../../lib/data/company";
import { addPropertyAction, deletePropertyAction } from "./actions";

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const properties = await listProperties();
  const counts = await Promise.all(properties.map((p) => getPropertyCounts(p.id)));
  const companies = await listCompanies();
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Properties</h1>
      {error && <p className="rounded bg-red-100 px-3 py-2 text-red-700">{error}</p>}

      <form action={addPropertyAction} className="flex flex-wrap items-end gap-2">
        <input name="name" placeholder="Property name" required className="border px-2 py-1" />
        <input name="address" placeholder="Address (optional)" className="border px-2 py-1" />
        <select name="ownershipType" defaultValue="personal" className="border px-2 py-1">
          <option value="personal">Personal</option>
          <option value="company">Company</option>
        </select>
        <select name="companyId" defaultValue="" className="border px-2 py-1">
          <option value="">— company (if company-owned) —</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Add property</button>
      </form>

      {properties.length === 0 && <p className="text-gray-500">Add your first property to get started.</p>}

      <ul className="divide-y border">
        {properties.map((p, i) => (
          <li key={p.id} className="flex items-center justify-between px-3 py-2">
            <span>
              {p.name}{p.address ? ` — ${p.address}` : ""} · <span className="text-gray-500">{p.ownershipType}</span>
              {p.companyId && <> · <span className="text-gray-500">{companyName.get(p.companyId) ?? "?"}</span></>}
              <span className="ml-2 text-xs text-gray-400">{counts[i].transactions} txns</span>
            </span>
            <span className="flex items-center gap-2">
              <a href={`/properties/${p.id}/edit`} className="text-blue-600 hover:underline">Edit</a>
              <form action={deletePropertyAction}>
                <input type="hidden" name="id" value={p.id} />
                <button type="submit" className="text-red-600">Delete</button>
              </form>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
