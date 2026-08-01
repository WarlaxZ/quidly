import Link from "next/link";
import { notFound } from "next/navigation";
import { getLoan } from "../../../../../lib/data/loans";
import { reconcileYear } from "../../../../../lib/data/loanGeneration";
import { latestConfiguredTaxYear, isConfiguredTaxYear, taxYearOptions } from "../../../../../lib/tax/taxYear";
import { formatGBP } from "../../../../../lib/tax/money";
import { PageHeader } from "../../../_ui/PageHeader";
import { Banner } from "../../../_ui/Banner";
import { applyYearVarianceAction } from "../../actions";

export default async function ReconcilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ty?: string; error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { ty, error, ok } = await searchParams;
  const loan = await getLoan(id);
  if (!loan) notFound();

  const taxYear = ty && isConfiguredTaxYear(ty) ? ty : latestConfiguredTaxYear();
  const { recordedInterestPence, paymentCount } = await reconcileYear(id, taxYear);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Check against my statement" subtitle={`${loan.name} · ${taxYear}`} />

      {error && <Banner variant="error">{error}</Banner>}
      {ok && <Banner variant="success">{ok}</Banner>}

      <nav className="flex flex-wrap gap-2">
        {taxYearOptions().map((y) => (
          <Link
            key={y}
            href={`/loans/${id}/reconcile?ty=${y}`}
            className={`btn ${y === taxYear ? "btn-primary" : "btn-ghost"} !px-3 !py-1.5 text-xs`}
          >
            {y}
          </Link>
        ))}
      </nav>

      <div className="card space-y-2 p-5">
        <div className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">
          Interest recorded in {taxYear}
        </div>
        <div className="money text-2xl text-ink">{formatGBP(recordedInterestPence)}</div>
        <div className="text-sm text-muted">
          Across {paymentCount} payment{paymentCount === 1 ? "" : "s"}. This is the figure
          that reaches SA105 box 44.
        </div>
      </div>

      <form action={applyYearVarianceAction} className="card space-y-4 p-5">
        <input type="hidden" name="loanId" value={id} />
        <input type="hidden" name="taxYear" value={taxYear} />
        <label className="block">
          <span className="label">Interest on your lender's annual statement</span>
          <input name="statementInterest" required inputMode="decimal" className="field" placeholder="1917.00" />
          <span className="mt-1 block text-xs text-muted">
            Quidly adjusts the final payment of the year so the total matches your statement
            exactly. Your statement is the figure HMRC would check against.
          </span>
        </label>
        <button type="submit" className="btn btn-primary" disabled={paymentCount === 0}>
          Match my statement
        </button>
        {paymentCount === 0 && (
          <p className="text-sm text-muted">Record some payments for {taxYear} first.</p>
        )}
      </form>

      <Link href={`/loans/${id}`} className="btn btn-ghost">Back to loan</Link>
    </div>
  );
}
