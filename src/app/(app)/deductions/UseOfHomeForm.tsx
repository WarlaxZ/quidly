"use client";
import { useState } from "react";
import { MoneyInput } from "../_ui/MoneyInput";
import { logUseOfHomeAction } from "./actions";

interface Props {
  taxYear: string;
  propertyId: string;
  propertyName: string;
  defaultMonthlyPence: number;
}

export function UseOfHomeForm({ taxYear, propertyId, propertyName, defaultMonthlyPence }: Props) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        Set a claim
      </button>
    );
  }
  const defaultAmount = (defaultMonthlyPence / 100).toFixed(2);
  return (
    <form action={logUseOfHomeAction} className="mt-3 w-full space-y-3 border-t border-line pt-3">
      <input type="hidden" name="taxYear" value={taxYear} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <p className="text-sm text-muted">
        A reasonable proportion of your home running costs for the time you spend administering the
        lettings. Most single-property landlords claim a modest flat amount — keep it reasonable and
        documented. This is separate from any employed working-from-home.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="label">Amount</span>
          <MoneyInput name="amount" required defaultValue={defaultAmount} />
        </label>
        <label className="text-sm">
          <span className="label">Per</span>
          <select className="field" name="basis" defaultValue="monthly">
            <option value="monthly">month</option>
            <option value="weekly">week</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-faint">Sets a single Use-of-home expense for {taxYear} on {propertyName} (re-running updates it).</p>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">Save claim</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
