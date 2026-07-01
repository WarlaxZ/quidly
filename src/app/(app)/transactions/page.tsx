import { listTransactionsFiltered } from "../../../lib/data/transactions";
import { getActiveProperty, listProperties } from "../../../lib/data/activeProperty";
import { listVendors } from "../../../lib/data/vendors";
import { listCategories } from "../../../lib/data/categories";
import { formatGBP } from "../../../lib/tax/money";
import { addTransactionAction, deleteTransactionAction } from "./actions";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";
import { MoneyInput } from "../_ui/MoneyInput";
import { ConfirmSubmit } from "../_ui/ConfirmSubmit";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ taxYear?: string; categoryId?: string; direction?: string; error?: string; ok?: string }>;
}) {
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
    Object.entries({ taxYear: sp.taxYear, categoryId: sp.categoryId, direction: sp.direction }).filter(
      ([, v]) => v,
    ) as [string, string][],
  ).toString();
  const headingProperty = active.isAll
    ? "All properties"
    : (properties.find((p) => p.id === active.propertyId)?.name ?? "—");

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Transactions" subtitle={headingProperty}>
          <a
            href={`/export/transactions${exportQuery ? `?${exportQuery}` : ""}`}
            className="btn btn-ghost"
          >
            Export CSV
          </a>
        </PageHeader>
      </div>

      {/* Banners */}
      {sp.error && <Banner variant="error">{sp.error}</Banner>}
      {sp.ok && <Banner variant="success">{sp.ok}</Banner>}

      {/* Filter form */}
      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <form className="card p-5">
          <div className="mb-4 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Filter</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Tax year</span>
              <input
                name="taxYear"
                placeholder="e.g. 2025-26"
                defaultValue={sp.taxYear ?? ""}
                className="field"
              />
            </label>
            <label className="flex-1 min-w-[10rem]">
              <span className="label">Category</span>
              <select name="categoryId" defaultValue={sp.categoryId ?? ""} className="field">
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1 min-w-[8rem]">
              <span className="label">Direction</span>
              <select name="direction" defaultValue={sp.direction ?? ""} className="field">
                <option value="">All</option>
                <option value="in">In</option>
                <option value="out">Out</option>
              </select>
            </label>
            <button type="submit" className="btn btn-ghost">
              Filter
            </button>
          </div>
        </form>
      </section>

      {/* Add transaction form */}
      <section className="reveal" style={{ animationDelay: "120ms" }}>
        <form action={addTransactionAction} className="card p-5">
          <div className="mb-4 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Add transaction</div>
          <div className="flex flex-wrap items-end gap-3">
            {active.isAll ? (
              <label className="flex-1 min-w-[10rem]">
                <span className="label">Property</span>
                <select name="propertyId" required className="field">
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="propertyId" value={active.propertyId ?? ""} />
            )}
            <label className="flex-1 min-w-[9rem]">
              <span className="label">Date</span>
              <input type="date" name="date" required className="field" />
            </label>
            <label className="flex-1 min-w-[9rem]">
              <span className="label">Amount</span>
              <MoneyInput name="amount" placeholder="0.00" required />
            </label>
            <label className="flex-1 min-w-[7rem]">
              <span className="label">Direction</span>
              <select name="direction" className="field">
                <option value="in">In</option>
                <option value="out">Out</option>
              </select>
            </label>
            <label className="flex-1 min-w-[10rem]">
              <span className="label">Category</span>
              <select name="categoryId" required className="field">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1 min-w-[10rem]">
              <span className="label">Vendor</span>
              <select name="vendorId" className="field">
                <option value="">— vendor —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Description</span>
              <input name="description" placeholder="Optional note" className="field" />
            </label>
            <button type="submit" className="btn btn-primary">
              Add
            </button>
          </div>
        </form>
      </section>

      {/* Transactions list */}
      <section className="reveal" style={{ animationDelay: "180ms" }}>
        {txns.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            hint="Add one above, import a bank CSV, or scan a receipt."
          />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Date</th>
                    {active.isAll && <th>Property</th>}
                    <th>Category</th>
                    <th>Vendor</th>
                    <th>Description</th>
                    <th className="text-right">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => (
                    <tr key={t.id}>
                      <td className="text-muted">{t.date.toISOString().slice(0, 10)}</td>
                      {active.isAll && (
                        <td className="text-muted">{t.property?.name}</td>
                      )}
                      <td className="font-medium text-ink">{t.category.name}</td>
                      <td className="text-muted">{t.vendor?.name ?? ""}</td>
                      <td className="text-muted">{t.description ?? ""}</td>
                      <td className="money text-right">
                        {t.direction === "out" ? "−" : ""}
                        {formatGBP(t.amountPence)}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-3">
                          <a
                            href={`/transactions/${t.id}/edit`}
                            className="text-sm font-medium text-forest hover:underline"
                          >
                            Edit
                          </a>
                          <form action={deleteTransactionAction}>
                            <input type="hidden" name="id" value={t.id} />
                            <ConfirmSubmit confirm="Delete this transaction? This can't be undone.">
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
          </div>
        )}
      </section>
    </div>
  );
}
