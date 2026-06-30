import { listTransactions } from "../../../lib/data/transactions";
import { getOrCreateDefaultProperty } from "../../../lib/data/property";
import { listVendors } from "../../../lib/data/vendors";
import { prisma } from "../../../lib/db";
import { formatGBP } from "../../../lib/tax/money";
import { addTransactionAction, deleteTransactionAction } from "./actions";
export default async function TransactionsPage() {
  const property = await getOrCreateDefaultProperty();
  const [txns, categories, vendors] = await Promise.all([
    listTransactions(property.id),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    listVendors(),
  ]);
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Transactions — {property.name}</h1>
      <form action={addTransactionAction} className="flex flex-wrap items-end gap-2">
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
            <th className="px-2 py-1">Date</th><th className="px-2 py-1">Category</th>
            <th className="px-2 py-1">Vendor</th><th className="px-2 py-1">Description</th>
            <th className="px-2 py-1 text-right">Amount</th><th />
          </tr>
        </thead>
        <tbody>
          {txns.map((t) => (
            <tr key={t.id} className="border-b">
              <td className="px-2 py-1">{t.date.toISOString().slice(0, 10)}</td>
              <td className="px-2 py-1">{t.category.name}</td>
              <td className="px-2 py-1">{t.vendor?.name ?? ""}</td>
              <td className="px-2 py-1">{t.description ?? ""}</td>
              <td className="px-2 py-1 text-right">{t.direction === "out" ? "−" : ""}{formatGBP(t.amountPence)}</td>
              <td className="px-2 py-1 text-right">
                <form action={deleteTransactionAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="text-red-600">×</button>
                </form>
              </td>
            </tr>
          ))}
          {txns.length === 0 && <tr><td colSpan={6} className="px-2 py-2 text-gray-500">No transactions yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
