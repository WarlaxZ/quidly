import { listProperties } from "../../../lib/data/activeProperty";
import { getPropertyCounts } from "../../../lib/data/property";
import { listCompanies } from "../../../lib/data/company";
import { addPropertyAction, deletePropertyAction } from "./actions";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";
import { ConfirmSubmit } from "../_ui/ConfirmSubmit";

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const properties = await listProperties();
  const counts = await Promise.all(properties.map((p) => getPropertyCounts(p.id)));
  const companies = await listCompanies();
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Properties" />
      </div>

      {error && <Banner variant="error">{error}</Banner>}
      {ok && <Banner variant="success">{ok}</Banner>}

      {/* Add property form */}
      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <form action={addPropertyAction} className="card p-5">
          <div className="mb-4 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Add property</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Name</span>
              <input name="name" placeholder="Property name" required className="field" />
            </label>
            <label className="flex-1 min-w-[14rem]">
              <span className="label">Address (optional)</span>
              <input name="address" placeholder="Address" className="field" />
            </label>
            <label className="flex-1 min-w-[10rem]">
              <span className="label">Ownership type</span>
              <select name="ownershipType" defaultValue="personal" className="field">
                <option value="personal">Personal</option>
                <option value="company">Company</option>
              </select>
            </label>
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Company (if company-owned)</span>
              <select name="companyId" defaultValue="" className="field">
                <option value="">— company (if company-owned) —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <button type="submit" className="btn btn-primary">Add property</button>
          </div>
        </form>
      </section>

      {/* Properties list */}
      <section className="reveal" style={{ animationDelay: "120ms" }}>
        {properties.length === 0 ? (
          <EmptyState
            title="Add your first property"
            hint="Give it a name (and address), then start recording transactions."
          />
        ) : (
          <div className="card divide-y divide-line">
            {properties.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{p.name}</span>
                    {p.address && <span className="text-sm text-muted">{p.address}</span>}
                    <span className="pill">{p.ownershipType}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3">
                    {p.companyId && (
                      <span className="text-xs text-muted">{companyName.get(p.companyId) ?? "?"}</span>
                    )}
                    <span className="text-xs text-faint">{counts[i].transactions} txns</span>
                  </div>
                </div>
                <div className="ml-4 flex items-center gap-2">
                  <a className="btn btn-ghost !px-3 !py-1.5 text-xs" href={`/properties/${p.id}/edit`}>Edit</a>
                  <form action={deletePropertyAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <ConfirmSubmit confirm="Delete this property? This can't be undone.">Delete</ConfirmSubmit>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
