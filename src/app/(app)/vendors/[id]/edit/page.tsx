import { notFound } from "next/navigation";
import { getVendor } from "../../../../../lib/data/vendors";
import { updateVendorAction } from "../../edit-actions";
import { PageHeader } from "../../../_ui/PageHeader";

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = await getVendor(id);
  if (!vendor) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Edit vendor" />
      </div>

      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <form action={updateVendorAction} className="card p-6 space-y-5">
          <input type="hidden" name="id" value={vendor.id} />
          <label className="block">
            <span className="label">Name</span>
            <input name="name" defaultValue={vendor.name} required className="field" />
          </label>
          <label className="block">
            <span className="label">Email</span>
            <input name="email" type="email" defaultValue={vendor.email ?? ""} className="field" />
          </label>
          <label className="block">
            <span className="label">Phone</span>
            <input name="phone" defaultValue={vendor.phone ?? ""} className="field" />
          </label>
          <label className="block">
            <span className="label">Address</span>
            <input name="address" defaultValue={vendor.address ?? ""} className="field" />
          </label>
          <label className="block">
            <span className="label">Notes</span>
            <input name="notes" defaultValue={vendor.notes ?? ""} className="field" />
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" className="btn btn-primary">Save</button>
            <a href="/vendors" className="btn btn-ghost">Cancel</a>
          </div>
        </form>
      </section>
    </div>
  );
}
