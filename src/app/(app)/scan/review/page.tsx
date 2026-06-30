import { notFound } from "next/navigation";
import { getAttachment } from "../../../../lib/data/attachments";
import { listCategories } from "../../../../lib/data/categories";
import { listVendors, matchVendorByName } from "../../../../lib/data/vendors";
import { listProperties, getActiveProperty } from "../../../../lib/data/activeProperty";
import { penceToPounds } from "../../../../lib/tax/money";
import type { Extraction } from "../../../../lib/extraction/extract";
import { confirmScanAction } from "./actions";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ attachmentId?: string; error?: string }> }) {
  const { attachmentId, error } = await searchParams;
  if (!attachmentId) notFound();
  const attachment = await getAttachment(attachmentId);
  if (!attachment) notFound();
  const x = (attachment.extractedData ? JSON.parse(attachment.extractedData) : {}) as Partial<Extraction>;

  const [categories, vendors, active, properties] = await Promise.all([
    listCategories(),
    listVendors(),
    getActiveProperty(),
    listProperties(),
  ]);
  const matchedVendor = x.vendorName ? await matchVendorByName(x.vendorName) : null;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Review scanned receipt</h1>
      <p className="text-sm text-gray-600">
        Extracted with {x.confidence ?? "low"} confidence ·{" "}
        <a href={`/attachments/${attachment.id}`} target="_blank" className="text-blue-600 hover:underline">view file</a>. Check and confirm.
      </p>
      {error && <p className="rounded bg-red-100 px-3 py-2 text-red-700">{error}</p>}
      <form action={confirmScanAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="attachmentId" value={attachment.id} />
        <select name="propertyId" required className="border px-2 py-1">
          <option value="" disabled>— property —</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id} selected={p.id === active.propertyId}>{p.name}</option>
          ))}
        </select>
        <input type="date" name="date" defaultValue={x.isoDate ?? ""} required className="border px-2 py-1" />
        <input name="amount" defaultValue={x.amountPence ? penceToPounds(x.amountPence) : ""} placeholder="£ amount" required className="border px-2 py-1" />
        <select name="direction" defaultValue={x.direction ?? "out"} className="border px-2 py-1">
          <option value="in">In</option>
          <option value="out">Out</option>
        </select>
        <select name="categoryId" defaultValue={x.categoryId ?? ""} required className="border px-2 py-1">
          <option value="" disabled>— category —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="vendorId" defaultValue={matchedVendor?.id ?? ""} className="border px-2 py-1">
          <option value="">— vendor —</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <input name="description" defaultValue={!matchedVendor && x.vendorName ? x.vendorName : ""} placeholder="Description" className="border px-2 py-1" />
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Confirm</button>
      </form>
    </div>
  );
}
