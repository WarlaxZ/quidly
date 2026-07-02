"use client";
import { useState } from "react";
import { CreateVendorModal } from "./CreateVendorModal";

export function VendorSelect({
  vendors,
  defaultValue,
}: {
  vendors: { id: string; name: string }[];
  defaultValue?: string;
}) {
  const [options, setOptions] = useState(() => vendors.map((v) => ({ id: v.id, name: v.name })));
  const [selected, setSelected] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <select
          name="vendorId"
          className="field"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">— vendor —</option>
          {options.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-ghost whitespace-nowrap !px-3"
          onClick={() => setOpen(true)}
          title="Create a new vendor"
        >
          ＋ New
        </button>
      </div>
      <CreateVendorModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(vendor) => {
          setOptions((prev) =>
            [...prev, vendor].sort((a, b) => a.name.localeCompare(b.name)),
          );
          setSelected(vendor.id);
        }}
      />
    </>
  );
}
