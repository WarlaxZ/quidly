import { listVendors } from "../../../lib/data/vendors";
import { addVendorAction, deleteVendorAction } from "./actions";
export default async function VendorsPage() {
  const vendors = await listVendors();
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Vendors</h1>
      <form action={addVendorAction} className="flex flex-wrap gap-2">
        <input name="name" placeholder="Name" required className="border px-2 py-1" />
        <input name="contactDetails" placeholder="Contact (optional)" className="border px-2 py-1" />
        <input name="notes" placeholder="Notes (optional)" className="border px-2 py-1" />
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Add</button>
      </form>
      <ul className="divide-y border">
        {vendors.map((v) => (
          <li key={v.id} className="flex items-center justify-between px-3 py-2">
            <span>{v.name}{v.contactDetails ? ` — ${v.contactDetails}` : ""}</span>
            <form action={deleteVendorAction}>
              <input type="hidden" name="id" value={v.id} />
              <button type="submit" className="text-red-600">Delete</button>
            </form>
          </li>
        ))}
        {vendors.length === 0 && <li className="px-3 py-2 text-gray-500">No vendors yet.</li>}
      </ul>
    </div>
  );
}
