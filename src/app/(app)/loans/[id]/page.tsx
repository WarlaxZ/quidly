import Link from "next/link";
import { notFound } from "next/navigation";
import { getLoan } from "../../../../lib/data/loans";
import { capitalNoReliefPence } from "../../../../lib/data/loanGeneration";
import { loanAdvice } from "../../../../lib/loans/advice";
import { getOrCreateProfile } from "../../../../lib/data/taxProfile";
import { latestConfiguredTaxYear } from "../../../../lib/tax/taxYear";
import { formatGBP } from "../../../../lib/tax/money";
import type { LoanKind } from "../../../../lib/tax/types";
import { PageHeader } from "../../_ui/PageHeader";
import { Banner } from "../../_ui/Banner";
import { generateLoanPaymentsAction, setActualInterestAction } from "../actions";

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function LoanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const loan = await getLoan(id);
  if (!loan) notFound();

  const taxYear = latestConfiguredTaxYear();
  const profile = await getOrCreateProfile(taxYear);
  const capitalPence = await capitalNoReliefPence(id, taxYear);
  const currentBalancePence = loan.payments.at(-1)?.closingBalancePence ?? loan.openingBalancePence;

  const advice = loanAdvice({
    annualRateBps: loan.annualRateBps,
    ownershipType: loan.property.ownershipType,
    taxYear,
    region: profile.region,
    kind: loan.kind as LoanKind,
    capitalNoReliefPence: capitalPence,
    termEndDate: loan.termEndDate,
    currentBalancePence,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title={loan.name}
        subtitle={`${loan.property.name} · ${loan.kind === "interestOnly" ? "Interest-only" : "Repayment"}`}
      />

      {error && <Banner variant="error">{error}</Banner>}
      {ok && <Banner variant="success">{ok}</Banner>}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Balance</div>
          <div className="money mt-1 text-xl text-ink">{formatGBP(currentBalancePence)}</div>
        </div>
        <div className="card p-4">
          <div className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Rate</div>
          <div className="money mt-1 text-xl text-ink">{(advice.nominalRateBps / 100).toFixed(2)}%</div>
          <div className="mt-1 text-sm text-muted">
            {advice.reliefBasis === "section24Reducer"
              ? `${(advice.effectiveRateBps / 100).toFixed(2)}% after ${(advice.reducerBps / 100).toFixed(0)}% relief`
              : "Interest deducted in full against company profits"}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Capital, {taxYear}</div>
          <div className="money mt-1 text-xl text-ink">{formatGBP(advice.capitalNoReliefPence)}</div>
          <div className="mt-1 text-sm text-muted">No tax relief — capital is not deductible</div>
        </div>
      </section>

      {advice.termEnd && (
        <Banner variant="error">
          This is an interest-only loan. {formatGBP(advice.termEnd.balanceDuePence)} is still
          due when the term ends on {fmtDate(advice.termEnd.date)}.
        </Banner>
      )}

      <section className="flex gap-3">
        <form action={generateLoanPaymentsAction}>
          <input type="hidden" name="id" value={loan.id} />
          <button type="submit" className="btn btn-primary">Record payments due</button>
        </form>
        <Link href={`/loans/${loan.id}/reconcile?ty=${taxYear}`} className="btn btn-ghost">
          Check against my statement
        </Link>
      </section>

      <section>
        <div className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Payments</div>
        {loan.payments.length === 0 ? (
          <div className="card p-5 text-muted">
            No payments recorded yet. Use “Record payments due” above.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Opening</th>
                    <th className="text-right">Interest</th>
                    <th className="text-right">Capital</th>
                    <th className="text-right">Closing</th>
                    <th>Actual interest</th>
                  </tr>
                </thead>
                <tbody>
                  {loan.payments.map((p) => {
                    const interest = p.actualInterestPence ?? p.computedInterestPence;
                    return (
                      <tr key={p.id}>
                        <td className="text-muted">{fmtDate(p.date)}</td>
                        <td className="money text-right">{formatGBP(p.openingBalancePence)}</td>
                        <td className="money text-right">
                          {formatGBP(interest)}
                          {p.actualInterestPence != null && (
                            <span className="ml-1.5 text-xs text-muted">actual</span>
                          )}
                        </td>
                        <td className="money text-right">{formatGBP(p.paidPence - interest)}</td>
                        <td className="money text-right">{formatGBP(p.closingBalancePence)}</td>
                        <td>
                          <form action={setActualInterestAction} className="flex items-center gap-2">
                            <input type="hidden" name="loanId" value={loan.id} />
                            <input type="hidden" name="paymentId" value={p.id} />
                            <input
                              name="actualInterest" inputMode="decimal" className="field !py-1 !text-sm"
                              placeholder={(interest / 100).toFixed(2)} aria-label="Actual interest"
                            />
                            <button type="submit" className="btn btn-ghost !px-3 !py-1 text-xs">Set</button>
                          </form>
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

      <Link href="/loans" className="btn btn-ghost">Back to loans</Link>
    </div>
  );
}
