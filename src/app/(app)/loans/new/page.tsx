import Link from "next/link";
import { getActiveProperty, listProperties } from "../../../../lib/data/activeProperty";
import { PageHeader } from "../../_ui/PageHeader";
import { Banner } from "../../_ui/Banner";
import { LoanForm } from "../LoanForm";
import { addLoanAction } from "../actions";

export default async function NewLoanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const active = await getActiveProperty();
  const properties = await listProperties();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Add a loan" subtitle="Quidly splits each payment into interest and capital" />
      {error && <Banner variant="error">{error}</Banner>}
      <LoanForm
        action={addLoanAction}
        properties={properties}
        activePropertyId={active.propertyId}
        isAll={active.isAll}
        submitLabel="Add loan"
      />
      <Link href="/loans" className="btn btn-ghost">Back to loans</Link>
    </div>
  );
}
