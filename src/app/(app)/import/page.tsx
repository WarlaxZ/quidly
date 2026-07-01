import { listCategories } from "../../../lib/data/categories";
import { listProperties, getActiveProperty } from "../../../lib/data/activeProperty";
import { parseCsv } from "../../../lib/reports/csv";
import { formatGBP } from "../../../lib/tax/money";
import { buildPreview, confirmImportAction, type PreviewRow } from "./actions";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [categories, active, properties] = await Promise.all([
    listCategories(),
    getActiveProperty(),
    listProperties(),
  ]);

  // Step 1: no csv yet — show the paste box.
  const csv = sp.csv;
  if (!csv) {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="reveal" style={{ animationDelay: "0ms" }}>
          <PageHeader title="Import bank CSV" subtitle="Map columns and preview before importing" />
        </div>

        <section className="reveal" style={{ animationDelay: "60ms" }}>
          <form method="get" className="card p-5 space-y-5">
            {active.isAll ? (
              <label className="block">
                <span className="label">Property</span>
                <select name="propertyId" required className="field">
                  <option value="" disabled>— choose property —</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            ) : (
              <input type="hidden" name="propertyId" value={active.propertyId ?? ""} />
            )}
            <label className="block">
              <span className="label">Bank CSV</span>
              <textarea
                name="csv"
                rows={10}
                required
                className="field font-mono text-xs"
                placeholder={"date,amount,description\n01/06/2025,950.00,Rent"}
              />
            </label>
            <p className="text-xs text-faint">
              v1 limitations: dates must be DD/MM/YYYY or YYYY-MM-DD; the amount column must use a leading minus or parentheses for outgoings (trailing-minus and separate debit/credit columns aren&apos;t supported yet). For very large statements, import in batches.
            </p>
            <button type="submit" className="btn btn-primary">Next: map columns</button>
          </form>
        </section>
      </div>
    );
  }

  const propertyId = sp.propertyId ?? (active.isAll ? "" : (active.propertyId ?? ""));
  if (active.isAll && !propertyId) {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="reveal" style={{ animationDelay: "0ms" }}>
          <PageHeader title="Import bank CSV" subtitle="Map columns and preview before importing" />
        </div>
        <Banner variant="error">Choose a property before importing.</Banner>
        <a href="/import" className="btn btn-ghost">Start over</a>
      </div>
    );
  }

  const { header } = parseCsv(csv);
  const colOptions = header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>);

  // Step 3: mapping chosen — show preview + confirm.
  if (sp.dateCol !== undefined && sp.amountCol !== undefined && sp.descriptionCol !== undefined && sp.categoryId) {
    const mapping = { dateCol: Number(sp.dateCol), amountCol: Number(sp.amountCol), descriptionCol: Number(sp.descriptionCol) };
    const preview: PreviewRow[] = await buildPreview(csv, mapping, propertyId);
    const importable = preview.filter((r) => r.ok && !r.duplicate).length;
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="reveal" style={{ animationDelay: "0ms" }}>
          <PageHeader title="Import bank CSV" subtitle="Map columns and preview before importing" />
        </div>

        <section className="reveal" style={{ animationDelay: "60ms" }}>
          <p className="text-sm text-muted">{importable} row(s) will be imported. Duplicates and unparseable rows are skipped.</p>
        </section>

        <section className="reveal" style={{ animationDelay: "120ms" }}>
          <div className="card overflow-hidden overflow-x-auto">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Dir</th>
                  <th className="text-right">Amount</th>
                  <th>Description</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td className="text-muted">{r.date ?? ""}</td>
                    <td className="text-muted">{r.direction ?? ""}</td>
                    <td className="money text-right">{r.amountPence !== undefined ? formatGBP(r.amountPence) : ""}</td>
                    <td className="text-muted">{r.description ?? ""}</td>
                    <td className={!r.ok ? "text-negative text-sm" : r.duplicate ? "text-faint text-sm" : "text-muted text-sm"}>
                      {!r.ok ? `error: ${r.error}` : r.duplicate ? "duplicate (skip)" : "import"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="reveal" style={{ animationDelay: "180ms" }}>
          <form action={confirmImportAction}>
            <input type="hidden" name="csv" value={csv} />
            <input type="hidden" name="dateCol" value={sp.dateCol} />
            <input type="hidden" name="amountCol" value={sp.amountCol} />
            <input type="hidden" name="descriptionCol" value={sp.descriptionCol} />
            <input type="hidden" name="categoryId" value={sp.categoryId} />
            <input type="hidden" name="propertyId" value={propertyId} />
            <button type="submit" className="btn btn-primary">Import {importable} transaction(s)</button>
          </form>
        </section>
      </div>
    );
  }

  // Step 2: choose columns + category.
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Import bank CSV" subtitle="Map columns and preview before importing" />
      </div>

      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <form method="get" className="card p-5 space-y-5">
          <div className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Map columns</div>
          <input type="hidden" name="csv" value={csv} />
          <input type="hidden" name="propertyId" value={propertyId} />
          <label className="block">
            <span className="label">Date column</span>
            <select name="dateCol" required className="field">{colOptions}</select>
          </label>
          <label className="block">
            <span className="label">Amount column</span>
            <select name="amountCol" required className="field">{colOptions}</select>
          </label>
          <label className="block">
            <span className="label">Description column</span>
            <select name="descriptionCol" required className="field">{colOptions}</select>
          </label>
          <label className="block">
            <span className="label">Category for imported rows</span>
            <select name="categoryId" required className="field">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <button type="submit" className="btn btn-primary">Next: preview</button>
        </form>
      </section>
    </div>
  );
}
