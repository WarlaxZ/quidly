"use client";
import { setActivePropertyAction } from "./actions";

export function PropertySwitcher({ properties, activeValue }: { properties: { id: string; name: string }[]; activeValue: string }) {
  return (
    <form action={setActivePropertyAction}>
      <select
        name="propertyId"
        defaultValue={activeValue}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="border px-2 py-1 text-sm"
      >
        <option value="all">All properties</option>
        {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </form>
  );
}
