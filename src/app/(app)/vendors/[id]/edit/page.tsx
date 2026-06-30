import { notFound } from "next/navigation";
import { getVendor } from "../../../../../lib/data/vendors";
import { updateVendorAction } from "../../edit-actions";

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = await getVendor(id);
  if (!vendor) notFound();

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Edit vendor</h1>
      <form action={updateVendorAction} className="space-y-3">
        <input type="hidden" name="id" value={vendor.id} />
        <label className="block"><span className="block text-sm">Name</span>
          <input name="name" defaultValue={vendor.name} required className="w-full border px-2 py-1" /></label>
        <label className="block"><span className="block text-sm">Contact</span>
          <input name="contactDetails" defaultValue={vendor.contactDetails ?? ""} className="w-full border px-2 py-1" /></label>
        <label className="block"><span className="block text-sm">Notes</span>
          <input name="notes" defaultValue={vendor.notes ?? ""} className="w-full border px-2 py-1" /></label>
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Save</button>
      </form>
    </div>
  );
}
