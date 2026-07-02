import { listVendors } from "../../../lib/data/vendors";
import { deleteVendorAction } from "./actions";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";
import { ConfirmSubmit } from "../_ui/ConfirmSubmit";
import { NewVendorButton } from "../_ui/NewVendorButton";

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
        <PageHeader title="Vendors">
          <NewVendorButton />
        </PageHeader>
      </div>

      {error && <Banner variant="error">{error}</Banner>}
      {ok && <Banner variant="success">{ok}</Banner>}

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
