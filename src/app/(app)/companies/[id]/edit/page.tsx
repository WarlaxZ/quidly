import { notFound } from "next/navigation";
import { getCompany } from "../../../../../lib/data/company";
import { updateCompanyAction } from "../../actions";
import { PageHeader } from "../../../_ui/PageHeader";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompany(id);
  if (!company) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Edit company" />
      </div>

      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <form action={updateCompanyAction} className="card p-6 space-y-5">
          <input type="hidden" name="id" value={company.id} />

          <label className="block">
            <span className="label">Company name</span>
            <input name="name" defaultValue={company.name} required className="field" />
          </label>

          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[6rem]">
              <span className="label">Year-end day</span>
              <input
                name="accountingYearEndDay"
                type="number"
                min="1"
                max="31"
                defaultValue={company.accountingYearEndDay}
                required
                className="field"
              />
            </label>
            <label className="min-w-[8rem]">
              <span className="label">Year-end month</span>
              <select name="accountingYearEndMonth" defaultValue={company.accountingYearEndMonth} className="field">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" className="btn btn-primary">Save changes</button>
            <a href="/companies" className="btn btn-ghost">Cancel</a>
          </div>
        </form>
      </section>
    </div>
  );
}
