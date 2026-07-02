"use client";
import { useState } from "react";
import { logMileageAction } from "./actions";

interface Props {
  taxYear: string;
  propertyId: string;
  propertyName: string;
  roundTripMiles: number | null;
}

const PURPOSES = ["Inspection", "Viewing", "Meeting a tradesperson", "Repair", "Other"];

export function MileageForm({ taxYear, propertyId, propertyName, roundTripMiles }: Props) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        Log a trip
      </button>
    );
  }
  return (
    <form action={logMileageAction} className="mt-3 w-full space-y-3 border-t border-line pt-3">
      <input type="hidden" name="taxYear" value={taxYear} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="label">Date</span>
          <input className="field" type="date" name="date" required />
        </label>
        <label className="text-sm">
          <span className="label">Purpose</span>
          <select className="field" name="purpose" defaultValue="Inspection">
            {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="label">Round-trip miles</span>
        <input className="field" type="number" name="miles" min="1" step="1" required defaultValue={roundTripMiles ?? undefined} placeholder="e.g. 24" />
      </label>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="remember" defaultChecked={roundTripMiles == null} />
        Remember this as the round trip for {propertyName}
      </label>
      <p className="text-xs text-faint">45p per mile for the first 10,000 miles this tax year, then 25p — worked out for you.</p>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">Log trip</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
