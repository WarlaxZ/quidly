import { notFound } from "next/navigation";
import { getCompany } from "../../../../../lib/data/company";
import { updateCompanyAction } from "../../actions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompany(id);
  if (!company) notFound();
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Edit company</h1>
      <form action={updateCompanyAction} className="space-y-3">
        <input type="hidden" name="id" value={company.id} />
        <label className="block"><span className="block text-sm">Name</span>
          <input name="name" defaultValue={company.name} required className="w-full border px-2 py-1" /></label>
        <div className="flex items-end gap-2">
          <label className="text-sm">Year end day
            <input name="accountingYearEndDay" type="number" min="1" max="31" defaultValue={company.accountingYearEndDay} required className="ml-1 w-16 border px-2 py-1" /></label>
          <select name="accountingYearEndMonth" defaultValue={company.accountingYearEndMonth} className="border px-2 py-1">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Save</button>
      </form>
    </div>
  );
}
