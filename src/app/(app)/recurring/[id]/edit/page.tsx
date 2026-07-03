import { notFound } from "next/navigation";
import { getRecurringRule } from "../../../../../lib/data/recurring";
import { listProperties } from "../../../../../lib/data/activeProperty";
import { listCategories } from "../../../../../lib/data/categories";
import { listVendors } from "../../../../../lib/data/vendors";
import type { IntervalUnit } from "../../../../../lib/recurring/occurrences";
import { updateRecurringAction } from "../../actions";
import { RecurringForm, type RecurringFormInitial } from "../../RecurringForm";
import { PageHeader } from "../../../_ui/PageHeader";
import { Banner } from "../../../_ui/Banner";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function EditRecurringPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [rule, properties, categories, vendors] = await Promise.all([
    getRecurringRule(id),
    listProperties(),
    listCategories(),
    listVendors(),
  ]);
  if (!rule) notFound();

  const initial: RecurringFormInitial = {
    id: rule.id,
    description: rule.description,
    amountText: (rule.amountPence / 100).toFixed(2),
    direction: rule.direction as "in" | "out",
    categoryId: rule.categoryId,
    vendorId: rule.vendorId,
    intervalUnit: rule.intervalUnit as IntervalUnit,
    intervalCount: rule.intervalCount,
    dayOfWeek: rule.dayOfWeek,
    dayOfMonth: rule.dayOfMonth,
    monthOfYear: rule.monthOfYear,
    startDate: iso(rule.startDate),
    endDate: iso(rule.endDate),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader title="Edit recurring payment" subtitle={rule.property?.name ?? undefined} />
      {error && <Banner variant="error">{error}</Banner>}
      <RecurringForm
        action={updateRecurringAction}
        initial={initial}
        categories={categories}
        vendors={vendors}
        properties={properties}
        activePropertyId={rule.propertyId}
        isAll={false}
        submitLabel="Save changes"
      />
    </div>
  );
}
