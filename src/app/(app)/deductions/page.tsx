import { getDeductionStatuses, listPersonalProperties } from "../../../lib/data/deductions";
import { getActiveProperty } from "../../../lib/data/activeProperty";
import { latestConfiguredTaxYear, taxYearOptions } from "../../../lib/tax/taxYear";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";
import { dismissDeductionAction, undismissDeductionAction } from "./actions";
import { LogItForm } from "./LogItForm";
import { MileageForm } from "./MileageForm";

export default async function DeductionsPage({ searchParams }: { searchParams: Promise<{ ty?: string; ok?: string; error?: string }> }) {
  const { ty, ok, error } = await searchParams;
  const taxYear = ty ?? latestConfiguredTaxYear();
  const [statuses, properties, active] = await Promise.all([
    getDeductionStatuses(taxYear),
    listPersonalProperties(),
    getActiveProperty(),
  ]);
  const activePropertyId =
    (active.propertyId && properties.some((p) => p.id === active.propertyId) ? active.propertyId : properties[0]?.id) ?? "";
  const activePropertyName = properties.find((p) => p.id === activePropertyId)?.name ?? "your property";
  const activeRoundTrip = properties.find((p) => p.id === activePropertyId)?.roundTripMiles ?? null;

  const considered = statuses.filter((s) => s.state === "consider");
  const covered = statuses.filter((s) => s.state === "covered");
  const dismissed = statuses.filter((s) => s.state === "dismissed");
  const relevant = considered.length + covered.length;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader title="Deductions" subtitle="Expenses you might be able to claim — prompts, not tax advice">
        <div className="flex items-center gap-1.5">
          {taxYearOptions().map((y) => (
            <a key={y} href={`/deductions?ty=${y}`} className={`pill ${y === taxYear ? "" : "opacity-60"}`}>{y}</a>
          ))}
        </div>
      </PageHeader>

      {ok && <Banner variant="success">{ok}</Banner>}
      {error && <Banner variant="error">{error}</Banner>}

      {properties.length === 0 ? (
        <EmptyState title="No properties yet" hint="Add a property first, then come back to review deductions." />
      ) : (
        <>
          <p className="text-sm text-muted">
            You&apos;ve captured <strong>{covered.length}</strong> of <strong>{relevant}</strong> relevant deductions for {taxYear}.
            The rest are prompts — log the expense to tick one off, or mark any that don&apos;t apply to you.
          </p>

          {considered.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-lg">Consider</h2>
              {considered.map(({ item }) => (
                <div key={item.key} className="card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <p className="mt-1 text-sm text-muted">{item.blurb}</p>
                    </div>
                    <form action={dismissDeductionAction} className="shrink-0">
                      <input type="hidden" name="taxYear" value={taxYear} />
                      <input type="hidden" name="itemKey" value={item.key} />
                      <button className="btn btn-ghost" type="submit">Not applicable</button>
                    </form>
                  </div>
                  {item.action === "mileage" ? (
                    <MileageForm taxYear={taxYear} propertyId={activePropertyId} propertyName={activePropertyName} roundTripMiles={activeRoundTrip} />
                  ) : (
                    <LogItForm taxYear={taxYear} itemKey={item.key} title={item.title} activePropertyId={activePropertyId} activePropertyName={activePropertyName} />
                  )}
                </div>
              ))}
            </section>
          )}

          {covered.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-display text-lg">Covered</h2>
              <ul className="space-y-1 text-sm">
                {covered.map(({ item }) => (
                  <li key={item.key} className="flex items-center gap-2 text-muted"><span className="text-forest">✓</span> {item.title}</li>
                ))}
              </ul>
            </section>
          )}

          {dismissed.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-display text-sm text-faint">Not applicable</h2>
              <ul className="space-y-1 text-sm">
                {dismissed.map(({ item }) => (
                  <li key={item.key} className="flex items-center gap-2 text-faint">
                    {item.title}
                    <form action={undismissDeductionAction} className="inline">
                      <input type="hidden" name="taxYear" value={taxYear} />
                      <input type="hidden" name="itemKey" value={item.key} />
                      <button className="underline hover:text-forest" type="submit">restore</button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
