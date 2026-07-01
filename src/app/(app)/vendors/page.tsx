import { listVendors } from "../../../lib/data/vendors";
import { addVendorAction, deleteVendorAction } from "./actions";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";
import { ConfirmSubmit } from "../_ui/ConfirmSubmit";

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const vendors = await listVendors();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Vendors" />
      </div>

      {error && <Banner variant="error">{error}</Banner>}
      {ok && <Banner variant="success">{ok}</Banner>}

      {/* Add-vendor form */}
      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <form action={addVendorAction} className="card p-5">
          <div className="mb-4 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Add vendor</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Name</span>
              <input name="name" placeholder="e.g. Plumber Ltd" required className="field" />
            </label>
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Contact (optional)</span>
              <input name="contactDetails" placeholder="Email or phone" className="field" />
            </label>
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Notes (optional)</span>
              <input name="notes" placeholder="Any notes" className="field" />
            </label>
            <button type="submit" className="btn btn-primary">Add</button>
          </div>
        </form>
      </section>

      {/* Vendors list */}
      <section className="reveal" style={{ animationDelay: "120ms" }}>
        {vendors.length === 0 ? (
          <EmptyState
            title="No vendors yet"
            hint="Add the people and companies you pay, to tag transactions."
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.id}>
                    <td className="font-medium text-ink">{v.name}</td>
                    <td className="text-muted">{v.contactDetails ?? ""}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        <a
                          href={`/vendors/${v.id}/edit`}
                          className="btn btn-ghost !px-3 !py-1.5 text-xs"
                        >
                          Edit
                        </a>
                        <form action={deleteVendorAction}>
                          <input type="hidden" name="id" value={v.id} />
                          <ConfirmSubmit confirm="Delete this vendor? This can't be undone.">
                            Delete
                          </ConfirmSubmit>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
