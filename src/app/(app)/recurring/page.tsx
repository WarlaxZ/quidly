import { listRecurringRules } from "../../../lib/data/recurring";
import { getActiveProperty, listProperties } from "../../../lib/data/activeProperty";
import { listCategories } from "../../../lib/data/categories";
import { listVendors } from "../../../lib/data/vendors";
import { formatGBP } from "../../../lib/tax/money";
import { addRecurringAction, deleteRecurringAction, generateNowAction } from "./actions";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";
import { MoneyInput } from "../_ui/MoneyInput";
import { ConfirmSubmit } from "../_ui/ConfirmSubmit";

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const active = await getActiveProperty();
  const properties = await listProperties();
  const [rules, categories, vendors] = await Promise.all([
    listRecurringRules(active.propertyId),
    listCategories(),
    listVendors(),
  ]);
  const headingProperty = active.isAll
    ? "All properties"
    : (properties.find((p) => p.id === active.propertyId)?.name ?? "—");

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Recurring payments" subtitle={headingProperty} />
      </div>

      {/* Banners */}
      {error && <Banner variant="error">{error}</Banner>}
      {ok && <Banner variant="success">{ok}</Banner>}

      {/* Add rule form */}
      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <form action={addRecurringAction} className="card p-5">
          <div className="mb-4 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">
            Add rule
          </div>
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
              <span className="label">Amount</span>
              <MoneyInput name="amount" required />
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
            <label className="flex-1 min-w-[9rem]">
              <span className="label">Frequency</span>
              <select name="frequency" className="field">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </label>
            <label>
              <span className="label">Day of month</span>
              <input
                name="dayOfMonth"
                type="number"
                min="1"
                max="31"
                defaultValue="1"
                required
                className="field w-20"
              />
            </label>
            <label className="flex-1 min-w-[9rem]">
              <span className="label">Start date</span>
              <input name="startDate" type="date" required className="field" />
            </label>
            <label className="flex-1 min-w-[9rem]">
              <span className="label">End date</span>
              <input name="endDate" type="date" className="field" />
            </label>
            <button type="submit" className="btn btn-primary">
              Add rule
            </button>
          </div>
        </form>
      </section>

      {/* Generate due transactions */}
      <section className="reveal" style={{ animationDelay: "120ms" }}>
        <form action={generateNowAction}>
          <input type="hidden" name="propertyId" value={active.propertyId ?? ""} />
          <button type="submit" className="btn btn-ghost">
            Generate due transactions now
          </button>
        </form>
      </section>

      {/* Rules list */}
      <section className="reveal" style={{ animationDelay: "180ms" }}>
        {rules.length === 0 ? (
          <EmptyState
            title="No recurring rules"
            hint="Add a monthly rent or a standing cost above."
          />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ledger">
                <thead>
                  <tr>
                    {active.isAll && <th>Property</th>}
                    <th>Frequency</th>
                    <th>Category</th>
                    <th className="text-right">Amount</th>
                    <th>Day</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      {active.isAll && (
                        <td className="text-muted">{r.property?.name}</td>
                      )}
                      <td className="font-medium text-ink capitalize">{r.frequency}</td>
                      <td className="text-muted">{r.category.name}</td>
                      <td className="money text-right">
                        {r.direction === "out" ? "−" : ""}
                        {formatGBP(r.amountPence)}
                      </td>
                      <td className="text-muted">{r.dayOfMonth}</td>
                      <td className="text-right">
                        <form action={deleteRecurringAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <ConfirmSubmit confirm="Delete this recurring rule? This can't be undone.">
                            Delete
                          </ConfirmSubmit>
                        </form>
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
