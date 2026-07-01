import { notFound } from "next/navigation";
import { getAttachment } from "../../../../lib/data/attachments";
import { listCategories } from "../../../../lib/data/categories";
import { listVendors, matchVendorByName } from "../../../../lib/data/vendors";
import { listProperties, getActiveProperty } from "../../../../lib/data/activeProperty";
import { penceToPounds } from "../../../../lib/tax/money";
import type { Extraction } from "../../../../lib/extraction/extract";
import { confirmScanAction } from "./actions";
import { PageHeader } from "../../_ui/PageHeader";
import { Banner } from "../../_ui/Banner";
import { MoneyInput } from "../../_ui/MoneyInput";

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
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Review extracted transaction" />
      </div>

      {error && <Banner variant="error">{error}</Banner>}

      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <p className="text-sm text-muted">
          Extracted with {x.confidence ?? "low"} confidence ·{" "}
          <a href={`/attachments/${attachment.id}`} target="_blank" className="font-medium text-forest hover:underline">
            view file
          </a>
          . Check and confirm.
        </p>
      </section>

      <section className="reveal" style={{ animationDelay: "120ms" }}>
        <form action={confirmScanAction} className="card p-6 space-y-5">
          <input type="hidden" name="attachmentId" value={attachment.id} />

          <div className="flex flex-wrap items-end gap-4">
            <label className="flex-1 min-w-[10rem]">
              <span className="label">Property</span>
              <select name="propertyId" required defaultValue={active.propertyId ?? ""} className="field">
                <option value="" disabled>— property —</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>

            <label className="flex-1 min-w-[9rem]">
              <span className="label">Date</span>
              <input type="date" name="date" defaultValue={x.isoDate ?? ""} required className="field" />
            </label>

            <label className="flex-1 min-w-[9rem]">
              <span className="label">Amount</span>
              <MoneyInput
                name="amount"
                defaultValue={x.amountPence ? penceToPounds(x.amountPence) : ""}
                placeholder="0.00"
                required
              />
            </label>

            <label className="flex-1 min-w-[7rem]">
              <span className="label">Direction</span>
              <select name="direction" defaultValue={x.direction ?? "out"} className="field">
                <option value="in">In</option>
                <option value="out">Out</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="flex-1 min-w-[10rem]">
              <span className="label">Category</span>
              <select name="categoryId" defaultValue={x.categoryId ?? ""} required className="field">
                <option value="" disabled>— category —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>

            <label className="flex-1 min-w-[10rem]">
              <span className="label">Vendor</span>
              <select name="vendorId" defaultValue={matchedVendor?.id ?? ""} className="field">
                <option value="">— vendor —</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>

            <label className="flex-1 min-w-[12rem]">
              <span className="label">Description</span>
              <input
                name="description"
                defaultValue={!matchedVendor && x.vendorName ? x.vendorName : ""}
                placeholder="Optional note"
                className="field"
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" className="btn btn-primary">Confirm</button>
          </div>
        </form>
      </section>
    </div>
  );
}
