import { listTransactionsFiltered } from "../../../lib/data/transactions";
import { getActiveProperty, listProperties } from "../../../lib/data/activeProperty";
import { listVendors } from "../../../lib/data/vendors";
import { listCategories } from "../../../lib/data/categories";
import { formatGBP } from "../../../lib/tax/money";
import { addTransactionAction, deleteTransactionAction } from "./actions";
export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ taxYear?: string; categoryId?: string; direction?: string; error?: string }> }) {
  const sp = await searchParams;
  const active = await getActiveProperty();
  const properties = await listProperties();
  const filter = {
    taxYear: sp.taxYear || undefined,
    categoryId: sp.categoryId || undefined,
    direction: (sp.direction as "in" | "out") || undefined,
  };
  const [txns, categories, vendors] = await Promise.all([
    listTransactionsFiltered(active.propertyId, filter),
    listCategories(),
    listVendors(),
  ]);
  const exportQuery = new URLSearchParams(
    Object.entries({ taxYear: sp.taxYear, categoryId: sp.categoryId, direction: sp.direction }).filter(([, v]) => v) as [string, string][]
  ).toString();
  const headingProperty = active.isAll ? "All properties" : (properties.find(p => p.id === active.propertyId)?.name ?? "—");
  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Transactions — {headingProperty}</h1>
        <a href={`/export/transactions${exportQuery ? `?${exportQuery}` : ""}`} className="text-blue-600 hover:underline">Export CSV</a>
      </div>
      {sp.error && <p className="rounded bg-red-100 px-3 py-2 text-red-700">{sp.error}</p>}
      <form className="flex flex-wrap items-end gap-2">
        <input name="taxYear" placeholder="Tax year e.g. 2025-26" defaultValue={sp.taxYear ?? ""} className="border px-2 py-1" />
        <select name="categoryId" defaultValue={sp.categoryId ?? ""} className="border px-2 py-1">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="direction" defaultValue={sp.direction ?? ""} className="border px-2 py-1">
          <option value="">All</option>
          <option value="in">In</option>
          <option value="out">Out</option>
        </select>
        <button type="submit" className="bg-gray-200 px-3 py-1">Filter</button>
      </form>
      <form action={addTransactionAction} className="flex flex-wrap items-end gap-2">
        {active.isAll ? (
          <select name="propertyId" required className="border px-2 py-1">
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <input type="hidden" name="propertyId" value={active.propertyId ?? ""} />
        )}
        <input type="date" name="date" required className="border px-2 py-1" />
        <input name="amount" placeholder="£ amount" required className="border px-2 py-1" />
        <select name="direction" className="border px-2 py-1">
          <option value="in">In</option>
          <option value="out">Out</option>
        </select>
        <select name="categoryId" required className="border px-2 py-1">
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="vendorId" className="border px-2 py-1">
          <option value="">— vendor —</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <input name="description" placeholder="Description" className="border px-2 py-1" />
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Add</button>
      </form>
      <table className="w-full border text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            {active.isAll && <th className="px-2 py-1">Property</th>}
            <th className="px-2 py-1">Date</th><th className="px-2 py-1">Category</th>
            <th className="px-2 py-1">Vendor</th><th className="px-2 py-1">Description</th>
            <th className="px-2 py-1 text-right">Amount</th><th />
          </tr>
        </thead>
        <tbody>
          {txns.map((t) => (
            <tr key={t.id} className="border-b">
              {active.isAll && <td className="px-2 py-1">{t.property?.name}</td>}
              <td className="px-2 py-1">{t.date.toISOString().slice(0, 10)}</td>
              <td className="px-2 py-1">{t.category.name}</td>
              <td className="px-2 py-1">{t.vendor?.name ?? ""}</td>
              <td className="px-2 py-1">{t.description ?? ""}</td>
              <td className="px-2 py-1 text-right">{t.direction === "out" ? "−" : ""}{formatGBP(t.amountPence)}</td>
              <td className="px-2 py-1 text-right">
                <a href={`/transactions/${t.id}/edit`} className="mr-2 text-blue-600 hover:underline">Edit</a>
                <form action={deleteTransactionAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="text-red-600">×</button>
                </form>
              </td>
            </tr>
          ))}
          {txns.length === 0 && <tr><td colSpan={active.isAll ? 7 : 6} className="px-2 py-2 text-gray-500">No transactions yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
