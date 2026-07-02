"use client";
import { useEffect, useState } from "react";

/** Non-blocking, dismissible "you might be missing N deductions" banner.
 *  Dismissal is remembered per tax year in localStorage. */
export function DeductionsNudge({ taxYear, considerCount }: { taxYear: string; considerCount: number }) {
  const storageKey = `deductions-nudge-dismissed-${taxYear}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    setHidden(localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  if (considerCount === 0 || hidden) return null;
  return (
    <div className="card flex items-center justify-between gap-4 p-4">
      <p className="text-sm">
        Before you file: <strong>{considerCount}</strong> deduction{considerCount === 1 ? "" : "s"} you might be missing for {taxYear}.{" "}
        <a className="underline hover:text-forest" href={`/deductions?ty=${taxYear}`}>Review them</a>.
      </p>
      <button type="button" className="btn btn-ghost shrink-0" onClick={() => { localStorage.setItem(storageKey, "1"); setHidden(true); }}>
        Dismiss
      </button>
    </div>
  );
}
