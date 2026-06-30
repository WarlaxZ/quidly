import { listCategories } from "../../../lib/data/categories";
import { parseCsv } from "../../../lib/reports/csv";
import { formatGBP } from "../../../lib/tax/money";
import { buildPreview, confirmImportAction, type PreviewRow } from "./actions";

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const categories = await listCategories();

  // Step 1: no csv yet — show the paste box.
  const csv = sp.csv;
  if (!csv) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">Import bank CSV</h1>
        <p className="text-sm text-gray-600">Open your bank&apos;s CSV export, copy all of it, and paste it below.</p>
        <form method="get" className="space-y-3">
          <textarea name="csv" rows={10} required className="w-full border p-2 font-mono text-xs" placeholder="date,amount,description&#10;01/06/2025,950.00,Rent" />
          <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Next: map columns</button>
        </form>
      </div>
    );
  }

  const { header } = parseCsv(csv);
  const colOptions = header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>);

  // Step 3: mapping chosen — show preview + confirm.
  if (sp.dateCol !== undefined && sp.amountCol !== undefined && sp.descriptionCol !== undefined && sp.categoryId) {
    const mapping = { dateCol: Number(sp.dateCol), amountCol: Number(sp.amountCol), descriptionCol: Number(sp.descriptionCol) };
    const preview: PreviewRow[] = await buildPreview(csv, mapping);
    const importable = preview.filter((r) => r.ok && !r.duplicate).length;
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Preview import</h1>
        <p className="text-sm text-gray-600">{importable} row(s) will be imported. Duplicates and unparseable rows are skipped.</p>
        <table className="w-full border text-sm">
          <thead><tr className="border-b bg-gray-50 text-left"><th className="px-2 py-1">Date</th><th className="px-2 py-1">Dir</th><th className="px-2 py-1 text-right">Amount</th><th className="px-2 py-1">Description</th><th className="px-2 py-1">Status</th></tr></thead>
          <tbody>
            {preview.map((r, i) => (
              <tr key={i} className="border-b">
                <td className="px-2 py-1">{r.date ?? ""}</td>
                <td className="px-2 py-1">{r.direction ?? ""}</td>
                <td className="px-2 py-1 text-right">{r.amountPence !== undefined ? formatGBP(r.amountPence) : ""}</td>
                <td className="px-2 py-1">{r.description ?? ""}</td>
                <td className="px-2 py-1">{!r.ok ? `error: ${r.error}` : r.duplicate ? "duplicate (skip)" : "import"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={confirmImportAction}>
          <input type="hidden" name="csv" value={csv} />
          <input type="hidden" name="dateCol" value={sp.dateCol} />
          <input type="hidden" name="amountCol" value={sp.amountCol} />
          <input type="hidden" name="descriptionCol" value={sp.descriptionCol} />
          <input type="hidden" name="categoryId" value={sp.categoryId} />
          <button type="submit" className="bg-green-700 px-3 py-1 text-white">Import {importable} transaction(s)</button>
        </form>
      </div>
    );
  }

  // Step 2: choose columns + category.
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Map columns</h1>
      <form method="get" className="space-y-3">
        <input type="hidden" name="csv" value={csv} />
        <label className="block">Date column <select name="dateCol" required className="border px-2 py-1">{colOptions}</select></label>
        <label className="block">Amount column <select name="amountCol" required className="border px-2 py-1">{colOptions}</select></label>
        <label className="block">Description column <select name="descriptionCol" required className="border px-2 py-1">{colOptions}</select></label>
        <label className="block">Category for imported rows <select name="categoryId" required className="border px-2 py-1">{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Next: preview</button>
      </form>
    </div>
  );
}
