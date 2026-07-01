import { getActiveProperty } from "../../../lib/data/activeProperty";
import { getProperty } from "../../../lib/data/property";
import { savePropertyAction } from "./actions";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const active = await getActiveProperty();

  if (active.isAll || !active.propertyId) {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="reveal" style={{ animationDelay: "0ms" }}>
          <PageHeader title="Settings" />
        </div>
        <div className="reveal" style={{ animationDelay: "60ms" }}>
          <EmptyState
            title="No property selected"
            hint="Pick a single property in the switcher to edit its details, or add one on the Properties page."
          />
        </div>
      </div>
    );
  }

  const property = await getProperty(active.propertyId);
  if (!property) {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="reveal" style={{ animationDelay: "0ms" }}>
          <PageHeader title="Settings" />
        </div>
        <div className="reveal" style={{ animationDelay: "60ms" }}>
          <EmptyState
            title="No property selected"
            hint="Pick a single property in the switcher to edit its details, or add one on the Properties page."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Settings" />
      </div>

      {ok && <Banner variant="success">{ok}</Banner>}

      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <form action={savePropertyAction} className="card p-6 space-y-4">
          <input type="hidden" name="propertyId" value={property.id} />
          <label className="block">
            <span className="label">Property name</span>
            <input name="name" defaultValue={property.name} className="field w-full" />
          </label>
          <label className="block">
            <span className="label">Address</span>
            <input name="address" defaultValue={property.address ?? ""} className="field w-full" />
          </label>
          <div className="pt-2">
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </section>
    </div>
  );
}
