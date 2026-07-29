import Link from "next/link";
import { listLoans } from "../../../lib/data/loans";
import { getActiveProperty, listProperties } from "../../../lib/data/activeProperty";
import { formatGBP } from "../../../lib/tax/money";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";
import { ConfirmSubmit } from "../_ui/ConfirmSubmit";
import { deleteLoanAction, setLoanActiveAction } from "./actions";

export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const active = await getActiveProperty();
  const properties = await listProperties();
  const loans = await listLoans(active.propertyId);
  const headingProperty = active.isAll
    ? "All properties"
    : (properties.find((p) => p.id === active.propertyId)?.name ?? "—");

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Mortgages & loans" subtitle={headingProperty} />
      </div>

      {error && <Banner variant="error">{error}</Banner>}
      {ok && <Banner variant="success">{ok}</Banner>}

      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <Link href="/loans/new" className="btn btn-primary">Add a loan</Link>
      </section>

      <section className="reveal" style={{ animationDelay: "120ms" }}>
        {loans.length === 0 ? (
          <EmptyState
            title="No loans yet"
            hint="Only the interest on a mortgage payment is deductible. Add your loan and Quidly will split each payment into interest and capital for you."
          />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ledger">
                <thead>
                  <tr>
                    {active.isAll && <th>Property</th>}
                    <th>Loan</th>
                    <th>Rate</th>
                    <th className="text-right">Payment</th>
                    <th className="text-right">Balance</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loans.map((l) => (
                    <tr key={l.id} className={l.active ? "" : "opacity-55"}>
                      {active.isAll && <td className="text-muted">{l.property?.name}</td>}
                      <td>
                        <Link href={`/loans/${l.id}`} className="font-medium text-ink hover:underline">
                          {l.name}
                        </Link>
                        {!l.active && (
                          <span className="ml-2 rounded-md bg-surface-sunk px-2 py-0.5 text-xs text-muted">Paused</span>
                        )}
                        <div className="text-sm text-muted">
                          {l.kind === "interestOnly" ? "Interest-only" : "Repayment"}
                        </div>
                      </td>
                      <td className="text-muted">{(l.annualRateBps / 100).toFixed(2)}%</td>
                      <td className="money text-right">{formatGBP(l.scheduledPaymentPence)}</td>
                      <td className="money text-right">{formatGBP(l.openingBalancePence)}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-3">
                          <Link href={`/loans/${l.id}/edit`} className="btn btn-ghost !px-3 !py-1.5 text-xs">Edit</Link>
                          <form action={setLoanActiveAction}>
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="active" value={l.active ? "false" : "true"} />
                            <button type="submit" className="btn btn-ghost !px-3 !py-1.5 text-xs">
                              {l.active ? "Pause" : "Resume"}
                            </button>
                          </form>
                          <form action={deleteLoanAction}>
                            <input type="hidden" name="id" value={l.id} />
                            <ConfirmSubmit confirm="Delete this loan? This can't be undone.">Delete</ConfirmSubmit>
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
