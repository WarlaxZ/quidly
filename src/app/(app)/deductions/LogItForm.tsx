"use client";
import { useState } from "react";
import { MoneyInput } from "../_ui/MoneyInput";
import { logDeductionAction } from "./actions";

interface Props {
  taxYear: string;
  itemKey: string;
  title: string;
  activePropertyId: string;
  activePropertyName: string;
}

export function LogItForm({ taxYear, itemKey, title, activePropertyId, activePropertyName }: Props) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        Log it
      </button>
    );
  }
  return (
    <form action={logDeductionAction} className="mt-3 w-full space-y-3 border-t border-line pt-3">
      <input type="hidden" name="taxYear" value={taxYear} />
      <input type="hidden" name="itemKey" value={itemKey} />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="label">Date</span>
          <input className="field" type="date" name="date" required />
        </label>
        <label className="text-sm">
          <span className="label">Amount</span>
          <MoneyInput name="amount" required />
        </label>
      </div>
      <label className="block text-sm">
        <span className="label">Description</span>
        <input className="field" type="text" name="description" defaultValue={title} />
      </label>
      <input type="hidden" name="propertyId" value={activePropertyId} />
      <p className="text-xs text-faint">Logged against {activePropertyName}.</p>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">Save expense</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
