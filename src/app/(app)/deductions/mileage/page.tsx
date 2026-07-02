import { listMileageTrips } from "../../../../lib/data/mileage";
import { listPersonalProperties } from "../../../../lib/data/deductions";
import { getActiveProperty } from "../../../../lib/data/activeProperty";
import { mileageSummary } from "../../../../lib/tax/mileage";
import { latestConfiguredTaxYear, taxYearOptions } from "../../../../lib/tax/taxYear";
import { formatGBP } from "../../../../lib/tax/money";
import { PageHeader } from "../../_ui/PageHeader";
import { Banner } from "../../_ui/Banner";
import { EmptyState } from "../../_ui/EmptyState";
import { MileageForm } from "../MileageForm";
import { deleteMileageAction } from "../actions";
import { ConfirmSubmit } from "../../_ui/ConfirmSubmit";

export default async function MileageLogPage({ searchParams }: { searchParams: Promise<{ ty?: string; ok?: string; error?: string }> }) {
  const { ty, ok, error } = await searchParams;
  const taxYear = ty ?? latestConfiguredTaxYear();
  const [trips, properties, active] = await Promise.all([
    listMileageTrips(taxYear),
    listPersonalProperties(),
    getActiveProperty(),
  ]);
  const activePropertyId =
    (active.propertyId && properties.some((p) => p.id === active.propertyId) ? active.propertyId : properties[0]?.id) ?? "";
  const activeProperty = properties.find((p) => p.id === activePropertyId);
  const summary = mileageSummary(trips, taxYear);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader title="Mileage log" subtitle="Your mileage trips this tax year — 45p/mile for the first 10,000, then 25p">
        <div className="flex items-center gap-1.5">
          {taxYearOptions().map((y) => (
            <a key={y} href={`/deductions/mileage?ty=${y}`} className={`pill ${y === taxYear ? "" : "opacity-60"}`}>{y}</a>
          ))}
        </div>
        <a className="btn btn-ghost" href={`/deductions?ty=${taxYear}`}>Back to deductions</a>
      </PageHeader>

      {ok && <Banner variant="success">{ok}</Banner>}
      {error && <Banner variant="error">{error}</Banner>}

      {properties.length === 0 ? (
        <EmptyState title="No properties yet" hint="Add a property first, then log trips to it." />
      ) : (
        <>
          <p className="text-sm text-muted">
            <strong>{summary.totalMiles}</strong> miles logged · <strong>{formatGBP(summary.totalPence)}</strong> ·{" "}
            {summary.remainingAt45p.toLocaleString()} miles left at 45p for {taxYear}.
          </p>

          <div className="card p-4">
            <div className="font-medium">Log a trip</div>
            <MileageForm
              taxYear={taxYear}
              propertyId={activePropertyId}
              propertyName={activeProperty?.name ?? "your property"}
              roundTripMiles={activeProperty?.roundTripMiles ?? null}
              returnTo="/deductions/mileage"
            />
          </div>

          {trips.length === 0 ? (
            <EmptyState title="No trips logged yet" hint="Log your first trip above." />
          ) : (
            <div className="card overflow-hidden">
              <table className="ledger">
                <thead>
                  <tr><th>Date</th><th>Purpose</th><th className="text-right">Miles</th><th className="text-right">Claim</th><th></th></tr>
                </thead>
                <tbody>
                  {trips.map((t) => (
                    <tr key={t.id}>
                      <td className="money">{t.date.toISOString().slice(0, 10)}</td>
                      <td>{t.description ?? "Trip"}</td>
                      <td className="money text-right">{t.miles}</td>
                      <td className="money text-right">{formatGBP(t.amountPence)}</td>
                      <td className="text-right">
                        <form action={deleteMileageAction}>
                          <input type="hidden" name="taxYear" value={taxYear} />
                          <input type="hidden" name="id" value={t.id} />
                          <ConfirmSubmit confirm="Delete this trip? This can't be undone." className="text-faint hover:text-forest">✕</ConfirmSubmit>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
