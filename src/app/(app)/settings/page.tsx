import { getOrCreateDefaultProperty } from "../../../lib/data/property";
import { savePropertyAction } from "./actions";
export default async function SettingsPage() {
  const property = await getOrCreateDefaultProperty();
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <form action={savePropertyAction} className="space-y-3">
        <label className="block">
          <span className="block text-sm">Property name</span>
          <input name="name" defaultValue={property.name} className="w-full border px-2 py-1" />
        </label>
        <label className="block">
          <span className="block text-sm">Address</span>
          <input name="address" defaultValue={property.address ?? ""} className="w-full border px-2 py-1" />
        </label>
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Save</button>
      </form>
    </div>
  );
}
