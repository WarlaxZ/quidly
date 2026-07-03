import Link from "next/link";
import { listRecurringRules } from "../../../lib/data/recurring";
import { getActiveProperty, listProperties } from "../../../lib/data/activeProperty";
import { listCategories } from "../../../lib/data/categories";
import { listVendors } from "../../../lib/data/vendors";
import { formatGBP } from "../../../lib/tax/money";
import { describeSchedule, nextDueDate } from "../../../lib/recurring/describe";
import type { IntervalUnit } from "../../../lib/recurring/occurrences";
import { addRecurringAction, deleteRecurringAction, generateNowAction, setActiveAction } from "./actions";
import { RecurringForm } from "./RecurringForm";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";
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
  const now = new Date();
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Recurring payments" subtitle={headingProperty} />
      </div>

      {error && <Banner variant="error">{error}</Banner>}
      {ok && <Banner variant="success">{ok}</Banner>}

      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <div className="mb-4 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Add rule</div>
        <RecurringForm
          action={addRecurringAction}
          categories={categories}
          vendors={vendors}
          properties={properties}
          activePropertyId={active.propertyId}
          isAll={active.isAll}
          submitLabel="Add rule"
        />
      </section>

      <section className="reveal" style={{ animationDelay: "120ms" }}>
        <form action={generateNowAction}>
          <input type="hidden" name="propertyId" value={active.propertyId ?? ""} />
          <button type="submit" className="btn btn-ghost">Generate due transactions now</button>
        </form>
      </section>

      <section className="reveal" style={{ animationDelay: "180ms" }}>
        {rules.length === 0 ? (
          <EmptyState title="No recurring rules" hint="Add a monthly rent or a standing cost above." />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ledger">
                <thead>
                  <tr>
                    {active.isAll && <th>Property</th>}
                    <th>Payment</th>
                    <th>Schedule</th>
                    <th>Next due</th>
                    <th className="text-right">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => {
                    const occRule = {
                      intervalUnit: r.intervalUnit as IntervalUnit,
                      intervalCount: r.intervalCount,
                      dayOfWeek: r.dayOfWeek,
                      dayOfMonth: r.dayOfMonth,
                      monthOfYear: r.monthOfYear,
                      startDate: r.startDate,
                      endDate: r.endDate,
                      lastGeneratedDate: r.lastGeneratedDate,
                    };
                    const due = nextDueDate({ ...occRule, active: r.active }, now);
                    return (
                      <tr key={r.id} className={r.active ? "" : "opacity-55"}>
                        {active.isAll && <td className="text-muted">{r.property?.name}</td>}
                        <td>
                          <div className="font-medium text-ink">
                            {r.description ?? r.category.name}
                            {!r.active && <span className="ml-2 rounded-md bg-subtle px-2 py-0.5 text-xs text-muted">Paused</span>}
                          </div>
                          <div className="text-sm text-muted">
                            {r.vendor?.name ? `${r.vendor.name} · ` : ""}{r.category.name}
                          </div>
                        </td>
                        <td className="text-muted">{describeSchedule(occRule)}</td>
                        <td className="text-muted">{due ? fmt(due) : "—"}</td>
                        <td className="money text-right">
                          {r.direction === "out" ? "−" : ""}{formatGBP(r.amountPence)}
                        </td>
                        <td className="text-right">
                          <div className="flex justify-end gap-3">
                            <Link href={`/recurring/${r.id}/edit`} className="link">Edit</Link>
                            <form action={setActiveAction}>
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="active" value={r.active ? "false" : "true"} />
                              <button type="submit" className="link">{r.active ? "Pause" : "Resume"}</button>
                            </form>
                            <form action={deleteRecurringAction}>
                              <input type="hidden" name="id" value={r.id} />
                              <ConfirmSubmit confirm="Delete this recurring rule? This can't be undone.">Delete</ConfirmSubmit>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
