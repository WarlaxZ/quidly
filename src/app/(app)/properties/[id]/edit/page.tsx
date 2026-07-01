import { notFound } from "next/navigation";
import { getProperty } from "../../../../../lib/data/property";
import { listCompanies } from "../../../../../lib/data/company";
import { updatePropertyAction } from "../../actions";
import { PageHeader } from "../../../_ui/PageHeader";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getProperty(id);
  if (!property) notFound();
  const companies = await listCompanies();
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Edit property" />
      </div>

      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <form action={updatePropertyAction} className="card p-6 space-y-4">
          <input type="hidden" name="id" value={property.id} />
          <label className="block">
            <span className="label">Name</span>
            <input name="name" defaultValue={property.name} required className="field w-full" />
          </label>
          <label className="block">
            <span className="label">Address</span>
            <input name="address" defaultValue={property.address ?? ""} className="field w-full" />
          </label>
          <label className="block">
            <span className="label">Ownership type</span>
            <select name="ownershipType" defaultValue={property.ownershipType} className="field">
              <option value="personal">Personal</option>
              <option value="company">Company</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Company (if company-owned)</span>
            <select name="companyId" defaultValue={property.companyId ?? ""} className="field">
              <option value="">— company (if company-owned) —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" className="btn btn-primary">Save</button>
            <a className="btn btn-ghost" href="/properties">Cancel</a>
          </div>
        </form>
      </section>
    </div>
  );
}
