import { notFound } from "next/navigation";
import { getTransaction } from "../../../../../lib/data/transactions";
import { listCategories } from "../../../../../lib/data/categories";
import { listVendors } from "../../../../../lib/data/vendors";
import { penceToPounds } from "../../../../../lib/tax/money";
import { updateTransactionAction } from "../../edit-actions";
import { PageHeader } from "../../../_ui/PageHeader";
import { Banner } from "../../../_ui/Banner";
import { MoneyInput } from "../../../_ui/MoneyInput";
import { VendorSelect } from "../../../_ui/VendorSelect";

export default async function EditTransactionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [txn, categories, vendors] = await Promise.all([
    getTransaction(id),
    listCategories(),
    listVendors(),
  ]);
  if (!txn) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Edit transaction" />
      </div>

      {/* Error banner */}
      {error && <Banner variant="error">{error}</Banner>}

      {/* Edit form */}
      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <form action={updateTransactionAction} encType="multipart/form-data" className="card p-6">
          <input type="hidden" name="id" value={txn.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="label">Date</span>
              <input
                type="date"
                name="date"
                defaultValue={txn.date.toISOString().slice(0, 10)}
                required
                className="field"
              />
            </label>
            <label>
              <span className="label">Amount</span>
              <MoneyInput
                name="amount"
                defaultValue={penceToPounds(txn.amountPence)}
                required
              />
            </label>
            <label>
              <span className="label">Direction</span>
              <select name="direction" defaultValue={txn.direction} className="field">
                <option value="in">In</option>
                <option value="out">Out</option>
              </select>
            </label>
            <label>
              <span className="label">Category</span>
              <select name="categoryId" defaultValue={txn.categoryId} required className="field">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Vendor</span>
              <VendorSelect vendors={vendors} defaultValue={txn.vendorId ?? ""} />
            </label>
            <label className="sm:col-span-2">
              <span className="label">Description</span>
              <textarea
                name="description"
                defaultValue={txn.description ?? ""}
                placeholder="Optional note"
                rows={4}
                className="field"
              />
            </label>
          </div>
          <div className="mt-4">
            <span className="label">Receipt / invoice</span>
            {txn.attachment ? (
              <div className="mb-2 flex flex-wrap items-center gap-4 text-sm">
                <a
                  href={`/attachments/${txn.attachmentId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-forest hover:underline"
                >
                  View current: {txn.attachment.originalName}
                </a>
                <label className="flex items-center gap-1.5 text-muted">
                  <input type="checkbox" name="removeAttachment" />
                  Remove
                </label>
              </div>
            ) : null}
            <input
              type="file"
              name="file"
              accept="image/jpeg,image/png,application/pdf"
              className="field"
            />
            <p className="mt-1 text-xs text-faint">
              {txn.attachment
                ? "Upload a file to replace the current one."
                : "Attach a JPG, PNG, or PDF (max 10 MB)."}
            </p>
          </div>
          <div className="mt-6 flex items-center gap-3">
            <button type="submit" className="btn btn-primary">
              Save changes
            </button>
            <a href="/transactions" className="btn btn-ghost">
              Cancel
            </a>
          </div>
        </form>
      </section>
    </div>
  );
}
