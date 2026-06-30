import { notFound } from "next/navigation";
import { getProperty } from "../../../../../lib/data/property";
import { listCompanies } from "../../../../../lib/data/company";
import { updatePropertyAction } from "../../actions";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getProperty(id);
  if (!property) notFound();
  const companies = await listCompanies();
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Edit property</h1>
      <form action={updatePropertyAction} className="space-y-3">
        <input type="hidden" name="id" value={property.id} />
        <label className="block"><span className="block text-sm">Name</span>
          <input name="name" defaultValue={property.name} required className="w-full border px-2 py-1" /></label>
        <label className="block"><span className="block text-sm">Address</span>
          <input name="address" defaultValue={property.address ?? ""} className="w-full border px-2 py-1" /></label>
        <label className="block"><span className="block text-sm">Ownership</span>
          <select name="ownershipType" defaultValue={property.ownershipType} className="border px-2 py-1">
            <option value="personal">Personal</option>
            <option value="company">Company</option>
          </select></label>
        <label className="block"><span className="block text-sm">Company (if company-owned)</span>
          <select name="companyId" defaultValue={property.companyId ?? ""} className="border px-2 py-1">
            <option value="">— company (if company-owned) —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Save</button>
      </form>
    </div>
  );
}
