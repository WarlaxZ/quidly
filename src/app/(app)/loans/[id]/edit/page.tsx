import Link from "next/link";
import { notFound } from "next/navigation";
import { getLoan } from "../../../../../lib/data/loans";
import { listProperties } from "../../../../../lib/data/activeProperty";
import { PageHeader } from "../../../_ui/PageHeader";
import { Banner } from "../../../_ui/Banner";
import { LoanForm } from "../../LoanForm";
import { updateLoanAction } from "../../actions";

export default async function EditLoanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const loan = await getLoan(id);
  if (!loan) notFound();
  const properties = await listProperties();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Edit loan" subtitle={loan.name} />
      {error && <Banner variant="error">{error}</Banner>}
      <Banner variant="success">
        Changing the rate only affects payments recorded from now on — payments already
        recorded keep the interest figure they were given.
      </Banner>
      <LoanForm
        action={updateLoanAction}
        properties={properties}
        activePropertyId={loan.propertyId}
        isAll={false}
        submitLabel="Save loan"
        values={{
          id: loan.id,
          name: loan.name,
          kind: loan.kind as "interestOnly" | "repayment",
          openingBalancePence: loan.openingBalancePence,
          annualRateBps: loan.annualRateBps,
          scheduledPaymentPence: loan.scheduledPaymentPence,
          intervalUnit: loan.intervalUnit,
          intervalCount: loan.intervalCount,
          dayOfWeek: loan.dayOfWeek,
          dayOfMonth: loan.dayOfMonth,
          monthOfYear: loan.monthOfYear,
          startDate: loan.startDate,
          termEndDate: loan.termEndDate,
        }}
      />
      <Link href={`/loans/${loan.id}`} className="btn btn-ghost">Back to loan</Link>
    </div>
  );
}
