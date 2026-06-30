import { notFound } from "next/navigation";
import { getTransaction } from "../../../../../lib/data/transactions";
import { listCategories } from "../../../../../lib/data/categories";
import { listVendors } from "../../../../../lib/data/vendors";
import { penceToPounds } from "../../../../../lib/tax/money";
import { updateTransactionAction } from "../../edit-actions";

export default async function EditTransactionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const [txn, categories, vendors] = await Promise.all([getTransaction(id), listCategories(), listVendors()]);
  if (!txn) notFound();

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Edit transaction</h1>
      {error && <p className="rounded bg-red-100 px-3 py-2 text-red-700">{error}</p>}
      <form action={updateTransactionAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={txn.id} />
        <input type="date" name="date" defaultValue={txn.date.toISOString().slice(0, 10)} required className="border px-2 py-1" />
        <input name="amount" defaultValue={penceToPounds(txn.amountPence)} required className="border px-2 py-1" />
        <select name="direction" defaultValue={txn.direction} className="border px-2 py-1">
          <option value="in">In</option>
          <option value="out">Out</option>
        </select>
        <select name="categoryId" defaultValue={txn.categoryId} required className="border px-2 py-1">
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="vendorId" defaultValue={txn.vendorId ?? ""} className="border px-2 py-1">
          <option value="">— vendor —</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <input name="description" defaultValue={txn.description ?? ""} placeholder="Description" className="border px-2 py-1" />
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Save</button>
      </form>
    </div>
  );
}
